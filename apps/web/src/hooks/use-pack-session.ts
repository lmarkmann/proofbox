import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  createPack,
  type Detection,
  getOrder,
  listOrders,
  type OrderDetail,
  type SealResult,
  sealPack,
  type TrackPoint,
} from "@/lib/api";

export type PackState =
  | { tag: "scanning" }
  | { tag: "looking-up"; orderId: string }
  | { tag: "lookup-failed"; orderId: string; unknownOrder: boolean; detail: string }
  | { tag: "packing"; order: OrderDetail; packId: string; vocabulary: string[] }
  | { tag: "sealing"; order: OrderDetail; packId: string }
  | { tag: "sealed"; order: OrderDetail; result: SealResult }
  | { tag: "seal-failed"; order: OrderDetail; packId: string; detail: string };

/** One tracked object's lifetime in the clip, in ms from the recording's start */
export type Span = { label: string; track: number; from: number; to: number };

// what YOLOE looks for when a label was printed without items
const OPEN_ORDER_VOCABULARY = [
  "computer mouse",
  "phone",
  "cable",
  "charger",
  "headphones",
  "keyboard",
  "book",
  "bottle",
  "cup",
  "pen",
];
// Classes.names in apps/vision
const MAX_CLASSES = 20;

const RECORDING_TYPES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm",
];

function failureDetail(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The packing loop: a stable label binds its order, binding starts a pack and the
 * recording, every detection while recording lands in the track, and sealing ships
 * the clip with its track to the API.
 */
export function usePackSession(
  stableOrderId: string | null,
  recordingStream: () => MediaStream | null,
) {
  const [state, setState] = useState<PackState>({ tag: "scanning" });
  const [spans, setSpans] = useState<Span[]>([]);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const recorder = useRef<MediaRecorder | null>(null);
  const recorded = useRef<Promise<Blob | null> | null>(null);
  const chunks = useRef<Blob[]>([]);
  const zero = useRef<number | null>(null);
  const track = useRef<TrackPoint[]>([]);
  const spanIndex = useRef(new Map<string, Span>());
  const clip = useRef<Blob | null>(null);

  const resetCapture = () => {
    chunks.current = [];
    zero.current = null;
    track.current = [];
    spanIndex.current = new Map();
    clip.current = null;
    setSpans([]);
    setRecordingSince(null);
  };

  const startRecording = (stream: MediaStream) => {
    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const media = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    // A camera that drops mid-pack ends the stream and stops the recorder on its own; the
    // clip then holds everything up to the drop and sealing still ships it.
    recorded.current = new Promise((resolve) => {
      media.onstop = () =>
        resolve(chunks.current.length ? new Blob(chunks.current, { type: media.mimeType }) : null);
    });
    media.onstart = () => {
      zero.current = performance.now();
      setRecordingSince(Date.now());
    };
    media.start(1000);
    recorder.current = media;
  };

  const stopRecording = async () => {
    const media = recorder.current;
    const clipDone = recorded.current;
    recorder.current = null;
    recorded.current = null;
    if (!media || !clipDone) return null;
    if (media.state !== "inactive") media.stop();
    return clipDone;
  };

  const bind = useCallback(
    async (orderId: string) => {
      setState({ tag: "looking-up", orderId });
      try {
        const [order, orders] = await Promise.all([getOrder(orderId), listOrders()]);
        const vocabulary = [
          ...new Set([
            ...order.items.map((item) => item.name),
            ...(order.items.length ? [] : OPEN_ORDER_VOCABULARY),
            ...orders.flatMap((other) => other.items.map((item) => item.name)),
          ]),
        ].slice(0, MAX_CLASSES);
        const stream = recordingStream();
        if (!stream) throw new Error("The camera stopped before packing could start.");
        const { pack_id } = await createPack(orderId);
        resetCapture();
        startRecording(stream);
        setState({ tag: "packing", order, packId: pack_id, vocabulary });
      } catch (cause) {
        setState({
          tag: "lookup-failed",
          orderId,
          unknownOrder: cause instanceof ApiError && cause.status === 404,
          detail: failureDetail(cause),
        });
      }
    },
    [recordingStream],
  );

  // binds on a new stable label only, so a sealed box still in view does not start a second pack
  useEffect(() => {
    if (stableOrderId && stateRef.current.tag === "scanning") void bind(stableOrderId);
  }, [stableOrderId, bind]);

  const onDetections = useCallback((detections: Detection[]) => {
    if (stateRef.current.tag !== "packing" || zero.current === null) return;
    const t_ms = Math.round(performance.now() - zero.current);
    let changed = false;
    for (const detection of detections) {
      track.current.push({ ...detection, t_ms });
      if (detection.track === null) continue;
      const key = `${detection.label}#${detection.track}`;
      const span = spanIndex.current.get(key);
      if (span) span.to = t_ms;
      else
        spanIndex.current.set(key, {
          label: detection.label,
          track: detection.track,
          from: t_ms,
          to: t_ms,
        });
      changed = true;
    }
    if (changed) setSpans([...spanIndex.current.values()]);
  }, []);

  const upload = async (order: OrderDetail, packId: string) => {
    setState({ tag: "sealing", order, packId });
    try {
      if (!clip.current) throw new Error("Nothing was recorded for this box.");
      const result = await sealPack(packId, clip.current, track.current);
      setState({ tag: "sealed", order, result });
    } catch (cause) {
      setState({ tag: "seal-failed", order, packId, detail: failureDetail(cause) });
    }
  };

  const seal = async () => {
    const current = stateRef.current;
    if (current.tag !== "packing") return;
    setState({ tag: "sealing", order: current.order, packId: current.packId });
    clip.current = await stopRecording();
    await upload(current.order, current.packId);
  };

  const retrySeal = () => {
    const current = stateRef.current;
    if (current.tag === "seal-failed") void upload(current.order, current.packId);
  };

  const retryLookup = () => {
    const current = stateRef.current;
    if (current.tag === "lookup-failed") void bind(current.orderId);
  };

  // a sealed box the after-seal check disputes is packed again as a new pack of the same order
  const repack = () => {
    const current = stateRef.current;
    if (current.tag === "sealed") void bind(current.order.order_id);
  };

  const reset = () => {
    void stopRecording();
    resetCapture();
    setState({ tag: "scanning" });
  };

  useEffect(() => () => void stopRecording(), []);

  const tracksByLabel = new Map<string, Set<number>>();
  for (const { label, track: id } of spans) {
    const ids = tracksByLabel.get(label) ?? new Set<number>();
    tracksByLabel.set(label, ids.add(id));
  }

  return {
    state,
    spans,
    tracksByLabel,
    recordingSince,
    onDetections,
    seal,
    retrySeal,
    retryLookup,
    repack,
    reset,
  };
}
