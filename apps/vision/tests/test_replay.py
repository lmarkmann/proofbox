import json
from email.parser import BytesParser
from email.policy import HTTP
from pathlib import Path

import cv2
import httpx
import numpy as np
import pytest
import torch
from ultralytics.engine.results import Results

from proofbox_vision import detections, prompt
from proofbox_vision.replay import (
    label_color,
    points,
    seal,
    track_clip,
    vocabulary,
)

# ultralytics' bus.jpg held for 2 s at 10 fps, 360 x 480
BUS_CLIP = Path(__file__).parent / "fixtures" / "bus.mp4"


def test_tracked_boxes_become_track_points_at_video_time():
    frame = np.zeros((100, 200, 3), np.uint8)
    names = {0: "mug", 1: "notebook"}
    tracked = Results(
        frame,
        path="",
        names=names,
        boxes=torch.tensor(
            [
                [20.0, 10.0, 120.0, 60.0, 7, 0.91234, 1],
                [0.0, 0.0, 200.0, 100.0, 8, 0.5, 0],
            ]
        ),
    )
    untracked = Results(
        frame,
        path="",
        names=names,
        boxes=torch.tensor([[50.0, 25.0, 100.0, 75.0, 0.4, 0]]),
    )

    assert points(detections(tracked), frame_index=100, fps=29.97) == [
        {
            "t_ms": 3337,
            "track": 7,
            "label": "notebook",
            "conf": 0.912,
            "box": [0.1, 0.1, 0.6, 0.6],
        },
        {
            "t_ms": 3337,
            "track": 8,
            "label": "mug",
            "conf": 0.5,
            "box": [0.0, 0.0, 1.0, 1.0],
        },
    ]
    assert points(detections(untracked), frame_index=0, fps=30) == [
        {
            "t_ms": 0,
            "track": None,
            "label": "mug",
            "conf": 0.4,
            "box": [0.25, 0.25, 0.5, 0.75],
        }
    ]


# expected colours computed by running labelColor from vision-overlay.tsx in node
@pytest.mark.parametrize(
    ("label", "web_hex"),
    [
        ("bus", "#fb923c"),
        ("person", "#22d3ee"),
        ("stainless steel water bottle", "#facc15"),
        ("\U0001f4e6 box", "#a78bfa"),
    ],
)
def test_label_colors_match_the_web_overlay(label, web_hex):
    blue, green, red = label_color(label)
    assert f"#{red:02x}{green:02x}{blue:02x}" == web_hex


def form_fields(request: httpx.Request) -> dict:
    head = f"Content-Type: {request.headers['content-type']}\r\n\r\n"
    form = BytesParser(policy=HTTP).parsebytes(head.encode() + request.content)
    return {
        part.get_param("name", header="content-disposition"): part
        for part in form.iter_parts()
    }


def test_vocabulary_and_seal_follow_the_station_calls(tmp_path):
    calls = []
    sealed = {
        "pack_id": "0a1b2c3d",
        "order_id": "PB-1001",
        "counts": {"mug": 1},
        "verdict": "short",
        "object_key": "PB-1001_0a1b2c3d.mp4",
        "upload_error": None,
    }

    def api(request: httpx.Request) -> httpx.Response:
        request.read()
        calls.append(request)
        match request.method, request.url.path:
            case "GET", "/orders/PB-1001":
                items = [
                    {"name": "mug", "qty": 1},
                    {"name": "notebook", "qty": 2},
                ]
                return httpx.Response(
                    200,
                    json={"order_id": "PB-1001", "items": items, "packs": []},
                )
            case "GET", "/orders":
                return httpx.Response(
                    200,
                    json=[
                        {
                            "order_id": "PB-1001",
                            "items": [
                                {"name": "mug", "qty": 1},
                                {"name": "notebook", "qty": 2},
                            ],
                        },
                        {
                            "order_id": "PB-1002",
                            "items": [
                                {"name": " headphones ", "qty": 1},
                                {"name": "mug", "qty": 3},
                            ],
                        },
                    ],
                )
            case "POST", "/packs":
                return httpx.Response(
                    200,
                    json={
                        "pack_id": "0a1b2c3d",
                        "order_id": "PB-1001",
                        "started_at": "2026-10-17T12:00:00Z",
                    },
                )
            case "POST", "/packs/0a1b2c3d/seal":
                return httpx.Response(200, json=sealed)
        return httpx.Response(404)

    clip = tmp_path / "packing.mov"
    clip.write_bytes(b"not really a movie")
    rows = [
        {
            "t_ms": 0,
            "track": 3,
            "label": "mug",
            "conf": 0.8,
            "box": [0.1, 0.2, 0.3, 0.4],
        }
    ]
    with httpx.Client(
        base_url="http://vm", transport=httpx.MockTransport(api)
    ) as client:
        assert vocabulary(client, "PB-1001") == [
            "mug",
            "notebook",
            "headphones",
        ]
        assert seal(client, "PB-1001", clip, rows) == sealed

    assert json.loads(calls[2].content) == {"order_id": "PB-1001"}
    fields = form_fields(calls[3])
    assert json.loads(fields["track"].get_content()) == rows
    assert fields["video"].get_content_type() == "video/mp4"
    assert fields["video"].get_payload(decode=True) == b"not really a movie"


def test_a_clip_is_tracked_frame_by_frame_and_rendered(tmp_path):
    prompt(["bus", "person"])
    rendered = tmp_path / "rendered.mp4"

    rows = track_clip(BUS_CLIP, rendered)

    assert {row["t_ms"] for row in rows} == set(range(0, 2000, 100))
    assert {row["label"] for row in rows} == {"bus", "person"}
    assert all(row["track"] is not None for row in rows)
    assert all(0 <= v <= 1 for row in rows for v in row["box"])
    video = cv2.VideoCapture(str(rendered))
    assert video.get(cv2.CAP_PROP_FRAME_COUNT) == 20
    assert (
        video.get(cv2.CAP_PROP_FRAME_WIDTH),
        video.get(cv2.CAP_PROP_FRAME_HEIGHT),
    ) == (360, 480)
    video.release()
