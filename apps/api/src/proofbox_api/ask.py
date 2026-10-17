import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import weave
from openai import AsyncOpenAI
from openai.types.chat import (
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageParam,
    ChatCompletionToolParam,
)
from pydantic import BaseModel

from proofbox_api.cosmos import Cosmos
from proofbox_api.packing import find_clip
from proofbox_api.store import Store
from proofbox_api.vss import VSS

MAX_TOOL_ROUNDS = 4

TOOLS: list[ChatCompletionToolParam] = [
    {
        "type": "function",
        "function": {
            "name": "get_order",
            "description": "The order's expected items and, for every sealed pack, the live detector's per-label item counts and verdict.",
            "parameters": {
                "type": "object",
                "properties": {"order_id": {"type": "string"}},
                "required": ["order_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "watch_pack",
            "description": "Have the Cosmos video model watch the recorded clip of one pack and answer a question about what it sees.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pack_id": {"type": "string"},
                    "question": {"type": "string"},
                },
                "required": ["pack_id", "question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_archive",
            "description": "Search the indexed video archive and get a grounded answer with matching clips. Pass order_id to restrict it to that order's packs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "order_id": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    },
]

SYSTEM_PROMPT = """You answer questions about orders packed at the ProofBox station.
Ground every claim in tool results: get_order for expected items and the detector counts and verdict of each sealed pack, watch_pack to have Cosmos look at a pack's clip, search_archive for the video archive.
Answer in two to four sentences and name the pack ids you relied on."""


class Evidence(BaseModel):
    pack_id: str | None
    order_id: str | None
    start_s: float | None
    end_s: float | None
    text: str


class Answer(BaseModel):
    answer: str
    evidence: list[Evidence]


@dataclass(frozen=True)
class Toolbox:
    store: Store
    cosmos: Cosmos
    vss: VSS
    packs_dir: Path


type ToolResult = tuple[dict[str, Any], list[Evidence]]


@weave.op
async def get_order(tools: Toolbox, order_id: str) -> ToolResult:
    order = await asyncio.to_thread(tools.store.order, order_id)
    if order is None:
        raise LookupError(f"no order {order_id}")
    packs = await asyncio.to_thread(tools.store.packs, order_id)
    evidence = [
        Evidence(
            pack_id=pack.pack_id,
            order_id=order_id,
            start_s=None,
            end_s=None,
            text=f"Detector verdict {pack.verdict}, counts {json.dumps(pack.counts)}",
        )
        for pack in packs
    ]
    return {
        **order.model_dump(),
        "packs": [
            pack.model_dump(mode="json", exclude={"object_key"})
            for pack in packs
        ],
    }, evidence


@weave.op
async def watch_pack(tools: Toolbox, pack_id: str, question: str) -> ToolResult:
    pack = await asyncio.to_thread(tools.store.pack, pack_id)
    clip = find_clip(tools.packs_dir, pack_id)
    if pack is None or clip is None:
        raise LookupError(f"no recorded clip for pack {pack_id}")
    order = await asyncio.to_thread(tools.store.order, pack.order_id)
    if order is None:
        raise LookupError(f"no order {pack.order_id}")
    expected = ", ".join(f"{item.qty} x {item.name}" for item in order.items)
    seen = await tools.cosmos.watch(
        clip,
        f"This clip was recorded at a packing station while order {order.order_id} was packed. "
        f"The order should contain: {expected}. {question} "
        "Answer only from what is visible and give the second at which each item goes into the box.",
    )
    return {"pack_id": pack_id, "cosmos": seen}, [
        Evidence(
            pack_id=pack_id,
            order_id=order.order_id,
            start_s=None,
            end_s=None,
            text=seen,
        )
    ]


@weave.op
async def search_archive(
    tools: Toolbox, query: str, order_id: str | None = None
) -> ToolResult:
    found = await tools.vss.search_and_answer(
        query, [order_id] if order_id else []
    )
    packs = await asyncio.to_thread(tools.store.packs_by_object_key)
    evidence = []
    for chunk in found["evidence"]["chunks"]:
        bucket_and_key = chunk["original_video"].removeprefix("s3://")
        pack = packs.get(bucket_and_key.partition("/")[2])
        evidence.append(
            Evidence(
                pack_id=pack.pack_id if pack else None,
                order_id=pack.order_id if pack else None,
                start_s=chunk["best_match_start_sec"],
                end_s=chunk["best_match_end_sec"],
                text=chunk["filename"],
            )
        )
    return {
        "answer": found["answer"],
        "matches": [item.model_dump() for item in evidence],
    }, evidence


TOOL_FUNCTIONS = {
    "get_order": get_order,
    "watch_pack": watch_pack,
    "search_archive": search_archive,
}


async def call_tool(
    tools: Toolbox, name: str, arguments: str
) -> tuple[str, list[Evidence]]:
    if name not in TOOL_FUNCTIONS:
        return json.dumps({"error": f"no tool {name}"}), []
    try:
        content, evidence = await TOOL_FUNCTIONS[name](
            tools, **json.loads(arguments)
        )
    except (LookupError, TypeError, ValueError, httpx.HTTPError) as error:
        return json.dumps({"error": str(error)}), []
    return json.dumps(content), evidence


@weave.op
async def ask(
    llm: AsyncOpenAI,
    model: str,
    tools: Toolbox,
    question: str,
    order_id: str | None,
) -> Answer:
    system = SYSTEM_PROMPT
    if order_id:
        system += f"\nThe operator is looking at order {order_id}; questions that name no order are about it."
    messages: list[ChatCompletionMessageParam] = [
        {"role": "system", "content": system},
        {"role": "user", "content": question},
    ]
    evidence: list[Evidence] = []
    for _ in range(MAX_TOOL_ROUNDS):
        completion = await llm.chat.completions.create(
            model=model, messages=messages, tools=TOOLS
        )
        message = completion.choices[0].message
        calls = [
            call
            for call in message.tool_calls or []
            if isinstance(call, ChatCompletionMessageFunctionToolCall)
        ]
        if not calls:
            return Answer(answer=message.content or "", evidence=evidence)
        messages.append(
            {
                "role": "assistant",
                "content": message.content,
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.function.name,
                            "arguments": call.function.arguments,
                        },
                    }
                    for call in calls
                ],
            }
        )
        for call in calls:
            content, found = await call_tool(
                tools, call.function.name, call.function.arguments
            )
            evidence += found
            messages.append(
                {"role": "tool", "tool_call_id": call.id, "content": content}
            )
    completion = await llm.chat.completions.create(
        model=model, messages=messages
    )
    return Answer(
        answer=completion.choices[0].message.content or "", evidence=evidence
    )
