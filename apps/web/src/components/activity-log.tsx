import { CircleCheckIcon, PackageOpenIcon } from "lucide-react";

import type { PrintedLabel } from "@/components/label-panel";
import { formatTime } from "@/components/status-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ActivityLog({ labels, onStart }: { labels: PrintedLabel[]; onStart: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Boxes labelled at this station since the page opened.</CardDescription>
      </CardHeader>
      <CardContent>
        {labels.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <PackageOpenIcon className="size-5" />
            </div>
            <div className="flex max-w-xs flex-col gap-1">
              <p className="text-sm font-medium">No boxes labelled yet</p>
              <p className="text-sm text-muted-foreground">
                Every label you print lands here with its time. Start with the order ID on the
                packing slip.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={onStart}>
              Write the first label
            </Button>
          </div>
        ) : (
          <ol className="divide-y">
            {labels.map(({ orderId, at }) => (
              <li key={`${orderId}-${at.getTime()}`} className="flex items-center gap-3 py-2.5">
                <CircleCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{orderId}</span>
                <span className="text-xs text-muted-foreground">Label printed</span>
                <time
                  dateTime={at.toISOString()}
                  className="shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                >
                  {formatTime(at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
