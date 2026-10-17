import { SparklesIcon, WifiOffIcon } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { ActivityLog, usePackHistory } from "@/components/activity-log";
import { AppHeader } from "@/components/app-header";
import { CameraPanel } from "@/components/camera-panel";
import { LabelPanel, type PrintedLabel } from "@/components/label-panel";
import { Inspector } from "@/components/inspector/inspector";
import { PackHud, PackPanel } from "@/components/pack-panel";
import { PanelBoundary } from "@/components/panel-boundary";
import { StatusStrip } from "@/components/status-strip";
import { VisionOverlay } from "@/components/vision-overlay";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useCamera } from "@/hooks/use-camera";
import { useOnline } from "@/hooks/use-online";
import { usePackSession } from "@/hooks/use-pack-session";
import { type ApiHealth, type PrinterHealth, toPrinterStatus, useProbe } from "@/hooks/use-probe";
import { useQr } from "@/hooks/use-qr";
import { useSealCheck } from "@/hooks/use-seal-check";
import { useVision } from "@/hooks/use-vision";
import type { BenchPhase } from "@/lib/inspector";
import type { PackState } from "@/hooks/use-pack-session";

function benchPhase(state: PackState): BenchPhase {
  switch (state.tag) {
    case "packing":
    case "sealing":
    case "seal-failed":
      return { tag: "packing", orderId: state.order.order_id };
    case "sealed":
      return {
        tag: "sealed",
        orderId: state.order.order_id,
        items: state.order.items,
        short: state.result.verdict !== "complete",
      };
    default:
      return { tag: "idle" };
  }
}

function AskButton({ onClick, flagged }: { onClick: () => void; flagged: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="relative gap-2">
      <SparklesIcon />
      Ask
      <Kbd className="hidden sm:inline-flex">{"⌘"}K</Kbd>
      {flagged && (
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-background">
          <span className="sr-only">The after-seal check needs a look</span>
        </span>
      )}
    </Button>
  );
}

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
  const history = usePackHistory(
    session.state.tag === "sealed" ? session.state.result.pack_id : null,
  );
  const packing = session.state.tag === "packing" ? session.state : null;
  const switchLocked = packing !== null || session.state.tag === "sealing";
  const { lockSwitch } = camera;
  useEffect(() => lockSwitch(switchLocked), [lockSwitch, switchLocked]);
  const vision = useVision(video, packing?.vocabulary ?? null, session.onDetections);
  const boundOrderId = "order" in session.state ? session.state.order.order_id : null;
  const seenOrderId = qr.sighting?.orderId ?? null;
  const foreignLabel = packing && seenOrderId && seenOrderId !== boundOrderId ? seenOrderId : null;
  const [inspecting, setInspecting] = useState(false);
  const check = useSealCheck(session.state.tag === "sealed" ? session.state.result.pack_id : null);
  const flagged = check.tag === "ready" && check.check.verdict !== "complete";

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
    <div className="group/station min-h-svh bg-muted/40">
      <AppHeader>
        <AskButton
          onClick={() => setInspecting((open) => !open)}
          flagged={flagged && !inspecting}
        />
      </AppHeader>
      {!online && <OfflineBanner />}
      <div className="flex items-start">
        <main className="mx-auto flex max-w-7xl min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
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
                  switchLocked={switchLocked}
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
                  history={history}
                  onStart={() => document.getElementById("order-id")?.focus()}
                />
              </PanelBoundary>
            </div>
          </div>
        </main>
        <PanelBoundary title="Inspector">
          <Inspector
            open={inspecting}
            onOpenChange={setInspecting}
            orderId={boundOrderId}
            phase={benchPhase(session.state)}
            check={check}
            onRepack={session.repack}
          />
        </PanelBoundary>
      </div>
    </div>
  );
}
