import { useCallback, useEffect, useRef, useState } from "react";

import { transcribe } from "@/lib/api";
import { encodeWav, joinSamples, SPEECH_SAMPLE_RATE } from "@/lib/wav";

export type VoiceState =
  | { tag: "idle" }
  | { tag: "recording"; partial: string }
  | { tag: "transcribing"; partial: string }
  | { tag: "failed"; detail: string };

// Canary-1B on the GPU host is an offline model, so the live transcript comes from
// re-transcribing the growing recording; each pass starts once the previous one returns.
const PARTIAL_EVERY_MS = 800;
const MIN_SAMPLES = SPEECH_SAMPLE_RATE * 0.4;
const MAX_SAMPLES = SPEECH_SAMPLE_RATE * 30;

const TAP = `registerProcessor("pcm-tap", class extends AudioWorkletProcessor {
  process([input]) {
    if (input[0]) this.port.postMessage(input[0].slice());
    return true;
  }
});`;
let tapUrl: string | null = null;

type Capture = { stream: MediaStream; context: AudioContext; chunks: Float32Array[] };

function micFailure(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "NotAllowedError")
    return "Microphone access is blocked; allow it from the address bar.";
  if (cause instanceof DOMException && cause.name === "NotFoundError")
    return "No microphone found.";
  return cause instanceof Error ? cause.message : String(cause);
}

const wav = (samples: Float32Array) => encodeWav(samples, SPEECH_SAMPLE_RATE);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Records a spoken question as 16 kHz PCM, shows Canary-1B's transcript while the packer
 * is still talking, and hands the final transcript to `onText` once they stop.
 */
export function useVoice(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>({ tag: "idle" });
  const capture = useRef<Capture | null>(null);
  const session = useRef(0);
  const deliver = useRef(onText);
  deliver.current = onText;

  const release = (current: Capture) => {
    current.stream.getTracks().forEach((track) => track.stop());
    void current.context.close();
  };

  const stop = useCallback(async () => {
    const current = capture.current;
    capture.current = null;
    const id = session.current;
    if (!current) return;
    release(current);
    const samples = joinSamples(current.chunks);
    if (samples.length < MIN_SAMPLES) {
      setState({ tag: "idle" });
      return;
    }
    setState((now) => ({ tag: "transcribing", partial: "partial" in now ? now.partial : "" }));
    try {
      const { text } = await transcribe(wav(samples));
      if (session.current !== id) return;
      setState({ tag: "idle" });
      if (text.trim()) deliver.current(text.trim());
    } catch (cause) {
      if (session.current === id) setState({ tag: "failed", detail: micFailure(cause) });
    }
  }, []);

  const listen = useCallback(
    async (id: number, chunks: Float32Array[]) => {
      const live = () => session.current === id && capture.current?.chunks === chunks;
      while (live()) {
        const began = performance.now();
        const samples = joinSamples(chunks);
        if (samples.length >= MAX_SAMPLES) return void stop();
        if (samples.length >= MIN_SAMPLES) {
          // a failed partial only delays the live text; the final pass reports errors
          const partial = await transcribe(wav(samples)).catch(() => null);
          if (partial && live()) setState({ tag: "recording", partial: partial.text.trim() });
        }
        await sleep(Math.max(0, PARTIAL_EVERY_MS - (performance.now() - began)));
      }
    },
    [stop],
  );

  const start = useCallback(async () => {
    if (capture.current) return;
    const id = ++session.current;
    setState({ tag: "recording", partial: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const context = new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE });
      const current = { stream, context, chunks: [] as Float32Array[] };
      tapUrl ??= URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }));
      await context.audioWorklet.addModule(tapUrl);
      // stop() or a newer start() ran while the browser was still opening the mic
      if (session.current !== id) return release(current);
      const tap = new AudioWorkletNode(context, "pcm-tap");
      tap.port.onmessage = (event: MessageEvent<Float32Array>) => current.chunks.push(event.data);
      context.createMediaStreamSource(stream).connect(tap);
      capture.current = current;
      void listen(id, current.chunks);
    } catch (cause) {
      if (session.current === id) setState({ tag: "failed", detail: micFailure(cause) });
    }
  }, [listen]);

  const cancel = useCallback(() => {
    session.current++;
    if (capture.current) release(capture.current);
    capture.current = null;
    setState({ tag: "idle" });
  }, []);

  // a press released before the mic opened has no capture yet; bumping the session drops it
  const finish = useCallback(() => {
    if (capture.current) void stop();
    else if (state.tag === "recording") cancel();
  }, [stop, cancel, state.tag]);

  useEffect(
    () => () => {
      session.current++;
      if (capture.current) release(capture.current);
    },
    [],
  );

  return { state, start, stop: finish, cancel };
}
