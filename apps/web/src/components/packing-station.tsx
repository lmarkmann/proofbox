import { WifiOffIcon } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { ActivityLog } from "@/components/activity-log";
import { AppHeader } from "@/components/app-header";
import { CameraPanel } from "@/components/camera-panel";
import { LabelPanel, type PrintedLabel } from "@/components/label-panel";
import { PackHud, PackPanel } from "@/components/pack-panel";
import { PanelBoundary } from "@/components/panel-boundary";
import { StatusStrip } from "@/components/status-strip";
import { VisionOverlay } from "@/components/vision-overlay";
import { useCamera } from "@/hooks/use-camera";
import { useOnline } from "@/hooks/use-online";
import { usePackSession } from "@/hooks/use-pack-session";
import { type ApiHealth, type PrinterHealth, toPrinterStatus, useProbe } from "@/hooks/use-probe";
import { useQr } from "@/hooks/use-qr";
import { useVision } from "@/hooks/use-vision";

export function OfflineBanner() {
  return (
    <div role="status" className="border-b bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-sm sm:px-6">
        <WifiOffIcon className="size-4 shrink-0" />
        This computer is offline. The camera and a printer on this machine keep working; the API
        reconnects on its own.
      </p>
    </div>
  );
}

type FrameSize = { width: number; height: number };

function useFrameSize(video: RefObject<HTMLVideoElement | null>) {
  const [size, setSize] = useState<FrameSize | null>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const read = () =>
      setSize(
        element.videoWidth ? { width: element.videoWidth, height: element.videoHeight } : null,
      );
    element.addEventListener("resize", read);
    element.addEventListener("loadedmetadata", read);
    return () => {
      element.removeEventListener("resize", read);
      element.removeEventListener("loadedmetadata", read);
    };
  }, [video]);
  return size;
}

export function PackingStation() {
  const api = useProbe<ApiHealth>("/api/health");
  const printer = toPrinterStatus(useProbe<PrinterHealth>("/printer/health"));
  const camera = useCamera();
  const online = useOnline();
  const [labels, setLabels] = useState<PrintedLabel[]>([]);

  const video = useRef<HTMLVideoElement>(null);
  const frameSize = useFrameSize(video);
  const showing = camera.state.tag === "live" || camera.state.tag === "file";
  const qr = useQr(video, showing);
  const cameraStream = camera.state.tag === "live" ? camera.state.stream : null;
  const recordingStream = useCallback(
    () =>
      cameraStream ??
      (
        video.current as (HTMLVideoElement & { captureStream?: () => MediaStream }) | null
      )?.captureStream?.() ??
      null,
    [cameraStream],
  );
  const session = usePackSession(qr.stableOrderId, recordingStream);
  const packing = session.state.tag === "packing" ? session.state : null;
  const vision = useVision(video, packing?.vocabulary ?? null, session.onDetections);
  const boundOrderId = "order" in session.state ? session.state.order.order_id : null;
  const seenOrderId = qr.sighting?.orderId ?? null;
  const foreignLabel = packing && seenOrderId && seenOrderId !== boundOrderId ? seenOrderId : null;

  useEffect(() => {
    if (!packing) return;
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea");
      if (event.key.toLowerCase() === "s" && !typing && !event.metaKey && !event.ctrlKey)
        void session.seal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [packing, session]);

  return (
    <div className="min-h-svh bg-muted/40">
      <AppHeader />
      {!online && <OfflineBanner />}
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Packing station</h1>
          <p className="text-sm text-muted-foreground">
            Film the pack, print the label, ship every box with proof.
          </p>
        </div>
        <StatusStrip
          api={api}
          printer={printer}
          camera={camera.state}
          labelCount={labels.length}
          lastLabelAt={labels[0]?.at ?? null}
        />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0">
            <PanelBoundary title="Bench camera">
              <CameraPanel
                camera={camera.state}
                video={video}
                onStart={camera.start}
                onStop={camera.stop}
                onPlayFile={camera.playFile}
              >
                <VisionOverlay
                  detections={vision.tag === "live" && packing ? vision.detections : []}
                  qr={qr.sighting}
                  qrMatches={!boundOrderId || seenOrderId === boundOrderId}
                  frameSize={frameSize}
                />
                <PackHud
                  state={session.state}
                  vision={packing ? vision : { tag: "off" }}
                  recordingSince={session.recordingSince}
                  foreignLabel={foreignLabel}
                />
              </CameraPanel>
            </PanelBoundary>
          </div>
          <div className="min-w-0">
            <PanelBoundary title="Current box">
              <PackPanel
                state={session.state}
                spans={session.spans}
                tracksByLabel={session.tracksByLabel}
                onSeal={() => void session.seal()}
                onRetrySeal={session.retrySeal}
                onRetryLookup={session.retryLookup}
                onReset={session.reset}
              />
            </PanelBoundary>
          </div>
          <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-stretch">
            <PanelBoundary title="Box label">
              <LabelPanel
                printer={printer}
                onPrinted={(label) => setLabels((all) => [label, ...all])}
              />
            </PanelBoundary>
          </div>
          <div className="min-w-0">
            <PanelBoundary title="Activity">
              <ActivityLog
                labels={labels}
                onStart={() => document.getElementById("order-id")?.focus()}
              />
            </PanelBoundary>
          </div>
        </div>
      </main>
    </div>
  );
}
