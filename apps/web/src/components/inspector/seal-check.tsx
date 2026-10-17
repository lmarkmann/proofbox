import { CircleCheckIcon, RotateCcwIcon, ScanEyeIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";
import type { CheckState } from "@/hooks/use-seal-check";
import { assertNever } from "@/lib/assert-never";

export type CheckChoice = "repack" | "ship";

/**
 * The agent's own look at a box right after it is sealed. A disagreement with the order
 * asks the packer to repack or ship it as it is.
 */
export function SealCheckCard({
  state,
  orderId,
  choice,
  onChoose,
}: {
  state: CheckState;
  orderId: string;
  choice: CheckChoice | null;
  onChoose: (choice: CheckChoice) => void;
}) {
  switch (state.tag) {
    case "none":
      return null;
    case "pending":
      return (
        <Trace>
          <TraceLine status="running">
            <TraceIcon>
              <ScanEyeIcon />
            </TraceIcon>
            <TraceTitle>Cosmos is checking the sealed box against {orderId}</TraceTitle>
          </TraceLine>
        </Trace>
      );
    case "unavailable":
      return (
        <p className="text-xs text-muted-foreground">
          The after-seal check did not finish, so the detector's count stands.
        </p>
      );
    case "ready": {
      const { verdict, text } = state.check;
      if (verdict === "complete")
        return (
          <Item variant="muted" size="sm">
            <ItemMedia variant="icon">
              <CircleCheckIcon className="text-emerald-600 dark:text-emerald-400" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Cosmos agrees, everything on {orderId} went in</ItemTitle>
              <ItemDescription>{text}</ItemDescription>
            </ItemContent>
          </Item>
        );
      const shipAs = verdict === "short" ? "Ship as short" : "Ship as is";
      return (
        <Item
          variant="outline"
          className="border-amber-500/40 bg-amber-500/5"
          role="alert"
          aria-live="assertive"
        >
          <ItemMedia variant="icon">
            <TriangleAlertIcon className="text-amber-600 dark:text-amber-400" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {verdict === "short"
                ? `Cosmos counted less than ${orderId} needs`
                : `Cosmos saw something not on ${orderId}`}
            </ItemTitle>
            <ItemDescription className="line-clamp-none">{text}</ItemDescription>
          </ItemContent>
          {choice ? (
            <p className="basis-full pl-6 text-xs text-muted-foreground">
              {choice === "repack" ? "Repacking with a new recording." : `${shipAs}, noted.`}
            </p>
          ) : (
            <ItemActions className="basis-full justify-end">
              <Button size="sm" variant="ghost" onClick={() => onChoose("ship")}>
                {shipAs}
              </Button>
              <Button size="sm" onClick={() => onChoose("repack")}>
                <RotateCcwIcon />
                Repack
              </Button>
            </ItemActions>
          )}
        </Item>
      );
    }
    default:
      return assertNever(state);
  }
}
