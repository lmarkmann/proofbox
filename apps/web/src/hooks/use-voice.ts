import { useCallback, useEffect, useRef, useState } from "react";

import { transcribe } from "@/lib/api";
import { toSpeechWav } from "@/lib/wav";

export type VoiceState =
  | { tag: "idle" }
  | { tag: "recording" }
  | { tag: "transcribing" }
  | { tag: "failed"; detail: string };

function micFailure(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "NotAllowedError")
    return "Microphone access is blocked; allow it from the address bar.";
  if (cause instanceof DOMException && cause.name === "NotFoundError")
    return "No microphone found.";
  return cause instanceof Error ? cause.message : String(cause);
}

/** Records a spoken question, then hands Canary-1B's transcript to `onText`. */
export function useVoice(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>({ tag: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const deliver = useRef(onText);
  deliver.current = onText;

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setState({ tag: "transcribing" });
        try {
          const { text } = await transcribe(
            await toSpeechWav(new Blob(chunks, { type: media.mimeType })),
          );
          setState({ tag: "idle" });
          if (text.trim()) deliver.current(text.trim());
        } catch (cause) {
          setState({ tag: "failed", detail: micFailure(cause) });
        }
      };
      media.start();
      recorder.current = media;
      setState({ tag: "recording" });
    } catch (cause) {
      setState({ tag: "failed", detail: micFailure(cause) });
    }
  }, []);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  return { state, start, stop };
}
