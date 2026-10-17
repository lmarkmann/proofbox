import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PackageCheckIcon,
  RotateCcwIcon,
  ScanLineIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { labelColor } from "@/components/vision-overlay";
import type { PackState, Span } from "@/hooks/use-pack-session";
import type { VisionState } from "@/hooks/use-vision";
import type { Verdict } from "@/lib/api";
import { assertNever } from "@/lib/assert-never";
import { cn } from "@/lib/utils";
import { type ChecklistRow, reconcile } from "@/lib/vision-math";

const STATUS: Record<ChecklistRow["status"], { icon: typeof CircleCheckIcon; tone: string }> = {
  done: { icon: CircleCheckIcon, tone: "text-emerald-600 dark:text-emerald-400" },
  partial: { icon: CircleDotIcon, tone: "text-amber-600 dark:text-amber-400" },
  missing: { icon: CircleDashedIcon, tone: "text-muted-foreground" },
  extra: { icon: TriangleAlertIcon, tone: "text-red-600 dark:text-red-400" },
};

const VERDICT: Record<Verdict, { title: string; tone: string }> = {
  complete: {
    title: "Every item was seen going in",
    tone: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  },
  short: {
    title: "Something on the order was not seen",
    tone: "bg-amber-500/10 text-amber-900 dark:text-amber-200",
  },
  unexpected: {
    title: "An item not on the order went in",
    tone: "bg-red-500/10 text-red-800 dark:text-red-300",
  },
};

export function ItemChecklist({ rows }: { rows: ChecklistRow[] }) {
  return (
    <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
      {rows.map((row) => {
        const { icon: Icon, tone } = STATUS[row.status];
        return (
          <li key={row.name} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Icon className={cn("size-4 shrink-0", tone)} />
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: labelColor(row.name) }}
            />
            <span className={cn("min-w-0 flex-1 truncate", row.status === "extra" && tone)}>
              {row.name}
              {row.status === "extra" && " (not on the order)"}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {row.status === "extra" ? row.seen : `${row.seen}/${row.qty}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One lane per label, one bar per tracked object, so the operator sees what the camera recognized and when. */
export function DetectionTimeline({ spans, labels }: { spans: Span[]; labels: string[] }) {
  const lanes = [...new Set([...labels, ...spans.map((span) => span.label)])];
  const end = Math.max(10_000, ...spans.map((span) => span.to + 500));
  return (
    <div className="flex flex-col gap-1.5" aria-label="When each item was recognized">
      {lanes.map((label) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{label}</span>
          <div className="relative h-3 flex-1 overflow-hidden rounded-sm bg-muted">
            {spans
              .filter((span) => span.label === label)
              .map((span) => (
                <span
                  key={span.track}
                  className="absolute inset-y-0 rounded-sm"
                  style={{
                    left: `${(span.from / end) * 100}%`,
                    width: `max(3px, ${((span.to - span.from) / end) * 100}%)`,
                    background: labelColor(label),
                  }}
                />
              ))}
          </div>
        </div>
      ))}
      <p className="text-right text-xs text-muted-foreground tabular-nums">
        {(end / 1000).toFixed(0)} s
      </p>
    </div>
  );
}

function useSecondsSince(since: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? null : Math.max(0, Math.floor((now - since) / 1000));
}

function hudText(state: PackState) {
  switch (state.tag) {
    case "scanning":
      return "Show the box label";
    case "looking-up":
      return `Found ${state.orderId}`;
    case "lookup-failed":
      return `${state.orderId} not loaded`;
    case "packing":
      return `Packing ${state.order.order_id}`;
    case "sealing":
      return "Sealing";
    case "sealed":
      return `Sealed ${state.order.order_id}`;
    case "seal-failed":
      return "Upload failed";
    default:
      return assertNever(state);
  }
}

export function PackHud({
  state,
  vision,
  recordingSince,
  foreignLabel,
}: {
  state: PackState;
  vision: VisionState;
  recordingSince: number | null;
  foreignLabel: string | null;
}) {
  const seconds = useSecondsSince(state.tag === "packing" ? recordingSince : null);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-5 flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 rounded-md bg-black/70 px-2.5 py-1 text-xs font-medium text-white tabular-nums backdrop-blur">
        {seconds !== null && (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
        )}
        <span>{hudText(state)}</span>
        {vision.tag === "live" && <span className="text-white/60">YOLOE {vision.ms} ms</span>}
        {vision.tag === "connecting" && <span className="text-white/60">connecting detector</span>}
        {vision.tag === "down" && <span className="text-amber-300">detector offline</span>}
      </div>
      {foreignLabel && (
        <div className="rounded-md bg-red-600/90 px-2.5 py-1 text-xs font-medium text-white">
          Label for {foreignLabel} in view; this box is still bound to its order
        </div>
      )}
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: string;
  icon: typeof CircleCheckIcon;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", tone)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function PackPanel({
  state,
  spans,
  tracksByLabel,
  onSeal,
  onRetrySeal,
  onRetryLookup,
  onReset,
}: {
  state: PackState;
  spans: Span[];
  tracksByLabel: ReadonlyMap<string, ReadonlySet<number>>;
  onSeal: () => void;
  onRetrySeal: () => void;
  onRetryLookup: () => void;
  onReset: () => void;
}) {
  const order = "order" in state ? state.order : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{order ? `Order ${order.order_id}` : "Current box"}</CardTitle>
        <CardDescription>
          {order
            ? `${order.customer}, ${order.items.reduce((sum, item) => sum + item.qty, 0)} items`
            : "Scanning the label binds the box to its order and starts recording."}
        </CardDescription>
        {state.tag === "packing" && (
          <CardAction className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onReset}>
              <XIcon data-icon="inline-start" />
              Discard
            </Button>
            <Button size="sm" onClick={onSeal}>
              <PackageCheckIcon data-icon="inline-start" />
              Seal box
              <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">S</kbd>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PackBody
          state={state}
          spans={spans}
          tracksByLabel={tracksByLabel}
          onRetrySeal={onRetrySeal}
          onRetryLookup={onRetryLookup}
          onReset={onReset}
        />
      </CardContent>
    </Card>
  );
}

function PackBody({
  state,
  spans,
  tracksByLabel,
  onRetrySeal,
  onRetryLookup,
  onReset,
}: {
  state: PackState;
  spans: Span[];
  tracksByLabel: ReadonlyMap<string, ReadonlySet<number>>;
  onRetrySeal: () => void;
  onRetryLookup: () => void;
  onReset: () => void;
}) {
  switch (state.tag) {
    case "scanning":
      return (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ScanLineIcon className="size-5 shrink-0" />
          Hold the printed label on the box up to the camera.
        </div>
      );
    case "looking-up":
      return (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />
          Loading order {state.orderId}.
        </div>
      );
    case "lookup-failed":
      return (
        <Notice
          tone="bg-destructive/10 text-destructive"
          icon={CircleAlertIcon}
          title={
            state.unknownOrder
              ? `No order ${state.orderId} in the system`
              : `Could not start packing ${state.orderId}`
          }
        >
          <p className="text-destructive/80">
            {state.unknownOrder
              ? "Print the label from an existing order, or check the ID."
              : `${state.detail} Check that the SSH tunnel to the VM is up.`}
          </p>
          <div className="mt-1 flex gap-2">
            {!state.unknownOrder && (
              <Button size="xs" variant="outline" onClick={onRetryLookup}>
                <RotateCcwIcon data-icon="inline-start" />
                Try again
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={onReset}>
              Scan another label
            </Button>
          </div>
        </Notice>
      );
    case "packing": {
      const rows = reconcile(state.order.items, tracksByLabel);
      return (
        <>
          <ItemChecklist rows={rows} />
          <DetectionTimeline spans={spans} labels={state.order.items.map((item) => item.name)} />
        </>
      );
    }
    case "sealing":
      return (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />
          Uploading the clip and its detections to VAST.
        </div>
      );
    case "sealed": {
      const { result, order } = state;
      const verdict = VERDICT[result.verdict];
      const rows = reconcile(
        order.items,
        new Map(
          Object.entries(result.counts).map(([label, count]) => [
            label,
            new Set(Array.from({ length: count }, (_, index) => index)),
          ]),
        ),
      );
      return (
        <>
          <Notice tone={verdict.tone} icon={PackageCheckIcon} title={verdict.title}>
            {result.upload_error ? (
              <p>Saved, but the VAST upload failed: {result.upload_error}</p>
            ) : (
              <p>Clip and detections are stored; the label opens this proof.</p>
            )}
          </Notice>
          <ItemChecklist rows={rows} />
          <div className="flex gap-2">
            <Button size="sm" onClick={onReset}>
              <ScanLineIcon data-icon="inline-start" />
              Next box
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<a href={`/proof/${encodeURIComponent(order.order_id)}`} target="_blank" />}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              Open proof
            </Button>
          </div>
        </>
      );
    }
    case "seal-failed":
      return (
        <Notice
          tone="bg-destructive/10 text-destructive"
          icon={CircleAlertIcon}
          title="Upload failed"
        >
          <p className="text-destructive/80">
            {state.detail} The clip is kept until you discard it.
          </p>
          <div className="mt-1 flex gap-2">
            <Button size="xs" variant="outline" onClick={onRetrySeal}>
              <RotateCcwIcon data-icon="inline-start" />
              Upload again
            </Button>
            <Button size="xs" variant="ghost" onClick={onReset}>
              Discard
            </Button>
          </div>
        </Notice>
      );
    default:
      return assertNever(state);
  }
}
