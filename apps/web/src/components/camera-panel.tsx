import {
  CameraIcon,
  CameraOffIcon,
  FileVideoIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  VideoOffIcon,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CameraDevice, CameraFailure, CameraState } from "@/hooks/use-camera";
import { assertNever } from "@/lib/assert-never";

const FAILURE: Record<CameraFailure, { title: string; fix: string }> = {
  denied: {
    title: "Camera access is blocked",
    fix: "The browser denied camera permission. Allow it from the camera icon in the address bar, then try again.",
  },
  "not-found": {
    title: "No camera found",
    fix: "Connect a USB camera or check that the built-in one is enabled, then try again.",
  },
  "in-use": {
    title: "Camera is busy",
    fix: "Another app such as Zoom, FaceTime or Photo Booth is using it. Close that app, then try again.",
  },
  insecure: {
    title: "Camera needs a secure page",
    fix: "Browsers only allow the camera on https or localhost. Open the station from one of those.",
  },
  disconnected: {
    title: "Camera disconnected",
    fix: "The video feed stopped. Reconnect the camera, then start it again.",
  },
  unknown: {
    title: "Camera could not start",
    fix: "The browser gave no reason. Reload the page, then try again.",
  },
};

function Corners() {
  const corner = "absolute size-6 border-white/70";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-3">
      <span className={`${corner} top-0 left-0 rounded-tl-md border-t-2 border-l-2`} />
      <span className={`${corner} top-0 right-0 rounded-tr-md border-t-2 border-r-2`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${corner} right-0 bottom-0 rounded-br-md border-r-2 border-b-2`} />
    </div>
  );
}

function StageMessage({
  icon: Icon,
  title,
  children,
  spin,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  spin?: boolean;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-white/10 text-white/80">
        <Icon className={spin ? "size-5 animate-spin motion-reduce:animate-none" : "size-5"} />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-white">{title}</p>
        <div className="text-sm text-white/60">{children}</div>
      </div>
    </div>
  );
}

function Stage({
  camera,
  resolution,
  onStart,
}: {
  camera: CameraState;
  resolution: string | null;
  onStart: () => void;
}) {
  switch (camera.tag) {
    case "off":
      return (
        <StageMessage icon={CameraIcon} title="Camera is off">
          Start it to film each box being packed at the bench.
        </StageMessage>
      );
    case "requesting":
      return (
        <StageMessage icon={LoaderCircleIcon} title="Waiting for camera access" spin>
          Allow the camera in the browser prompt to continue.
        </StageMessage>
      );
    case "live":
    case "file":
      return (
        <>
          <Corners />
          <div className="absolute top-5 left-5 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
            {camera.tag === "live" ? "Live" : "Replay"}
          </div>
          {resolution && (
            <div className="absolute top-5 right-5 rounded-md bg-black/60 px-2 py-1 text-xs text-white/80 tabular-nums backdrop-blur">
              {resolution}
            </div>
          )}
        </>
      );
    case "error":
      return (
        <StageMessage icon={VideoOffIcon} title={FAILURE[camera.failure].title}>
          <p>{FAILURE[camera.failure].fix}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => onStart()}>
            <RotateCcwIcon data-icon="inline-start" />
            Try again
          </Button>
        </StageMessage>
      );
    default:
      return assertNever(camera);
  }
}

function CameraPicker({
  devices,
  deviceId,
  locked,
  onPick,
}: {
  devices: CameraDevice[];
  deviceId: string;
  locked: boolean;
  onPick: (deviceId: string) => void;
}) {
  return (
    <Select
      disabled={locked}
      items={devices.map((device) => ({ value: device.id, label: device.label }))}
      value={deviceId}
      onValueChange={(id) => id && id !== deviceId && onPick(id)}
    >
      <SelectTrigger
        size="sm"
        aria-label="Camera"
        title={locked ? "Seal or discard the box to switch cameras" : undefined}
        className="max-w-48"
      >
        <SelectValue className="truncate" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end" className="w-auto max-w-80">
        {devices.map((device) => (
          <SelectItem key={device.id} value={device.id}>
            {device.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// The clip's frame size, read off the element, so a replay shows the same chrome as the camera.
function useClipResolution(video: RefObject<HTMLVideoElement | null>, url: string | null) {
  const [measured, setMeasured] = useState<{ url: string; resolution: string } | null>(null);
  useEffect(() => {
    const element = video.current;
    if (!element || !url) return;
    const read = () => {
      if (element.videoWidth)
        setMeasured({ url, resolution: `${element.videoWidth}x${element.videoHeight}` });
    };
    element.addEventListener("loadedmetadata", read);
    return () => element.removeEventListener("loadedmetadata", read);
  }, [video, url]);
  return measured && measured.url === url ? measured.resolution : null;
}

export function CameraPanel({
  camera,
  video,
  onStart,
  onStop,
  onPlayFile,
  switchLocked = false,
  children,
}: {
  camera: CameraState;
  video: RefObject<HTMLVideoElement | null>;
  onStart: (deviceId?: string) => void;
  onStop: () => void;
  onPlayFile: (file: File) => void;
  switchLocked?: boolean;
  children?: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const stream = camera.tag === "live" ? camera.stream : null;
  const fileUrl = camera.tag === "file" ? camera.url : null;
  const showing = Boolean(stream ?? fileUrl);
  const clipResolution = useClipResolution(video, fileUrl);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream;
    if (fileUrl) element.src = fileUrl;
    else element.removeAttribute("src");
  }, [video, stream, fileUrl]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bench camera</CardTitle>
        <CardDescription>
          Every box is filmed while it is packed; the label links to it.
        </CardDescription>
        <CardAction className="flex max-w-56 flex-wrap justify-end gap-2 sm:max-w-none">
          {camera.tag === "live" && camera.devices.length > 0 && (
            <CameraPicker
              devices={camera.devices}
              deviceId={camera.deviceId}
              locked={switchLocked}
              onPick={onStart}
            />
          )}
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onPlayFile(file);
              event.target.value = "";
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
            <FileVideoIcon data-icon="inline-start" />
            Use a video
          </Button>
          {camera.tag === "live" || camera.tag === "file" ? (
            <Button variant="outline" size="sm" onClick={onStop}>
              <CameraOffIcon data-icon="inline-start" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => onStart()} disabled={camera.tag === "requesting"}>
              <CameraIcon data-icon="inline-start" />
              Start camera
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <div
          data-source={
            camera.tag === "file" ? "file" : camera.tag === "live" ? "camera" : undefined
          }
          className="relative aspect-video overflow-hidden rounded-lg bg-neutral-950"
        >
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            loop={camera.tag === "file" && camera.loop}
            className={showing ? "size-full object-cover" : "hidden"}
          />
          {showing && children}
          <Stage
            camera={camera}
            resolution={camera.tag === "live" ? camera.resolution : clipResolution}
            onStart={onStart}
          />
        </div>
      </CardContent>
    </Card>
  );
}
