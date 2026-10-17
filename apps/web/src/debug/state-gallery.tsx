import type { ReactNode } from "react";

import { ActivityLog } from "@/components/activity-log";
import { CameraPanel } from "@/components/camera-panel";
import { type Preview, PreviewFrame, type PrintJob, PrintFeedback } from "@/components/label-panel";
import { OfflineBanner } from "@/components/packing-station";
import { PanelBoundary } from "@/components/panel-boundary";
import { StatusStrip } from "@/components/status-strip";
import { AuthSplash } from "@/App";
import type { CameraFailure, CameraState } from "@/hooks/use-camera";
import type { PrinterStatus } from "@/hooks/use-probe";
import type { PrinterFailure } from "@/lib/printer";

// Pinned fixtures: fixed times, and a sample image standing in for a rendered label.
const AT = new Date("2026-10-17T14:32:00");
const SAMPLE_IMAGE = "/proofbox-wordmark.svg";
const noop = () => {};

const CAMERA_FAILURES: CameraFailure[] = [
  "denied",
  "not-found",
  "in-use",
  "insecure",
  "disconnected",
  "unknown",
];
const PRINTER_FAILURES: PrinterFailure[] = [
  { kind: "agent-down" },
  { kind: "no-printer" },
  { kind: "busy" },
  { kind: "rejected", detail: "The agent rejected the label fields." },
  { kind: "failed", detail: "Internal Server Error" },
];
const PRINTER_STATUSES: PrinterStatus[] = [
  { tag: "checking" },
  { tag: "agent-down" },
  { tag: "no-printer", version: "0.2.0" },
  { tag: "ready", version: "0.2.0" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Cell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="font-mono text-xs text-muted-foreground">{name}</figcaption>
      {children}
    </figure>
  );
}

function Throws(): ReactNode {
  throw new Error("Fixture: render threw on purpose");
}

export default function StateGallery() {
  const live: CameraState = { tag: "live", stream: new MediaStream(), resolution: "1280x720" };
  const previews: [string, Preview][] = [
    ["waiting", { tag: "waiting" }],
    ["rendering, first", { tag: "rendering", previous: null }],
    ["rendering, previous kept", { tag: "rendering", previous: SAMPLE_IMAGE }],
    ["ready", { tag: "ready", url: SAMPLE_IMAGE }],
    ...PRINTER_FAILURES.slice(0, 3).map((failure): [string, Preview] => [
      `failed: ${failure.kind}`,
      { tag: "failed", failure },
    ]),
  ];
  const jobs: [string, PrintJob, PrinterStatus][] = [
    ...PRINTER_STATUSES.map((printer): [string, PrintJob, PrinterStatus] => [
      `idle, printer ${printer.tag}`,
      { tag: "idle" },
      printer,
    ]),
    ["printing", { tag: "printing" }, { tag: "ready", version: "0.2.0" }],
    [
      "printed",
      { tag: "printed", orderId: "PB-20481", at: AT },
      { tag: "ready", version: "0.2.0" },
    ],
    ...PRINTER_FAILURES.map((failure): [string, PrintJob, PrinterStatus] => [
      `failed: ${failure.kind}`,
      { tag: "failed", failure },
      { tag: "ready", version: "0.2.0" },
    ]),
  ];

  return (
    <div className="min-h-svh bg-muted/40">
      <div className="border-b bg-amber-500/15 px-6 py-2 text-sm">
        Development state gallery. Every panel below is a fixture, not live data.
      </div>
      <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6">
        <Section title="Status strip">
          <Cell name="all checking">
            <StatusStrip
              api={{ tag: "checking" }}
              printer={{ tag: "checking" }}
              camera={{ tag: "off" }}
              labelCount={0}
              lastLabelAt={null}
            />
          </Cell>
          <Cell name="all healthy">
            <StatusStrip
              api={{ tag: "up", body: { status: "ok", version: "0.2.0" } }}
              printer={{ tag: "ready", version: "0.2.0" }}
              camera={live}
              labelCount={12}
              lastLabelAt={AT}
            />
          </Cell>
          <Cell name="degraded">
            <StatusStrip
              api={{ tag: "down" }}
              printer={{ tag: "agent-down" }}
              camera={{ tag: "error", failure: "denied" }}
              labelCount={0}
              lastLabelAt={null}
            />
          </Cell>
          <Cell name="printer unplugged, camera asking">
            <StatusStrip
              api={{ tag: "up", body: { status: "ok", version: "0.2.0" } }}
              printer={{ tag: "no-printer", version: "0.2.0" }}
              camera={{ tag: "requesting" }}
              labelCount={3}
              lastLabelAt={AT}
            />
          </Cell>
        </Section>

        <Section title="Bench camera">
          <div className="grid gap-6 md:grid-cols-2">
            <Cell name="off">
              <CameraPanel camera={{ tag: "off" }} onStart={noop} onStop={noop} />
            </Cell>
            <Cell name="requesting">
              <CameraPanel camera={{ tag: "requesting" }} onStart={noop} onStop={noop} />
            </Cell>
            <Cell name="live (empty fixture stream, so the video is black)">
              <CameraPanel camera={live} onStart={noop} onStop={noop} />
            </Cell>
            {CAMERA_FAILURES.map((failure) => (
              <Cell key={failure} name={`error: ${failure}`}>
                <CameraPanel camera={{ tag: "error", failure }} onStart={noop} onStop={noop} />
              </Cell>
            ))}
          </div>
        </Section>

        <Section title="Label preview">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-7">
            {previews.map(([name, preview]) => (
              <Cell key={name} name={name}>
                <PreviewFrame preview={preview} orderId="PB-20481" />
              </Cell>
            ))}
          </div>
        </Section>

        <Section title="Print feedback">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map(([name, job, printer]) => (
              <Cell key={name} name={name}>
                <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                  <PrintFeedback job={job} printer={printer} onRetry={noop} />
                </div>
              </Cell>
            ))}
          </div>
        </Section>

        <Section title="Activity">
          <div className="grid gap-6 md:grid-cols-2">
            <Cell name="empty, first run">
              <ActivityLog labels={[]} onStart={noop} />
            </Cell>
            <Cell name="three labels">
              <ActivityLog
                labels={[
                  { orderId: "PB-20483", at: new Date("2026-10-17T14:41:00") },
                  { orderId: "PB-20482", at: new Date("2026-10-17T14:36:00") },
                  { orderId: "PB-20481", at: AT },
                ]}
                onStart={noop}
              />
            </Cell>
          </div>
        </Section>

        <Section title="Shell">
          <div className="grid gap-6 md:grid-cols-2">
            <Cell name="panel render crash, caught by PanelBoundary">
              <PanelBoundary title="Bench camera">
                <Throws />
              </PanelBoundary>
            </Cell>
            <Cell name="offline banner">
              <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                <OfflineBanner />
              </div>
            </Cell>
            <Cell name="auth loading splash">
              <div className="h-48 overflow-hidden rounded-xl ring-1 ring-foreground/10 [&>main]:min-h-full">
                <AuthSplash />
              </div>
            </Cell>
          </div>
        </Section>
      </main>
    </div>
  );
}
