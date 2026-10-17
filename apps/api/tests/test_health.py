import json
from pathlib import Path

from fastapi.testclient import TestClient

from proofbox_api import app

WEB_PACKAGE = Path(__file__).parents[2] / "web" / "package.json"


def test_health_reports_the_repo_version():
    version = json.loads(WEB_PACKAGE.read_text())["version"]
    response = TestClient(app).get("/health")
    assert response.json() == {"status": "ok", "version": version}
