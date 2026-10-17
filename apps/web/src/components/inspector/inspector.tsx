import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isStaticToolUIPart } from "ai";
import {
  ArrowUpIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  MicIcon,
  SparklesIcon,
  SquareIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import { EvidenceRow } from "@/components/inspector/evidence";
import { type CheckChoice, SealCheckCard } from "@/components/inspector/seal-check";
import { ToolStep } from "@/components/inspector/tool-step";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";
import { usePushToTalk } from "@/hooks/use-push-to-talk";
import type { CheckState } from "@/hooks/use-seal-check";
import { useVoice, type VoiceState } from "@/hooks/use-voice";
import {
  type BenchPhase,
  type InspectorMessage,
  type PlayableClip,
  suggestionsFor,
} from "@/lib/inspector";
import { cn } from "@/lib/utils";

const ANY_ORDER = "*";

function newChat(scope: string | null) {
  return new Chat<InspectorMessage>({
    id: scope ?? ANY_ORDER,
    transport: new DefaultChatTransport({ api: "/api/chat", body: { order_id: scope } }),
  });
}

function Thinking({ children = "Thinking with W&B Inference" }: { children?: ReactNode }) {
  return (
    <Trace>
      <TraceLine status="running">
        <TraceIcon>
          <SparklesIcon />
        </TraceIcon>
        <TraceTitle>{children}</TraceTitle>
      </TraceLine>
    </Trace>
  );
}

function AgentMessage({ message, streaming }: { message: InspectorMessage; streaming: boolean }) {
  const clips: PlayableClip[] = [];
  const body: ReactNode[] = [];
  let waiting = streaming;
  message.parts.forEach((part, index) => {
    if (isStaticToolUIPart(part)) {
      waiting = streaming && part.state === "output-available";
      body.push(<ToolStep key={index} part={part} />);
    } else if (part.type === "text") {
      waiting = false;
      body.push(
        <Streamdown
          key={index}
          isAnimating={streaming && part.state === "streaming"}
          className="text-sm leading-relaxed text-pretty [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        >
          {part.text}
        </Streamdown>,
      );
    } else if (part.type === "data-evidence" && part.data.pack_id !== null)
      clips.push({ ...part.data, pack_id: part.data.pack_id });
  });
  const traceUrl = message.metadata?.traceUrl;
  return (
    <Message>
      <MessageContent>
        {body}
        {waiting && <Thinking />}
        {clips.length > 0 && !streaming && <EvidenceRow clips={clips} />}
        {!streaming && (
          <MessageFooter className="gap-1 px-0">
            W&B Inference
            {traceUrl && (
              <>
                {" "}
                <span aria-hidden>{"·"}</span>
                <a
                  href={traceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  Weave trace
                  <ExternalLinkIcon className="size-3" />
                </a>
              </>
            )}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}

function UserMessage({ message }: { message: InspectorMessage }) {
  const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
  return (
    <Message align="end">
      <MessageContent>
        <Bubble variant="muted" align="end">
          <BubbleContent>{text}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

function EmptyThread({ scope }: { scope: string | null }) {
  return (
    <div className="m-auto flex max-w-64 flex-col items-center gap-3 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted">
        <SparklesIcon className="size-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium">{scope ? `Ask about ${scope}` : "Ask about any pack"}</p>
      <p className="text-xs text-pretty text-muted-foreground">
        The agent reads orders from VastDB, has Cosmos watch the pack video and searches the VAST
        archive, then cites the moments it saw.
      </p>
    </div>
  );
}

function voiceHint(voice: VoiceState) {
  if (voice.tag === "recording")
    return (
      <span className="flex items-center gap-1.5 text-foreground">
        <span className="size-2 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
        Listening, release to send
      </span>
    );
  if (voice.tag === "transcribing")
    return (
      <span className="flex items-center gap-1.5">
        <Spinner className="size-3" />
        Finishing with Canary-1B
      </span>
    );
  if (voice.tag === "failed") return <span className="text-destructive">{voice.detail}</span>;
  return (
    <span className="hidden items-center gap-1.5 pointer-fine:flex">
      Hold <Kbd>Space</Kbd> to talk
    </span>
  );
}

/**
 * The station's agent panel: one thread per order, tool steps as they run, cited moments that
 * play in place, and the after-seal check. Docked beside the station on wide screens.
 */
export function Inspector({
  open,
  onOpenChange,
  orderId,
  phase,
  check,
  onRepack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  phase: BenchPhase;
  check: CheckState;
  onRepack: () => void;
}) {
  const [unscopedFrom, setUnscopedFrom] = useState<string | null>(null);
  const scope = orderId && unscopedFrom !== orderId ? orderId : null;
  const chats = useRef(new Map<string, Chat<InspectorMessage>>());
  const key = scope ?? ANY_ORDER;
  if (!chats.current.has(key)) chats.current.set(key, newChat(scope));
  const { messages, status, error, sendMessage, stop, regenerate, setMessages } = useChat({
    chat: chats.current.get(key)!,
  });
  const busy = status === "submitted" || status === "streaming";

  const [draft, setDraft] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [choices, setChoices] = useState<Record<string, CheckChoice>>({});

  function ask(text: string) {
    const question = text.trim();
    if (!question) return;
    if (busy) return setDraft(question);
    setDraft("");
    void sendMessage({ text: question });
  }

  const voice = useVoice((text) => {
    onOpenChange(true);
    ask(text);
  });
  usePushToTalk(() => {
    onOpenChange(true);
    void voice.start();
  }, voice.stop);
  const heard =
    voice.state.tag === "recording" || voice.state.tag === "transcribing"
      ? voice.state.partial
      : null;
  const listening = heard !== null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) textarea.current?.focus();
  }, [open]);

  const flagged = check.tag === "ready" && check.check.verdict !== "complete";
  useEffect(() => {
    if (flagged) onOpenChange(true);
  }, [flagged, onOpenChange]);

  if (!open) return null;

  const sealedHere = phase.tag === "sealed" && scope === phase.orderId;
  const checkPackId =
    check.tag === "ready" ? check.check.pack_id : check.tag === "none" ? null : check.packId;
  const suggestions = suggestionsFor(phase, scope !== null);
  const last = messages.at(-1);

  return (
    <aside
      aria-label="Inspector"
      data-slot="inspector"
      onKeyDown={(event) => {
        if (event.key === "Escape") onOpenChange(false);
      }}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md animate-in flex-col border-l bg-background shadow-xl duration-200 fade-in slide-in-from-right-8 motion-reduce:animate-none xl:sticky xl:top-14 xl:z-0 xl:h-[calc(100svh-3.5rem)] xl:w-[26rem] xl:max-w-none xl:shrink-0 xl:shadow-none"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SparklesIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Inspector</h2>
        {scope ? (
          <span className="flex items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-2 text-xs font-medium">
            {scope}
            <button
              type="button"
              aria-label={`Ask about every order instead of ${scope}`}
              onClick={() => setUnscopedFrom(scope)}
              className="rounded-sm text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ) : (
          orderId && (
            <Button size="xs" variant="outline" onClick={() => setUnscopedFrom(null)}>
              Ask about {orderId}
            </Button>
          )
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {messages.length > 0 && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Start a new thread"
              disabled={busy}
              onClick={() => setMessages([])}
            >
              <SquarePenIcon />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close the inspector"
            onClick={() => onOpenChange(false)}
          >
            <XIcon />
          </Button>
        </div>
      </header>

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label="Conversation" className="px-4">
            <MessageScrollerContent className="py-4">
              {messages.length === 0 && !sealedHere && <EmptyThread scope={scope} />}
              {messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  {message.role === "user" ? (
                    <UserMessage message={message} />
                  ) : (
                    <AgentMessage message={message} streaming={busy && message.id === last?.id} />
                  )}
                </MessageScrollerItem>
              ))}
              {status === "submitted" && last?.role === "user" && (
                <MessageScrollerItem>
                  <Thinking />
                </MessageScrollerItem>
              )}
              {error && (
                <MessageScrollerItem>
                  <Bubble variant="destructive">
                    <BubbleContent className="flex items-start gap-2">
                      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                      <span>
                        The agent could not answer.{" "}
                        <button
                          type="button"
                          className="font-medium underline underline-offset-2"
                          onClick={() => void regenerate()}
                        >
                          Try again
                        </button>
                      </span>
                    </BubbleContent>
                  </Bubble>
                </MessageScrollerItem>
              )}
              {sealedHere && checkPackId && (
                <MessageScrollerItem>
                  <SealCheckCard
                    state={check}
                    orderId={phase.orderId}
                    choice={choices[checkPackId] ?? null}
                    onChoose={(choice) => {
                      setChoices((all) => ({ ...all, [checkPackId]: choice }));
                      if (choice === "repack") onRepack();
                    }}
                  />
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <footer className="flex shrink-0 flex-col gap-2 border-t p-3">
        {!busy && !listening && (
          <div className="flex scroll-fade-x scrollbar-none gap-1.5 overflow-x-auto">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                size="xs"
                variant="outline"
                className="shrink-0 rounded-full"
                onClick={() => ask(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            ask(draft);
          }}
        >
          <InputGroup className={cn("rounded-xl", listening && "border-red-500/50")}>
            <InputGroupTextarea
              ref={textarea}
              aria-label="Question"
              value={heard ?? draft}
              readOnly={listening}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  ask(draft);
                }
              }}
              placeholder={
                listening
                  ? "Listening..."
                  : scope
                    ? `Ask about ${scope}`
                    : "Ask about any order or pack"
              }
              rows={1}
              className="max-h-40 min-h-11"
            />
            <InputGroupAddon align="block-end">
              <span className="text-xs font-normal">{voiceHint(voice.state)}</span>
              <InputGroupButton
                size="icon-sm"
                variant={voice.state.tag === "recording" ? "destructive" : "ghost"}
                className="ml-auto rounded-full"
                aria-label={voice.state.tag === "recording" ? "Stop and send" : "Ask by voice"}
                aria-pressed={voice.state.tag === "recording"}
                disabled={voice.state.tag === "transcribing"}
                onClick={() => (voice.state.tag === "recording" ? voice.stop() : voice.start())}
              >
                {voice.state.tag === "recording" ? <SquareIcon /> : <MicIcon />}
              </InputGroupButton>
              {busy ? (
                <InputGroupButton
                  size="icon-sm"
                  variant="secondary"
                  className="rounded-full"
                  aria-label="Stop the answer"
                  onClick={() => void stop()}
                >
                  <SquareIcon className="fill-current" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  className="rounded-full"
                  aria-label="Ask"
                  disabled={!draft.trim() || listening}
                >
                  <ArrowUpIcon />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </form>
      </footer>
    </aside>
  );
}
