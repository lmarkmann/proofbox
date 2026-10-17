# ProofBox

Per-item packing proof for B2B fulfilment. Built at Real-Time Video Agents Hack London, 17 Oct 2026.

## Layout

- `apps/web`: React app on Vite+ with Tailwind v4 and shadcn/ui (Base UI primitives, nova style)
- `apps/api`: FastAPI service on Python 3.14, managed by uv
- `docs/assets`: logo SVGs and `build_logo.py`, which generates them

## Getting started

Install [pnpm](https://pnpm.io), [uv](https://docs.astral.sh/uv/), [just](https://just.systems) and [Vite+](https://viteplus.dev) (`vp`), then:

```sh
just setup   # pnpm install, uv sync, prek install
just dev     # API on :8000, web on :5173 (proxies /api to the API)
just check   # format, lint, typecheck and test both apps
just logo    # regenerate the logo into docs/assets and apps/web/public
```

Add UI components from `apps/web` with `pnpm dlx shadcn@latest add <component>`.

## Contributing

`main` is protected: work on a branch, open a PR, squash-merge it. CI (`linux`) runs format, lint, types, tests and a version drift check.

Every user-facing change gets a changeset: run `pnpm changeset`, pick `web` and the bump, write one sentence, commit it with the code. Merging to `main` opens a "chore: release" PR; merging that tags `vX.Y.Z`. There is one version for the whole repo, so never edit a version by hand.
