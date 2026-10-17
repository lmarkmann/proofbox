import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function PanelCrashed({ error, resetErrorBoundary, title }: FallbackProps & { title: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <TriangleAlertIcon className="size-5 text-destructive" />
        <div className="flex max-w-sm flex-col gap-1">
          <p className="text-sm font-medium">{title} stopped working</p>
          <p className="text-sm text-muted-foreground">
            The rest of the station still works. Reload this panel; if it keeps failing, reload the
            page.
          </p>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={resetErrorBoundary}>
          Reload panel
        </Button>
      </CardContent>
    </Card>
  );
}

/** A render crash in one panel replaces only that panel, with a reset that remounts it. */
export function PanelBoundary({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ErrorBoundary
      fallbackRender={(props) => <PanelCrashed {...props} title={title} />}
      onError={(error) => console.error(`[${title}]`, error)}
    >
      {children}
    </ErrorBoundary>
  );
}
