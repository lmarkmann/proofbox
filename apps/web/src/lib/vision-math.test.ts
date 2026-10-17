import { describe, expect, test } from "vite-plus/test";

import { orderIdFromProofUrl, placeFrame, reconcile } from "@/lib/vision-math";

describe("orderIdFromProofUrl", () => {
  test("reads the ID from labels printed on any origin", () => {
    expect(orderIdFromProofUrl("http://localhost:5173/proof/PB-1001")).toBe("PB-1001");
    expect(orderIdFromProofUrl("https://proofbox.luis-markmann.workers.dev/proof/PB%2F7")).toBe(
      "PB/7",
    );
  });

  test("rejects codes that are not ProofBox labels", () => {
    expect(orderIdFromProofUrl("PB-1001")).toBeNull();
    expect(orderIdFromProofUrl("https://example.com/p/PB-1001")).toBeNull();
    expect(orderIdFromProofUrl("https://example.com/proof/")).toBeNull();
    expect(orderIdFromProofUrl("https://example.com/proof/%E0")).toBeNull();
  });
});

describe("placeFrame", () => {
  test("cover crops a 16:9 frame left and right in a square box", () => {
    const { scale, dx, dy } = placeFrame("cover", 1280, 720, 360, 360);
    expect(scale).toBeCloseTo(0.5);
    expect(dx).toBeCloseTo(-140);
    expect(dy).toBeCloseTo(0);
  });

  test("contain letterboxes the same frame top and bottom", () => {
    const { scale, dx, dy } = placeFrame("contain", 1280, 720, 360, 360);
    expect(scale).toBeCloseTo(0.28125);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeCloseTo(78.75);
  });
});

describe("reconcile", () => {
  test("counts distinct tracks and flags shortfalls and extras", () => {
    const rows = reconcile(
      [
        { name: "coffee mug", qty: 1 },
        { name: "pen", qty: 3 },
        { name: "stapler", qty: 1 },
      ],
      new Map([
        ["coffee mug", new Set([4])],
        ["pen", new Set([7, 9])],
        ["banana", new Set([2])],
      ]),
    );
    expect(rows.map((row) => [row.name, row.seen, row.status])).toEqual([
      ["coffee mug", 1, "done"],
      ["pen", 2, "partial"],
      ["stapler", 0, "missing"],
      ["banana", 1, "extra"],
    ]);
  });
});
