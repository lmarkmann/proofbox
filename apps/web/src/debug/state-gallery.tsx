import { type ReactNode, useRef } from "react";

import { ActivityLog } from "@/components/activity-log";
import { type Account, UserMenu } from "@/components/app-header";
import { ThemeSwitch } from "@/components/theme-switch";
import { CameraPanel } from "@/components/camera-panel";
import { type Preview, PreviewFrame, type PrintJob, PrintFeedback } from "@/components/label-panel";
import { OfflineBanner, PackingStation } from "@/components/packing-station";
import { PanelBoundary } from "@/components/panel-boundary";
import { StatusStrip } from "@/components/status-strip";
import { AuthSplash } from "@/App";
import { demoOrder, demoPoints, demoSummary, demoVideoUrl } from "@/debug/pack-demo";
import type { CameraDevice, CameraFailure, CameraState } from "@/hooks/use-camera";
import type { PrinterStatus } from "@/hooks/use-probe";
import type { PrinterFailure } from "@/lib/printer";
import { ProofView } from "@/proof/proof-page";
import type { ProofState, SummaryState } from "@/proof/use-proof";

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
const MAC_CAMERA: CameraDevice = { id: "cam-builtin", label: "FaceTime HD Camera" };
const PHONE_CAMERA: CameraDevice = { id: "cam-iphone", label: "Sam's iPhone Camera" };
const DESK_VIEW: CameraDevice = { id: "cam-desk", label: "Sam's iPhone Desk View Camera" };
const USB_CAMERA: CameraDevice = {
  id: "cam-usb",
  label: "Logitech BRIO 4K Stream Edition (046d:085e)",
};
const REPLAY: CameraState = {
  tag: "file",
  url: demoVideoUrl,
  name: "pack-demo.mp4",
  loop: false,
};
const ACCOUNTS: [string, Account][] = [
  [
    "named, no picture",
    {
      id: "user_01SAMPLEPACKER",
      email: "packer@example.com",
      firstName: "Sam",
      lastName: "Rivera",
      profilePictureUrl: null,
    },
  ],
  [
    "email only, long address",
    {
      id: "user_01SAMPLENIGHTSHIFT",
      email: "night-shift.station-04@fulfilment.example.com",
      firstName: null,
      lastName: null,
      profilePictureUrl: null,
    },
  ],
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

const DEMO_PACK = demoOrder.packs[0];
const packed = (
  pack: Partial<typeof DEMO_PACK>,
  track: Extract<ProofState, { tag: "packed" }>["track"] = { tag: "ready", points: demoPoints },
): ProofState => ({
  tag: "packed",
  order: demoOrder,
  pack: { ...DEMO_PACK, ...pack },
  video: demoVideoUrl,
  track,
});
const SUMMARY_READY: SummaryState = {
  tag: "ready",
  answer: { answer: demoSummary, evidence: [] },
};
const PROOF_STATES: [string, ProofState, SummaryState][] = [
  ["loading", { tag: "loading" }, { tag: "loading" }],
  ["not found", { tag: "not-found" }, { tag: "loading" }],
  ["API unreachable", { tag: "unreachable" }, { tag: "loading" }],
  [
    "order exists, not packed yet",
    { tag: "not-packed", order: { ...demoOrder, packs: [] } },
    { tag: "loading" },
  ],
  [
    "short: card never seen",
    packed(
      { verdict: "short", counts: { mug: 1, "coffee beans": 1 } },
      { tag: "ready", points: demoPoints.filter((point) => point.label !== "card") },
    ),
    SUMMARY_READY,
  ],
  [
    "unexpected: tape not on the order",
    packed({ verdict: "unexpected", counts: { ...DEMO_PACK.counts, tape: 1 } }),
    SUMMARY_READY,
  ],
  ["detections still loading, summary loading", packed({}, { tag: "loading" }), { tag: "loading" }],
  ["detections failed, summary failed", packed({}, { tag: "failed" }), { tag: "failed" }],
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

function GalleryCamera({ camera }: { camera: CameraState }) {
  const video = useRef<HTMLVideoElement>(null);
  return (
    <CameraPanel camera={camera} video={video} onStart={noop} onStop={noop} onPlayFile={noop} />
  );
}

function Throws(): ReactNode {
  throw new Error("Fixture: render threw on purpose");
}

export default function StateGallery() {
  // ?states=station runs the live station without signing in, for driving it from a browser script
  if (new URLSearchParams(window.location.search).get("states") === "station")
    return <PackingStation />;
  const liveOn = (deviceId: string, devices: CameraDevice[]): CameraState => ({
    tag: "live",
    stream: new MediaStream(),
    resolution: "1280x720",
    deviceId,
    devices,
  });
  const live = liveOn(MAC_CAMERA.id, [MAC_CAMERA]);
  const cameras: [string, CameraState][] = [
    ["live, one camera", live],
    [
      "live, iPhone picked by default",
      liveOn(PHONE_CAMERA.id, [MAC_CAMERA, PHONE_CAMERA, DESK_VIEW]),
    ],
    ["live, iPhone dropped, fell back to the built-in camera", liveOn(MAC_CAMERA.id, [MAC_CAMERA])],
    ["live, long device label", liveOn(USB_CAMERA.id, [MAC_CAMERA, USB_CAMERA])],
    ["replay from ?replay=/demo/pack-demo.mp4 (data-source=file)", REPLAY],
  ];
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
        <Section title="Station, live probes">
          <Cell name="composed station; the header has no account menu here because the gallery skips sign-in">
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10 [&>div]:min-h-0">
              <PackingStation />
            </div>
          </Cell>
        </Section>

        <Section title="Account menu">
          <div className="grid gap-6 md:grid-cols-2">
            {ACCOUNTS.map(([name, account], index) => (
              <Cell key={name} name={name}>
                <div className="flex items-center justify-end gap-3 rounded-xl bg-background p-2 ring-1 ring-foreground/10">
                  {index === 0 && <ThemeSwitch />}
                  <UserMenu user={account} onSignOut={noop} />
                </div>
              </Cell>
            ))}
          </div>
        </Section>

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
          <Cell name="replaying a clip">
            <StatusStrip
              api={{ tag: "up", body: { status: "ok", version: "0.2.0" } }}
              printer={{ tag: "ready", version: "0.2.0" }}
              camera={REPLAY}
              labelCount={12}
              lastLabelAt={AT}
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

        <Section title="Bench camera (live fixtures have an empty stream, so the video is black)">
          <div className="grid gap-6 md:grid-cols-2">
            <Cell name="off">
              <GalleryCamera camera={{ tag: "off" }} />
            </Cell>
            <Cell name="requesting">
              <GalleryCamera camera={{ tag: "requesting" }} />
            </Cell>
            {cameras.map(([name, camera]) => (
              <Cell key={name} name={name}>
                <GalleryCamera camera={camera} />
              </Cell>
            ))}
            {CAMERA_FAILURES.map((failure) => (
              <Cell key={failure} name={`error: ${failure}`}>
                <GalleryCamera camera={{ tag: "error", failure }} />
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
              <ActivityLog labels={[]} history={[]} onStart={noop} />
            </Cell>
            <Cell name="sealed packs after a reload">
              <ActivityLog
                labels={[{ orderId: "PB-1003", at: new Date("2026-10-17T14:52:00") }]}
                history={[
                  {
                    pack_id: "pk_2",
                    order_id: "PB-1002",
                    sealed_at: "2026-10-17T14:47:00Z",
                    verdict: "short",
                    counts: { "water bottle": 1, notebook: 1 },
                  },
                  {
                    pack_id: "pk_1",
                    order_id: "PB-1001",
                    sealed_at: "2026-10-17T14:39:00Z",
                    verdict: "complete",
                    counts: { "coffee mug": 1, scissors: 1, "roll of tape": 1 },
                  },
                ]}
                onStart={noop}
              />
            </Cell>
            <Cell name="three labels, API offline">
              <ActivityLog
                labels={[
                  { orderId: "PB-20483", at: new Date("2026-10-17T14:41:00") },
                  { orderId: "PB-20482", at: new Date("2026-10-17T14:36:00") },
                  { orderId: "PB-20481", at: AT },
                ]}
                history="unavailable"
                onStart={noop}
              />
            </Cell>
          </div>
        </Section>

        <Section title="Proof page">
          <div className="grid gap-6">
            {PROOF_STATES.map(([name, state, summary]) => (
              <Cell key={name} name={name}>
                <div className="h-[52rem] overflow-hidden rounded-xl ring-1 ring-foreground/10 [&>div]:min-h-full">
                  <ProofView orderId="PB-DEMO" state={state} summary={summary} onRetry={noop} />
                </div>
              </Cell>
            ))}
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
