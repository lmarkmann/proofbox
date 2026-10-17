import { useCallback, useEffect, useRef, useState } from "react";

export type CameraFailure =
  | "denied"
  | "not-found"
  | "in-use"
  | "insecure"
  | "disconnected"
  | "unknown";

export type CameraState =
  | { tag: "off" }
  | { tag: "requesting" }
  | { tag: "live"; stream: MediaStream; resolution: string | null }
  | { tag: "file"; url: string; name: string }
  | { tag: "error"; failure: CameraFailure };

function classify(cause: unknown): CameraFailure {
  if (!(cause instanceof DOMException)) return "unknown";
  switch (cause.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "not-found";
    case "NotReadableError":
    case "AbortError":
      return "in-use";
    default:
      return "unknown";
  }
}

export function useCamera() {
  const [state, setState] = useState<CameraState>({ tag: "off" });
  const stream = useRef<MediaStream | null>(null);
  const fileUrl = useRef<string | null>(null);

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    fileUrl.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ tag: "error", failure: "insecure" });
      return;
    }
    release();
    setState({ tag: "requesting" });
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const [track] = media.getVideoTracks();
      const { width, height } = track.getSettings();
      track.addEventListener("ended", () => {
        if (stream.current !== media) return;
        release();
        setState({ tag: "error", failure: "disconnected" });
      });
      stream.current = media;
      setState({
        tag: "live",
        stream: media,
        resolution: width && height ? `${width}x${height}` : null,
      });
    } catch (cause) {
      setState({ tag: "error", failure: classify(cause) });
    }
  }, [release]);

  const playFile = useCallback(
    (file: File) => {
      release();
      fileUrl.current = URL.createObjectURL(file);
      setState({ tag: "file", url: fileUrl.current, name: file.name });
    },
    [release],
  );

  const stop = useCallback(() => {
    release();
    setState({ tag: "off" });
  }, [release]);

  useEffect(() => release, [release]);

  return { state, start, playFile, stop };
}
