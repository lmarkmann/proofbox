import json
from dataclasses import replace
from unittest.mock import MagicMock

import httpx
import pyarrow as pa
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from proofbox_api.middleware import (
    AUDIT_SCHEMA,
    Settings,
    VastAuditStore,
    install,
)


def test_vast_operations_use_transactions_and_explicit_schema():
    store = VastAuditStore(Settings())
    session = MagicMock()
    store.session = lambda: session
    tx = session.transaction.return_value.__enter__.return_value
    bucket = tx.bucket.return_value
    schema = bucket.create_schema.return_value
    table = schema.create_table.return_value
    bucket.schema.return_value = None
    schema.table.return_value = None
    table.arrow_schema = AUDIT_SCHEMA
    store.initialize()
    bucket.create_schema.assert_called_once_with(
        "logistics", fail_if_exists=False
    )
    schema.create_table.assert_called_once_with(
        "package_audits", columns=AUDIT_SCHEMA, fail_if_exists=False
    )
    bucket.schema.return_value = schema
    schema.table.return_value = table
    row = dict.fromkeys(AUDIT_SCHEMA.names, "value")
    store.insert(row)
    arrow = table.insert.call_args.args[0]
    assert arrow.schema == AUDIT_SCHEMA
    assert arrow.to_pylist() == [row]
    table.select.return_value.read_all.return_value = pa.Table.from_pylist(
        [row], schema=AUDIT_SCHEMA
    )
    assert store.get("value") == row
    table.__getitem__.assert_called_once_with("id")
    assert session.transaction.return_value.__exit__.call_count == 3


class Store:
    def __init__(self):
        self.rows = {}
        self.fail = False

    def initialize(self):
        if self.fail:
            raise RuntimeError("offline")

    def insert(self, row):
        self.initialize()
        self.rows[row["id"]] = row

    def get(self, upload_id):
        return self.rows.get(upload_id)


@pytest.fixture
def harness():
    store = Store()
    calls = []
    responses = {
        "/api/upload": {"id": "upload-1"},
        "/api/uploads/upload-1/detect": {"box": 1, "bottle": 2},
        "/api/uploads/upload-1/ask": {"answer": "Box closure is obscured."},
        "/v1/chat/completions": {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "investigation_summary": "Closure cannot be verified.",
                                "proposed_employee_reply": "We are reviewing the packing footage.",
                            }
                        )
                    }
                }
            ]
        },
    }

    def handler(request):
        assert request.headers["ngrok-skip-browser-warning"] == "1"
        assert request.method == "POST"
        calls.append(request)
        value = responses[request.url.path]
        if isinstance(value, Exception):
            raise value
        if isinstance(value, httpx.Response):
            return value
        return httpx.Response(200, json=value)

    settings = Settings(
        upstream_url="https://vision.example",
        llm_base_url="https://llm.example/v1",
        llm_model="test-model",
        llm_api_key="test-key",
    )

    def client(**overrides):
        app = FastAPI()
        install(
            app,
            replace(settings, **overrides),
            store,
            httpx.MockTransport(handler),
        )
        return TestClient(app)

    return client, store, calls, responses


def upload(client, route="/api/process-session", content=b"video"):
    return client.post(
        route, files={"file": ("pack.mp4", content, "video/mp4")}
    )


def test_ingestion_and_evaluation_preserve_evidence(harness):
    factory, store, calls, _ = harness
    with factory() as client:
        response = upload(client)
        assert response.status_code == 201
        row = store.rows["upload-1"]
        assert json.loads(row["yolo_counts"]) == {"box": 1, "bottle": 2}
        trail = json.loads(row["internal_audit_trail"])
        assert len(trail["sha256"]) == 64
        assert len(trail["events"]) == 3
        response = client.post(
            "/api/audit/evaluate-claim",
            json={
                "upload_id": "upload-1",
                "customer_dispute_text": "One item was missing",
            },
        )
        assert response.status_code == 200
        assert (
            response.json()["auditable_trail"]["historical_yolo_telemetry_used"]
            == row["yolo_counts"]
        )
        context = json.loads(
            json.loads(calls[-1].content)["messages"][1]["content"]
        )
        assert context["cosmos_analysis"] == row["cosmos_analysis"]
        assert [call.url.path for call in calls] == [
            "/api/upload",
            "/api/uploads/upload-1/detect",
            "/api/uploads/upload-1/ask",
            "/v1/chat/completions",
        ]


@pytest.mark.parametrize("path", ["/process-session", "/api/process-session"])
def test_proxy_and_direct_routes(harness, path):
    factory, *_ = harness
    with factory() as client:
        assert upload(client, path).status_code == 201


@pytest.mark.parametrize(
    "failure,code",
    [
        (httpx.Response(500), 502),
        (httpx.Response(200, text="not json"), 502),
        (httpx.Response(202, json={"status": "pending"}), 503),
        (httpx.ReadTimeout("timeout"), 504),
    ],
)
def test_detection_failure_does_not_commit(harness, failure, code):
    factory, store, calls, responses = harness
    responses["/api/uploads/upload-1/detect"] = failure
    with factory() as client:
        result = upload(client)
        assert result.status_code == code
        assert result.json()["detail"]["upload_id"] == "upload-1"
    assert not store.rows
    assert len(calls) == 2


def test_upload_validation(harness):
    factory, _, calls, _ = harness
    with factory(max_upload_bytes=4) as client:
        assert upload(client).status_code == 413
        assert upload(client, content=b"").status_code == 422
        assert (
            client.post(
                "/process-session",
                files={"file": ("test.txt", b"x", "text/plain")},
            ).status_code
            == 415
        )
    assert not calls


def test_missing_claim_and_invalid_id(harness):
    factory, _, calls, _ = harness
    with factory() as client:
        assert (
            client.post(
                "/audit/evaluate-claim",
                json={
                    "upload_id": "missing",
                    "customer_dispute_text": "missing item",
                },
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/audit/evaluate-claim",
                json={
                    "upload_id": "x' OR 1=1",
                    "customer_dispute_text": "missing item",
                },
            ).status_code
            == 422
        )
    assert not calls


def test_invalid_llm_is_not_presented_as_verified(harness):
    factory, _, _, responses = harness
    responses["/v1/chat/completions"] = {
        "choices": [{"message": {"content": "not JSON"}}]
    }
    with factory() as client:
        upload(client)
        assert (
            client.post(
                "/audit/evaluate-claim",
                json={
                    "upload_id": "upload-1",
                    "customer_dispute_text": "missing item",
                },
            ).status_code
            == 502
        )


def test_database_outage_and_recovery(harness):
    factory, store, calls, _ = harness
    store.fail = True
    with factory() as client:
        assert client.get("/api/ready").status_code == 503
        assert upload(client).status_code == 503
        assert not calls
        store.fail = False
        assert upload(client).status_code == 201


def test_commit_failure_preserves_upload_id(harness):
    factory, store, _, _ = harness
    with factory() as client:
        store.fail = True
        response = upload(client)
        assert response.status_code == 503
        assert response.json()["detail"]["upload_id"] == "upload-1"
        assert not store.rows
