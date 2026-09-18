"""
Canonical Harmony final-channel extraction — Python port.

This is a faithful port of ``apps/web/lib/runtime/harmony-final.mjs`` (the single
deterministic authority used by the Next.js application and the Node evaluation
harness). The GHARIBO-V1 serving service reuses the SAME contract so the answer a
client receives is byte-for-byte the same channel the application already
accepts.

Contract (identical to the TS module):
  1. DETERMINISTIC  - pure function of the input string.
  2. FINAL-ONLY     - only the LAST ``final`` channel content is returned.
  3. FAIL-CLOSED    - no ``final`` segment => {ok: False, final: None}. No
                     raw-text fallback, no semantic repair.
  4. UNAMBIGUOUS TERMINATOR - ``<|return|>`` (final) vs ``<|end|>`` (non-final).

``test_harmony_final.py`` pins the behaviour to the same fixtures as the TS suite.
"""

import re
from typing import Dict, List, Optional

HARMONY_SPECIALS = (
    "<|start|>",
    "<|end|>",
    "<|message|>",
    "<|channel|>",
    "<|return|>",
    "<|call|>",
    "<|constrain|>",
)

# Tokens that terminate a channel segment's content (in priority order by scan).
SEGMENT_TERMINATORS = (
    "<|return|>",
    "<|end|>",
    "<|call|>",
    "<|start|>",
    "<|constrain|>",
)

HIDDEN_CHANNELS = ("analysis", "commentary")
FINAL_CHANNEL = "final"

CHANNEL_HEADER = re.compile(r"<\|channel\|>([A-Za-z_][A-Za-z0-9_]*)\s*<\|message\|>")

EXTRACTION_REASONS = (
    "OK",
    "EMPTY_INPUT",
    "NO_CHANNEL_HEADER",
    "NO_FINAL_CHANNEL",
    "EMPTY_FINAL_CHANNEL",
)

# Reasons produced only by the higher-level V1 answer wrapper.
V1_REASONS = (
    "NO_CHOICES",
    "NO_CONTENT",
)

# The full set of reasons surfaced by extract_v1_answer.
ANSWER_REASONS = EXTRACTION_REASONS + V1_REASONS


def _find_segment_end(text: str, frm: int):
    """Index of the earliest segment terminator at/after ``frm`` (or len)."""
    best = -1
    terminator = None
    for token in SEGMENT_TERMINATORS:
        at = text.find(token, frm)
        if at != -1 and (best == -1 or at < best):
            best = at
            terminator = token
    if best == -1:
        return len(text), None
    return best, terminator


def parse_channel_segments(text) -> List[Dict[str, Optional[str]]]:
    """Split a raw continuation into ordered channel segments.

    Mirrors the TS implementation exactly: after each segment the scan resumes
    at the content END (not at the header end), so a structural token inside a
    channel's content cannot be mistaken for a new header.
    """
    source = text if isinstance(text, str) else ""
    segments: List[Dict[str, Optional[str]]] = []
    i = 0
    while True:
        m = CHANNEL_HEADER.search(source, i)
        if not m:
            break
        channel = m.group(1)
        content_start = m.end()
        end, terminator = _find_segment_end(source, content_start)
        segments.append(
            {
                "channel": channel,
                "content": source[content_start:end],
                "terminator": terminator,
            }
        )
        i = end  # resume after this segment's content (matches JS lastIndex = end)
    return segments


def extract_final_channel(text) -> Dict:
    """Extract the canonical application answer from a raw continuation."""
    source = text if isinstance(text, str) else ""

    base = {
        "ok": False,
        "final": None,
        "reason": "EMPTY_INPUT",
        "terminator": None,
        "channelsFound": [],
        "analysisPresent": False,
        "segmentCount": 0,
    }

    if source == "":
        return base

    segments = parse_channel_segments(source)
    channels_found: List[str] = []
    for seg in segments:
        if seg["channel"] not in channels_found:
            channels_found.append(seg["channel"])

    analysis_present = any(seg["channel"] in HIDDEN_CHANNELS for seg in segments)

    if not segments:
        return {
            **base,
            "reason": "NO_CHANNEL_HEADER",
            "channelsFound": channels_found,
            "analysisPresent": analysis_present,
            "segmentCount": 0,
        }

    chosen = None
    for seg in segments:
        if seg["channel"] == FINAL_CHANNEL:
            chosen = seg  # LAST final segment wins

    if chosen is None:
        return {
            **base,
            "reason": "NO_FINAL_CHANNEL",
            "channelsFound": channels_found,
            "analysisPresent": analysis_present,
            "segmentCount": len(segments),
        }

    if chosen["content"] == "":
        return {
            **base,
            "reason": "EMPTY_FINAL_CHANNEL",
            "terminator": chosen["terminator"],
            "channelsFound": channels_found,
            "analysisPresent": analysis_present,
            "segmentCount": len(segments),
        }

    return {
        "ok": True,
        "final": chosen["content"],
        "reason": "OK",
        "terminator": chosen["terminator"],
        "channelsFound": channels_found,
        "analysisPresent": analysis_present,
        "segmentCount": len(segments),
    }


def final_channel_or_null(text):
    result = extract_final_channel(text)
    return result["final"] if result["ok"] else None


def contains_hidden_channel(text) -> bool:
    return any(
        seg["channel"] in HIDDEN_CHANNELS for seg in parse_channel_segments(text)
    )


def extract_v1_answer(response_body) -> Dict:
    """The GHARIBO-V1 answer wrapper (mirrors apps/web/lib/runtime/gharibo-v1.mjs).

    Turns a raw OpenAI-style response body into the one answer the application
    may show:

      - no choices              -> NO_CHOICES  (fail closed)
      - empty content           -> NO_CONTENT  (fail closed)
      - final channel present   -> the final content
      - no final, no hidden     -> pass the plain text through (already isolated)
      - hidden channel present   -> NO_FINAL_CHANNEL (fail closed; never surface)

    This is the exact function the Next.js route uses, ported to Python so the
    serving answer equals the answer the application already accepts.
    """
    base_fail = {
        "ok": False,
        "answer": None,
        "reason": "NO_CHOICES",
        "analysisPresent": False,
    }

    choices = response_body.get("choices") if isinstance(response_body, dict) else None
    if not isinstance(choices, list) or len(choices) == 0:
        return base_fail

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or content == "":
        return {
            "ok": False,
            "answer": None,
            "reason": "NO_CONTENT",
            "analysisPresent": False,
        }

    extracted = extract_final_channel(content)

    if extracted["ok"]:
        return {
            "ok": True,
            "answer": extracted["final"],
            "reason": "OK",
            "analysisPresent": extracted["analysisPresent"],
        }

    # A model that returned no Harmony channel but also no hidden channel has
    # produced an already-isolated plain answer: pass it through verbatim.
    if not contains_hidden_channel(content):
        return {
            "ok": True,
            "answer": content,
            "reason": "OK",
            "analysisPresent": False,
        }

    # Hidden channel (analysis) with no final: fail closed, never surface it.
    return {
        "ok": False,
        "answer": None,
        "reason": "NO_FINAL_CHANNEL",
        "analysisPresent": extracted["analysisPresent"],
    }
