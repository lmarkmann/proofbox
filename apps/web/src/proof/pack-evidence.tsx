import {
  CircleAlertIcon,
  CircleCheckIcon,
  CirclePlusIcon,
  SparklesIcon,
  VideoOffIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrderDetail, PackSummary } from "@/lib/api";
import { assertNever } from "@/lib/assert-never";
import { cn } from "@/lib/utils";
import {
  type ChecklistRow,
  checklistOf,
  detectionsAt,
  formatClock,
  framesOf,
  type Sighting,
  sightingsOf,
} from "@/proof/pack-model";
import { ReplayOverlay } from "@/proof/replay-overlay";
import type { SummaryState, TrackState } from "@/proof/use-proof";

// how long a marker or chip stays highlighted after playback passes it
const JUST_SEEN_MS = 1200;

const ROW_STATUS: Record<ChecklistRow["status"], (row: ChecklistRow) => string> = {
  done: (row) => `${row.seen} of ${row.qty} seen going in`,
  partial: (row) => `${row.seen} of ${row.qty} seen going in`,
  missing: () => "Not seen in the video",
  extra: (row) => `Not on the order, seen ${row.seen}x`,
};

function RowIcon({ status }: { status: ChecklistRow["status"] }) {
  switch (status) {
    case "done":
      return <CircleCheckIcon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    case "partial":
    case "missing":
      return <CircleAlertIcon className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />;
    case "extra":
      return <CirclePlusIcon className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />;
    default:
      return assertNever(status);
  }
}

function seenTone(ms: number, at: number) {
  if (ms < at) return "ahead";
  return ms - at < JUST_SEEN_MS ? "just" : "passed";
}

function Timeline({
  ms,
  spanMs,
  sightings,
  onSeek,
}: {
  ms: number;
  spanMs: number | null;
  sightings: Sighting[];
  onSeek: (ms: number) => void;
}) {
  const at = (t: number) => (spanMs ? `${Math.min(100, (t / spanMs) * 100)}%` : "0%");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>{sightings.length ? "Items going in" : "No item detections for this clip"}</span>
        {spanMs && (
          <span className="tabular-nums">
            {formatClock(ms)} / {formatClock(spanMs)}
          </span>
        )}
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-foreground/25" style={{ width: at(ms) }} />
        </div>
        {spanMs &&
          sightings.map((sighting) => {
            const tone = seenTone(ms, sighting.t_ms);
            return (
              <button
                key={`${sighting.track}:${sighting.label}`}
                type="button"
                title={`${sighting.label}, ${formatClock(sighting.t_ms)}`}
                aria-label={`Jump to ${sighting.label} at ${formatClock(sighting.t_ms)}`}
                onClick={() => onSeek(sighting.t_ms)}
                style={{ left: at(sighting.t_ms) }}
                className={cn(
                  "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[background-color,border-color,box-shadow] duration-300 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  tone === "ahead"
                    ? "border-muted-foreground/50 bg-background"
                    : "border-emerald-500 bg-emerald-500",
                  tone === "just" && "shadow-[0_0_0_6px_rgb(16_185_129/0.25)]",
                )}
              />
            );
          })}
      </div>
    </div>
  );
}

function Checklist({
  rows,
  sightings,
  ms,
  onSeek,
}: {
  rows: ChecklistRow[];
  sightings: Sighting[];
  ms: number;
  onSeek: (ms: number) => void;
}) {
  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle>Checklist</CardTitle>
        <CardDescription>Each item on the order against what the camera tracked.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.name} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <RowIcon status={row.status} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-sm font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{ROW_STATUS[row.status](row)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {sightings
                    .filter((sighting) => sighting.label === row.name)
                    .map((sighting) => {
                      const tone = seenTone(ms, sighting.t_ms);
                      return (
                        <button
                          key={sighting.track}
                          type="button"
                          onClick={() => onSeek(sighting.t_ms)}
                          aria-label={`Jump to ${row.name} at ${formatClock(sighting.t_ms)}`}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-xs tabular-nums transition-[background-color,color,box-shadow] duration-300 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            tone === "ahead"
                              ? "bg-muted text-muted-foreground hover:bg-muted/70"
                              : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                            tone === "just" && "ring-2 ring-emerald-500/40",
                          )}
                        >
                          {formatClock(sighting.t_ms)}
                        </button>
                      );
                    })}
                </div>
              </div>
              {row.qty > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">x{row.qty}</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Summary({
  summary,
  packId,
  onSeek,
}: {
  summary: SummaryState;
  packId: string;
  onSeek: (ms: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-muted-foreground" />
          What the camera saw
        </CardTitle>
        <CardDescription>NVIDIA Cosmos watched this clip and described the pack.</CardDescription>
      </CardHeader>
      <CardContent>
        {summary.tag === "loading" && (
          <div className="flex appear-late flex-col gap-2" aria-busy="true">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
            <span className="sr-only">Asking Cosmos about this clip</span>
          </div>
        )}
        {summary.tag === "failed" && (
          <p className="text-sm text-muted-foreground">
            The summary is not available right now. The video and checklist above are the record.
          </p>
        )}
        {summary.tag === "ready" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-pretty">{summary.answer.answer}</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.answer.evidence
                .filter((clip) => clip.pack_id === packId && clip.start_s !== null)
                .map((clip) => (
                  <button
                    key={`${clip.start_s}-${clip.end_s}`}
                    type="button"
                    onClick={() => onSeek((clip.start_s ?? 0) * 1000)}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums hover:bg-muted/70"
                  >
                    {formatClock((clip.start_s ?? 0) * 1000)}
                    {clip.end_s !== null && ` to ${formatClock(clip.end_s * 1000)}`}
                  </button>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PackEvidence({
  order,
  pack,
  video,
  track,
  summary,
}: {
  order: OrderDetail;
  pack: PackSummary;
  video: string;
  track: TrackState;
  summary: SummaryState;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const [ms, setMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);

  const points = track.tag === "ready" ? track.points : null;
  const frames = useMemo(() => (points ? framesOf(points) : []), [points]);
  const sightings = useMemo(() => (points ? sightingsOf(points) : []), [points]);
  const rows = checklistOf(order.items, pack.counts);
  // MediaRecorder webm often reports an infinite duration; the track still knows how long it ran
  const spanMs = durationMs ?? (frames.length ? frames[frames.length - 1].t_ms : null);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    let handle = element.requestVideoFrameCallback(function tick(_, frame) {
      setMs(frame.mediaTime * 1000);
      handle = element.requestVideoFrameCallback(tick);
    });
    return () => element.cancelVideoFrameCallback(handle);
  }, [video]);

  function seek(toMs: number) {
    const element = player.current;
    if (!element) return;
    element.currentTime = toMs / 1000;
    setMs(toMs);
    element.play().catch(() => undefined);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-950 ring-1 ring-foreground/10">
          <video
            ref={player}
            src={video}
            controls
            playsInline
            muted
            preload="auto"
            className="size-full object-contain"
            onLoadedMetadata={(event) => {
              const { duration, videoWidth, videoHeight } = event.currentTarget;
              setFrameSize({ width: videoWidth, height: videoHeight });
              if (Number.isFinite(duration)) setDurationMs(duration * 1000);
            }}
            onSeeked={(event) => setMs(event.currentTarget.currentTime * 1000)}
            onError={() => setVideoFailed(true)}
          />
          {!videoFailed && (
            <ReplayOverlay detections={detectionsAt(frames, ms)} frameSize={frameSize} />
          )}
          {videoFailed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <VideoOffIcon className="size-5 text-white/70" />
              <p className="text-sm font-medium text-white">The video could not be played</p>
              <p className="max-w-sm text-sm text-white/60">
                The checklist still shows what was tracked while the box was packed.
              </p>
            </div>
          )}
        </div>
        {track.tag === "failed" && (
          <p className="text-xs text-muted-foreground">
            The item detections could not be loaded, so the video plays without boxes.
          </p>
        )}
        {track.tag === "loading" && <Skeleton className="h-10 w-full appear-late" />}
        {track.tag === "ready" && (
          <Timeline ms={ms} spanMs={spanMs} sightings={sightings} onSeek={seek} />
        )}
      </div>
      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch">
        <Checklist rows={rows} sightings={sightings} ms={ms} onSeek={seek} />
      </div>
      <div className="min-w-0 lg:col-start-1">
        <Summary summary={summary} packId={pack.pack_id} onSeek={seek} />
      </div>
    </div>
  );
}
