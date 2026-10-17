import asyncio
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from typing import Annotated

import httpx
import uvicorn
import weave
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    Form,
    HTTPException,
    Path as PathParam,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from openai import APIError, AsyncOpenAI
from pydantic import BaseModel, TypeAdapter, ValidationError

from proofbox_api import canary, settings
from proofbox_api.ask import Answer, Evidence, Toolbox, ask, summarize_pack
from proofbox_api.cosmos import Cosmos
from proofbox_api.packing import (
    Order,
    Pack,
    PackSummary,
    TrackPoint,
    Verdict,
    count_tracks,
    find_clip,
    judge,
    remux,
    track_spans,
)
from proofbox_api.store import Store
from proofbox_api.vss import VSS


@dataclass(frozen=True)
class Services:
    store: Store
    vss: VSS
    canary: httpx.AsyncClient
    llm: AsyncOpenAI
    model: str
    tools: Toolbox
    packs_dir: Path


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    config = settings.load()
    packs_dir = config.data_dir / "packs"
    packs_dir.mkdir(parents=True, exist_ok=True)
    store = Store(
        config.s3_endpoint,
        config.access_key,
        config.secret_key,
        config.vastdb_bucket,
    )
    store.create_tables()
    demo_orders = TypeAdapter(list[Order]).validate_json(
        config.demo_orders.read_bytes()
    )
    store.seed_orders(demo_orders)
    weave.init(f"{config.wandb_team}/{config.wandb_project}")
    gpu_auth = {"Authorization": f"Bearer {config.gpu_bearer_token}"}
    async with (
        httpx.AsyncClient(base_url=config.ingress_url, timeout=180) as vss_http,
        httpx.AsyncClient(
            base_url=config.cosmos_url, headers=gpu_auth, timeout=180
        ) as cosmos_http,
        httpx.AsyncClient(
            base_url=config.canary_url, headers=gpu_auth, timeout=60
        ) as canary_http,
        AsyncOpenAI(
            base_url="https://api.inference.wandb.ai/v1",
            api_key=config.wandb_api_key,
            default_headers={
                "OpenAI-Project": f"{config.wandb_team}/{config.wandb_project}"
            },
        ) as llm,
    ):
        vss = VSS(vss_http, config.username, config.password)
        app.state.services = Services(
            store=store,
            vss=vss,
            canary=canary_http,
            llm=llm,
            model=config.wandb_model,
            tools=Toolbox(store, Cosmos(cosmos_http), vss, packs_dir),
            packs_dir=packs_dir,
        )
        yield


app = FastAPI(
    title="ProofBox", version=version("proofbox-api"), lifespan=lifespan
)


def services(request: Request) -> Services:
    return request.app.state.services


Svc = Annotated[Services, Depends(services)]
PackId = Annotated[str, PathParam(pattern=r"^[0-9a-f]{8}$")]


class OrderDetail(Order):
    packs: list[PackSummary]


class SealedPack(PackSummary):
    order_id: str


class NewPack(BaseModel):
    order_id: str


class OpenPack(BaseModel):
    pack_id: str
    order_id: str
    started_at: datetime


class Sealed(BaseModel):
    pack_id: str
    order_id: str
    counts: dict[str, int]
    verdict: Verdict
    object_key: str | None
    upload_error: str | None


class Summary(BaseModel):
    pack_id: str
    text: str
    evidence: list[Evidence]


class Question(BaseModel):
    question: str
    order_id: str | None = None


class Transcript(BaseModel):
    text: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


@app.get("/orders")
def list_orders(svc: Svc) -> list[Order]:
    return svc.store.orders()


@app.get("/orders/{order_id}")
def get_order(svc: Svc, order_id: str) -> OrderDetail:
    order = svc.store.order(order_id)
    if order is None:
        raise HTTPException(404, f"no order {order_id}")
    packs = [
        PackSummary.model_validate(pack, from_attributes=True)
        for pack in svc.store.packs(order_id)
    ]
    return OrderDetail(**order.model_dump(), packs=packs)


@app.get("/packs")
def list_packs(
    svc: Svc, limit: Annotated[int, Query(ge=1, le=200)] = 20
) -> list[SealedPack]:
    return [
        SealedPack.model_validate(pack, from_attributes=True)
        for pack in svc.store.recent_packs(limit)
    ]


@app.post("/packs")
def open_pack(svc: Svc, body: NewPack) -> OpenPack:
    if svc.store.order(body.order_id) is None:
        raise HTTPException(404, f"no order {body.order_id}")
    pack = OpenPack(
        pack_id=secrets.token_hex(4),
        order_id=body.order_id,
        started_at=datetime.now(UTC),
    )
    (svc.packs_dir / f"{pack.pack_id}.json").write_text(pack.model_dump_json())
    return pack


@app.post("/packs/{pack_id}/seal")
async def seal_pack(
    svc: Svc,
    pack_id: PackId,
    video: UploadFile,
    track: Annotated[str, Form()],
    background: BackgroundTasks,
) -> Sealed:
    opened = svc.packs_dir / f"{pack_id}.json"
    if not opened.exists():
        raise HTTPException(404, f"no open pack {pack_id}")
    if find_clip(svc.packs_dir, pack_id):
        raise HTTPException(409, f"pack {pack_id} is already sealed")
    pack = OpenPack.model_validate_json(opened.read_text())
    try:
        points = TypeAdapter(list[TrackPoint]).validate_json(track)
    except ValidationError as error:
        raise HTTPException(422, error.errors(include_url=False)) from error
    order = await asyncio.to_thread(svc.store.order, pack.order_id)
    if order is None:
        raise HTTPException(404, f"no order {pack.order_id}")

    content_type = video.content_type or "video/mp4"
    suffix = ".webm" if "webm" in content_type else ".mp4"
    recorded = svc.packs_dir / f"{pack_id}.recorded{suffix}"
    recorded.write_bytes(await video.read())
    clip_path = svc.packs_dir / f"{pack_id}{suffix}"
    remux_error = await remux(recorded, clip_path)
    clip = clip_path.read_bytes()

    counts = count_tracks(points)
    expected = ", ".join(f"{item.qty} x {item.name}" for item in order.items)
    object_key = None
    errors = [remux_error] if remux_error else []
    try:
        object_key = await svc.vss.upload(
            f"{order.order_id}_{pack_id}{suffix}",
            clip,
            content_type.split(";")[0],
            [order.order_id, pack_id],
            f"A packing station camera should show order {order.order_id} being packed into a shipping box; the order lists {expected}. "
            "Do not assume the order list is right. Describe each item you see placed into the box, in order, with the time it goes in. "
            "Then, for each listed item, say seen or not seen, and name anything packed that is not on the list.",
        )
    except httpx.HTTPError as error:
        errors.append(f"VSS upload {type(error).__name__}: {error}")

    sealed = Pack(
        pack_id=pack_id,
        order_id=order.order_id,
        started_at=pack.started_at,
        sealed_at=datetime.now(UTC),
        object_key=object_key,
        counts=counts,
        verdict=judge(order, counts),
    )
    await asyncio.to_thread(svc.store.insert_pack, sealed, points)
    background.add_task(summarize_pack, svc.tools, pack_id)
    return Sealed(
        pack_id=pack_id,
        order_id=order.order_id,
        counts=counts,
        verdict=sealed.verdict,
        object_key=object_key,
        upload_error="; ".join(errors) or None,
    )


@app.get("/packs/{pack_id}/video")
def pack_video(svc: Svc, pack_id: PackId) -> FileResponse:
    clip = find_clip(svc.packs_dir, pack_id)
    if clip is None:
        raise HTTPException(404, f"no clip for pack {pack_id}")
    return FileResponse(clip, media_type=f"video/{clip.suffix[1:]}")


@app.get("/packs/{pack_id}/track")
def pack_track(svc: Svc, pack_id: PackId) -> list[TrackPoint]:
    if svc.store.pack(pack_id) is None:
        raise HTTPException(404, f"no sealed pack {pack_id}")
    return svc.store.track(pack_id)


@app.get("/packs/{pack_id}/summary")
def pack_summary(svc: Svc, pack_id: PackId) -> Summary:
    text = svc.store.summary(pack_id)
    pack = svc.store.pack(pack_id)
    if text is None or pack is None:
        raise HTTPException(404, f"no summary yet for pack {pack_id}")
    spans = track_spans(svc.store.track(pack_id))
    return Summary(
        pack_id=pack_id,
        text=text,
        evidence=[
            Evidence(
                pack_id=pack_id,
                order_id=pack.order_id,
                start_s=first_ms / 1000,
                end_s=last_ms / 1000,
                text=f"{label} #{track_id}",
            )
            for (label, track_id), (first_ms, last_ms) in spans.items()
        ],
    )


@app.post("/ask")
async def answer_question(svc: Svc, body: Question) -> Answer:
    try:
        return await ask(
            svc.llm, svc.model, svc.tools, body.question, body.order_id
        )
    except APIError as error:
        raise HTTPException(502, f"W&B Inference: {error}") from error


@app.post("/transcribe")
async def transcribe(svc: Svc, audio: UploadFile) -> Transcript:
    try:
        text = await canary.transcribe(svc.canary, await audio.read())
    except httpx.HTTPError as error:
        raise HTTPException(502, f"Canary: {error}") from error
    return Transcript(text=text)


def main() -> None:
    uvicorn.run("proofbox_api:app", port=8000, reload=True)
