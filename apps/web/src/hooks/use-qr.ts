import { type RefObject, useEffect, useState } from "react";

import { orderIdFromProofUrl } from "@/lib/vision-math";
import type { DecodedQr } from "@/workers/qr.worker";

export type QrSighting = DecodedQr & { orderId: string | null };

const SCAN_INTERVAL_MS = 120;
// a label must decode this many frames in a row before it counts, and vanish this long to be gone
const STABLE_FRAMES = 3;
const LOST_FRAMES = 4;

/**
 * Decodes QR codes from the video in a worker, one frame in flight at a time.
 * `sighting` follows what is in view now; `stableOrderId` only changes once a label
 * has held still for a few frames, or has been out of view for a few.
 */
export function useQr(video: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [sighting, setSighting] = useState<QrSighting | null>(null);
  const [stableOrderId, setStableOrderId] = useState<string | null>(null);

  useEffect(() => {
    const element = video.current;
    if (!enabled || !element) return;

    const worker = new Worker(new URL("../workers/qr.worker.ts", import.meta.url), {
      type: "module",
    });
    let stopped = false;
    let busy = false;
    let lastScan = 0;
    let handle = 0;
    let streak = { orderId: null as string | null, frames: 0 };
    let misses = 0;

    worker.onmessage = (event: MessageEvent<DecodedQr[]>) => {
      busy = false;
      if (stopped) return;
      const [code] = event.data;
      if (code) {
        misses = 0;
        const orderId = orderIdFromProofUrl(code.raw);
        setSighting({ ...code, orderId });
        streak =
          streak.orderId === orderId
            ? { orderId, frames: streak.frames + 1 }
            : { orderId, frames: 1 };
        if (orderId && streak.frames >= STABLE_FRAMES) setStableOrderId(orderId);
      } else if (++misses >= LOST_FRAMES) {
        streak = { orderId: null, frames: 0 };
        setSighting(null);
        setStableOrderId(null);
      }
    };

    const scan = (now: number) => {
      if (stopped) return;
      if (!busy && now - lastScan >= SCAN_INTERVAL_MS && element.videoWidth > 0) {
        busy = true;
        lastScan = now;
        createImageBitmap(element)
          .then((frame) => worker.postMessage(frame, [frame]))
          .catch(() => {
            busy = false;
          });
      }
      handle = element.requestVideoFrameCallback(scan);
    };
    handle = element.requestVideoFrameCallback(scan);

    return () => {
      stopped = true;
      element.cancelVideoFrameCallback(handle);
      worker.terminate();
      setSighting(null);
      setStableOrderId(null);
    };
  }, [video, enabled]);

  return { sighting, stableOrderId };
}
