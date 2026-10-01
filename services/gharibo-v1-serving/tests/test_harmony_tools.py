import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.harmony_tools import HarmonyToolCallError, extract_tool_call  # noqa: E402


def test_extracts_official_harmony_function_call_without_analysis():
    raw = (
        "<|channel|>analysis<|message|>private reasoning<|end|>"
        "<|start|>assistant<|channel|>commentary to=functions.calculator "
        "<|constrain|>json<|message|>"
        '{"operations":[{"op":"divide","a":6200,"b":24}]}'
        "<|call|>"
    )
    call = extract_tool_call(raw)
    assert call == {
        "name": "calculator",
        "arguments": {"operations": [{"op": "divide", "a": 6200, "b": 24}]},
        "arguments_json": '{"operations":[{"op":"divide","a":6200,"b":24}]}',
    }
    assert "private reasoning" not in str(call)


def test_extracts_unsloth_header_shape():
    raw = (
        "<|start|>assistant to=functions.web_search"
        "<|channel|>commentary json<|message|>"
        '{"query":"8MP CCTV camera"}<|call|>'
    )
    call = extract_tool_call(raw)
    assert call is not None
    assert call["name"] == "web_search"
    assert call["arguments"] == {"query": "8MP CCTV camera"}


def test_plain_final_answer_is_not_a_tool_call():
    raw = "<|start|>assistant<|channel|>final<|message|>Hello<|return|>"
    assert extract_tool_call(raw) is None


def test_malformed_tool_arguments_fail_closed():
    raw = (
        "<|start|>assistant<|channel|>commentary to=functions.calculator "
        "<|constrain|>json<|message|>{bad json}<|call|>"
    )
    with pytest.raises(HarmonyToolCallError, match="TOOL_ARGUMENTS_INVALID_JSON"):
        extract_tool_call(raw)
