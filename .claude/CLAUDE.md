# ProofBox

Hackathon monorepo, four contributors, `main` protected by `infra/ruleset.json` (PR required, squash only).

- pnpm workspace on Vite+ (`vp`): `apps/web` only. `vp check` owns format (oxfmt, Tailwind class sorting), lint (oxlint, type-aware) and typecheck. No ESLint, Prettier or PostCSS. Import from `vite-plus`, not `vite`.
- `apps/web` uses shadcn with Base UI (`base-nova`); add components with `pnpm dlx shadcn@latest add`, never hand-install their deps. Font is Instrument Sans, matching the logo; never Geist.
- `apps/api` is a uv project (FastAPI, Python 3.14, ruff, pyrefly, pytest), not part of the pnpm workspace. The web dev server proxies `/api/*` to it on :8000 with the prefix stripped.
- `apps/printer` is a second uv project with the same tooling: a local FastAPI agent on :8001 (proxied as `/printer/*`) that renders box labels with Pillow and sends raw TSPL to a JADENS JD-268BT over USB (pyusb, libusb-package backend). It runs on the machine the printer is plugged into; the API never imports it. Every print uses one physical label, so never call `POST /labels` without an explicit "print" from the user; use `POST /labels/preview` to check a layout. Never detach kernel drivers or use sudo for USB.
- `apps/web` signs in with `@workos-inc/authkit-react` (WorkOS project `proofbox`: Staging on `localhost:5173`, Production on the Worker; client IDs in `src/main.tsx`, no API key, `devMode` on because workers.dev cannot host a custom auth domain). Each origin must be a redirect URI, CORS origin and logout URI of its WorkOS environment; change them through the WorkOS MCP.
- `apps/web/wrangler.jsonc` deploys the build as the assets-only Worker `proofbox` at `https://proofbox.luis-markmann.workers.dev` via `vp run web#deploy` (never `pnpm deploy`, a pnpm builtin). CI runs `wrangler deploy --dry-run` on every PR, and its `deploy` job (GitHub environment `production`, secret `CLOUDFLARE_API_TOKEN`) deploys every push to `main` after `linux` passes. A manual deploy needs an explicit ask.
- `docs/vast/`, `.claude/skills/` and `.cursor/rules/vast-builders.mdc` (symlinked as `.claude/rules/vast-builders.md`) are copied from the VAST organizers' repo; `docs/vast/README.md` says how. The root `.gitignore` re-includes `.claude/`, which is ignored globally, except `worktrees/` and `settings.local.json`. Keep the copies byte-identical: they are excluded from `vp fmt` and the whitespace hooks.
- `docs/assets/build_logo.py` generates the logo; `just logo` rebuilds and copies it into `apps/web/public` and the wordmark into `apps/printer/src/proofbox_printer`. Do not hand-edit the SVGs.
- `just setup | dev | check | logo` are the entry points.

## Versioning, CI, hooks

- One version for everything. `apps/web/package.json` is the source; Changesets bumps it. `scripts/sync-version.mjs` mirrors it into the `pyproject.toml` of `apps/api` and `apps/printer` (and their `uv.lock` via `release:version`); CI and `just check` fail on drift. Both Python apps read it at runtime through `importlib.metadata`. Never edit a version by hand.
- Record a change with `pnpm changeset` (package `web`, the bump) and commit the file with the code. Never run `changeset version` locally.
- `.github/workflows/release.yml` opens and auto-merges the "chore: release" PR, then tags `vX.Y.Z` and creates the GitHub release itself; Changesets' own `web@X.Y.Z` tags are not used. It needs the lmarkmann-release App installed on the repo plus `RELEASE_APP_CLIENT_ID` / `RELEASE_APP_PRIVATE_KEY`.
- `ci.yml` has two jobs: `linux`, the required check, and `deploy`, which runs only on pushes to `main`. Every `uses:` is SHA-pinned with its tag comment; Dependabot bumps them weekly.
- prek runs from `prek.toml`: fast format and lint hooks on commit and `just check` on push. `prek install --prepare-hooks` after cloning. Ruff hooks are scoped to `apps/api` and `apps/printer`; `docs/assets/build_logo.py` is left as written.
