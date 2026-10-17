import { useEffect, useRef } from "react";

import type { Detection } from "@/lib/api";

// stand-in with VisionOverlay's props until feat/live-vision lands components/vision-overlay.tsx
export function ReplayOverlay({
  detections,
  frameSize,
  fit = "contain",
}: {
  detections: Detection[];
  frameSize: { width: number; height: number } | null;
  fit?: "cover" | "contain";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const { clientWidth: width, clientHeight: height } = element;
      const ratio = window.devicePixelRatio;
      element.width = width * ratio;
      element.height = height * ratio;
      const context = element.getContext("2d");
      if (!context || !frameSize) return;
      context.scale(ratio, ratio);
      const pick = fit === "cover" ? Math.max : Math.min;
      const scale = pick(width / frameSize.width, height / frameSize.height);
      const dx = (width - frameSize.width * scale) / 2;
      const dy = (height - frameSize.height * scale) / 2;
      context.font = "500 12px 'Instrument Sans Variable', sans-serif";
      context.lineWidth = 2;
      for (const { label, conf, box } of detections) {
        const x = dx + box[0] * frameSize.width * scale;
        const y = dy + box[1] * frameSize.height * scale;
        const w = (box[2] - box[0]) * frameSize.width * scale;
        const h = (box[3] - box[1]) * frameSize.height * scale;
        context.strokeStyle = "rgb(52 211 153)";
        context.beginPath();
        context.roundRect(x, y, w, h, 6);
        context.stroke();
        const tag = `${label} ${Math.round(conf * 100)}%`;
        const tagWidth = context.measureText(tag).width + 12;
        const tagY = y > 22 ? y - 22 : y + 2;
        context.fillStyle = "rgb(6 78 59 / 0.9)";
        context.beginPath();
        context.roundRect(x, tagY, tagWidth, 20, 4);
        context.fill();
        context.fillStyle = "white";
        context.fillText(tag, x + 6, tagY + 14);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [detections, frameSize, fit]);

  return (
    <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
  );
}
