import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx2
from openai import AsyncOpenAI

from proofbox_api.cosmos import Cosmos
from proofbox_api.packing import Item, Order, Pack, TrackPoint
from proofbox_api.store import Store
from proofbox_api.vss import VSS

MODEL = "openai/gpt-oss-120b"

ORDER = Order(
    order_id="PB-1001",
    customer="Kestrel Labs",
    items=[Item(name="coffee mug", qty=1), Item(name="scissors", qty=1)],
)
PACK = Pack(
    pack_id="0a1b2c3d",
    order_id="PB-1001",
    started_at=datetime(2026, 10, 17, 12, 0, tzinfo=UTC),
    sealed_at=datetime(2026, 10, 17, 12, 1, tzinfo=UTC),
    object_key="team-15/20261017_120100_PB-1001_0a1b2c3d.mp4",
    counts={"coffee mug": 1},
    verdict="short",
)
TRACK = [
    TrackPoint(
        t_ms=t_ms, track=7, label="coffee mug", conf=0.9, box=(0, 0, 1, 1)
    )
    for t_ms in (2000, 3500)
]


class FakeStore(Store):
    def __init__(self):
        self.summaries: dict[str, str] = {}

    def insert_summary(self, pack_id: str, text: str) -> None:
        self.summaries[pack_id] = text

    def order(self, order_id: str) -> Order | None:
        return ORDER if order_id == ORDER.order_id else None

    def packs(self, order_id: str) -> list[Pack]:
        return [PACK] if order_id == PACK.order_id else []

    def pack(self, pack_id: str) -> Pack | None:
        return PACK if pack_id == PACK.pack_id else None

    def track(self, pack_id: str) -> list[TrackPoint]:
        return TRACK if pack_id == PACK.pack_id else []

    def packs_by_object_key(self) -> dict[str, Pack]:
        return {"team-15/20261017_120100_PB-1001_0a1b2c3d.mp4": PACK}


class FakeCosmos(Cosmos):
    def __init__(self):
        self.prompts: list[str] = []

    async def watch(self, clip: Path, prompt: str) -> str:
        self.prompts.append(prompt)
        return "A mug goes in at 2 s; no scissors are seen."


class FakeVSS(VSS):
    def __init__(self):
        self.searches: list[tuple[str, list[str]]] = []

    async def search_and_answer(
        self, query: str, tags: list[str]
    ) -> dict[str, Any]:
        self.searches.append((query, tags))
        return {
            "answer": "One matching pack.",
            "evidence": {
                "chunks": [
                    {
                        "original_video": "s3://team-15-vss-chunks/team-15/20261017_120100_PB-1001_0a1b2c3d.mp4",
                        "filename": "20261017_120100_PB-1001_0a1b2c3d.mp4",
                        "best_match_start_sec": 1.5,
                        "best_match_end_sec": 4.0,
                    }
                ]
            },
        }


def tool_call(call_id: str, name: str, arguments: dict) -> dict:
    return {"id": call_id, "name": name, "arguments": json.dumps(arguments)}


def chunk(delta: dict, finish_reason: str | None = None) -> str:
    payload = {
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "created": 0,
        "model": MODEL,
        "choices": [
            {"index": 0, "delta": delta, "finish_reason": finish_reason}
        ],
    }
    return f"data: {json.dumps(payload)}\n\n"


def streamed_reply(reply: dict) -> bytes:
    """Splits text and every tool call's arguments over two chunks, the way
    W&B Inference streams them, with the id and name only in the first."""
    events = [chunk({"role": "assistant", "content": ""})]
    content = reply.get("content") or ""
    half = len(content) // 2
    events += [
        chunk({"content": part})
        for part in (content[:half], content[half:])
        if part
    ]
    calls = reply.get("tool_calls", [])
    for index, call in enumerate(calls):
        cut = len(call["arguments"]) // 2
        events.append(
            chunk(
                {
                    "tool_calls": [
                        {
                            "index": index,
                            "id": call["id"],
                            "type": "function",
                            "function": {
                                "name": call["name"],
                                "arguments": call["arguments"][:cut],
                            },
                        }
                    ]
                }
            )
        )
        events.append(
            chunk(
                {
                    "tool_calls": [
                        {
                            "index": index,
                            "function": {"arguments": call["arguments"][cut:]},
                        }
                    ]
                }
            )
        )
    events.append(chunk({}, "tool_calls" if calls else "stop"))
    events.append("data: [DONE]\n\n")
    return "".join(events).encode()


def fake_llm(replies: list[dict]) -> tuple[AsyncOpenAI, list[dict]]:
    requests: list[dict] = []

    def wandb(request: httpx2.Request) -> httpx2.Response:
        requests.append(json.loads(request.content))
        return httpx2.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=streamed_reply(replies[len(requests) - 1]),
        )

    llm = AsyncOpenAI(
        base_url="http://wandb/v1",
        api_key="test",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(wandb)),
    )
    return llm, requests
