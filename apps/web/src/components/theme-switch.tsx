import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useId } from "react";
import { flushSync } from "react-dom";

import { type Theme, useTheme } from "@/components/theme-provider";

const CHOICES = [
  { value: "system", label: "System theme", Icon: MonitorIcon },
  { value: "light", label: "Light theme", Icon: SunIcon },
  { value: "dark", label: "Dark theme", Icon: MoonIcon },
] as const satisfies { value: Theme; label: string; Icon: typeof SunIcon }[];

const resolve = (theme: Theme) =>
  theme === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : theme;

/** The murios lander's switch: crossfades the page while the thumb slides to the new choice. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const group = useId();

  function choose(next: Theme) {
    if (!document.startViewTransition || resolve(theme) === resolve(next)) return setTheme(next);
    document.startViewTransition(() => flushSync(() => setTheme(next)));
  }

  return (
    <fieldset className="theme-switch" data-choice={theme}>
      <legend className="sr-only">Theme</legend>
      <span className="thumb" aria-hidden />
      {CHOICES.map(({ value, label, Icon }) => (
        <label key={value} title={label}>
          <input
            type="radio"
            name={group}
            value={value}
            checked={theme === value}
            onChange={() => choose(value)}
            aria-label={label}
          />
          <Icon className="size-3.5" aria-hidden />
        </label>
      ))}
    </fieldset>
  );
}
