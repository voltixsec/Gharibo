"""Harmony function-tool call extraction for GHARIBO-V1.

The model is trained to stop a function call with ``<|call|>``. This module
extracts only the machine-visible commentary tool call and never surfaces the
preceding analysis channel.
"""

import json
import re
from typing import Any, Dict, Optional


_TOOL_RECIPIENT = re.compile(r"\bto=functions\.([A-Za-z_][A-Za-z0-9_.-]*)\b")
_ASSISTANT_START = "<|start|>assistant"
_MESSAGE = "<|message|>"
_CALL = "<|call|>"
_COMMENTARY = "<|channel|>commentary"


class HarmonyToolCallError(ValueError):
    """Raised when a tool-call frame exists but its arguments are invalid."""


def extract_tool_call(text: str) -> Optional[Dict[str, Any]]:
    """Return the first complete Harmony function call, or ``None``.

    Both the official header shape and the Unsloth-compatible header shape are
    accepted. A malformed JSON argument payload fails closed.
    """
    source = text if isinstance(text, str) else ""
    call_end = source.find(_CALL)
    if call_end < 0:
        return None

    assistant_start = source.rfind(_ASSISTANT_START, 0, call_end)
    if assistant_start < 0:
        return None

    message_at = source.find(_MESSAGE, assistant_start, call_end)
    if message_at < 0:
        return None

    header = source[assistant_start:message_at]
    if _COMMENTARY not in header:
        return None

    recipient = _TOOL_RECIPIENT.search(header)
    if recipient is None:
        return None

    arguments_raw = source[message_at + len(_MESSAGE):call_end].strip()
    try:
        arguments = json.loads(arguments_raw)
    except json.JSONDecodeError as exc:
        raise HarmonyToolCallError("TOOL_ARGUMENTS_INVALID_JSON") from exc

    if not isinstance(arguments, dict):
        raise HarmonyToolCallError("TOOL_ARGUMENTS_MUST_BE_OBJECT")
    name = recipient.group(1)
    return {
        "name": name,
        "arguments": arguments,
        "arguments_json": json.dumps(arguments, separators=(",", ":"), ensure_ascii=False),
    }
