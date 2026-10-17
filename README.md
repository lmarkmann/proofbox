<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/proofbox-wordmark-white.svg">
    <img alt="ProofBox" src="docs/assets/proofbox-wordmark.svg" width="400">
  </picture>
</p>

<p align="center">
  Per-item packing proof for B2B fulfilment.<br>
  Built at Real-Time Video Agents Hack London, 17 Oct 2026.
</p>

<p align="center">
  <a href="https://proofbox.luis-markmann.workers.dev">proofbox.luis-markmann.workers.dev</a>
  ·
  <a href="https://github.com/lmarkmann/proofbox/actions/workflows/ci.yml"><img alt="ci" src="https://github.com/lmarkmann/proofbox/actions/workflows/ci.yml/badge.svg?branch=main"></a>
</p>

The packing station films each order, VAST video search finds every item going into the box, and the QR code on the printed label opens the proof: a disputed shipment comes with video of exactly what was packed.

## Demo

<!--
Replace VIDEO_ID with the unlisted video's ID (the part after youtu.be/) and delete this comment:

<a href="https://youtu.be/VIDEO_ID"><img alt="ProofBox demo" src="https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg" width="720"></a>
-->

The demo video goes here.

## Team

| Name                 | Email                          |
| -------------------- | ------------------------------ |
| Hein Htet Phyo       | heinhtetphyo56@gmail.com       |
| Pavan Sidhu          | pavanssidhu@gmail.com          |
| Luis Camran Markmann | luis.camran.markmann@gmail.com |
| Riad Mc              | riadmc@proton.me               |

## Layout

| Path             | What                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| `apps/web`       | React app on Vite+ with Tailwind v4 and shadcn/ui (Base UI primitives, nova style) |
| `apps/api`       | FastAPI service on Python 3.14, managed by uv                                      |
| `apps/printer`   | local agent that renders box labels and prints them on a USB JADENS JD-268BT       |
| `apps/vision`    | local agent that detects the order's items in camera frames with YOLOE-26s         |
| `docs/assets`    | logo SVGs and `build_logo.py`, which generates them                                |
| `docs/vast`      | the VAST Builders Challenge guides and reference, copied from the organizers' repo |
| `.claude/skills` | the organizers' agent skills for the stack (search, ingest, VastDB, GPU models)    |

The skills load in both Claude Code and Cursor; `.cursor/rules/vast-builders.mdc`, symlinked into `.claude/rules`, holds the ground rules.

## Getting started

Install [pnpm](https://pnpm.io), [uv](https://docs.astral.sh/uv/), [just](https://just.systems) and [Vite+](https://viteplus.dev) (`vp`), then:

```sh
just setup   # pnpm install, uv sync, prek install
just dev     # API on :8000, printer agent on :8001, vision agent on :8002, web on :5173
just check   # format, lint, typecheck and test every app
just logo    # regenerate the logo into docs/assets and apps/web/public
```

Add UI components from `apps/web` with `pnpm dlx shadcn@latest add <component>`.

## Sign-in

The web app signs users in with WorkOS AuthKit (project `proofbox`) before it shows anything. `localhost:5173` uses the Staging environment and the deployed app uses Production, so an account in one does not exist in the other. The client IDs in `apps/web/src/main.tsx` are public and no API key is involved. Everyone in the team table has an account in both: sign in with your email and the code WorkOS sends, or with Google, Microsoft, GitHub or Apple.

A new origin (custom domain, another port) has to be added to the matching WorkOS environment as a redirect URI, CORS origin and logout URI, or sign-in fails.

## Deploy

Every push to `main` deploys the web app as the Cloudflare Worker `proofbox`, static assets only, at <https://proofbox.luis-markmann.workers.dev>: the `deploy` job in `.github/workflows/ci.yml` runs after the `linux` checks pass, in the GitHub environment `production`, with a Workers-scoped Cloudflare token in its `CLOUDFLARE_API_TOKEN` secret. To deploy by hand from a machine logged in with `wrangler login`:

```sh
vp run web#deploy   # build, then wrangler deploy
```

Only the web app is deployed. The API and printer agent run locally, so on the Worker the header shows both as offline.

## Bench camera

An iPhone works as the station's camera through Continuity Camera, with no app on the phone. It needs macOS Ventura or later and iOS 16 or later, both signed in to the same Apple ID, with Wi-Fi and Bluetooth on for both. Lock the phone and mount it stationary in landscape, looking down at the bench. Once you start the camera the phone shows up in the camera picker next to the Stop button, and the station picks it by default whenever it is connected. Your own pick is remembered in this browser. If the phone drops out mid-session the station switches to another camera and the picker shows which one; it switches back to the phone when it reconnects, unless you picked a different camera yourself.

For a demo without a live bench, put a clip in `apps/web/public/demo/` (gitignored) and open the station with `?replay=/demo/<file>.mp4`. It starts playing on load, muted and without controls, and stops on the last frame so a seal at the end of the clip lands like a real pack; add `&loop` to loop it. The panel looks the same as with the camera and the status strip says Replay. Paths outside `/demo/` are ignored.

## Label printer

The printer agent runs on the machine the printer is plugged into, separate from the API, so the API can live anywhere. It talks raw TSPL over USB through libusb, with no driver or CUPS queue. Load 4x6 in fanfold labels and hold the feed button until one beep so the printer measures them.

From the web app, call it through the dev proxy at `/printer`:

| Request                        | Does                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `GET /printer/health`          | `{"printer": "connected" \| "missing"}`                              |
| `POST /printer/labels/preview` | the label as a PNG, prints nothing                                   |
| `POST /printer/labels`         | prints one label; 503 if no printer, 409 if another process holds it |

Both POSTs take `{"order_id": "PB-20481", "proof_url": "https://...", "lines": ["3 items", "Acme GmbH"]}`: the order ID up to 40 characters, the URL the QR code opens, and up to three detail lines. Without the web app, post straight to the agent:

```sh
xh POST :8001/labels/preview order_id=PB-20481 proof_url=https://proofbox.app/p/demo > label.png
```

A browser tab that has opened the printer over WebUSB holds it until the tab closes; prints then fail with 409.

## Contributing

`main` is protected: work on a branch, open a PR, squash-merge it. CI (`linux`) runs format, lint, types, tests and a version drift check; on `main` it then deploys.

Every user-facing change gets a changeset: run `pnpm changeset`, pick `web` and the bump, write one sentence, commit it with the code. Merging to `main` opens a "chore: release" PR; merging that tags `vX.Y.Z`. There is one version for the whole repo, so never edit a version by hand.
