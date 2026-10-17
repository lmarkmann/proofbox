import { EyeIcon, PrinterIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type LabelRequest, previewLabel, printLabel } from "@/lib/printer";

const MAX_LINES = 3;

export function LabelPanel({
  printerReady,
  onPrinted,
}: {
  printerReady: boolean;
  onPrinted: (orderId: string) => void;
}) {
  const [orderId, setOrderId] = useState("");
  const [details, setDetails] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const lines = details
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const proofUrl = `${window.location.origin}/proof/${encodeURIComponent(orderId.trim())}`;
  const label: LabelRequest = { order_id: orderId.trim(), proof_url: proofUrl, lines };
  const invalid = !label.order_id || lines.length > MAX_LINES;

  async function run(action: "preview" | "print") {
    setBusy(true);
    setMessage(null);
    try {
      if (action === "preview") {
        setPreviewUrl(URL.createObjectURL(await previewLabel(label)));
      } else {
        await printLabel(label);
        onPrinted(label.order_id);
        setMessage(`Printed label for ${label.order_id}`);
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Box label</CardTitle>
        <CardDescription>Order ID and a QR code that opens the packing proof.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="order-id">Order ID</Label>
          <Input
            id="order-id"
            placeholder="PB-20481"
            maxLength={40}
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="details">Details</Label>
          <Textarea
            id="details"
            rows={3}
            placeholder={"3 items, 2 cartons\nAcme GmbH, Berlin"}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-invalid={lines.length > MAX_LINES}
          />
          <p className="text-xs text-muted-foreground">
            Up to {MAX_LINES} lines, printed at the bottom of the label.
          </p>
        </div>
        <div className="mx-auto grid aspect-[776/1156] w-full max-w-56 place-items-center overflow-hidden rounded-lg border bg-muted/40">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Label preview for ${label.order_id}`}
              className="size-full bg-white object-contain"
            />
          ) : (
            <p className="px-6 text-center text-sm text-muted-foreground">Preview appears here</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={invalid || busy} onClick={() => run("preview")}>
            <EyeIcon data-icon="inline-start" />
            Preview
          </Button>
          <Button disabled={invalid || busy || !printerReady} onClick={() => run("print")}>
            <PrinterIcon data-icon="inline-start" />
            Print
          </Button>
        </div>
        <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
          {message ??
            (printerReady ? "" : "Connect the printer to print. Preview works without it.")}
        </p>
      </CardFooter>
    </Card>
  );
}
