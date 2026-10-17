import { useEffect, useState } from "react";

import {
  type Answer,
  ApiError,
  ask,
  getOrder,
  getTrack,
  type OrderDetail,
  type PackSummary,
  packVideoUrl,
  type TrackPoint,
} from "@/lib/api";
import { latestPack } from "@/proof/pack-model";

export type ProofSource = {
  getOrder: (orderId: string) => Promise<OrderDetail>;
  getTrack: (packId: string) => Promise<TrackPoint[]>;
  videoUrl: (packId: string) => string;
  ask: (question: string, orderId: string, signal?: AbortSignal) => Promise<Answer>;
};

export const apiSource: ProofSource = { getOrder, getTrack, videoUrl: packVideoUrl, ask };

export type TrackState =
  | { tag: "loading" }
  | { tag: "ready"; points: TrackPoint[] }
  | { tag: "failed" };

export type ProofState =
  | { tag: "loading" }
  | { tag: "not-found" }
  | { tag: "unreachable" }
  | { tag: "not-packed"; order: OrderDetail }
  | { tag: "packed"; order: OrderDetail; pack: PackSummary; video: string; track: TrackState };

export type SummaryState =
  | { tag: "loading" }
  | { tag: "ready"; answer: Answer }
  | { tag: "failed" };

const SUMMARY_QUESTION = "Describe exactly what was packed into this box";

export function useProof(orderId: string, source: ProofSource, attempt: number): ProofState {
  const [state, setState] = useState<ProofState>({ tag: "loading" });

  useEffect(() => {
    let live = true;
    setState({ tag: "loading" });
    void (async () => {
      let order: OrderDetail;
      try {
        order = await source.getOrder(orderId);
      } catch (cause) {
        if (live)
          setState({
            tag: cause instanceof ApiError && cause.status === 404 ? "not-found" : "unreachable",
          });
        return;
      }
      const pack = latestPack(order.packs);
      if (!live) return;
      if (!pack) {
        setState({ tag: "not-packed", order });
        return;
      }
      const packed = { tag: "packed", order, pack, video: source.videoUrl(pack.pack_id) } as const;
      setState({ ...packed, track: { tag: "loading" } });
      const track: TrackState = await source.getTrack(pack.pack_id).then(
        (points) => ({ tag: "ready", points }),
        () => ({ tag: "failed" }),
      );
      if (live) setState({ ...packed, track });
    })();
    return () => {
      live = false;
    };
  }, [orderId, source, attempt]);

  return state;
}

export function useSummary(orderId: string, source: ProofSource, enabled: boolean): SummaryState {
  const [state, setState] = useState<SummaryState>({ tag: "loading" });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ tag: "loading" });
    source.ask(SUMMARY_QUESTION, orderId, controller.signal).then(
      (answer) => setState({ tag: "ready", answer }),
      () => {
        if (!controller.signal.aborted) setState({ tag: "failed" });
      },
    );
    return () => controller.abort();
  }, [orderId, source, enabled]);

  return state;
}
