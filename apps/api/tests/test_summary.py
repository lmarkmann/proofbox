from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from proofbox_api import Summary, app, services


def test_summary_is_pending_then_ready_or_failed(tmp_path: Path) -> None:
    app.dependency_overrides[services] = lambda: SimpleNamespace(
        packs_dir=tmp_path
    )
    client = TestClient(app)
    try:
        assert client.get("/packs/0a1b2c3d/summary").status_code == 404

        summary = Summary(
            pack_id="0a1b2c3d", text="A mug goes in at 2 s.", evidence=[]
        )
        (tmp_path / "0a1b2c3d.summary.json").write_text(
            summary.model_dump_json()
        )
        assert (
            client.get("/packs/0a1b2c3d/summary").json()["text"] == summary.text
        )

        (tmp_path / "0a1b2c3d.summary-error.txt").write_text("ReadTimeout: ")
        assert client.get("/packs/0a1b2c3d/summary").status_code == 502
    finally:
        app.dependency_overrides.clear()
