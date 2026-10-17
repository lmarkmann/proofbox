import { describe, expect, test } from "vite-plus/test";

import type { TrackPoint } from "@/lib/api";
import {
  checklistOf,
  detectionsAt,
  formatClock,
  framesOf,
  latestPack,
  sightingsOf,
} from "@/proof/pack-model";

const point = (t_ms: number, track: number | null, label: string, x: number): TrackPoint => ({
  t_ms,
  track,
  label,
  conf: 0.9,
  box: [x, 0.1, x + 0.2, 0.3],
});

const points = [
  point(200, 1, "mug", 0.4),
  point(100, 1, "mug", 0.2),
  point(200, 2, "card", 0.6),
  point(1000, 1, "mug", 0.5),
];

describe("detectionsAt", () => {
  const frames = framesOf(points);

  test("groups the flat track into frames in video order", () => {
    expect(frames.map((frame) => frame.t_ms)).toEqual([100, 200, 1000]);
    expect(frames[1].detections).toHaveLength(2);
  });

  test("slides a tracked box toward its next sample", () => {
    const [mug] = detectionsAt(frames, 150);
    expect(mug.box[0]).toBeCloseTo(0.3);
  });

  test("holds the last frame across a gap and shows nothing once it goes stale", () => {
    expect(detectionsAt(frames, 400).map((d) => d.label)).toEqual(["mug", "card"]);
    expect(detectionsAt(frames, 700)).toEqual([]);
    expect(detectionsAt(frames, 50)).toEqual([]);
  });
});

test("sightingsOf keeps the first moment of each tracked object and skips untracked boxes", () => {
  expect(sightingsOf([...points, point(150, null, "tape", 0.1)])).toEqual([
    { label: "mug", track: 1, t_ms: 100 },
    { label: "card", track: 2, t_ms: 200 },
  ]);
});

test("checklistOf compares the order to the counts and lists extras last", () => {
  const rows = checklistOf(
    [
      { name: "mug", qty: 2 },
      { name: "card", qty: 1 },
      { name: "beans", qty: 1 },
    ],
    { mug: 1, card: 1, tape: 2 },
  );
  expect(rows.map((row) => [row.name, row.status])).toEqual([
    ["mug", "partial"],
    ["card", "done"],
    ["beans", "missing"],
    ["tape", "extra"],
  ]);
});

test("latestPack picks the most recently sealed pack", () => {
  const pack = (pack_id: string, sealed_at: string) => ({
    pack_id,
    sealed_at,
    verdict: "complete" as const,
    counts: {},
  });
  expect(latestPack([])).toBeNull();
  expect(
    latestPack([pack("a", "2026-10-17T10:00:00Z"), pack("b", "2026-10-17T12:00:00Z")])?.pack_id,
  ).toBe("b");
});

test("formatClock writes minutes and seconds", () => {
  expect(formatClock(65_400)).toBe("1:05");
});
