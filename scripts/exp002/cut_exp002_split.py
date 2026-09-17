#!/usr/bin/env python3
"""
EXP-002 governed split (fresh, pre-training, never-inspected qualification set).

WHY THIS EXISTS
---------------
DEC-0048 consumed the GHARIBO-Research-Gold-v0.1 TEST split: Evaluation
Attempt #6 ran inference over all 80 TEST rows. Those rows can never again be
fresh promotion evidence. EXP-002 therefore needs its own qualification set,
defined BEFORE any EXP-002 training so that it cannot influence training,
prompts, hyperparameters, checkpoint choice or model selection.

WHAT THIS DOES
--------------
Re-splits the 720 rows that remain available for EXP-002 work — Gold v0.1 TRAIN
(640) plus VALIDATION (80) — under the SAME deterministic algorithm the governed
dataset already uses, but with a FRESH seed that is independent of the dataset's
own `20260914`.

    exp002-train          560   used for EXP-002 training
    exp002-dev             80   used for EXP-002 development monitoring only
    exp002-qualification   80   set aside; NOT read until final V1 qualification

WHAT THIS DELIBERATELY DOES NOT DO
----------------------------------
It never opens `test.jsonl`. The consumed split is not a source here.

LINEAGE — STATED PLAINLY, NOT HIDDEN
------------------------------------
The qualification set is drawn from Gold v0.1 TRAIN+VALIDATION. It is NOT drawn
from a new, previously-unused source corpus. Consequences, recorded in the
emitted manifest so a downstream reader cannot be misled:

  * It is a valid held-out set for the EXP-002 development distribution: it is
    fixed before training and never inspected.
  * It is NOT an independent second benchmark. The repository has no committed
    deterministic generator that maps raw UCL source records to gold examples
    (the 800 examples were sampled during the M3A session), so no genuinely new
    gold cohort can be constructed without a new governed annotation process.
  * Gold v0.1 TEST remains consumed and must never be used as promotion evidence.

Determinism: same inputs + same seed -> byte-identical outputs and hashes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

FORBIDDEN_SPLIT = "test.jsonl"

#: Fresh seed. Deliberately different from the dataset's own 20260914 so this
#: split is independent of the split that produced Gold v0.1.
EXP002_SPLIT_SEED = "20260917"

SPLIT_SIZES = {"qualification": 80, "dev": 80}
ORDER = ("train", "dev", "qualification")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def line_hash(raw_line: bytes) -> str:
    """The governed line-hash convention: sha256 of raw bytes, trailing CR stripped."""
    return sha256_bytes(raw_line.rstrip(b"\r"))


def split_hash(lines: list[bytes]) -> str:
    """The governed split-hash convention: sha256 of sorted per-line hashes."""
    return sha256_bytes(
        "\n".join(sorted(line_hash(l) for l in lines if l.strip())).encode("utf-8")
    )


def load_source(name: str, dataset_dir: pathlib.Path) -> list[bytes]:
    path = (dataset_dir / f"{name}.jsonl").resolve()
    if path.name == FORBIDDEN_SPLIT:
        raise SystemExit("REFUSING to open the consumed TEST split: %s" % path)
    return [l for l in path.read_bytes().splitlines() if l.strip()]


def assign_key(raw_line: bytes) -> tuple[str, str]:
    """Deterministic ordering key: (sha256(seed:lineHash), lineHash)."""
    lh = line_hash(raw_line)
    return sha256_bytes(("%s:%s" % (EXP002_SPLIT_SEED, lh)).encode("utf-8")), lh


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--check", action="store_true", help="verify outputs are unchanged")
    args = parser.parse_args()

    dataset_dir = pathlib.Path(args.dataset_dir)
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pool = load_source("train", dataset_dir) + load_source("validation", dataset_dir)
    print("EXP-002 governed split")
    print("source pool rows :", len(pool), "(Gold v0.1 TRAIN + VALIDATION; TEST never opened)")

    if len(pool) != 720:
        raise SystemExit("expected a 720-row pool, got %d" % len(pool))

    ordered = sorted(pool, key=assign_key)

    n_qual = SPLIT_SIZES["qualification"]
    n_dev = SPLIT_SIZES["dev"]

    # The qualification set is taken from the END of the ordering so that its
    # membership cannot be nudged by anything that inspects the training prefix.
    qualification = ordered[len(ordered) - n_qual :]
    remainder = ordered[: len(ordered) - n_qual]
    dev = remainder[len(remainder) - n_dev :]
    train = remainder[: len(remainder) - n_dev]

    assigned = {"train": train, "dev": dev, "qualification": qualification}

    # Structural disjointness: prove it, do not assume it.
    seen: dict[str, str] = {}
    for name in ORDER:
        for raw_line in assigned[name]:
            lh = line_hash(raw_line)
            if lh in seen:
                raise SystemExit(
                    "row appears in both %s and %s: %s" % (seen[lh], name, lh)
                )
            seen[lh] = name

    if len(seen) != 720:
        raise SystemExit("split is not a partition: %d unique rows" % len(seen))

    manifest_splits = {}
    for name in ORDER:
        lines = assigned[name]
        payload = b"\n".join(lines) + b"\n"
        target = out_dir / f"{name}.jsonl"

        if args.check:
            if not target.exists() or target.read_bytes() != payload:
                print("DRIFT: %s is not byte-identical to the governed split" % target)
                return 1
        else:
            target.write_bytes(payload)

        manifest_splits[name] = {
            "file": f"{name}.jsonl",
            "rows": len(lines),
            "splitHash": split_hash(lines),
            "fileSha256": sha256_bytes(payload),
            "fileBytes": len(payload),
        }
        print("  %-14s rows=%-4d splitHash=%s" % (name, len(lines), manifest_splits[name]["splitHash"][:16]))

    manifest = {
        "artifactKind": "GHARIBO_EXP002_GOVERNED_SPLIT",
        "schemaVersion": "1.0.0",
        "splitSeed": EXP002_SPLIT_SEED,
        "algorithm": (
            "k(r) = sha256(seed + ':' + lineHash(r)); records ordered ascending by (k, lineHash); "
            "qualification = last 80 of the ordering; dev = last 80 of the remainder; train = the rest"
        ),
        "lineHashAlgorithm": "sha256(utf-8(raw line bytes, trailing CR stripped))",
        "splitHashAlgorithm": "sha256(utf-8('\\n'.join(sorted(lineHash(r) for r in S))))",
        "source": {
            "dataset": "GHARIBO-Research-Gold-v0.1",
            "splitsUsed": ["train", "validation"],
            "splitsNeverOpened": ["test"],
            "poolRows": len(pool),
            "note": "TEST was consumed by Evaluation Attempt #6 (DEC-0048) and is never a source here.",
        },
        "splits": manifest_splits,
        "lineageDisclosure": {
            "derivedFrom": "GHARIBO-Research-Gold-v0.1 TRAIN + VALIDATION",
            "independentOfConsumedTest": True,
            "newIndependentSourceCorpus": False,
            "whyNoNewCorpus": (
                "The repository has no committed deterministic generator mapping raw UCL source "
                "records to gold examples; the 800 governed examples were sampled during the M3A "
                "session. A genuinely new gold cohort therefore requires a new governed annotation "
                "process and cannot be produced by re-running code."
            ),
            "whatThisSupports": (
                "A held-out qualification measurement over the EXP-002 development distribution, "
                "fixed before training and never inspected."
            ),
            "whatThisDoesNotSupport": (
                "A claim of an independent second benchmark corpus, or any use of the consumed "
                "Gold v0.1 TEST split as promotion evidence."
            ),
        },
        "qualificationPolicy": (
            "qualification.jsonl is written once, hashed, and MUST NOT be read, tokenized, parsed "
            "or inspected until the V1 promotion gate. Only its hash may travel."
        ),
    }

    text = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    manifest_path = out_dir / "split-manifest.json"

    if args.check:
        if not manifest_path.exists() or manifest_path.read_text(encoding="utf-8") != text:
            print("DRIFT: split-manifest.json is not byte-identical")
            return 1
        print("PASS: governed EXP-002 split is byte-identical (no drift)")
    else:
        manifest_path.write_text(text, encoding="utf-8")
        print("wrote", manifest_path)
        print("manifest sha256:", sha256_bytes(text.encode("utf-8")))

    return 0


if __name__ == "__main__":
    sys.exit(main())
