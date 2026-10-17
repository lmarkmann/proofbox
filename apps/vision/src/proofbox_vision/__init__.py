import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from importlib.metadata import version
from typing import Annotated

import cv2
import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, StringConstraints, ValidationError
from ultralytics import YOLOE
from ultralytics.engine.results import Results

WEIGHTS = "yoloe-26s-seg.pt"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

model = YOLOE(WEIGHTS)
# one worker serializes every model call, so prompts and tracker state never race
inference = ThreadPoolExecutor(max_workers=1)
prompt_embeddings: dict[tuple[str, ...], torch.Tensor | None] = {}

type ClassName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)
]


class Classes(BaseModel):
    names: list[ClassName] = Field(min_length=1, max_length=20)


def prompt(names: list[str]) -> None:
    key = tuple(names)
    if key not in prompt_embeddings:
        prompt_embeddings[key] = model.get_text_pe(names)
    model.set_classes(names, prompt_embeddings[key])


def detections(result: Results) -> list[dict]:
    boxes = result.boxes
    if boxes is None:
        return []
    tracks = (
        [int(t) for t in boxes.id.tolist()]
        if boxes.id is not None
        else [None] * len(boxes)
    )
    return [
        {
            "track": track,
            "label": result.names[int(cls)],
            "conf": round(float(conf), 3),
            "box": [round(v, 4) for v in xyxyn],
        }
        for track, cls, conf, xyxyn in zip(
            tracks,
            boxes.cls.tolist(),
            boxes.conf.tolist(),
            boxes.xyxyn.tolist(),
            strict=True,
        )
    ]


def detect(frame: np.ndarray) -> list[dict]:
    """Tracks one BGR frame against the prompted classes, continuing the previous frame's tracks."""
    (result,) = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        device=DEVICE,
        imgsz=640,
        conf=0.25,
        verbose=False,
    )
    return detections(result)


def detect_jpeg(jpeg: bytes) -> list[dict]:
    frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("frame is not a decodable JPEG")
    return detect(frame)


def warm_up() -> None:
    """Fetches the text encoder and compiles the MPS kernels before a station connects."""
    prompt(["person"])
    model.predict(
        np.zeros((480, 640, 3), np.uint8), device=DEVICE, verbose=False
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    await asyncio.get_running_loop().run_in_executor(inference, warm_up)
    yield


app = FastAPI(
    title="ProofBox vision",
    version=version("proofbox-vision"),
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "version": app.version,
        "model": WEIGHTS,
        "device": DEVICE,
    }


@app.websocket("/ws")
async def stream(socket: WebSocket) -> None:
    """Text messages set the prompt classes, binary messages are JPEG frames.

    The client keeps one frame in flight, so replies come back in send order.
    """
    await socket.accept()
    loop = asyncio.get_running_loop()
    prompted = False
    frame = 0
    try:
        while True:
            message = await socket.receive()
            if message["type"] == "websocket.disconnect":
                return
            if text := message.get("text"):
                try:
                    names = Classes.model_validate_json(text).names
                except ValidationError as error:
                    await socket.send_json(
                        {"type": "error", "detail": str(error)}
                    )
                    continue
                await loop.run_in_executor(inference, prompt, names)
                prompted = True
                await socket.send_json({"type": "classes", "names": names})
                continue
            if not prompted:
                await socket.send_json(
                    {"type": "error", "detail": "send classes before frames"}
                )
                continue
            started = time.perf_counter()
            boxes = await loop.run_in_executor(
                inference, detect_jpeg, message["bytes"]
            )
            frame += 1
            await socket.send_json(
                {
                    "type": "boxes",
                    "frame": frame,
                    "ms": round((time.perf_counter() - started) * 1000),
                    "boxes": boxes,
                }
            )
    except WebSocketDisconnect:
        return


def main() -> None:
    uvicorn.run("proofbox_vision:app", port=8002)
