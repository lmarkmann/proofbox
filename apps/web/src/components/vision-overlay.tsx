import { useEffect, useRef, useState } from "react";

import type { QrSighting } from "@/hooks/use-qr";
import type { Detection } from "@/lib/api";
import { type Fit, placeFrame } from "@/lib/vision-math";

const PALETTE = ["#22d3ee", "#a78bfa", "#f472b6", "#facc15", "#fb923c", "#4ade80", "#60a5fa"];
const QR_BOUND = "#34d399";
const QR_FOREIGN = "#f87171";
const FONT = "600 12px 'Instrument Sans Variable', ui-sans-serif, sans-serif";

export function labelColor(label: string) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function tag(context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  context.font = FONT;
  const width = context.measureText(text).width + 10;
  const top = Math.max(0, y - 20);
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(x, top, width, 20, 4);
  context.fill();
  context.fillStyle = "#0a0a0a";
  context.fillText(text, x + 5, top + 14);
}

/**
 * Draws detections and a QR outline over a video. Coordinates are fractions of the
 * video frame; `frameSize` and `fit` must match the video element so boxes line up.
 */
export function VisionOverlay({
  detections,
  qr,
  qrLabel,
  qrMatches = true,
  frameSize,
  fit = "cover",
}: {
  detections: Detection[];
  qr?: QrSighting | null;
  qrLabel?: string;
  qrMatches?: boolean;
  frameSize: { width: number; height: number } | null;
  fit?: Fit;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const parent = canvas.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const ratio = window.devicePixelRatio;
    element.width = Math.round(size.width * ratio);
    element.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    if (!frameSize || !size.width) return;

    const { scale, dx, dy } = placeFrame(
      fit,
      frameSize.width,
      frameSize.height,
      size.width,
      size.height,
    );
    const toX = (fraction: number) => dx + fraction * frameSize.width * scale;
    const toY = (fraction: number) => dy + fraction * frameSize.height * scale;

    context.lineWidth = 2;
    for (const { label, track, conf, box } of detections) {
      const color = labelColor(label);
      const [x1, y1, x2, y2] = [toX(box[0]), toY(box[1]), toX(box[2]), toY(box[3])];
      context.strokeStyle = color;
      context.beginPath();
      context.roundRect(x1, y1, x2 - x1, y2 - y1, 6);
      context.stroke();
      const id = track === null ? "" : ` #${track}`;
      tag(context, `${label}${id} ${Math.round(conf * 100)}%`, x1, y1, color);
    }

    if (qr) {
      const color = qrMatches ? QR_BOUND : QR_FOREIGN;
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.beginPath();
      qr.corners.forEach(([x, y], index) =>
        index === 0 ? context.moveTo(toX(x), toY(y)) : context.lineTo(toX(x), toY(y)),
      );
      context.closePath();
      context.stroke();
      const [left, top] = qr.corners.reduce(
        ([minX, minY], [x, y]) => [Math.min(minX, x), Math.min(minY, y)],
        [1, 1],
      );
      tag(context, qrLabel ?? qr.orderId ?? "Not a ProofBox label", toX(left), toY(top), color);
    }
  }, [detections, qr, qrLabel, qrMatches, frameSize, fit, size]);

  return (
    <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
  );
}
