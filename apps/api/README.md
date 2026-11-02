# ProofBox middleware

## Current merged application

The app now includes the team's VSS packing workflow (`/orders`, `/packs`,
`/packs/{id}/seal`, `/ask`) alongside the custom middleware described below.
Both startup lifespans are preserved. The packing workflow loads `/config/*.config`
on the workshop VM and needs the VSS login, GPU bearer token, VAST, and W&B settings
defined in `settings.py`. The custom ngrok adapter is a separate integration;
the VSS workflow does not require that service.

For an opt-in live test, use an isolated checkout on the VM, Python 3.14, and run:

```sh
uv sync --project apps/api --python 3.14
uv run --project apps/api python scripts/live_integration.py --confirm-private-upload
```

Only run after approving the private synthetic fixture upload. This creates a
timestamped `proofbox_integration_*` schema in the assigned team bucket, uploads
the synthetic clip, and tests the application routes with real dependencies.
It writes `integration-result.json` in that checkout. It does not test browser
sign-in, a physical camera/printer, or the deployed Worker. Fixture track points
are synthetic; their counts are not evidence of actual detector accuracy.
No credentials are written to the report. Test schemas and private uploads are
retained for inspection; the runner does not delete them automatically.

The sections below document the original custom middleware contract. Frontend
handoff items reflect the initial stub and should be checked against the newer
packing/proof UI before planning more work.

Implements `POST /api/process-session` (multipart `file`) and
`POST /api/audit/evaluate-claim` (`upload_id`, `customer_dispute_text`).
The same routes without `/api` support the existing Vite proxy.
`/health` is liveness; `/api/ready` verifies the VAST connection and table.
OpenAPI and interactive examples are at `/docs`.

## Launch

From the repository root, with uv installed:

```sh
uv sync --project apps/api
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with actual endpoints and credentials.
uv run --project apps/api uvicorn proofbox_api:app --env-file apps/api/.env --host 127.0.0.1 --port 8000
```

PowerShell users can use `Copy-Item` instead of `cp`. The existing `just dev`
launcher also works when variables are exported in its environment.
VAST credentials accept workshop aliases `S3_ENDPOINT`, `ACCESS_KEY`, `SECRET_KEY`;
the LLM key also accepts `WANDB_API_KEY`. Explicit ProofBox names take precedence.
Set `LLM_BASE_URL` and `LLM_MODEL` to the provided OpenAI-compatible inference
service and a model supporting JSON-object responses. No provider/model is guessed.

The bucket must already exist and be authorized. Default: `proofbox`. Workshop
identity policies may require setting `VASTDB_BUCKET` to the assigned team bucket.
Use the data VIP, not the Query Engine VIP. Startup creates only the
`logistics.package_audits` schema/table, validates five Arrow string columns, and
leaves incompatible tables untouched. Initialization failure leaves liveness
available, while readiness and data endpoints report 503; later requests retry.
TLS certificate verification remains enabled.

## Custom upstream contract to confirm

This implementation follows the custom microservice requested for ProofBox:

1. `POST /api/upload`: multipart field `file`; JSON response `{"id":"..."}`.
2. `POST /api/uploads/{id}/detect`: JSON object or array of raw telemetry.
3. `POST /api/uploads/{id}/ask`: JSON `{"question":"..."}`; response
   `{"answer":"..."}` with nonempty VLM text.

Methods and response envelopes were not provided in full, so these are explicit
adapter assumptions, tested with fixtures, not a verified live-service contract.
All HTTP calls through the adapter, including inference, send
`ngrok-skip-browser-warning: 1`. This header does not replace authentication.
Supply the real ngrok hostname; the default hostname is a placeholder.

The official workshop stack instead documents `/api/v1/videos/upload`, JWT login,
asynchronous indexing, and retrieval APIs (see `docs/vast/INGEST.md`). Do not point
this custom adapter at VSS directly without adapting its contract. A 202 response
is reported as pending/unavailable rather than saving unfinished evidence.
An agreed polling/status contract is needed if your service is asynchronous.

## Responses and audit semantics

Ingestion returns 201 only after the VAST transaction commits, including
`upload_id`, `status: committed`, and the five persisted columns. The trail stores
UTC stage timestamps, file SHA-256, size, upload metadata, analysis prompt, and raw
Cosmos response. The file hash identifies submitted bytes; it is not a digital
signature or proof of tamper-free capture. Media storage remains upstream.

Claim evaluation returns `investigation_summary`, `proposed_employee_reply`, and
`auditable_trail`, with exact historical strings copied by application code.
`vast_query_executed` is readable equivalent SQL; the actual read uses an SDK
predicate, disclosed in `query_method`. Drafts require employee approval and are
never sent automatically. No claim evaluation is persisted in this five-column
schema. Add an append-only decision history before using it operationally.

Errors: 404 unknown upload; 409 ambiguous duplicate rows; 413 oversized file;
415 unsupported media type; 422 invalid input; 502 invalid dependency response;
503 unavailable database/configuration or pending inference; 504 dependency timeout.
Failures after upload include the upstream `upload_id` for recovery. There are
no automatic write retries: upload and DB commit timeouts can have ambiguous
outcomes. Add durable jobs and idempotency before enabling client retries.
The upload limit is checked on the parsed/spooled file; configure a request-size
limit at the deployment proxy too. MIME validation does not decode the media.

## Frontend handoff and demo blockers

- The camera hook currently previews video only. Add MediaRecorder start/stop,
  submit its Blob as multipart `file`, and display processing/failure states.
- Associate the returned upload ID with an order and its expected packing list.
  The five requested columns do not contain order IDs or SKU expectations.
- Build the employee claim workspace using the evaluation endpoint, with raw
  evidence and a clearly labelled editable reply draft.
- Implement the QR proof destination and video access authorization; printed
  labels alone do not provide a working evidence page.
- The Cloudflare deployment currently serves only the frontend. Deploy the API
  where it can reach VAST, and route `/api` to it with adequate upload/time limits.
- WorkOS sign-in currently protects the UI only. These middleware routes do not
  validate WorkOS tokens or enforce tenant/order authorization. Keep the demo API
  local/private until server-side authentication and access controls are added.

## Highest-value next features

Prioritize a demonstrable loop: record an order, identify each packing event,
print its QR, scan to replay evidence, then investigate a dispute. Add timestamped
clip citations so a judge can verify each observation. Compare expected items
against tracked packing events (raw YOLO detections can count the same object in
many frames). Include an obscured-view example that requests manual review.
Use your own short recordings covering complete, missing-item, and ambiguous
packing; the workshop's default corpus is primarily traffic footage.
Measure time to investigate with and without ProofBox, and report measured results.
These are product recommendations, not claimed official judging criteria.

Challenge reference: https://github.com/vast-data/vast-builders-challenge

## Verification

```sh
uv run --project apps/api pytest apps/api/tests -q
uv run --project apps/api ruff check apps/api
uv run --project apps/api pyrefly check
```

Tests use mocked HTTP and an injected store. They do not establish live VAST,
ngrok, or LLM compatibility. Before the demo, run readiness, upload one owned clip,
verify its row in VAST, evaluate a claim, and inspect the evidence against playback.
