import { useEffect, useState } from "react";

export type Probe<T> = { tag: "checking" } | { tag: "down" } | { tag: "up"; body: T };

export type ApiHealth = { status: string; version: string };
export type PrinterHealth = ApiHealth & { printer: "connected" | "missing" };

export type PrinterStatus =
  | { tag: "checking" }
  | { tag: "agent-down" }
  | { tag: "no-printer"; version: string }
  | { tag: "ready"; version: string };

/** Polls a health endpoint. "checking" only until the first answer; after that up or down. */
export function useProbe<T>(url: string, intervalMs = 5000): Probe<T> {
  const [probe, setProbe] = useState<Probe<T>>({ tag: "checking" });

  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      fetch(url)
        .then((response) => (response.ok ? (response.json() as Promise<T>) : null))
        .catch(() => null)
        .then((body) => {
          if (!cancelled) setProbe(body ? { tag: "up", body } : { tag: "down" });
        });
    void poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  return probe;
}

export function toPrinterStatus(probe: Probe<PrinterHealth>): PrinterStatus {
  switch (probe.tag) {
    case "checking":
      return { tag: "checking" };
    case "down":
      return { tag: "agent-down" };
    case "up":
      return probe.body.printer === "connected"
        ? { tag: "ready", version: probe.body.version }
        : { tag: "no-printer", version: probe.body.version };
  }
}
