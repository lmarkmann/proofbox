# install JS and Python dependencies and the git hooks
setup:
    pnpm install
    uv sync --project apps/api
    uv sync --project apps/printer
    uv sync --project apps/vision
    prek install --prepare-hooks

# ssh host of the lab VM that runs the API; override with PROOFBOX_VM=bc-<user>
vm := env("PROOFBOX_VM", "bc-luiscamranmarkmann")

# tunnel the VM's API to :8000, run the printer agent on :8001, the vision agent on :8002 and the web app on :5173, which proxies /api, /printer and /vision to them
dev:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    ssh -N -o ExitOnForwardFailure=yes -L 8000:127.0.0.1:8000 {{vm}} &
    (cd apps/printer && uv run proofbox-printer) &
    (cd apps/vision && uv run proofbox-vision) &
    pnpm dev

# copy apps/api and the demo orders to the VM, then restart the API there on 127.0.0.1:8000 and wait for /health
deploy-api:
    rsync -az --delete --exclude .venv --exclude __pycache__ --exclude .pytest_cache --exclude .ruff_cache apps/api/ {{vm}}:proofbox-api/apps/api/
    rsync -az docs/demo-orders.json {{vm}}:proofbox-api/docs/
    ssh {{vm}} 'bash -lc "fuser -k 8000/tcp; cd ~/proofbox-api/apps/api && ~/.local/bin/uv sync --frozen -q; PYTHONWARNINGS=\"ignore:Unverified HTTPS request\" nohup .venv/bin/uvicorn proofbox_api:app --host 127.0.0.1 --port 8000 > ~/proofbox-api.log 2>&1 < /dev/null &" > /dev/null 2>&1 < /dev/null' < /dev/null
    ssh {{vm}} 'for i in $(seq 30); do curl -sf 127.0.0.1:8000/health && exit; sleep 2; done; tail -20 ~/proofbox-api.log; exit 1' < /dev/null

# version drift, then format, lint, typecheck and test every app
check:
    pnpm run --silent version:check
    vp check
    vp run web#test
    cd apps/api && uv run ruff format --check && uv run ruff check && uv run pyrefly check && uv run pytest -q
    cd apps/printer && uv run ruff format --check && uv run ruff check && uv run pyrefly check && uv run pytest -q
    cd apps/vision && uv run ruff format --check && uv run ruff check && uv run pyrefly check && uv run pytest -q

# rebuild the logo SVGs in docs/assets, copy them into the web app and the label renderer, and regenerate the browser icons
logo:
    cd docs/assets && uv run build_logo.py --out .
    cp docs/assets/proofbox-*.svg apps/web/public/
    cd docs/assets && uv run build_favicons.py --out ../../apps/web/public
    cp docs/assets/proofbox-wordmark.svg apps/printer/src/proofbox_printer/
