import { CameraIcon, CameraOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CameraPanel() {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  async function start() {
    setError(null);
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Camera unavailable");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Packing station</CardTitle>
        <CardDescription>Live view of the bench while items go into the box.</CardDescription>
        <CardAction>
          {stream ? (
            <Button variant="outline" size="sm" onClick={() => setStream(null)}>
              <CameraOffIcon data-icon="inline-start" />
              Stop camera
            </Button>
          ) : (
            <Button size="sm" onClick={start}>
              <CameraIcon data-icon="inline-start" />
              Start camera
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
          <video ref={video} autoPlay playsInline muted className="size-full object-cover" />
          {!stream && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
              {error ?? "Camera is off"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
