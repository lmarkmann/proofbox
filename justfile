# install JS and Python dependencies
setup:
    pnpm install
    uv sync --project apps/api

# run the API on :8000 and the web app on :5173, which proxies /api to it
dev:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    (cd apps/api && uv run proofbox-api) &
    pnpm dev

# format, lint, typecheck and test both apps
check:
    vp check
    cd apps/api && uv run ruff format --check && uv run ruff check && uv run pyrefly check && uv run pytest -q

# rebuild the logo SVGs in docs/assets and copy them into the web app
logo:
    cd docs/assets && uv run build_logo.py --out .
    cp docs/assets/proofbox-*.svg apps/web/public/
