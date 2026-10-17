import demoVideo from "@/debug/fixtures/pack-demo.mp4";
import demoTrack from "@/debug/fixtures/pack-demo-track.json";
import { ApiError, type OrderDetail, type TrackPoint } from "@/lib/api";
import { ProofPage } from "@/proof/proof-page";
import type { ProofSource } from "@/proof/use-proof";

export const DEMO_ORDER_ID = "PB-DEMO";

// regenerate the clip and track with `uv run scripts/pack_fixture.py`
export const demoOrder: OrderDetail = {
  order_id: DEMO_ORDER_ID,
  customer: "Acme GmbH, Berlin",
  items: [
    { name: "mug", qty: 1 },
    { name: "coffee beans", qty: 1 },
    { name: "card", qty: 1 },
  ],
  packs: [
    {
      pack_id: "demo",
      sealed_at: "2026-10-17T14:32:00+01:00",
      verdict: "complete",
      counts: { mug: 1, "coffee beans": 1, card: 1 },
    },
  ],
};

export const demoVideoUrl = demoVideo;
export const demoPoints = demoTrack as TrackPoint[];

export const demoSummary =
  "Sample answer. A white mug goes into the left of the carton first, a bag of coffee beans follows on the right, and a red card is laid flat along the front before the box is closed.";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const demoSource: ProofSource = {
  getOrder: async (orderId) => {
    await wait(400);
    if (orderId !== DEMO_ORDER_ID) throw new ApiError(404, "Unknown order");
    return demoOrder;
  },
  getTrack: async () => {
    await wait(300);
    return demoPoints;
  },
  videoUrl: () => demoVideoUrl,
  getSummary: async (packId) => {
    await wait(1800);
    return {
      pack_id: packId,
      text: demoSummary,
      evidence: [{ pack_id: packId, start_s: 1.5, end_s: 9, text: demoSummary }],
    };
  },
};

export default function PackDemo() {
  return (
    <ProofPage
      orderId={DEMO_ORDER_ID}
      source={demoSource}
      notice={
        <div className="border-b bg-amber-500/15 px-4 py-2 text-sm sm:px-6">
          Sample pack: a synthetic clip, its detection track and a canned summary. Not live data.
        </div>
      }
    />
  );
}
