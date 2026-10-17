# ProofBox

Per-item packing proof for B2B fulfilment. Built at Real-Time Video Agents Hack London, 17 Oct 2026.

## Layout

- `apps/web`: React app on Vite+ with Tailwind v4 and shadcn/ui (Base UI primitives, nova style)
- `apps/api`: FastAPI service on Python 3.14, managed by uv
- `docs/assets`: logo SVGs and `build_logo.py`, which generates them

## Getting started

Install [pnpm](https://pnpm.io), [uv](https://docs.astral.sh/uv/), [just](https://just.systems) and [Vite+](https://viteplus.dev) (`vp`), then:

```sh
just setup   # pnpm install + uv sync
just dev     # API on :8000, web on :5173 (proxies /api to the API)
just check   # format, lint, typecheck and test both apps
just logo    # regenerate the logo into docs/assets and apps/web/public
```

Add UI components from `apps/web` with `pnpm dlx shadcn@latest add <component>`.

## Contributing

`main` is protected: work on a branch, open a PR, squash-merge it.
