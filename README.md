# ProofBox

Per-item packing proof for B2B fulfilment. Built at Real-Time Video Agents Hack London, 17 Oct 2026.

## Layout

- `apps/web`: React app on Vite+ with Tailwind v4 and shadcn/ui (Base UI primitives, nova style)
- `apps/api`: FastAPI service on Python 3.14, managed by uv
- `apps/printer`: local agent that renders box labels and prints them on a USB JADENS JD-268BT thermal printer
- `docs/assets`: logo SVGs and `build_logo.py`, which generates them

## Getting started

Install [pnpm](https://pnpm.io), [uv](https://docs.astral.sh/uv/), [just](https://just.systems) and [Vite+](https://viteplus.dev) (`vp`), then:

```sh
just setup   # pnpm install, uv sync, prek install
just dev     # API on :8000, printer agent on :8001, web on :5173 (proxies /api and /printer)
just check   # format, lint, typecheck and test every app
just logo    # regenerate the logo into docs/assets and apps/web/public
```

Add UI components from `apps/web` with `pnpm dlx shadcn@latest add <component>`.

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

`main` is protected: work on a branch, open a PR, squash-merge it. CI (`linux`) runs format, lint, types, tests and a version drift check.

Every user-facing change gets a changeset: run `pnpm changeset`, pick `web` and the bump, write one sentence, commit it with the code. Merging to `main` opens a "chore: release" PR; merging that tags `vX.Y.Z`. There is one version for the whole repo, so never edit a version by hand.

hein htet phyo
heinhtetphyo56@gmail.com

pavan sidhu
pavanssidhu@gmail.com

luis camran markmann
luis.camran.markmann@gmail.com

riad mc
riadmc@proton.me
