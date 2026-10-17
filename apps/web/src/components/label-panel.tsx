import {
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  PrinterIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddressFields } from "@/components/address-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { PrinterStatus } from "@/hooks/use-probe";
import { type Address, addressLines, EMPTY_ADDRESS } from "@/lib/address";
import { registerOrder } from "@/lib/api";
import { assertNever } from "@/lib/assert-never";
import {
  type LabelRequest,
  type PrinterFailure,
  previewLabel,
  printLabel,
  toPrinterFailure,
} from "@/lib/printer";
import { cn } from "@/lib/utils";
import { formatTime } from "@/components/status-strip";

const PREVIEW_DEBOUNCE_MS = 350;
// the QR must open somewhere a phone can reach, so a demo on localhost points it at a public origin
const PROOF_ORIGIN: string = import.meta.env.VITE_PROOF_ORIGIN || window.location.origin;

export type Preview =
  | { tag: "waiting" }
  | { tag: "rendering"; previous: string | null }
  | { tag: "ready"; url: string }
  | { tag: "failed"; failure: PrinterFailure };

export type PrintJob =
  | { tag: "idle" }
  | { tag: "printing" }
  | { tag: "printed"; orderId: string; at: Date }
  | { tag: "failed"; failure: PrinterFailure };

export type PrintedLabel = { orderId: string; at: Date };

const FAILURE: Record<PrinterFailure["kind"], { title: string; fix: string }> = {
  "agent-down": {
    title: "Printer agent is not running",
    fix: "Start it on this machine with just dev, then try again.",
  },
  "no-printer": {
    title: "Printer not connected",
    fix: "Plug the JD-268BT in over USB and switch it on, then try again.",
  },
  busy: {
    title: "Printer is held by another app",
    fix: "Close any browser tab using the printer over WebUSB, then try again.",
  },
  rejected: { title: "Label was rejected", fix: "" },
  failed: { title: "Print failed", fix: "" },
};

function failureText(failure: PrinterFailure) {
  const { title, fix } = FAILURE[failure.kind];
  return { title, fix: "detail" in failure ? failure.detail : fix };
}

function Paper({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto grid aspect-[776/1156] w-full max-w-56 place-items-center overflow-hidden rounded-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

const PAPER_SHADOW =
  "bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_24px_-6px_rgb(0_0_0/0.18)] ring-1 ring-black/5";

export function PreviewFrame({ preview, orderId }: { preview: Preview; orderId: string }) {
  switch (preview.tag) {
    case "waiting":
      return (
        <Paper className="border-2 border-dashed bg-muted/30">
          <p className="px-6 text-center text-sm text-muted-foreground">
            Enter an order ID to see the label.
          </p>
        </Paper>
      );
    case "rendering":
      return preview.previous ? (
        <Paper className={PAPER_SHADOW}>
          <img
            src={preview.previous}
            alt={`Label preview for ${orderId}, updating`}
            className="size-full dim-late object-contain"
          />
          <LoaderCircleIcon className="absolute top-2 right-2 size-4 animate-spin appear-late text-neutral-400 motion-reduce:animate-none" />
        </Paper>
      ) : (
        <Paper>
          <Skeleton className="size-full appear-late rounded-md" />
          <span className="sr-only">Rendering preview</span>
        </Paper>
      );
    case "ready":
      return (
        <Paper className={PAPER_SHADOW}>
          <img
            src={preview.url}
            alt={`Label preview for ${orderId}`}
            className="size-full object-contain"
          />
        </Paper>
      );
    case "failed": {
      const { title, fix } = failureText(preview.failure);
      return (
        <Paper className="border bg-muted/30">
          <div className="flex flex-col items-center gap-2 px-5 text-center">
            <CircleAlertIcon className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">No preview</p>
            <p className="text-xs text-muted-foreground">
              {title}. {fix}
            </p>
          </div>
        </Paper>
      );
    }
    default:
      return assertNever(preview);
  }
}

export function PrintFeedback({
  job,
  printer,
  onRetry,
}: {
  job: PrintJob;
  printer: PrinterStatus;
  onRetry: () => void;
}) {
  switch (job.tag) {
    case "printing":
      return <p className="text-xs text-muted-foreground">Sending the label to the printer.</p>;
    case "printed":
      return (
        <p className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          <CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            Printed <span className="font-medium">{job.orderId}</span> at {formatTime(job.at)}.
            Ready for the next box.
          </span>
        </p>
      );
    case "failed": {
      const { title, fix } = failureText(job.failure);
      return (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">{title}</p>
            {fix && <p className="text-destructive/80">{fix}</p>}
            <Button size="xs" variant="outline" className="mt-1 w-fit" onClick={onRetry}>
              <RotateCcwIcon data-icon="inline-start" />
              Print again
            </Button>
          </div>
        </div>
      );
    }
    case "idle":
      switch (printer.tag) {
        case "checking":
          return <p className="text-xs text-muted-foreground">Checking the printer.</p>;
        case "agent-down":
          return (
            <p className="text-xs text-muted-foreground">
              Printer agent is offline. Run <code className="font-mono">just dev</code> on this
              machine.
            </p>
          );
        case "no-printer":
          return (
            <p className="text-xs text-muted-foreground">
              Printer is not connected. Preview still works.
            </p>
          );
        case "ready":
          return <p className="text-xs text-muted-foreground">Each print uses one sticker.</p>;
        default:
          return assertNever(printer);
      }
    default:
      return assertNever(job);
  }
}

export function LabelPanel({
  printer,
  onPrinted,
}: {
  printer: PrinterStatus;
  onPrinted: (label: PrintedLabel) => void;
}) {
  const [orderId, setOrderId] = useState("");
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [preview, setPreview] = useState<Preview>({ tag: "waiting" });
  const [job, setJob] = useState<PrintJob>({ tag: "idle" });
  const orderInput = useRef<HTMLInputElement>(null);
  const shownUrl = useRef<string | null>(null);

  const label: LabelRequest = {
    order_id: orderId.trim(),
    proof_url: `${PROOF_ORIGIN}/proof/${encodeURIComponent(orderId.trim())}`,
    lines: addressLines(address),
  };
  const valid = Boolean(label.order_id);
  const labelKey = valid ? JSON.stringify(label) : null;

  useEffect(() => {
    if (!labelKey) return;
    const request = JSON.parse(labelKey) as LabelRequest;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreview((current) => ({
        tag: "rendering",
        previous:
          current.tag === "ready"
            ? current.url
            : current.tag === "rendering"
              ? current.previous
              : null,
      }));
      try {
        const url = URL.createObjectURL(await previewLabel(request, controller.signal));
        if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
        shownUrl.current = url;
        setPreview({ tag: "ready", url });
      } catch (cause) {
        if (!controller.signal.aborted)
          setPreview({ tag: "failed", failure: toPrinterFailure(cause) });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [labelKey]);

  useEffect(
    () => () => {
      if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
    },
    [],
  );

  function edit(update: () => void) {
    update();
    if (job.tag === "printed" || job.tag === "failed") setJob({ tag: "idle" });
  }

  async function print() {
    if (!label.order_id) {
      orderInput.current?.focus();
      return;
    }
    setJob({ tag: "printing" });
    try {
      // no items: the first sealed pack fills them in from what the camera tracked
      await registerOrder({
        order_id: label.order_id,
        customer: address.recipient || "Walk-in",
        items: [],
      });
      await printLabel(label);
      const printed = { orderId: label.order_id, at: new Date() };
      onPrinted(printed);
      setJob({ tag: "printed", ...printed });
      setOrderId("");
      setAddress((current) => ({ ...EMPTY_ADDRESS, country: current.country }));
      orderInput.current?.focus();
    } catch (cause) {
      setJob({ tag: "failed", failure: toPrinterFailure(cause) });
    }
  }

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>Box label</CardTitle>
        <CardDescription>The QR code opens the packing video for this order.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="order-id">
            Order ID
            <span aria-hidden className="-ml-1 text-muted-foreground">
              *
            </span>
          </Label>
          <Input
            ref={orderInput}
            id="order-id"
            placeholder="PB-20481"
            maxLength={40}
            autoComplete="off"
            required
            value={orderId}
            onChange={(event) => edit(() => setOrderId(event.target.value))}
          />
        </div>
        <AddressFields address={address} onChange={(update) => edit(() => setAddress(update))} />
        <PreviewFrame preview={valid ? preview : { tag: "waiting" }} orderId={label.order_id} />
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <Button
          size="lg"
          onClick={print}
          disabled={job.tag === "printing" || printer.tag !== "ready"}
        >
          {job.tag === "printing" ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <PrinterIcon data-icon="inline-start" />
          )}
          {job.tag === "printing" ? "Printing" : "Print label"}
        </Button>
        <div aria-live="polite">
          <PrintFeedback job={job} printer={printer} onRetry={print} />
        </div>
      </CardFooter>
    </Card>
  );
}
