from fastapi.testclient import TestClient

from proofbox_api import app


def test_health_reports_package_version():
    response = TestClient(app).get("/health")
    assert response.json() == {"status": "ok", "version": "0.1.0"}
