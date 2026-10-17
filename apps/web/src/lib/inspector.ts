import type { UIMessage } from "ai";

import type { OrderItem, PackSummary } from "@/lib/api";

/** A moment in a pack's clip the agent cites; `label` names what is in it. */
export type EvidenceClip = {
  pack_id: string;
  order_id: string | null;
  start_s: number | null;
  end_s: number | null;
  label: string;
  text: string;
};

export type ArchiveHit = Omit<EvidenceClip, "label">;

export type InspectorTools = {
  getOrder: {
    input: { order_id?: string };
    output: { order_id: string; customer: string; items: OrderItem[]; packs: PackSummary[] };
  };
  watchPack: {
    input: { pack_id?: string; question?: string };
    output: { pack_id: string; seconds: number; seen: string };
  };
  searchArchive: {
    input: { query?: string };
    output: { query: string; answer: string; hits: ArchiveHit[] };
  };
};

export type InspectorMessage = UIMessage<
  { traceUrl?: string },
  { evidence: EvidenceClip },
  InspectorTools
>;

export type BenchPhase =
  | { tag: "idle" }
  | { tag: "packing"; orderId: string }
  | { tag: "sealed"; orderId: string; items: OrderItem[]; short: boolean };

/** What a packer most likely wants to ask next, given what is on the bench. */
export function suggestionsFor(phase: BenchPhase, scoped: boolean): string[] {
  if (!scoped || phase.tag === "idle")
    return [
      "Which packs today were short?",
      "Find a pack with a mug in it",
      "What did the last sealed pack contain?",
    ];
  if (phase.tag === "packing")
    return [`What goes into ${phase.orderId}?`, `Was ${phase.orderId} packed before?`];
  const first = phase.items[0]?.name;
  return [
    phase.short ? "Which item is missing?" : "Was anything missing?",
    ...(first ? [`When did the ${first} go in?`] : []),
    "Describe this pack",
  ];
}

export function clipRange({ start_s, end_s }: Pick<EvidenceClip, "start_s" | "end_s">) {
  if (start_s === null) return null;
  const clock = (seconds: number) => {
    const whole = Math.max(0, Math.round(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  };
  return end_s === null || Math.round(end_s) === Math.round(start_s)
    ? clock(start_s)
    : `${clock(start_s)}-${clock(end_s)}`;
}
