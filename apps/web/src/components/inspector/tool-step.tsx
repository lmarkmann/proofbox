import type { ToolUIPart } from "ai";
import { DatabaseIcon, ScanEyeIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { assertNever } from "@/lib/assert-never";
import { clipRange, type InspectorTools } from "@/lib/inspector";

export type ToolPart = ToolUIPart<InspectorTools>;

type Step = { icon: ReactNode; running: string; done: string; detail?: string; body?: ReactNode };

const shortId = (packId: string | undefined) => (packId ? packId.slice(0, 8) : "");

function describe(part: ToolPart): Step {
  switch (part.type) {
    case "tool-getOrder": {
      const id = part.output?.order_id ?? part.input?.order_id ?? "the order";
      const order = part.output;
      return {
        icon: <DatabaseIcon />,
        running: `Reading ${id} from VastDB`,
        done: `Read ${id} from VastDB`,
        detail:
          order &&
          `${order.items.length} lines, ${order.packs.length} ${order.packs.length === 1 ? "pack" : "packs"}`,
        body: order && (
          <ul className="flex flex-col gap-1">
            {order.items.map((item) => (
              <li key={item.name}>
                {item.qty}x {item.name}
              </li>
            ))}
            {order.packs.map((pack) => (
              <li key={pack.pack_id} className="tabular-nums">
                Pack {shortId(pack.pack_id)}: {pack.verdict}
              </li>
            ))}
          </ul>
        ),
      };
    }
    case "tool-watchPack": {
      const pack = shortId(part.output?.pack_id ?? part.input?.pack_id);
      return {
        icon: <ScanEyeIcon />,
        running: `Cosmos is watching pack ${pack}`,
        done: `Cosmos watched pack ${pack}`,
        detail: part.output && `${part.output.seconds.toFixed(1)} s`,
        body: part.output && <p className="text-pretty">{part.output.seen}</p>,
      };
    }
    case "tool-searchArchive": {
      const query = part.output?.query ?? part.input?.query;
      const hits = part.output?.hits;
      return {
        icon: <SearchIcon />,
        running: query ? `Searching the VAST archive for "${query}"` : "Searching the VAST archive",
        done: query ? `Searched the VAST archive for "${query}"` : "Searched the VAST archive",
        detail: hits && `${hits.length} ${hits.length === 1 ? "clip" : "clips"}`,
        body: part.output && (
          <div className="flex flex-col gap-2">
            <p className="text-pretty">{part.output.answer}</p>
            <ul className="flex flex-col gap-1">
              {part.output.hits.map((hit, index) => (
                <li key={index} className="truncate tabular-nums">
                  <span className="font-medium text-foreground">
                    {hit.order_id ?? shortId(hit.pack_id)} {clipRange(hit)}
                  </span>{" "}
                  {hit.text}
                </li>
              ))}
            </ul>
          </div>
        ),
      };
    }
    default:
      return assertNever(part);
  }
}

/** One agent tool call: present tense with a shimmer while it runs, past tense and expandable after. */
export function ToolStep({ part }: { part: ToolPart }) {
  const step = describe(part);
  switch (part.state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return (
        <Trace>
          <TraceLine status="running">
            <TraceIcon>{step.icon}</TraceIcon>
            <TraceTitle>{step.running}</TraceTitle>
          </TraceLine>
        </Trace>
      );
    case "output-error":
    case "output-denied":
      return (
        <Trace>
          <TraceCollapsible>
            <TraceCollapsibleTrigger>
              <TraceLine status="error">
                <TraceIcon>{step.icon}</TraceIcon>
                <TraceTitle>{step.running} failed</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              {"errorText" in part ? part.errorText : "The tool call was refused."}
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
      );
    case "output-available":
      return (
        <Trace>
          <TraceCollapsible>
            <TraceCollapsibleTrigger>
              <TraceLine>
                <TraceIcon>{step.icon}</TraceIcon>
                <TraceTitle>{step.done}</TraceTitle>
                {step.detail && <TraceDescription>{step.detail}</TraceDescription>}
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>{step.body}</TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
      );
    default:
      return assertNever(part);
  }
}
