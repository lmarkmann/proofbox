import {
  CloudOffIcon,
  PackageOpenIcon,
  PackageSearchIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrderDetail, PackSummary } from "@/lib/api";
import { assertNever } from "@/lib/assert-never";
import { PackEvidence } from "@/proof/pack-evidence";
import { checklistOf } from "@/proof/pack-model";
import {
  apiSource,
  type ProofSource,
  type ProofState,
  type SummaryState,
  useProof,
  useSummary,
} from "@/proof/use-proof";

function verdictTitle(order: OrderDetail, pack: PackSummary) {
  const rows = checklistOf(order.items, pack.counts);
  switch (pack.verdict) {
    case "complete": {
      const total = order.items.reduce((sum, item) => sum + item.qty, 0);
      return `All ${total} item${total === 1 ? "" : "s"} packed`;
    }
    case "short": {
      const missing = rows.reduce((sum, row) => sum + Math.max(row.qty - row.seen, 0), 0);
      return `${missing} item${missing === 1 ? "" : "s"} missing from this box`;
    }
    case "unexpected":
      return "Items not on the order went into this box";
    default:
      return assertNever(pack.verdict);
  }
}

function Verdict({ order, pack }: { order: OrderDetail; pack: PackSummary }) {
  const complete = pack.verdict === "complete";
  const Seal = complete ? ShieldCheckIcon : ShieldAlertIcon;
  const sealedAt = new Date(pack.sealed_at).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <div className="flex items-center gap-4">
      <div
        className={
          complete
            ? "grid size-14 shrink-0 stamp-in place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "grid size-14 shrink-0 stamp-in place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
        }
      >
        <Seal className="size-7" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {verdictTitle(order, pack)}
        </h1>
        <p className="text-sm text-muted-foreground">
          Sealed {sealedAt} for {order.customer}
        </p>
      </div>
    </div>
  );
}

function Message({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-xl bg-card px-6 py-10 text-center ring-1 ring-foreground/10">
      <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <div className="text-sm text-pretty text-muted-foreground">{children}</div>
      {action}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex appear-late flex-col gap-6" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <span className="sr-only">Loading the packing proof</span>
    </div>
  );
}

function Body({
  orderId,
  state,
  summary,
  onRetry,
}: {
  orderId: string;
  state: ProofState;
  summary: SummaryState;
  onRetry: () => void;
}) {
  switch (state.tag) {
    case "loading":
      return <Loading />;
    case "not-found":
      return (
        <Message icon={PackageSearchIcon} title="No proof for this order">
          Nothing is recorded under <span className="font-mono">{orderId}</span>. Check the code on
          the label, or ask the sender for the link.
        </Message>
      );
    case "unreachable":
      return (
        <Message
          icon={CloudOffIcon}
          title="The proof is unavailable right now"
          action={
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              <RotateCcwIcon data-icon="inline-start" />
              Try again
            </Button>
          }
        >
          The ProofBox service did not answer. Nothing is wrong with your order; try again in a
          minute.
        </Message>
      );
    case "not-packed":
      return (
        <Message icon={PackageOpenIcon} title={`${state.order.order_id} is not packed yet`}>
          The packing video and checklist appear here as soon as the box is sealed at the station.
        </Message>
      );
    case "packed":
      return (
        <div className="flex flex-col gap-6">
          <Verdict order={state.order} pack={state.pack} />
          <PackEvidence
            order={state.order}
            pack={state.pack}
            video={state.video}
            track={state.track}
            summary={summary}
          />
        </div>
      );
    default:
      return assertNever(state);
  }
}

export function ProofView({
  orderId,
  state,
  summary,
  onRetry,
  notice,
}: {
  orderId: string;
  state: ProofState;
  summary: SummaryState;
  onRetry: () => void;
  notice?: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      {notice}
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <img src="/proofbox-wordmark.svg" alt="ProofBox" className="h-7 dark:invert" />
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          <span className="hidden text-sm text-muted-foreground sm:block">Packing proof</span>
          <span className="ml-auto truncate font-mono text-sm">{orderId}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Body orderId={orderId} state={state} summary={summary} onRetry={onRetry} />
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        Filmed and checked at the packing station by ProofBox.
      </footer>
    </div>
  );
}

export function ProofPage({
  orderId,
  source = apiSource,
  notice,
}: {
  orderId: string;
  source?: ProofSource;
  notice?: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const state = useProof(orderId, source, attempt);
  const summary = useSummary(state.tag === "packed" ? state.pack.pack_id : null, source);
  return (
    <ProofView
      orderId={orderId}
      state={state}
      summary={summary}
      onRetry={() => setAttempt((count) => count + 1)}
      notice={notice}
    />
  );
}
