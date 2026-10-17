import { CircleAlertIcon, CircleCheckIcon, PackageOpenIcon, TagIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { PrintedLabel } from "@/components/label-panel";
import { formatTime } from "@/components/status-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type RecentPack, recentPacks, type Verdict } from "@/lib/api";

type Entry =
  | { tag: "label"; orderId: string; at: Date }
  | { tag: "pack"; orderId: string; at: Date; verdict: Verdict };

const VERDICT_TEXT: Record<Verdict, string> = {
  complete: "Sealed, complete",
  short: "Sealed, items missing",
  unexpected: "Sealed, extra items",
};

function entriesOf(labels: PrintedLabel[], packs: RecentPack[]): Entry[] {
  return [
    ...labels.map(({ orderId, at }): Entry => ({ tag: "label", orderId, at })),
    ...packs.map((pack): Entry => ({
      tag: "pack",
      orderId: pack.order_id,
      at: new Date(pack.sealed_at),
      verdict: pack.verdict,
    })),
  ].toSorted((a, b) => b.at.getTime() - a.at.getTime());
}

export type PackHistory = RecentPack[] | "unavailable";

/** Every pack sealed at the station, which the API keeps across reloads; refetched after each seal. */
export function usePackHistory(sealedPackId: string | null): PackHistory {
  const [history, setHistory] = useState<PackHistory>([]);
  useEffect(() => {
    let current = true;
    recentPacks().then(
      (recent) => current && setHistory(recent),
      () => current && setHistory("unavailable"),
    );
    return () => {
      current = false;
    };
  }, [sealedPackId]);
  return history;
}

/** Labels printed this session merged with the station's sealed packs. */
export function ActivityLog({
  labels,
  history,
  onStart,
}: {
  labels: PrintedLabel[];
  history: PackHistory;
  onStart: () => void;
}) {
  const historyDown = history === "unavailable";
  const entries = entriesOf(labels, historyDown ? [] : history);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          {historyDown
            ? "Labels printed since the page opened; sealed packs load once the API is reachable."
            : "Labels printed and boxes sealed at this station."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <PackageOpenIcon className="size-5" />
            </div>
            <div className="flex max-w-xs flex-col gap-1">
              <p className="text-sm font-medium">No boxes labelled yet</p>
              <p className="text-sm text-muted-foreground">
                Every label you print and box you seal lands here with its time. Start with the
                order ID on the packing slip.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={onStart}>
              Write the first label
            </Button>
          </div>
        ) : (
          <ol className="divide-y">
            {entries.map((entry) => (
              <li
                key={`${entry.tag}-${entry.orderId}-${entry.at.getTime()}`}
                className="flex items-center gap-3 py-2.5"
              >
                {entry.tag === "label" ? (
                  <TagIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : entry.verdict === "complete" ? (
                  <CircleCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleAlertIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                {entry.tag === "pack" ? (
                  <a
                    href={`/proof/${encodeURIComponent(entry.orderId)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {entry.orderId}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {entry.orderId}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {entry.tag === "label" ? "Label printed" : VERDICT_TEXT[entry.verdict]}
                </span>
                <time
                  dateTime={entry.at.toISOString()}
                  className="shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                >
                  {formatTime(entry.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
