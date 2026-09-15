#!/usr/bin/env python3
"""build-eval-items.py - governed TEST item builder (read-only, leak-controlled).

Turns the 80 held-out TEST records into benchmark items, per
`docs/RESEARCH_BENCHMARK.md` 3.2. It is a PURE PROJECTION: it never writes back to the
dataset, the Data Factory or the repository layer.

WHAT LEAVES THIS SCRIPT
-----------------------
Two files, both written OUTSIDE git (under `.workbuddy-ai/`):

  prompts.jsonl  - the model-visible input only (system + user message). Safe to hand to
                   an inference worker; contains no gold answer.
  gold.jsonl     - the frozen gold annotation, keyed by item_id. Used ONLY by the local
                   scorer. NEVER handed to the model, NEVER uploaded, NEVER committed.

The split is deliberate: the inference environment sees prompts; the scoring environment
sees gold. That is the mechanical guarantee that the model cannot see the answer, and that
a scoring run cannot leak gold back into a prompt.

`item_id = sha256(recordLineHash)` - a content address, stable across machines (3.2).

Usage:
    python scripts/eval/build-eval-items.py --check   # verify hashes, write nothing
    python scripts/eval/build-eval-items.py           # write prompts + gold
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SPLIT_DIR = REPO_ROOT / "data/processed/gharibo-research-gold-v0.1"
OUT_DIR = REPO_ROOT / ".workbuddy-ai/eval-items"

PINNED_TEST_SPLIT_HASH = "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b"
PINNED_TEST_RECORD_COUNT = 80


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_lines(path: Path) -> list[str]:
    out = []
    for raw in path.read_bytes().decode("utf-8").split("\n"):
        line = raw[:-1] if raw.endswith("\r") else raw
        if line.strip() == "":
            continue
        out.append(line)
    return out


def split_hash(line_hashes: list[str]) -> str:
    return sha256_hex("\n".join(sorted(line_hashes)))


def build_item(line: str) -> dict:
    record = json.loads(line)
    messages = record.get("messages", [])
    system = next((m["content"] for m in messages if m.get("role") == "system"), "")
    user = next((m["content"] for m in messages if m.get("role") == "user"), "")
    assistant = next((m["content"] for m in messages if m.get("role") == "assistant"), "")

    line_hash = sha256_hex(line)
    item_id = sha256_hex(line_hash)

    # The source record carries the evidence available to the model.
    #
    # EVIDENCE MODEL (deliberate, and the reason M4/M5/M6 are meaningful):
    # `docs/RESEARCH_BENCHMARK.md` 3.2.2 says `sources[].text` is "the only admissible
    # evidence" and that a citation to a URL not in `sources[]` is invalid. The Gold corpus
    # carries evidence as `sourceRecord.evidence[]`, and every entry there is keyed by
    # `sourceUrl` — the same key the model is expected to cite back. So `sources[]` is built
    # from the record's OWN evidence list, with `source_id = sourceUrl` and `text` = the
    # evidence claim, which is the only text the record actually provides for that URL.
    # Using `externalKey` here instead would make every legitimate gold citation invalid.
    sources: list[dict] = []
    instructions: list[dict] = []
    try:
        user_obj = json.loads(user)
        src = user_obj.get("sourceRecord", {})
        for ev in src.get("evidence", []) or []:
            url = ev.get("sourceUrl")
            if not url:
                continue
            sources.append(
                {
                    "source_id": url,
                    "url": url,
                    "text": ev.get("claim") or "",
                    "source_type": ev.get("sourceType"),
                    "confidence": ev.get("confidence"),
                }
            )
        instructions = user_obj.get("constraints", [])
    except json.JSONDecodeError:
        pass

    gold = {
        "item_id": item_id,
        "recordLineHash": line_hash,
        "entire_raw_assistant_is_gold": True,
        "entity_type": None,
        "taxonomy_path": [],
        "entities": [],
        "relations": [],
        "duplicate_pairs": [],
        "instructions": instructions,
    }
    try:
        g = json.loads(assistant)
        gold["entity_type"] = g.get("entityType")
        classification = g.get("classification")
        gold["taxonomy_path"] = classification if isinstance(classification, list) else [g.get("entityType", "")]
        gold["entities"] = [
            {"type": g.get("entityType"), "name": g.get("normalizedPayload", {}).get("name")}
        ]
    except json.JSONDecodeError:
        pass

    return {
        "item_id": item_id,
        "recordLineHash": line_hash,
        "prompt": {"system": system, "user": user},
        "gold_raw": assistant,
        "gold": gold,
        "sources": sources,
        "instructions": instructions,
    }


def main() -> int:
    check_only = "--check" in sys.argv

    lines = read_lines(SPLIT_DIR / "test.jsonl")
    hashes = [sha256_hex(line) for line in lines]
    recomputed = split_hash(hashes)

    print("=" * 72)
    print("GHARIBO - governed TEST item builder")
    print("=" * 72)
    print(f"  records read        : {len(lines)}")
    print(f"  test split hash     : {recomputed}")
    print(f"  pinned split hash   : {PINNED_TEST_SPLIT_HASH}")

    if recomputed != PINNED_TEST_SPLIT_HASH:
        print("  ABORT: recomputed TEST split hash does not match the pinned manifest value")
        return 1
    if len(lines) != PINNED_TEST_RECORD_COUNT:
        print(f"  ABORT: record count {len(lines)} != pinned {PINNED_TEST_RECORD_COUNT}")
        return 1
    print("  hash + count        : MATCH (run is VALID to build items)")

    if check_only:
        print("  --check: wrote nothing")
        return 0

    items = [build_item(line) for line in lines]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    prompts_path = OUT_DIR / "prompts.jsonl"
    gold_path = OUT_DIR / "gold.jsonl"
    manifest_path = OUT_DIR / "items-manifest.json"

    with prompts_path.open("w", encoding="utf-8", newline="\n") as fh:
        for it in items:
            fh.write(json.dumps({"item_id": it["item_id"], "prompt": it["prompt"]}, ensure_ascii=False) + "\n")
    with gold_path.open("w", encoding="utf-8", newline="\n") as fh:
        for it in items:
            fh.write(
                json.dumps(
                    {
                        "item_id": it["item_id"],
                        "gold": it["gold"],
                        "gold_raw": it["gold_raw"],
                        "sources": it["sources"],
                        "instructions": it["instructions"],
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    manifest = {
        "record_count": len(items),
        "item_count": len(items),
        "test_split_hash": recomputed,
        "prompts_sha256": sha256_hex(prompts_path.read_text(encoding="utf-8")),
        "gold_sha256": sha256_hex(gold_path.read_text(encoding="utf-8")),
        "note": "prompts.jsonl is model-visible; gold.jsonl is scorer-only and must never reach the model",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    print(f"  wrote {prompts_path.relative_to(REPO_ROOT)}  ({len(items)} items)")
    print(f"  wrote {gold_path.relative_to(REPO_ROOT)}")
    print(f"  wrote {manifest_path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
