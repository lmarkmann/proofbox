from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
from ultralytics.utils import ASSETS

from proofbox_vision import app


def jpeg(path) -> bytes:
    buffer = BytesIO()
    Image.open(path).convert("RGB").save(buffer, "JPEG")
    return buffer.getvalue()


def test_prompted_classes_come_back_as_labels_with_normalized_boxes():
    with TestClient(app) as client, client.websocket_connect("/ws") as socket:
        socket.send_text('{"names": ["bus", "person"]}')
        assert socket.receive_json() == {
            "type": "classes",
            "names": ["bus", "person"],
        }
        socket.send_bytes(jpeg(ASSETS / "bus.jpg"))
        reply = socket.receive_json()

    labels = {box["label"] for box in reply["boxes"]}
    assert labels == {"bus", "person"}
    assert all(0 <= v <= 1 for box in reply["boxes"] for v in box["box"])


def test_frames_before_classes_are_refused():
    with TestClient(app) as client, client.websocket_connect("/ws") as socket:
        socket.send_bytes(b"\xff\xd8")
        assert socket.receive_json()["type"] == "error"
        socket.send_text('{"names": []}')
        assert socket.receive_json()["type"] == "error"
