import asyncio
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

type Verdict = Literal["complete", "short", "unexpected"]


class Item(BaseModel):
    name: str
    qty: int


class Order(BaseModel):
    order_id: str
    customer: str
    items: list[Item]


class TrackPoint(BaseModel):
    t_ms: int
    track: int | None
    label: str
    conf: float
    box: tuple[float, float, float, float] = Field(
        description="x1, y1, x2, y2 normalized to 0..1"
    )


class PackSummary(BaseModel):
    pack_id: str
    sealed_at: datetime
    verdict: Verdict
    counts: dict[str, int]


class Check(BaseModel):
    pack_id: str
    verdict: Verdict
    text: str


class Pack(PackSummary):
    order_id: str
    started_at: datetime
    object_key: str | None


def count_tracks(track: list[TrackPoint]) -> dict[str, int]:
    tracks_by_label: defaultdict[str, set[int]] = defaultdict(set)
    for point in track:
        if point.track is not None:
            tracks_by_label[point.label].add(point.track)
    return {label: len(ids) for label, ids in tracks_by_label.items()}


def track_spans(
    track: list[TrackPoint],
) -> dict[tuple[str, int], tuple[int, int]]:
    spans: dict[tuple[str, int], tuple[int, int]] = {}
    for point in sorted(track, key=lambda point: point.t_ms):
        if point.track is not None:
            key = (point.label, point.track)
            first_ms = spans[key][0] if key in spans else point.t_ms
            spans[key] = (first_ms, point.t_ms)
    return spans


def judge(order: Order, counts: dict[str, int]) -> Verdict:
    expected = {item.name for item in order.items}
    if any(counts.get(item.name, 0) < item.qty for item in order.items):
        return "short"
    if counts.keys() - expected:
        return "unexpected"
    return "complete"


def find_clip(packs_dir: Path, pack_id: str) -> Path | None:
    return next(
        (
            clip
            for suffix in (".mp4", ".webm")
            if (clip := packs_dir / f"{pack_id}{suffix}").exists()
        ),
        None,
    )


async def remux(recorded: Path, clip: Path) -> str | None:
    faststart = ["-movflags", "+faststart"] if clip.suffix == ".mp4" else []
    ffmpeg = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-i",
        recorded,
        "-c",
        "copy",
        *faststart,
        clip,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await ffmpeg.communicate()
    if ffmpeg.returncode:
        recorded.replace(clip)
        return f"remux failed, kept the recording as is: {stderr.decode().strip()[-300:]}"
    recorded.unlink()
    return None
