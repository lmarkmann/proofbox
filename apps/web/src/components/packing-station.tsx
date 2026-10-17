import { WifiOffIcon } from "lucide-react";
import { useState } from "react";

import { ActivityLog } from "@/components/activity-log";
import { AppHeader } from "@/components/app-header";
import { CameraPanel } from "@/components/camera-panel";
import { LabelPanel, type PrintedLabel } from "@/components/label-panel";
import { PanelBoundary } from "@/components/panel-boundary";
import { StatusStrip } from "@/components/status-strip";
import { useCamera } from "@/hooks/use-camera";
import { useOnline } from "@/hooks/use-online";
import { type ApiHealth, type PrinterHealth, toPrinterStatus, useProbe } from "@/hooks/use-probe";

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

export function PackingStation() {
  const api = useProbe<ApiHealth>("/api/health");
  const printer = toPrinterStatus(useProbe<PrinterHealth>("/printer/health"));
  const camera = useCamera();
  const online = useOnline();
  const [labels, setLabels] = useState<PrintedLabel[]>([]);

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
              <CameraPanel camera={camera.state} onStart={camera.start} onStop={camera.stop} />
            </PanelBoundary>
          </div>
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch">
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
