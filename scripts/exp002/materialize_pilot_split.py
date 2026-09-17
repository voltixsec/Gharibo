#!/usr/bin/env python3
"""
Materialises the governed EXP-002 PILOT split (100 rows).

The pilot is the deterministic PREFIX of the governed EXP-002 train ordering. It
is derived from the train split, never from the sealed qualification split, and it
does not modify the governed 560/80/80 partition or its manifest.

Deterministic: same input -> byte-identical output and hash.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
TRAIN_SPLIT = REPO_ROOT / "data/derived/exp002/splits/train.jsonl"
PILOT_SPLIT = REPO_ROOT / "data/derived/exp002/splits/pilot-100.jsonl"
PILOT_MANIFEST = REPO_ROOT / "data/derived/exp002/splits/pilot-manifest.json"

PILOT_ROWS = 100
PILOT_SEED_NOTE = (
    "Deterministic prefix of the governed EXP-002 train ordering (seed 20260917). "
    "A prefix is used rather than a re-shuffle so the pilot cannot select for "
    "easier or shorter examples."
)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def split_hash(lines: list[bytes]) -> str:
    per_line = sorted(sha256_text(l.rstrip(b"\r").decode("utf-8")) for l in lines if l.strip())
    return sha256_text("\n".join(per_line))


def main() -> int:
    check = "--check" in sys.argv

    if not TRAIN_SPLIT.exists():
        raise SystemExit("governed train split missing: %s" % TRAIN_SPLIT)

    train_lines = [l for l in TRAIN_SPLIT.read_bytes().splitlines() if l.strip()]
    pilot_lines = train_lines[:PILOT_ROWS]
    payload = b"\n".join(pilot_lines) + b"\n"

    manifest = {
        "artifactKind": "GHARIBO_EXP002_PILOT_SPLIT",
        "schemaVersion": "1.0.0",
        "pilotRows": PILOT_ROWS,
        "definition": PILOT_SEED_NOTE,
        "sourceSplit": "data/derived/exp002/splits/train.jsonl",
        "sourceSplitRows": len(train_lines),
        "sourceSplitHash": split_hash(train_lines),
        "pilotSplitHash": split_hash(pilot_lines),
        "pilotFileSha256": hashlib.sha256(payload).hexdigest(),
        "fileBytes": len(payload),
        "promotable": False,
        "purpose": "End-to-end pipeline validation only. No V1 claim.",
        "checkpointPolicy": {
            "optimizerSteps": PILOT_ROWS // 4,
            "derivation": "100 rows / (per-device batch 1 x grad-accum 4) = 25 optimizer steps",
            "saveStrategy": "steps",
            "saveSteps": 25,
            "saveTotalLimit": 1,
            "selectionRule": "TERMINAL_CHECKPOINT_ONLY",
        },
        "sealedSplitTouched": False,
        "consumedTestTouched": False,
    }

    text = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"

    if check:
        if not PILOT_SPLIT.exists() or PILOT_SPLIT.read_bytes() != payload:
            print("DRIFT: pilot split is not byte-identical")
            return 1
        if not PILOT_MANIFEST.exists() or PILOT_MANIFEST.read_text(encoding="utf-8") != text:
            print("DRIFT: pilot manifest is not byte-identical")
            return 1
        print("PASS: pilot split + manifest byte-identical (no drift)")
        print("  pilotSplitHash:", manifest["pilotSplitHash"])
        return 0

    PILOT_SPLIT.write_bytes(payload)
    PILOT_MANIFEST.write_text(text, encoding="utf-8")

    print("EXP-002 pilot split materialised")
    print("=" * 60)
    print("rows           :", len(pilot_lines))
    print("pilotSplitHash :", manifest["pilotSplitHash"])
    print("fileSha256     :", manifest["pilotFileSha256"])
    print("fileBytes      :", manifest["fileBytes"])
    print("source rows    :", len(train_lines), "(governed train split, unchanged)")
    print("wrote", PILOT_SPLIT)
    print("wrote", PILOT_MANIFEST)
    return 0


if __name__ == "__main__":
    sys.exit(main())
