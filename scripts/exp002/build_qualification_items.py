#!/usr/bin/env python3
"""
Opens the SEALED EXP-002 qualification split and builds the qualification items.

This is the governed seal-opening event. It happens exactly once, under DEC-0056,
and it is recorded truthfully.

Outputs:
  prompts.jsonl        model-visible: item_id + prompt ONLY (no gold)
  gold.jsonl           scorer-only: NEVER sent to any model or any remote host
  items-manifest.json  hashes + the seal-opening record

The consumed EXP-001 TEST split is never read.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SPLIT = REPO_ROOT / "data/derived/exp002/splits/qualification.jsonl"
MANIFEST = REPO_ROOT / "data/derived/exp002/splits/split-manifest.json"
OUT = REPO_ROOT / "data/derived/exp002/qualification"
PINNED_SPLIT_HASH = "1c5648cbcaa292357017abb8bc9a6775205f4a6f2abde688079ff7ed0aa9a9b1"
PINNED_ROWS = 80


def sha(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    expected = manifest["splits"]["qualification"]

    lines = [l for l in SPLIT.read_text(encoding="utf-8").splitlines() if l.strip()]
    per_line = sorted(sha(l.rstrip("\r")) for l in lines)
    recomputed = sha("\n".join(per_line))

    print("=" * 72)
    print("EXP-002 SEALED QUALIFICATION - seal opening")
    print("=" * 72)
    print("  rows            :", len(lines))
    print("  recomputed hash :", recomputed)
    print("  pinned hash     :", PINNED_SPLIT_HASH)

    if recomputed != PINNED_SPLIT_HASH or len(lines) != PINNED_ROWS:
        print("  ABORT: seal integrity check failed. The split is not the sealed one.")
        return 1
    print("  seal integrity  : MATCH (opening is valid)")

    items = []
    for raw in lines:
        record = json.loads(raw)
        msgs = record["messages"]
        first_asst = next(i for i, m in enumerate(msgs) if m["role"] == "assistant")
        prompt_msgs = msgs[:first_asst]
        gold = msgs[first_asst]["content"]
        item_id = sha(sha(raw.rstrip("\r")))
        items.append({"item_id": item_id, "prompt": prompt_msgs, "gold": gold})

    OUT.mkdir(parents=True, exist_ok=True)
    prompts_path = OUT / "prompts.jsonl"
    gold_path = OUT / "gold.jsonl"

    with prompts_path.open("w", encoding="utf-8", newline="\n") as fh:
        for it in items:
            fh.write(json.dumps({"item_id": it["item_id"], "messages": it["prompt"]}, ensure_ascii=False) + "\n")
    with gold_path.open("w", encoding="utf-8", newline="\n") as fh:
        for it in items:
            fh.write(json.dumps({"item_id": it["item_id"], "gold": it["gold"]}, ensure_ascii=False) + "\n")

    art = {
        "artifactKind": "GHARIBO_EXP002_QUALIFICATION_ITEMS",
        "schemaVersion": "1.0.0",
        "sealOpening": {
            "opened": True,
            "openedAt": "2026-09-17",
            "authorizedBy": "DEC-0056",
            "splitHashVerified": True,
            "rows": len(items),
            "note": "Opened exactly once. Prompts are model-visible; gold is scorer-only.",
        },
        "itemCount": len(items),
        "splitHash": recomputed,
        "promptsSha256": sha(prompts_path.read_text(encoding="utf-8")),
        "goldSha256": sha(gold_path.read_text(encoding="utf-8")),
        "promptsPath": "data/derived/exp002/qualification/prompts.jsonl",
        "goldPath": "data/derived/exp002/qualification/gold.jsonl",
        "goldNeverLeavesLocal": True,
        "consumedTestTouched": False,
    }
    (OUT / "items-manifest.json").write_text(
        json.dumps(art, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print("  wrote prompts.jsonl :", len(items), "items")
    print("  wrote gold.jsonl    : LOCAL ONLY")
    print("  prompts sha256      :", art["promptsSha256"])
    print("  gold sha256         :", art["goldSha256"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
