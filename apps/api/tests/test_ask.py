import asyncio
import json
from pathlib import Path

from fakes import (
    MODEL,
    PACK,
    FakeCosmos,
    FakeStore,
    FakeVSS,
    fake_llm,
    tool_call,
)

from proofbox_api.ask import (
    MAX_TOOL_ROUNDS,
    Answer,
    Event,
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
    ask,
    converse,
    summarize_pack,
)

FULL_ROUND = [
    {
        "content": None,
        "tool_calls": [
            tool_call("c1", "getOrder", {"order_id": "PB-1001"}),
            tool_call(
                "c2",
                "watchPack",
                {"pack_id": PACK.pack_id, "question": "What went in?"},
            ),
            tool_call(
                "c3",
                "searchArchive",
                {"query": "scissors", "order_id": "PB-1001"},
            ),
        ],
    },
    {"content": "The scissors are missing from pack 0a1b2c3d."},
]


def toolbox(tmp_path: Path) -> Toolbox:
    (tmp_path / f"{PACK.pack_id}.mp4").write_bytes(b"mp4")
    return Toolbox(FakeStore(), FakeCosmos(), FakeVSS(), tmp_path)


def run_ask(
    replies: list[dict], tools: Toolbox, order_id: str | None = "PB-1001"
) -> tuple[Answer, list[dict]]:
    llm, requests = fake_llm(replies)

    async def go() -> Answer:
        async with llm:
            return await ask(
                llm, MODEL, tools, "Was anything missing?", order_id
            )

    return asyncio.run(go()), requests


def run_converse(replies: list[dict], tools: Toolbox) -> list[Event]:
    llm, _ = fake_llm(replies)

    async def go() -> list[Event]:
        async with llm:
            return [
                event
                async for event in converse(
                    llm,
                    MODEL,
                    tools,
                    [{"role": "user", "content": "Was anything missing?"}],
                    "PB-1001",
                )
            ]

    return asyncio.run(go())


def test_dispatches_each_tool_and_collects_evidence(tmp_path: Path):
    tools = toolbox(tmp_path)
    answer, requests = run_ask(FULL_ROUND, tools)

    assert answer.answer == "The scissors are missing from pack 0a1b2c3d."
    assert "PB-1001" in requests[0]["messages"][0]["content"]
    assert requests[0]["stream"] is True
    tool_messages = {
        message["tool_call_id"]: json.loads(message["content"])
        for message in requests[1]["messages"]
        if message["role"] == "tool"
    }
    assert tool_messages["c1"]["packs"][0] == {
        "pack_id": PACK.pack_id,
        "sealed_at": "2026-10-17T12:01:00Z",
        "verdict": "short",
        "counts": {"coffee mug": 1},
    }
    assert tool_messages["c2"]["seen"].startswith("A mug goes in")
    assert tool_messages["c3"]["hits"][0]["start_s"] == 1.5
    assert isinstance(tools.cosmos, FakeCosmos)
    assert "lists 1 x coffee mug, 1 x scissors" in tools.cosmos.prompts[0]
    assert isinstance(tools.vss, FakeVSS)
    assert tools.vss.searches == [("scissors", ["PB-1001"])]
    assert [(e.label, e.start_s, e.end_s) for e in answer.evidence] == [
        ("detector", None, None),
        ("Cosmos", None, None),
        ("coffee mug", 2.0, 3.5),
        ("archive", 1.5, 4.0),
    ]


def test_streams_steps_tools_evidence_and_text_in_protocol_order(
    tmp_path: Path,
):
    events = run_converse(FULL_ROUND, toolbox(tmp_path))

    kinds = [type(event).__name__ for event in events]
    assert kinds == [
        "StepStarted",
        "ToolCalled",
        "ToolReturned",
        "Found",
        "ToolCalled",
        "ToolReturned",
        "Found",
        "Found",
        "ToolCalled",
        "ToolReturned",
        "Found",
        "StepFinished",
        "StepStarted",
        "TextStarted",
        "TextDelta",
        "TextDelta",
        "TextEnded",
        "StepFinished",
        "Finished",
    ]
    called = [event for event in events if isinstance(event, ToolCalled)]
    assert called[1] == ToolCalled(
        "c2",
        "watchPack",
        {"pack_id": PACK.pack_id, "question": "What went in?"},
    )
    found_ids = [event.id for event in events if isinstance(event, Found)]
    assert len(set(found_ids)) == len(found_ids)
    text = "".join(e.delta for e in events if isinstance(e, TextDelta))
    assert text == "The scissors are missing from pack 0a1b2c3d."
    assert {e.id for e in events if isinstance(e, TextStarted | TextEnded)} == {
        e.id for e in events if isinstance(e, TextDelta)
    }
    assert events[-1] == Finished(None)
    assert isinstance(events[0], StepStarted)
    assert isinstance(events[-2], StepFinished)


def test_tool_errors_go_back_to_the_model_instead_of_failing(tmp_path: Path):
    tools = toolbox(tmp_path)
    replies = [
        {
            "content": None,
            "tool_calls": [
                tool_call("c1", "getOrder", {"order_id": "PB-9999"}),
                tool_call("c2", "dropTable", {}),
            ],
        },
        {"content": "I could not find that order."},
    ]
    answer, requests = run_ask(replies, tools, order_id=None)
    events = run_converse(replies, tools)

    errors = [
        json.loads(message["content"])["error"]
        for message in requests[1]["messages"]
        if message["role"] == "tool"
    ]
    assert errors == ["no order PB-9999", "no tool dropTable"]
    assert [e for e in events if isinstance(e, ToolFailed)] == [
        ToolFailed("c1", "no order PB-9999"),
        ToolFailed("c2", "no tool dropTable"),
    ]
    assert not any(isinstance(e, ToolReturned) for e in events)
    assert answer.evidence == []


def test_stops_offering_tools_after_the_round_cap(tmp_path: Path):
    looping = {
        "content": None,
        "tool_calls": [tool_call("c", "getOrder", {"order_id": "PB-1001"})],
    }
    answer, requests = run_ask(
        [looping] * MAX_TOOL_ROUNDS + [{"content": "Done."}], toolbox(tmp_path)
    )

    assert answer.answer == "Done."
    assert len(requests) == MAX_TOOL_ROUNDS + 1
    assert "tools" not in requests[-1]


def test_answer_keeps_only_the_last_step_text(tmp_path: Path):
    answer, _ = run_ask(
        [
            {
                "content": "Let me look.",
                "tool_calls": [
                    tool_call("c1", "getOrder", {"order_id": "PB-1001"})
                ],
            },
            {"content": "Complete."},
        ],
        toolbox(tmp_path),
    )

    assert answer.answer == "Complete."


def test_summary_stores_what_cosmos_saw_and_skips_unknown_packs(tmp_path: Path):
    tools = toolbox(tmp_path)

    asyncio.run(summarize_pack(tools, PACK.pack_id))
    asyncio.run(summarize_pack(tools, "ffffffff"))

    assert isinstance(tools.store, FakeStore)
    assert tools.store.summaries == {
        PACK.pack_id: "A mug goes in at 2 s; no scissors are seen."
    }
    assert isinstance(tools.cosmos, FakeCosmos)
    assert "Describe exactly what was packed" in tools.cosmos.prompts[0]
