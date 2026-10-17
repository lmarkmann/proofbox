import { CameraIcon, PrinterIcon, ServerIcon, TagIcon, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { CameraState } from "@/hooks/use-camera";
import type { ApiHealth, PrinterStatus, Probe } from "@/hooks/use-probe";
import { assertNever } from "@/lib/assert-never";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "down" | "idle";

type Reading = { tag: "checking" } | { tag: "known"; tone: Tone; value: string; detail: string };

const DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  down: "bg-red-500",
  idle: "bg-muted-foreground/40",
};

function Tile({
  icon: Icon,
  title,
  reading,
}: {
  icon: LucideIcon;
  title: string;
  reading: Reading;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
      <div className="hidden size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground sm:grid">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">{title}</p>
        {reading.tag === "checking" ? (
          <>
            <Skeleton className="mt-1 h-4 w-20" />
            <Skeleton className="mt-1 h-3 w-28" />
            <span className="sr-only">Checking</span>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span aria-hidden className={cn("size-2 rounded-full", DOT[reading.tone])} />
              {reading.value}
            </p>
            <p className="text-xs text-pretty text-muted-foreground sm:truncate">
              {reading.detail}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function apiReading(api: Probe<ApiHealth>): Reading {
  switch (api.tag) {
    case "checking":
      return { tag: "checking" };
    case "up":
      return { tag: "known", tone: "ok", value: "Online", detail: `ProofBox v${api.body.version}` };
    case "down":
      return { tag: "known", tone: "down", value: "Unreachable", detail: "Start it with just dev" };
    default:
      return assertNever(api);
  }
}

function printerReading(printer: PrinterStatus): Reading {
  switch (printer.tag) {
    case "checking":
      return { tag: "checking" };
    case "ready":
      return { tag: "known", tone: "ok", value: "Ready", detail: "JADENS JD-268BT on USB" };
    case "no-printer":
      return {
        tag: "known",
        tone: "warn",
        value: "Not connected",
        detail: "Plug in the printer over USB",
      };
    case "agent-down":
      return {
        tag: "known",
        tone: "down",
        value: "Agent offline",
        detail: "Run just dev on this machine",
      };
    default:
      return assertNever(printer);
  }
}

function cameraReading(camera: CameraState): Reading {
  switch (camera.tag) {
    case "off":
      return { tag: "known", tone: "idle", value: "Off", detail: "Start it on the bench view" };
    case "requesting":
      return {
        tag: "known",
        tone: "warn",
        value: "Waiting",
        detail: "Allow access in the browser",
      };
    case "live":
      return { tag: "known", tone: "ok", value: "Live", detail: camera.resolution ?? "Streaming" };
    case "file":
      return { tag: "known", tone: "warn", value: "Video file", detail: camera.name };
    case "error":
      return { tag: "known", tone: "down", value: "Unavailable", detail: "See the bench view" };
    default:
      return assertNever(camera);
  }
}

export function StatusStrip({
  api,
  printer,
  camera,
  labelCount,
  lastLabelAt,
}: {
  api: Probe<ApiHealth>;
  printer: PrinterStatus;
  camera: CameraState;
  labelCount: number;
  lastLabelAt: Date | null;
}) {
  return (
    <section aria-label="Station status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile icon={ServerIcon} title="API" reading={apiReading(api)} />
      <Tile icon={PrinterIcon} title="Printer" reading={printerReading(printer)} />
      <Tile icon={CameraIcon} title="Camera" reading={cameraReading(camera)} />
      <Tile
        icon={TagIcon}
        title="Labels this session"
        reading={{
          tag: "known",
          tone: labelCount > 0 ? "ok" : "idle",
          value: String(labelCount),
          detail: lastLabelAt ? `Last at ${formatTime(lastLabelAt)}` : "None printed yet",
        }}
      />
    </section>
  );
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
