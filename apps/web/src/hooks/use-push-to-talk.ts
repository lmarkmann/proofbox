import { useEffect, useRef } from "react";

function typingInto(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("input, textarea, select, [contenteditable=true]")) return true;
  // a keyboard user on a focused button expects Space to press it; a clicked one keeps focus silently
  return target.closest("button, a, [role=button]") !== null && target.matches(":focus-visible");
}

/** Holding Space anywhere outside a text field records; releasing it ends the recording. */
export function usePushToTalk(onHold: () => void, onRelease: () => void) {
  const handlers = useRef({ onHold, onRelease });
  handlers.current = { onHold, onRelease };

  useEffect(() => {
    let held = false;
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (held) {
        event.preventDefault();
        return;
      }
      if (event.repeat || typingInto(event.target)) return;
      event.preventDefault();
      held = true;
      handlers.current.onHold();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !held) return;
      event.preventDefault();
      held = false;
      handlers.current.onRelease();
    };
    const lost = () => {
      if (!held) return;
      held = false;
      handlers.current.onRelease();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", lost);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", lost);
    };
  }, []);
}
