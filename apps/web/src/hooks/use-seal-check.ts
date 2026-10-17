import { useEffect, useState } from "react";

import { ApiError, getCheck, type SealCheck } from "@/lib/api";

export type CheckState =
  | { tag: "none" }
  | { tag: "pending"; packId: string }
  | { tag: "ready"; check: SealCheck }
  | { tag: "unavailable"; packId: string };

const POLL_MS = 4000;
// Cosmos takes well under a minute per clip; past this the background check has failed
const GIVE_UP_MS = 4 * 60_000;

/** Polls the agent's after-seal check for a pack until it lands. */
export function useSealCheck(packId: string | null): CheckState {
  const [state, setState] = useState<CheckState>({ tag: "none" });

  useEffect(() => {
    if (!packId) {
      setState({ tag: "none" });
      return;
    }
    setState({ tag: "pending", packId });
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        setState({ tag: "ready", check: await getCheck(packId, controller.signal) });
      } catch (cause) {
        if (controller.signal.aborted) return;
        // 0 is a dropped tunnel, worth riding out like a check still in progress
        const waiting = cause instanceof ApiError && (cause.status === 404 || cause.status === 0);
        if (waiting && Date.now() - started < GIVE_UP_MS) timer = setTimeout(poll, POLL_MS);
        else setState({ tag: "unavailable", packId });
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [packId]);

  return state;
}
