from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from proofbox_printer import app, jd268bt, tspl

client = TestClient(app)
LABEL = {"order_id": "PB-20481", "proof_url": "https://proofbox.app/p/7f3k2q"}


def test_preview_is_a_png_of_the_canvas():
    response = client.post("/labels/preview", json=LABEL)
    assert response.headers["content-type"] == "image/png"
    assert Image.open(BytesIO(response.content)).size == tspl.CANVAS


def test_print_without_a_printer_is_service_unavailable(monkeypatch):
    monkeypatch.setattr(jd268bt, "find", lambda: None)
    assert client.get("/health").json()["printer"] == "missing"
    assert client.post("/labels", json=LABEL).status_code == 503


def test_more_than_three_detail_lines_are_rejected():
    response = client.post("/labels", json={**LABEL, "lines": ["a"] * 4})
    assert response.status_code == 422
