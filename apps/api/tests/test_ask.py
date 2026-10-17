import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx2
from openai import AsyncOpenAI

from proofbox_api.ask import MAX_TOOL_ROUNDS, Answer, Toolbox, ask
from proofbox_api.cosmos import Cosmos
from proofbox_api.packing import Item, Order, Pack
from proofbox_api.store import Store
from proofbox_api.vss import VSS

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


class FakeStore(Store):
    def __init__(self):
        pass

    def order(self, order_id: str) -> Order | None:
        return ORDER if order_id == ORDER.order_id else None

    def packs(self, order_id: str) -> list[Pack]:
        return [PACK] if order_id == PACK.order_id else []

    def pack(self, pack_id: str) -> Pack | None:
        return PACK if pack_id == PACK.pack_id else None

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
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(arguments)},
    }


def completion(message: dict) -> dict:
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 0,
        "model": "openai/gpt-oss-120b",
        "choices": [
            {
                "index": 0,
                "finish_reason": "tool_calls"
                if message.get("tool_calls")
                else "stop",
                "message": {"role": "assistant", **message},
            }
        ],
    }


def run_ask(
    replies: list[dict], tmp_path: Path, order_id: str | None = "PB-1001"
) -> tuple[Answer, list[dict], FakeCosmos, FakeVSS]:
    (tmp_path / f"{PACK.pack_id}.mp4").write_bytes(b"mp4")
    requests: list[dict] = []

    def wandb(request: httpx2.Request) -> httpx2.Response:
        requests.append(json.loads(request.content))
        return httpx2.Response(200, json=completion(replies[len(requests) - 1]))

    cosmos, vss = FakeCosmos(), FakeVSS()
    tools = Toolbox(FakeStore(), cosmos, vss, tmp_path)

    async def go() -> Answer:
        async with AsyncOpenAI(
            base_url="http://wandb/v1",
            api_key="test",
            http_client=httpx2.AsyncClient(
                transport=httpx2.MockTransport(wandb)
            ),
        ) as llm:
            return await ask(
                llm,
                "openai/gpt-oss-120b",
                tools,
                "Was anything missing?",
                order_id,
            )

    return asyncio.run(go()), requests, cosmos, vss


def test_dispatches_each_tool_and_collects_evidence(tmp_path: Path):
    answer, requests, cosmos, vss = run_ask(
        [
            {
                "content": None,
                "tool_calls": [
                    tool_call("c1", "get_order", {"order_id": "PB-1001"}),
                    tool_call(
                        "c2",
                        "watch_pack",
                        {"pack_id": PACK.pack_id, "question": "What went in?"},
                    ),
                    tool_call(
                        "c3",
                        "search_archive",
                        {"query": "scissors", "order_id": "PB-1001"},
                    ),
                ],
            },
            {"content": "The scissors are missing from pack 0a1b2c3d."},
        ],
        tmp_path,
    )

    assert answer.answer == "The scissors are missing from pack 0a1b2c3d."
    assert "PB-1001" in requests[0]["messages"][0]["content"]
    tool_messages = {
        message["tool_call_id"]: json.loads(message["content"])
        for message in requests[1]["messages"]
        if message["role"] == "tool"
    }
    assert tool_messages["c1"]["packs"][0]["verdict"] == "short"
    assert tool_messages["c2"]["cosmos"].startswith("A mug goes in")
    assert tool_messages["c3"]["answer"] == "One matching pack."
    assert "lists 1 x coffee mug, 1 x scissors" in cosmos.prompts[0]
    assert vss.searches == [("scissors", ["PB-1001"])]
    assert [(e.pack_id, e.start_s) for e in answer.evidence] == [
        ("0a1b2c3d", None),
        ("0a1b2c3d", None),
        ("0a1b2c3d", 1.5),
    ]


def test_tool_errors_go_back_to_the_model_instead_of_failing(tmp_path: Path):
    answer, requests, _, _ = run_ask(
        [
            {
                "content": None,
                "tool_calls": [
                    tool_call("c1", "get_order", {"order_id": "PB-9999"}),
                    tool_call("c2", "drop_table", {}),
                ],
            },
            {"content": "I could not find that order."},
        ],
        tmp_path,
        order_id=None,
    )

    errors = [
        json.loads(message["content"])["error"]
        for message in requests[1]["messages"]
        if message["role"] == "tool"
    ]
    assert errors == ["no order PB-9999", "no tool drop_table"]
    assert answer.evidence == []


def test_stops_offering_tools_after_the_round_cap(tmp_path: Path):
    looping = {
        "content": None,
        "tool_calls": [tool_call("c", "get_order", {"order_id": "PB-1001"})],
    }
    answer, requests, _, _ = run_ask(
        [looping] * MAX_TOOL_ROUNDS + [{"content": "Done."}], tmp_path
    )

    assert answer.answer == "Done."
    assert len(requests) == MAX_TOOL_ROUNDS + 1
    assert "tools" not in requests[-1]
