"""Opt-in live test. Run on the workshop VM with --confirm-private-upload.

Uses only /config and the process environment for credentials. Writes a dedicated
test schema and uploads the repo's synthetic clip privately. Does not print keys.
The track fixture is synthetic, not a live detector measurement.
"""

import argparse
import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--confirm-private-upload", action="store_true")
args = parser.parse_args()
if not args.confirm_private_upload:
    parser.error("Explicit private synthetic upload approval is required")

os.environ["WEAVE_DISABLED"] = "true"

import httpx
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
from proofbox_api import Services, app, settings
from proofbox_api import store as store_module
from proofbox_api.ask import Toolbox
from proofbox_api.cosmos import Cosmos
from proofbox_api.packing import Item, Order
from proofbox_api.vss import VSS

ROOT = Path(__file__).resolve().parents[1]
RUN_ID = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
ORDER_ID = "PB-TEST-" + RUN_ID
PROMPT = "Describe only visible items entering the box and their timestamps; state uncertainty; this is a synthetic test, not real shipment evidence."
RESULTS = {"run_id": RUN_ID, "synthetic_fixture": True, "checks": {}}
REPORT = ROOT / "integration-result.json"


def record(name, value):
    RESULTS["checks"][name] = value
    REPORT.write_text(json.dumps(RESULTS, indent=2))
    print(name, json.dumps(value), flush=True)


class PrivateTestVSS(VSS):
    async def upload(self, filename, clip, content_type, tags, custom_prompt):
        # Keep exactly the explicitly approved test metadata and prompt.
        result = await self.request(
            "POST",
            "/api/v1/videos/upload",
            files={"file": (filename, clip, content_type)},
            data={
                "is_public": "false",
                "tags": ",".join([*tags, "integration-test"]),
                "custom_prompt": PROMPT,
                "camera_id": "bench-test",
                "capture_type": "warehouse",
                "location": "proofbox-test",
            },
        )
        return result["object_key"]


@asynccontextmanager
async def live_services(application):
    config = settings.load()
    store_module.SCHEMA = "proofbox_integration_" + RUN_ID
    RESULTS["schema"] = store_module.SCHEMA
    store = store_module.Store(
        config.s3_endpoint, config.access_key, config.secret_key, config.vastdb_bucket
    )
    await asyncio.to_thread(store.create_tables)
    await asyncio.to_thread(
        store.seed_orders,
        [
            Order(
                order_id=ORDER_ID,
                customer="SYNTHETIC INTEGRATION TEST",
                items=[
                    Item(name="mug", qty=1),
                    Item(name="coffee beans", qty=1),
                    Item(name="card", qty=1),
                ],
            )
        ],
    )
    record(
        "vast_write_read",
        {
            "passed": bool(await asyncio.to_thread(store.order, ORDER_ID)),
            "order_id": ORDER_ID,
        },
    )
    packs_dir = ROOT / "test-data" / RUN_ID
    packs_dir.mkdir(parents=True, exist_ok=True)
    headers = {"ngrok-skip-browser-warning": "1"}
    gpu_headers = headers | {"Authorization": "Bearer " + config.gpu_bearer_token}
    async with (
        httpx.AsyncClient(
            base_url=config.ingress_url, headers=headers, timeout=180
        ) as vss_http,
        httpx.AsyncClient(
            base_url=config.cosmos_url, headers=gpu_headers, timeout=180
        ) as cosmos_http,
        httpx.AsyncClient(
            base_url=config.canary_url, headers=gpu_headers, timeout=60
        ) as canary_http,
        AsyncOpenAI(
            base_url="https://api.inference.wandb.ai/v1",
            api_key=config.wandb_api_key,
            timeout=180,
            max_retries=0,
            default_headers={
                "OpenAI-Project": f"{config.wandb_team}/{config.wandb_project}",
                **headers,
            },
        ) as llm,
    ):
        vss = PrivateTestVSS(vss_http, config.username, config.password)
        await vss.login()
        limits = await vss.request("GET", "/api/v1/config")
        clip = ROOT / "apps/web/src/debug/fixtures/pack-demo.mp4"
        max_mb = limits.get("app", {}).get("max_upload_size_mb")
        record(
            "vss_upload_limit",
            {"max_upload_size_mb": max_mb, "clip_bytes": clip.stat().st_size},
        )
        if max_mb is not None and clip.stat().st_size > float(max_mb) * 1024 * 1024:
            raise RuntimeError("Fixture exceeds live upload limit")
        tools = Toolbox(store, Cosmos(cosmos_http), vss, packs_dir)
        application.state.services = Services(
            store, vss, canary_http, llm, config.wandb_model, tools, packs_dir
        )
        application.state.integration_vss = vss
        yield


app.router.lifespan_context = live_services


def checked(client, method, path, **kwargs):
    response = client.request(method, path, **kwargs)
    record(method + " " + path, {"status": response.status_code})
    response.raise_for_status()
    return response


try:
    with TestClient(app) as client:
        checked(client, "GET", "/health")
        checked(client, "GET", "/orders/" + ORDER_ID)
        opened = checked(client, "POST", "/packs", json={"order_id": ORDER_ID}).json()
        pack_id = opened["pack_id"]
        RESULTS["pack_id"] = pack_id
        clip = ROOT / "apps/web/src/debug/fixtures/pack-demo.mp4"
        track = ROOT / "apps/web/src/debug/fixtures/pack-demo-track.json"
        sealed = checked(
            client,
            "POST",
            f"/packs/{pack_id}/seal",
            files={
                "video": ("synthetic-integration.mp4", clip.read_bytes(), "video/mp4")
            },
            data={"track": track.read_text()},
        ).json()
        # Persist only structured safe fields, not raw dependency exceptions.
        record(
            "seal_result",
            {
                k: sealed[k]
                for k in ["pack_id", "order_id", "counts", "verdict", "object_key"]
            },
        )
        record("upload_error_present", bool(sealed.get("upload_error")))
        checked(client, "GET", f"/packs/{pack_id}/video")
        points = checked(client, "GET", f"/packs/{pack_id}/track").json()
        record("persisted_track_points", len(points))
        summary_response = client.get(f"/packs/{pack_id}/summary")
        record(
            "cosmos_summary",
            {
                "status": summary_response.status_code,
                "data": summary_response.json()
                if summary_response.is_success
                else None,
            },
        )
        answer = checked(
            client,
            "POST",
            "/ask",
            json={
                "order_id": ORDER_ID,
                "question": "This is a synthetic integration fixture, not a real shipment. What can the clip actually establish about the items? State any uncertainty and cite the pack.",
            },
        ).json()
        record("llm_answer", answer)
        if sealed.get("object_key"):
            # Poll the actual fully-indexed archive; never infer indexing from upload.
            async def poll():
                key = sealed["object_key"]
                for attempt in range(10):
                    data = await app.state.integration_vss.request(
                        "GET",
                        "/api/v1/videos/explore",
                        params={"scope": "mine", "limit": 100, "offset": 0},
                    )
                    if key in json.dumps(data):
                        record("vss_indexed", {"passed": True, "attempt": attempt + 1})
                        return
                    record("index_poll", {"attempt": attempt + 1, "found": False})
                    await asyncio.sleep(20)
                record(
                    "vss_indexed",
                    {"passed": False, "reason": "not visible within polling window"},
                )

            client.portal.call(poll)
except Exception as exc:  # noqa: BLE001 - report type only, never credential-bearing errors
    record("failure", {"type": type(exc).__name__})
    raise SystemExit(1) from None
