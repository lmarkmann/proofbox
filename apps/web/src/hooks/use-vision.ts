import { type RefObject, useEffect, useRef, useState } from "react";

import type { Detection } from "@/lib/api";

export type VisionState =
  | { tag: "off" }
  | { tag: "connecting" }
  | { tag: "live"; detections: Detection[]; ms: number }
  | { tag: "down" };

type Reply =
  | { type: "classes"; names: string[] }
  | { type: "boxes"; frame: number; ms: number; boxes: Detection[] }
  | { type: "error"; detail: string };

const FRAME_WIDTH = 640;
const RECONNECT_MS = 2000;

function socketUrl() {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/vision/ws`;
}

/**
 * Streams video frames to the local YOLOE agent while `classes` is set, one frame in
 * flight, and reports every reply to `onDetections` as well as through the state.
 */
export function useVision(
  video: RefObject<HTMLVideoElement | null>,
  classes: string[] | null,
  onDetections: (detections: Detection[]) => void,
): VisionState {
  const [state, setState] = useState<VisionState>({ tag: "off" });
  const report = useRef(onDetections);
  report.current = onDetections;
  const classesKey = classes ? JSON.stringify(classes) : null;

  useEffect(() => {
    const element = video.current;
    if (!classesKey || !element) {
      setState({ tag: "off" });
      return;
    }
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry = 0;
    let handle = 0;
    let canvas: OffscreenCanvas | null = null;

    const sendFrame = () => {
      handle = element.requestVideoFrameCallback(async () => {
        if (stopped || socket?.readyState !== WebSocket.OPEN || !element.videoWidth) {
          if (!stopped) sendFrame();
          return;
        }
        const height = Math.round((FRAME_WIDTH * element.videoHeight) / element.videoWidth);
        if (canvas?.height !== height) canvas = new OffscreenCanvas(FRAME_WIDTH, height);
        canvas.getContext("2d")?.drawImage(element, 0, 0, FRAME_WIDTH, height);
        const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
        socket.send(await jpeg.arrayBuffer());
      });
    };

    const connect = () => {
      setState({ tag: "connecting" });
      const current = new WebSocket(socketUrl());
      socket = current;
      current.onopen = () => current.send(classesKey);
      current.onmessage = (event: MessageEvent<string>) => {
        const reply = JSON.parse(event.data) as Reply;
        if (reply.type === "boxes") {
          setState({ tag: "live", detections: reply.boxes, ms: reply.ms });
          report.current(reply.boxes);
        }
        if (reply.type === "classes" || reply.type === "boxes") sendFrame();
      };
      current.onclose = () => {
        if (stopped) return;
        setState({ tag: "down" });
        retry = window.setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      element.cancelVideoFrameCallback(handle);
      socket?.close();
    };
  }, [video, classesKey]);

  return state;
}
