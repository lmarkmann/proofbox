# install JS and Python dependencies and the git hooks
setup:
    pnpm install
    uv sync --project apps/api
    uv sync --project apps/printer
    prek install --prepare-hooks

# run the API on :8000, the printer agent on :8001 and the web app on :5173, which proxies /api and /printer to them
dev:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    (cd apps/api && uv run proofbox-api) &
    (cd apps/printer && uv run proofbox-printer) &
    pnpm dev

# version drift, then format, lint, typecheck and test every app
check:
    pnpm run --silent version:check
    vp check
    cd apps/api && uv run ruff format --check && uv run ruff check && uv run pyrefly check && uv run pytest -q
    cd apps/printer && uv run ruff format --check && uv run ruff check && uv run pyrefly check && uv run pytest -q

# rebuild the logo SVGs in docs/assets, copy them into the web app and the label renderer, and regenerate the browser icons
logo:
    cd docs/assets && uv run build_logo.py --out .
    cp docs/assets/proofbox-*.svg apps/web/public/
    cd docs/assets && uv run build_favicons.py --out ../../apps/web/public
    cp docs/assets/proofbox-wordmark.svg apps/printer/src/proofbox_printer/
