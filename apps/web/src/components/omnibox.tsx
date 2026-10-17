import {
  CircleAlertIcon,
  LoaderCircleIcon,
  MicIcon,
  PlayIcon,
  SearchIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useVoice, type VoiceState } from "@/hooks/use-voice";
import { type Answer, ask, type Evidence } from "@/lib/api";
import { assertNever } from "@/lib/assert-never";
import { cn } from "@/lib/utils";

type AskState =
  | { tag: "idle" }
  | { tag: "asking"; question: string }
  | { tag: "answered"; question: string; answer: Answer }
  | { tag: "failed"; question: string; detail: string };

function clock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const range =
    evidence.start_s === null
      ? null
      : `${clock(evidence.start_s)}${evidence.end_s === null ? "" : `-${clock(evidence.end_s)}`}`;
  const label = [evidence.order_id ?? evidence.pack_id ?? "clip", range].filter(Boolean).join(" ");
  const chip = (
    <>
      <PlayIcon className="size-3" />
      {label}
    </>
  );
  const className =
    "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums";
  return evidence.order_id ? (
    <a
      href={`/proof/${encodeURIComponent(evidence.order_id)}${evidence.start_s === null ? "" : `?t=${evidence.start_s}`}`}
      target="_blank"
      rel="noreferrer"
      title={evidence.text}
      className={cn(className, "hover:bg-accent")}
    >
      {chip}
    </a>
  ) : (
    <span title={evidence.text} className={className}>
      {chip}
    </span>
  );
}

function voiceHint(voice: VoiceState) {
  switch (voice.tag) {
    case "idle":
      return null;
    case "recording":
      return "Listening. Click the mic again when you are done.";
    case "transcribing":
      return "Transcribing with Canary-1B.";
    case "failed":
      return voice.detail;
    default:
      return assertNever(voice);
  }
}

/** Ask anything about an order, typed or spoken; scoped to the box on the bench when there is one. */
export function Omnibox({ orderId }: { orderId: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [question, setQuestion] = useState("");
  const [unscopedFrom, setUnscopedFrom] = useState<string | null>(null);
  const [result, setResult] = useState<AskState>({ tag: "idle" });
  const scope = orderId && unscopedFrom !== orderId ? orderId : null;

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setResult({ tag: "asking", question: trimmed });
    try {
      const answer = await ask(trimmed, scope, controller.signal);
      setResult({ tag: "answered", question: trimmed, answer });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setResult({
        tag: "failed",
        question: trimmed,
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  const voice = useVoice((text) => {
    setQuestion(text);
    void submit(text);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => pending.current?.abort(), []);

  const hint = voiceHint(voice.state);

  return (
    <section aria-label="Ask about orders" className="flex flex-col gap-3">
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void submit(question);
        }}
        className="flex items-center gap-2 rounded-xl bg-card p-2 pl-3 ring-1 ring-foreground/10 focus-within:ring-2 focus-within:ring-ring"
      >
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        {scope && (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
            {scope}
            <button
              type="button"
              aria-label={`Ask about every order instead of ${scope}`}
              onClick={() => setUnscopedFrom(scope)}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        )}
        <input
          ref={input}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !question && scope) setUnscopedFrom(scope);
          }}
          placeholder={
            scope ? `Ask about ${scope}, e.g. was anything missing?` : "Ask about any order or pack"
          }
          aria-label="Question"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
          {"\u2318"}K
        </kbd>
        <Button
          type="button"
          size="icon-sm"
          variant={voice.state.tag === "recording" ? "destructive" : "ghost"}
          aria-label={voice.state.tag === "recording" ? "Stop and transcribe" : "Ask by voice"}
          aria-pressed={voice.state.tag === "recording"}
          disabled={voice.state.tag === "transcribing"}
          onClick={() => (voice.state.tag === "recording" ? voice.stop() : void voice.start())}
        >
          {voice.state.tag === "transcribing" ? (
            <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          ) : voice.state.tag === "recording" ? (
            <SquareIcon />
          ) : (
            <MicIcon />
          )}
        </Button>
        <Button type="submit" size="sm" disabled={!question.trim() || result.tag === "asking"}>
          Ask
        </Button>
      </form>
      {hint && (
        <p
          role="status"
          className={cn(
            "px-1 text-xs",
            voice.state.tag === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
      <AnswerCard result={result} onDismiss={() => setResult({ tag: "idle" })} />
    </section>
  );
}

function AnswerCard({ result, onDismiss }: { result: AskState; onDismiss: () => void }) {
  if (result.tag === "idle") return null;
  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-2 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{result.question}</p>
        <Button size="icon-xs" variant="ghost" aria-label="Dismiss answer" onClick={onDismiss}>
          <XIcon />
        </Button>
      </div>
      {result.tag === "asking" && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
          Watching the pack video with Cosmos.
        </p>
      )}
      {result.tag === "failed" && (
        <p className="flex items-start gap-2 text-destructive">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          {result.detail}
        </p>
      )}
      {result.tag === "answered" && (
        <>
          <p className="flex items-start gap-2 text-pretty whitespace-pre-wrap">
            <SparklesIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {result.answer.answer}
          </p>
          {result.answer.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.answer.evidence.map((evidence, index) => (
                <EvidenceChip key={index} evidence={evidence} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
