import { ArrowRightIcon, PackageSearchIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const proofHref = (orderId: string) => `/proof/${encodeURIComponent(orderId)}`;

// A mistyped proof link usually still carries the order number, e.g. /proofs/PB-1001 or /pb1001
function orderInPath(pathname: string) {
  const match = /pb-?(\d+)/i.exec(pathname);
  return match ? `PB-${match[1]}` : null;
}

// The logo's cube with the lid open and nothing inside; side faces are the mark's own paths
function EmptyBox({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-1 -2.5 26 25.5"
      aria-hidden
      className={className}
      fill="currentColor"
      stroke="var(--background)"
      strokeWidth={0.5}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      <g className="fill-[color-mix(in_oklab,currentColor_45%,var(--background))]">
        <polygon points="3.33,7.33 12,3 10.46,-1.65 1.8,2.68" />
      </g>
      <g className="fill-[color-mix(in_oklab,currentColor_60%,var(--background))]">
        <polygon points="12,3 20.66,7.33 22.2,2.68 13.54,-1.65" />
      </g>
      <polygon
        points="3.335,7.332 12,3 12,11.665"
        className="fill-[color-mix(in_oklab,currentColor_14%,var(--background))]"
      />
      <polygon
        points="12,3 20.665,7.332 12,11.665"
        className="fill-[color-mix(in_oklab,currentColor_26%,var(--background))]"
      />
      <path d="M3 18 L11.7 22.35 L11.7 12.185 L3 7.835 Z" />
      <path d="M21 18 L21 7.835 L12.3 12.185 L12.3 22.35 Z" />
      <polygon
        points="3.33,7.33 12,11.66 8.48,14.53 -0.18,10.2"
        className="fill-[color-mix(in_oklab,currentColor_80%,var(--background))]"
      />
      <polygon
        points="12,11.66 20.66,7.33 24.18,10.2 15.52,14.53"
        className="fill-[color-mix(in_oklab,currentColor_90%,var(--background))]"
      />
    </svg>
  );
}

export function NotFoundPage({ pathname }: { pathname: string }) {
  const [orderId, setOrderId] = useState("");
  const guess = orderInPath(pathname);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
        <a href="/" aria-label="ProofBox home">
          <img src="/proofbox-wordmark.svg" alt="ProofBox" className="h-7 dark:invert" />
        </a>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
        <div
          role="img"
          aria-label="404"
          className="flex items-end gap-1 text-[7.5rem] leading-none font-semibold tracking-tighter sm:text-[10rem]"
        >
          <span aria-hidden>4</span>
          <EmptyBox className="mb-[0.02em] size-[0.86em] stamp-in" />
          <span aria-hidden>4</span>
        </div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-balance">
          This box is empty
        </h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          Nothing is packed at{" "}
          <span className="font-mono break-all text-foreground">{pathname}</span>. The link may be
          mistyped, or the page has moved.
        </p>

        {guess && (
          <Button
            size="lg"
            className="mt-6"
            nativeButton={false}
            render={<a href={proofHref(guess)} />}
          >
            <PackageSearchIcon data-icon="inline-start" />
            Open the proof for {guess}
          </Button>
        )}

        <form
          className="mt-10 flex w-full max-w-sm flex-col gap-2 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = orderId.trim();
            if (trimmed) window.location.assign(proofHref(trimmed));
          }}
        >
          <label htmlFor="order-id" className="text-sm font-medium">
            Have a ProofBox label? Enter the order number on it.
          </label>
          <div className="flex gap-2">
            <Input
              id="order-id"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              placeholder="PB-1001"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-9 font-mono"
            />
            <Button type="submit" size="lg" variant={guess ? "outline" : "default"}>
              Open proof
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </form>

        <a
          href="/"
          className="mt-8 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to ProofBox
        </a>
      </main>
    </div>
  );
}
