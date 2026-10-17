import type { OrderItem } from "@/lib/api";

/** The order ID a ProofBox label's QR encodes, from any origin that printed it. */
export function orderIdFromProofUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const match = /^\/proof\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return null;
  }
}

export type Fit = "cover" | "contain";
export type Placement = { scale: number; dx: number; dy: number };

/** Where object-fit places a source frame inside a box; dx and dy go negative where cover crops. */
export function placeFrame(
  fit: Fit,
  frameWidth: number,
  frameHeight: number,
  boxWidth: number,
  boxHeight: number,
): Placement {
  const pick = fit === "cover" ? Math.max : Math.min;
  const scale = pick(boxWidth / frameWidth, boxHeight / frameHeight);
  return {
    scale,
    dx: (boxWidth - frameWidth * scale) / 2,
    dy: (boxHeight - frameHeight * scale) / 2,
  };
}

export type ChecklistRow = {
  name: string;
  qty: number;
  seen: number;
  status: "missing" | "partial" | "done" | "extra";
};

/** Counts distinct tracks per label against the order; labels the order lacks come last as extras. */
export function reconcile(
  items: OrderItem[],
  tracksByLabel: ReadonlyMap<string, ReadonlySet<number>>,
): ChecklistRow[] {
  const expected = new Set(items.map((item) => item.name));
  const rows: ChecklistRow[] = items.map(({ name, qty }) => {
    const seen = tracksByLabel.get(name)?.size ?? 0;
    return {
      name,
      qty,
      seen,
      status: seen >= qty ? "done" : seen > 0 ? "partial" : "missing",
    };
  });
  for (const [name, tracks] of tracksByLabel) {
    if (!expected.has(name) && tracks.size > 0)
      rows.push({ name, qty: 0, seen: tracks.size, status: "extra" });
  }
  return rows;
}
