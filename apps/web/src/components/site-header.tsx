import { useAuth } from "@workos-inc/authkit-react";
import { LogOutIcon, MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import type { Health } from "@/hooks/use-health";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "down";

function StatusPill({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          tone === "ok" && "bg-emerald-500",
          tone === "warn" && "bg-amber-500",
          tone === "down" && "bg-red-500",
        )}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="sr-only font-medium sm:not-sr-only">{value}</span>
    </div>
  );
}

export function SiteHeader({ api, printer }: { api: Health | null; printer: Health | null }) {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <a href="/" className="shrink-0">
          <img src="/proofbox-wordmark.svg" alt="ProofBox" className="h-7 dark:invert" />
        </a>
        <div className="ml-auto flex items-center gap-2">
          <StatusPill
            label="API"
            value={api ? `v${api.version}` : "offline"}
            tone={api ? "ok" : "down"}
          />
          <StatusPill
            label="Printer"
            value={!printer ? "agent offline" : (printer.printer ?? "unknown")}
            tone={!printer ? "down" : printer.printer === "connected" ? "ok" : "warn"}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setTheme(dark ? "light" : "dark")}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
          {user && (
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground md:inline">
              {user.email}
            </span>
          )}
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => signOut()}>
            <LogOutIcon />
          </Button>
        </div>
      </div>
    </header>
  );
}
