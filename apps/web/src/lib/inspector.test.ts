import { expect, test } from "vite-plus/test";

import { type BenchPhase, clipRange, suggestionsFor } from "@/lib/inspector";

const sealed = (short: boolean): BenchPhase => ({
  tag: "sealed",
  orderId: "PB-1001",
  items: [{ name: "pen", qty: 3 }],
  short,
});

test("suggestions follow the bench: archive questions idle or unscoped, order questions otherwise", () => {
  expect(suggestionsFor({ tag: "idle" }, false)[0]).toBe("Which packs today were short?");
  expect(suggestionsFor(sealed(false), false)[0]).toBe("Which packs today were short?");
  expect(suggestionsFor({ tag: "packing", orderId: "PB-1001" }, true)).toEqual([
    "What goes into PB-1001?",
    "Was PB-1001 packed before?",
  ]);
  expect(suggestionsFor(sealed(false), true)).toEqual([
    "Was anything missing?",
    "When did the pen go in?",
    "Describe this pack",
  ]);
  expect(suggestionsFor(sealed(true), true)[0]).toBe("Which item is missing?");
});

test("a clip range collapses to one clock when it starts and ends in the same second", () => {
  expect(clipRange({ start_s: null, end_s: null })).toBeNull();
  expect(clipRange({ start_s: 4.2, end_s: null })).toBe("0:04");
  expect(clipRange({ start_s: 4.2, end_s: 4.4 })).toBe("0:04");
  expect(clipRange({ start_s: 4, end_s: 71 })).toBe("0:04-1:11");
});
