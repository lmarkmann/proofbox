import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import httpx
import pytest
from fakes import PACK, FakeCosmos, FakeStore, FakeVSS, fake_llm
from fastapi.testclient import TestClient

from proofbox_api import Services, app, services
from proofbox_api.ask import (
    Event,
    Evidence,
    Finished,
    Found,
    StepFinished,
    StepStarted,
    TextDelta,
    TextEnded,
    TextStarted,
    Toolbox,
    ToolCalled,
    ToolFailed,
    ToolReturned,
)
from proofbox_api.stream import FAILED, ui_message_stream

EVIDENCE = Evidence(
    pack_id=PACK.pack_id,
    order_id="PB-1001",
    start_s=2.0,
    end_s=3.5,
    label="coffee mug",
    text="coffee mug #7",
)


def encode(events: list[Event], fail: bool = False) -> list[str]:
    async def scripted() -> AsyncIterator[Event]:
        for event in events:
            yield event
        if fail:
            raise RuntimeError("upstream said http://10.0.0.1 secret")

    async def go() -> list[str]:
        return [line async for line in ui_message_stream(scripted())]

    return asyncio.run(go())


def parts(lines: list[str]) -> list[dict]:
    assert all(
        line.startswith("data: ") and line.endswith("\n\n") for line in lines
    )
    assert lines[-1] == "data: [DONE]\n\n"
    return [json.loads(line.removeprefix("data: ")) for line in lines[:-1]]


def test_encodes_events_as_ui_message_stream_parts():
    lines = encode(
        [
            StepStarted(),
            ToolCalled("c1", "getOrder", {"order_id": "PB-1001"}),
            ToolReturned("c1", {"order_id": "PB-1001"}),
            ToolCalled("c2", "watchPack", {"pack_id": "ffffffff"}),
            ToolFailed("c2", "no recorded clip for pack ffffffff"),
            Found("c1-0", EVIDENCE),
            StepFinished(),
            StepStarted(),
            TextStarted("text-1"),
            TextDelta("text-1", "Short: "),
            TextDelta("text-1", "no scissors."),
            TextEnded("text-1"),
            StepFinished(),
            Finished("https://wandb.ai/team/project/r/call/abc"),
        ]
    )

    decoded = parts(lines)
    assert decoded[0]["type"] == "start"
    assert decoded[0]["messageId"].startswith("msg-")
    assert decoded[1:] == [
        {"type": "start-step"},
        {
            "type": "tool-input-available",
            "toolCallId": "c1",
            "toolName": "getOrder",
            "input": {"order_id": "PB-1001"},
        },
        {
            "type": "tool-output-available",
            "toolCallId": "c1",
            "output": {"order_id": "PB-1001"},
        },
        {
            "type": "tool-input-available",
            "toolCallId": "c2",
            "toolName": "watchPack",
            "input": {"pack_id": "ffffffff"},
        },
        {
            "type": "tool-output-error",
            "toolCallId": "c2",
            "errorText": "no recorded clip for pack ffffffff",
        },
        {
            "type": "data-evidence",
            "id": "c1-0",
            "data": {
                "pack_id": PACK.pack_id,
                "order_id": "PB-1001",
                "start_s": 2.0,
                "end_s": 3.5,
                "label": "coffee mug",
                "text": "coffee mug #7",
            },
        },
        {"type": "finish-step"},
        {"type": "start-step"},
        {"type": "text-start", "id": "text-1"},
        {"type": "text-delta", "id": "text-1", "delta": "Short: "},
        {"type": "text-delta", "id": "text-1", "delta": "no scissors."},
        {"type": "text-end", "id": "text-1"},
        {"type": "finish-step"},
        {
            "type": "finish",
            "messageMetadata": {
                "traceUrl": "https://wandb.ai/team/project/r/call/abc"
            },
        },
    ]


def test_finish_omits_metadata_without_a_trace():
    assert parts(encode([Finished(None)]))[-1] == {"type": "finish"}


def test_a_failure_ends_with_a_generic_error_and_done():
    decoded = parts(encode([StepStarted()], fail=True))

    assert decoded[-1] == {"type": "error", "errorText": FAILED}
    assert "10.0.0.1" not in json.dumps(decoded)


@pytest.fixture
def client(tmp_path: Path) -> Iterator[tuple[TestClient, FakeStore]]:
    (tmp_path / f"{PACK.pack_id}.mp4").write_bytes(b"mp4")
    store = FakeStore()
    llm, _ = fake_llm(
        [
            {
                "content": None,
                "tool_calls": [
                    {
                        "id": "c1",
                        "name": "getOrder",
                        "arguments": json.dumps({"order_id": "PB-1001"}),
                    }
                ],
            },
            {"content": "Nothing is missing."},
        ]
    )
    vss = FakeVSS()
    app.dependency_overrides[services] = lambda: Services(
        store=store,
        vss=vss,
        canary=httpx.AsyncClient(),
        llm=llm,
        model="openai/gpt-oss-120b",
        tools=Toolbox(store, FakeCosmos(), vss, tmp_path),
        packs_dir=tmp_path,
    )
    yield TestClient(app), store
    app.dependency_overrides.clear()


def test_chat_streams_the_protocol_with_its_header(
    client: tuple[TestClient, FakeStore],
):
    test_client, _ = client
    response = test_client.post(
        "/chat",
        json={
            "id": "chat-1",
            "trigger": "submit-message",
            "order_id": "PB-1001",
            "messages": [
                {
                    "id": "m1",
                    "role": "user",
                    "parts": [
                        {"type": "text", "text": "Was anything missing?"}
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text.endswith("data: [DONE]\n\n")
    types = [
        json.loads(line.removeprefix("data: "))["type"]
        for line in response.text.split("\n\n")
        if line.startswith("data: {")
    ]
    assert types[0] == "start"
    assert "tool-output-available" in types
    assert "data-evidence" in types
    assert "text-delta" in types
    assert types[-1] == "finish"
