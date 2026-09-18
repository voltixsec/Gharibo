"""
Parity tests for the Python Harmony final-channel port.

These pin the Python implementation (app/harmony_final.py) to the SAME fixtures
and expectations as apps/web/lib/runtime/harmony-final.mjs, so the answer the
serving service extracts is identical to what the Next.js application accepts.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.harmony_final import (  # noqa: E402
    extract_final_channel,
    extract_v1_answer,
    parse_channel_segments,
    contains_hidden_channel,
    final_channel_or_null,
)

ANALYSIS = "Compare the payload against the taxonomy before answering."
ANSWER = '{"entityType":"SYSTEM","externalKey":"system:security:sip-voip-intercom"}'
RAW_HARMONY = (
    "<|start|>assistant<|channel|>analysis<|message|>"
    + ANALYSIS
    + "<|end|>"
    + "<|start|>assistant<|channel|>final<|message|>"
    + ANSWER
    + "<|return|>"
)
ANALYSIS_ONLY = "<|start|>assistant<|channel|>analysis<|message|>" + ANALYSIS + "<|end|>"


def test_returns_final_channel_from_raw_harmony():
    r = extract_v1_answer({"choices": [{"message": {"content": RAW_HARMONY}}]})
    assert r["ok"] is True
    assert r["answer"] == ANSWER
    assert r["analysisPresent"] is True


def test_never_returns_analysis_content():
    r = extract_v1_answer({"choices": [{"message": {"content": RAW_HARMONY}}]})
    assert r["answer"] != ANALYSIS
    assert ANALYSIS not in r["answer"]
    assert ANALYSIS not in str(r)


def test_passes_through_already_isolated_answer():
    r = extract_v1_answer({"choices": [{"message": {"content": ANSWER}}]})
    assert r["ok"] is True
    assert r["answer"] == ANSWER
    assert r["analysisPresent"] is False


def test_fails_closed_when_only_analysis_present():
    r = extract_v1_answer({"choices": [{"message": {"content": ANALYSIS_ONLY}}]})
    assert r["ok"] is False
    assert r["answer"] is None
    assert r["analysisPresent"] is True


def test_fails_closed_no_choices():
    assert extract_v1_answer({})["ok"] is False
    assert extract_v1_answer({"choices": []})["reason"] == "NO_CHOICES"


def test_fails_closed_empty_content():
    assert (
        extract_v1_answer({"choices": [{"message": {"content": ""}}]})["reason"]
        == "NO_CONTENT"
    )


def test_tolerates_malformed_input():
    assert extract_v1_answer(None)["ok"] is False
    assert extract_v1_answer("not json")["ok"] is False


def test_contains_hidden_channel_defence():
    assert contains_hidden_channel(RAW_HARMONY) is True
    assert contains_hidden_channel(ANSWER) is False


def test_final_channel_or_null_helper():
    assert final_channel_or_null(RAW_HARMONY) == ANSWER
    assert final_channel_or_null(ANALYSIS_ONLY) is None


# Channel-level checks (the deterministic extractor beneath the wrapper).
def test_channel_segmenter_resumes_after_content():
    segs = parse_channel_segments(RAW_HARMONY)
    channels = [s["channel"] for s in segs]
    assert "final" in channels
    assert "analysis" in channels
    # The LAST final segment wins; the chosen final is the ANSWER.
    r = extract_final_channel(RAW_HARMONY)
    assert r["ok"] is True
    assert r["final"] == ANSWER
