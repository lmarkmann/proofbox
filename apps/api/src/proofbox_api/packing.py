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
