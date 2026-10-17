import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from proofbox_api.ask import (
    Event,
    Finished,
    Found,
    StepFinished,
    StepStarted,
    TextDelta,
    TextEnded,
    TextStarted,
    ToolCalled,
    ToolFailed,
    ToolReturned,
)

HEADERS = {
    "x-vercel-ai-ui-message-stream": "v1",
    "cache-control": "no-cache",
    "x-accel-buffering": "no",
}

FAILED = "Something went wrong while answering. Try again."

logger = logging.getLogger(__name__)


def ui_part(event: Event) -> dict[str, Any]:
    match event:
        case StepStarted():
            return {"type": "start-step"}
        case StepFinished():
            return {"type": "finish-step"}
        case TextStarted(id=text_id):
            return {"type": "text-start", "id": text_id}
        case TextDelta(id=text_id, delta=delta):
            return {"type": "text-delta", "id": text_id, "delta": delta}
        case TextEnded(id=text_id):
            return {"type": "text-end", "id": text_id}
        case ToolCalled(call_id=call_id, name=name, arguments=arguments):
            return {
                "type": "tool-input-available",
                "toolCallId": call_id,
                "toolName": name,
                "input": arguments,
            }
        case ToolReturned(call_id=call_id, output=output):
            return {
                "type": "tool-output-available",
                "toolCallId": call_id,
                "output": output,
            }
        case ToolFailed(call_id=call_id, error=error):
            return {
                "type": "tool-output-error",
                "toolCallId": call_id,
                "errorText": error,
            }
        case Found(id=part_id, evidence=evidence):
            return {
                "type": "data-evidence",
                "id": part_id,
                "data": evidence.model_dump(),
            }
        case Finished(trace_url=None):
            return {"type": "finish"}
        case Finished(trace_url=trace_url):
            return {
                "type": "finish",
                "messageMetadata": {"traceUrl": trace_url},
            }


def sse(part: dict[str, Any]) -> str:
    return f"data: {json.dumps(part, separators=(',', ':'))}\n\n"


async def ui_message_stream(events: AsyncIterator[Event]) -> AsyncIterator[str]:
    yield sse({"type": "start", "messageId": f"msg-{uuid4().hex}"})
    try:
        async for event in events:
            yield sse(ui_part(event))
    except Exception:
        logger.exception("chat answer failed")
        yield sse({"type": "error", "errorText": FAILED})
    yield "data: [DONE]\n\n"
