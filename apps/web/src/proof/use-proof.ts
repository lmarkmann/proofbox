import { useEffect, useState } from "react";

import {
  ApiError,
  type CosmosSummary,
  getOrder,
  getSummary,
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
  getSummary: (packId: string, signal?: AbortSignal) => Promise<CosmosSummary>;
};

export const apiSource: ProofSource = { getOrder, getTrack, videoUrl: packVideoUrl, getSummary };

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
  | { tag: "pending" }
  | { tag: "ready"; summary: CosmosSummary }
  | { tag: "failed" };

const SUMMARY_POLL_MS = 5000;

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

export function useSummary(packId: string | null, source: ProofSource): SummaryState {
  const [state, setState] = useState<SummaryState>({ tag: "loading" });

  useEffect(() => {
    if (!packId) return;
    const controller = new AbortController();
    let poll: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      source.getSummary(packId, controller.signal).then(
        (summary) => setState({ tag: "ready", summary }),
        (cause: unknown) => {
          if (controller.signal.aborted) return;
          if (cause instanceof ApiError && cause.status === 404) {
            setState({ tag: "pending" });
            poll = setTimeout(load, SUMMARY_POLL_MS);
          } else setState({ tag: "failed" });
        },
      );
    setState({ tag: "loading" });
    void load();
    return () => {
      controller.abort();
      clearTimeout(poll);
    };
  }, [packId, source]);

  return state;
}
