import { useEffect, useState } from "react";

export type Health = {
  status: string;
  version: string;
  printer?: "connected" | "missing";
};

/** Polls a health endpoint; null while it is unreachable. */
export function useHealth(url: string, intervalMs = 5000): Health | null {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      fetch(url)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)
        .then((body: Health | null) => {
          if (!cancelled) setHealth(body);
        });
    void poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  return health;
}
