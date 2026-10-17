import { Button } from "@/components/ui/button";

// label-sample.png is a real render from apps/printer (proofbox_printer.label.render)
export function SignInScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="relative grid min-h-svh content-center items-center gap-12 overflow-hidden bg-background px-6 py-10 sm:px-12 lg:grid-cols-2 lg:px-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(32rem_24rem_at_50%_85%,var(--color-muted),transparent_70%)] lg:bg-[radial-gradient(60rem_36rem_at_75%_50%,var(--color-muted),transparent_70%)]"
      />
      <div className="relative">
        <img
          src="/proofbox-wordmark.svg"
          alt="ProofBox"
          className="h-8 w-auto lg:h-9 dark:invert"
        />
        <h1 className="mt-12 text-4xl font-semibold tracking-tighter text-balance sm:text-5xl lg:mt-16 lg:text-6xl">
          Every box, proven.
        </h1>
        <p className="mt-5 max-w-md text-base text-pretty text-muted-foreground sm:text-lg">
          Per-item packing proof for B2B fulfilment. The packing station films each order, VAST
          video search finds every item going in, and the label's QR code opens the proof.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Button size="lg" className="h-11 px-6 text-base" onClick={onSignIn}>
            Sign in
          </Button>
          <span className="text-center text-sm text-muted-foreground sm:text-left">
            Team accounts only
          </span>
        </div>
      </div>
      <div className="relative grid place-items-center">
        <div className="w-44 rotate-3 rounded-md bg-white p-2.5 shadow-2xl ring-1 shadow-black/40 ring-black/5 sm:w-60 lg:w-72">
          <img
            src="/label-sample.png"
            alt="A ProofBox shipping label for order PB-20481 with the QR code that opens its proof"
            className="w-full"
          />
        </div>
      </div>
      <footer className="relative text-xs text-muted-foreground lg:absolute lg:bottom-7 lg:left-24">
        VAST Builders Challenge, London 2026
      </footer>
    </main>
  );
}
