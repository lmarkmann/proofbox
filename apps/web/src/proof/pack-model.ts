import type { Detection, OrderItem, PackSummary, TrackPoint } from "@/lib/api";

export type Frame = { t_ms: number; detections: Detection[] };
export type Sighting = { label: string; track: number; t_ms: number };
export type ChecklistRow = {
  name: string;
  qty: number;
  seen: number;
  status: "done" | "partial" | "missing" | "extra";
};

// boxes older than this belong to a gap in the track, not to the frame on screen
const STALE_MS = 400;

export function framesOf(points: TrackPoint[]): Frame[] {
  const byTime = new Map<number, Detection[]>();
  for (const { t_ms, ...detection } of points) {
    const frame = byTime.get(t_ms);
    if (frame) frame.push(detection);
    else byTime.set(t_ms, [detection]);
  }
  return [...byTime]
    .map(([t_ms, detections]) => ({ t_ms, detections }))
    .sort((a, b) => a.t_ms - b.t_ms);
}

export function detectionsAt(frames: Frame[], ms: number): Detection[] {
  let low = 0;
  let high = frames.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (frames[mid].t_ms <= ms) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  if (found < 0 || ms - frames[found].t_ms > STALE_MS) return [];
  const { t_ms, detections } = frames[found];
  const next = frames[found + 1];
  if (!next || next.t_ms - t_ms > STALE_MS) return detections;
  // the track samples at a few hertz; sliding each tracked box toward its next sample keeps it on a moving item
  const k = (ms - t_ms) / (next.t_ms - t_ms);
  return detections.map((detection) => {
    const after = next.detections.find(
      (other) => other.track !== null && other.track === detection.track,
    );
    if (!after) return detection;
    const box = detection.box.map((v, i) => v + (after.box[i] - v) * k) as Detection["box"];
    return { ...detection, box };
  });
}

/** The first moment each tracked object appears, in video order. */
export function sightingsOf(points: TrackPoint[]): Sighting[] {
  const first = new Map<string, Sighting>();
  for (const { label, track, t_ms } of points) {
    if (track === null) continue;
    const key = `${track}:${label}`;
    const seen = first.get(key);
    if (!seen || t_ms < seen.t_ms) first.set(key, { label, track, t_ms });
  }
  return [...first.values()].sort((a, b) => a.t_ms - b.t_ms);
}

/** The order's items against the pack's counts; labels the order lacks come last as extras. */
export function checklistOf(items: OrderItem[], counts: PackSummary["counts"]): ChecklistRow[] {
  const rows: ChecklistRow[] = items.map(({ name, qty }) => {
    const seen = counts[name] ?? 0;
    return { name, qty, seen, status: seen >= qty ? "done" : seen > 0 ? "partial" : "missing" };
  });
  const expected = new Set(items.map((item) => item.name));
  for (const [name, seen] of Object.entries(counts))
    if (!expected.has(name) && seen > 0) rows.push({ name, qty: 0, seen, status: "extra" });
  return rows;
}

export function latestPack(packs: PackSummary[]): PackSummary | null {
  return packs.reduce<PackSummary | null>(
    (latest, pack) => (!latest || pack.sealed_at > latest.sealed_at ? pack : latest),
    null,
  );
}

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
