"""Seals a pack from a recorded clip, tracked the way the live station tracks it."""

import itertools
import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Annotated

import cv2
import httpx
import numpy as np
import typer

from proofbox_vision import Classes, detect, prompt

# labelColor in apps/web/src/components/vision-overlay.tsx
PALETTE = [
    "#22d3ee",
    "#a78bfa",
    "#f472b6",
    "#facc15",
    "#fb923c",
    "#4ade80",
    "#60a5fa",
]
TAG_INK = (10, 10, 10)
FONT = cv2.FONT_HERSHEY_SIMPLEX


def label_color(label: str) -> tuple[int, int, int]:
    """BGR of the colour the web overlay draws `label` in."""
    hashed = 0
    for char in label:
        code_unit = int.from_bytes(char.encode("utf-16-be")[:2])
        hashed = (hashed * 31 + code_unit) & 0xFFFFFFFF
    signed = hashed - (1 << 32) if hashed >= 1 << 31 else hashed
    red, green, blue = bytes.fromhex(PALETTE[abs(signed) % len(PALETTE)][1:])
    return blue, green, red


def points(detections: list[dict], frame_index: int, fps: float) -> list[dict]:
    t_ms = round(frame_index / fps * 1000)
    return [{"t_ms": t_ms, **detection} for detection in detections]


def burn_in(frame: np.ndarray, detections: list[dict]) -> None:
    height, width = frame.shape[:2]
    # the web overlay draws 2 px lines and a 20 px tag on a video about 480 px tall
    scale = height / 480
    line = max(2, round(2 * scale))
    tag_height = round(20 * scale)
    pad = round(5 * scale)
    font_scale = 0.45 * scale
    thickness = max(1, round(scale))
    for detection in detections:
        color = label_color(detection["label"])
        x1, y1, x2, y2 = (
            round(v * size)
            for v, size in zip(
                detection["box"], (width, height, width, height), strict=True
            )
        )
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, line, cv2.LINE_AA)
        track = "" if detection["track"] is None else f" #{detection['track']}"
        percent = math.floor(detection["conf"] * 100 + 0.5)
        text = f"{detection['label']}{track} {percent}%"
        (text_width, text_height), _ = cv2.getTextSize(
            text, FONT, font_scale, thickness
        )
        top = max(0, y1 - tag_height)
        cv2.rectangle(
            frame,
            (x1, top),
            (x1 + text_width + 2 * pad, top + tag_height),
            color,
            cv2.FILLED,
        )
        cv2.putText(
            frame,
            text,
            (x1 + pad, top + (tag_height + text_height) // 2),
            FONT,
            font_scale,
            TAG_INK,
            thickness,
            cv2.LINE_AA,
        )


def h264_encoder(
    out: Path, width: int, height: int, fps: float
) -> subprocess.Popen[bytes]:
    return subprocess.Popen(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{width}x{height}",
            "-r",
            str(fps),
            "-i",
            "-",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(out),
        ],
        stdin=subprocess.PIPE,
    )


def track_clip(clip: Path, render: Path | None = None) -> list[dict]:
    """Tracks every frame of `clip`; t_ms is video time, so the rows line up with playback."""
    capture = cv2.VideoCapture(str(clip))
    if not capture.isOpened():
        raise ValueError(f"OpenCV cannot read {clip}")
    fps = capture.get(cv2.CAP_PROP_FPS)
    rows: list[dict] = []
    encoder = None
    try:
        for frame_index in itertools.count():
            ok, frame = capture.read()
            if not ok:
                break
            found = detect(frame)
            rows += points(found, frame_index, fps)
            if render:
                if encoder is None:
                    height, width = frame.shape[:2]
                    encoder = h264_encoder(render, width, height, fps)
                burn_in(frame, found)
                assert encoder.stdin
                encoder.stdin.write(frame.tobytes())
    finally:
        capture.release()
        if encoder and encoder.stdin:
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError(f"ffmpeg could not write {render}")
    return rows


def vocabulary(api: httpx.Client, order_id: str) -> list[str]:
    """The prompt the station sends: every item name of this order, then of all orders."""
    order = api.get(f"/orders/{order_id}").raise_for_status().json()
    orders = api.get("/orders").raise_for_status().json()
    names = [
        item["name"] for each in [order, *orders] for item in each["items"]
    ]
    return Classes(names=list(dict.fromkeys(names))).names


def seal(
    api: httpx.Client, order_id: str, clip: Path, rows: list[dict]
) -> dict:
    opened = api.post("/packs", json={"order_id": order_id})
    pack_id = opened.raise_for_status().json()["pack_id"]
    content_type = (
        "video/webm" if clip.suffix.lower() == ".webm" else "video/mp4"
    )
    with clip.open("rb") as video:
        sealed = api.post(
            f"/packs/{pack_id}/seal",
            files={"video": (clip.name, video, content_type)},
            data={"track": json.dumps(rows)},
        )
    return sealed.raise_for_status().json()


cli = typer.Typer(
    add_completion=False,
    rich_markup_mode=None,
    pretty_exceptions_enable=False,
    context_settings={"help_option_names": ["-h", "--help"]},
)


@cli.command()
def replay(
    clip: Annotated[Path, typer.Argument(exists=True, dir_okay=False)],
    order: Annotated[str, typer.Option(help="Order id, e.g. PB-1001")],
    api: Annotated[str, typer.Option(help="ProofBox API")] = (
        "http://127.0.0.1:8000"
    ),
    render: Annotated[
        Path | None,
        typer.Option(help="Also write the clip with the boxes burned in"),
    ] = None,
) -> None:
    """Tracks a recorded packing clip and seals it as a pack for ORDER."""
    with httpx.Client(base_url=api, timeout=600) as client:
        try:
            names = vocabulary(client, order)
            prompt(names)
            rows = track_clip(clip, render)
            print(
                f"{len(rows)} detections, prompted with {', '.join(names)}",
                file=sys.stderr,
            )
            sealed = seal(client, order, clip, rows)
        except httpx.HTTPStatusError as error:
            response = error.response
            sys.exit(
                f"{response.request.method} {response.request.url.path} "
                f"answered {response.status_code}: {response.text}"
            )
        except httpx.TransportError as error:
            sys.exit(
                f"cannot reach {api} ({error!r}); is the SSH tunnel to the VM open?"
            )
    counts = ", ".join(
        f"{n} x {label}" for label, n in sealed["counts"].items()
    )
    print(f"pack_id       {sealed['pack_id']}")
    print(f"verdict       {sealed['verdict']}")
    print(f"counts        {counts or 'nothing tracked'}")
    print(f"object_key    {sealed['object_key']}")
    print(f"upload_error  {sealed['upload_error']}")
