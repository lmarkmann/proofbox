import { useCallback, useEffect, useRef, useState } from "react";

export type CameraFailure =
  | "denied"
  | "not-found"
  | "in-use"
  | "insecure"
  | "disconnected"
  | "unknown";

export type CameraDevice = { id: string; label: string };

export type CameraState =
  | { tag: "off" }
  | { tag: "requesting" }
  | {
      tag: "live";
      stream: MediaStream;
      resolution: string | null;
      deviceId: string;
      devices: CameraDevice[];
    }
  | { tag: "file"; url: string; name: string; loop: boolean }
  | { tag: "error"; failure: CameraFailure };

const PHONE = /iphone|continuity/i;
const STORAGE_KEY = "proofbox.camera";

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

function rememberedCamera(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberCamera(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // private windows and blocked storage just forget the choice
  }
}

/** The remembered camera if it is plugged in, else an iPhone over Continuity Camera. */
export function preferredCamera(devices: CameraDevice[], remembered: string | null) {
  return (devices.find((device) => device.id === remembered) ?? devices.find(isPhone))?.id;
}

const isPhone = (device: CameraDevice) => PHONE.test(device.label);

/** `raw` as a same-origin path under /demo/, or null for anything else. */
export function demoClipPath(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw, origin);
    return url.origin === origin && url.pathname.startsWith("/demo/") ? url.pathname : null;
  } catch {
    return null;
  }
}

function replayFromQuery(): CameraState {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("replay");
  if (raw === null) return { tag: "off" };
  const url = demoClipPath(raw, window.location.origin);
  if (!url) {
    console.warn(`?replay must point under /demo/, ignoring ${raw}`);
    return { tag: "off" };
  }
  return {
    tag: "file",
    url,
    name: decodeURIComponent(url.slice(url.lastIndexOf("/") + 1)),
    loop: params.has("loop"),
  };
}

async function listCameras(): Promise<CameraDevice[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((device) => device.kind === "videoinput" && device.deviceId)
    .map((device, index) => ({
      id: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

async function open(deviceId: string | undefined): Promise<MediaStream> {
  const video = deviceId ? { deviceId: { exact: deviceId } } : true;
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (cause) {
    if (!deviceId || classify(cause) !== "not-found") throw cause;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

const halt = (media: MediaStream) => media.getTracks().forEach((track) => track.stop());
const deviceOf = (media: MediaStream) => media.getVideoTracks()[0]?.getSettings().deviceId ?? "";

export function useCamera() {
  const [state, setState] = useState<CameraState>(replayFromQuery);
  const stream = useRef<MediaStream | null>(null);
  const fileUrl = useRef<string | null>(null);
  const attempt = useRef(0);
  const onTrackEnded = useRef(() => {});
  const switchLocked = useRef(false);

  const release = useCallback(() => {
    if (stream.current) halt(stream.current);
    stream.current = null;
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    fileUrl.current = null;
  }, []);

  // Opens `deviceId` (or the preferred camera when omitted) and swaps it in once it streams,
  // so a running feed stays on screen while the next one starts.
  const connect = useCallback(
    async (deviceId?: string) => {
      const current = ++attempt.current;
      try {
        let media = await open(deviceId ?? rememberedCamera() ?? undefined);
        const devices = await listCameras();
        const target = deviceId ?? preferredCamera(devices, rememberedCamera());
        if (target && target !== deviceOf(media) && current === attempt.current) {
          halt(media);
          media = await open(target);
        }
        if (current !== attempt.current) {
          halt(media);
          return;
        }
        const track = media.getVideoTracks()[0];
        const { width, height } = track.getSettings();
        track.addEventListener("ended", () => {
          if (stream.current === media) onTrackEnded.current();
        });
        release();
        stream.current = media;
        setState({
          tag: "live",
          stream: media,
          resolution: width && height ? `${width}x${height}` : null,
          deviceId: deviceOf(media),
          devices,
        });
      } catch (cause) {
        if (current !== attempt.current) return;
        release();
        setState({ tag: "error", failure: classify(cause) });
      }
    },
    [release],
  );

  // On a camera plugging in or dropping out: keep the current one if it is still the best
  // choice or switching is locked, otherwise move to the preferred or any remaining camera.
  const fallBack = useCallback(async () => {
    const media = stream.current;
    if (!media) return;
    const devices = await listCameras();
    if (stream.current !== media) return;
    const id = deviceOf(media);
    const alive =
      media.getVideoTracks()[0]?.readyState === "live" &&
      devices.some((device) => device.id === id);
    const target = preferredCamera(devices, rememberedCamera()) ?? (alive ? id : devices[0]?.id);
    if (alive && (switchLocked.current || target === id)) {
      setState((now) => (now.tag === "live" && now.stream === media ? { ...now, devices } : now));
    } else if (target) {
      await connect(target);
    } else {
      attempt.current++;
      release();
      setState({ tag: "error", failure: "disconnected" });
    }
  }, [connect, release]);

  const start = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ tag: "error", failure: "insecure" });
        return;
      }
      if (deviceId) rememberCamera(deviceId);
      if (!stream.current) {
        release();
        setState({ tag: "requesting" });
      }
      await connect(deviceId);
    },
    [connect, release],
  );

  // While a box is being recorded only a dropped camera may be replaced; unlocking catches up
  // on any switch that waited, such as the phone coming back.
  const lockSwitch = useCallback(
    (locked: boolean) => {
      switchLocked.current = locked;
      if (!locked) void fallBack();
    },
    [fallBack],
  );

  const playFile = useCallback(
    (file: File) => {
      attempt.current++;
      release();
      fileUrl.current = URL.createObjectURL(file);
      setState({ tag: "file", url: fileUrl.current, name: file.name, loop: false });
    },
    [release],
  );

  const stop = useCallback(() => {
    attempt.current++;
    release();
    setState({ tag: "off" });
  }, [release]);

  useEffect(() => {
    onTrackEnded.current = () => void fallBack();
    const devices = navigator.mediaDevices;
    if (!devices) return;
    const onChange = () => void fallBack();
    devices.addEventListener("devicechange", onChange);
    return () => devices.removeEventListener("devicechange", onChange);
  }, [fallBack]);

  useEffect(
    () => () => {
      attempt.current++;
      release();
    },
    [release],
  );

  return { state, start, playFile, stop, lockSwitch };
}
