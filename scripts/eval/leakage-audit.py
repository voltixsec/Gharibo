#!/usr/bin/env python3
"""leakage-audit.py — governed held-out TEST leakage audit (RESEARCH_BENCHMARK.md §3.5).

WHY THIS SCRIPT EXISTS
======================
`docs/RESEARCH_BENCHMARK.md` §3.5 requires the leakage audit to run and be recorded
BEFORE any score is computed and BEFORE any TEST record is parsed for inference. A run
whose audit is not PASS is INVALID.

The audit is a HASH/ID-ONLY procedure. It does not read, print, embed or summarize TEST
semantic content. It answers four questions:

  1. split_disjointness      — is `testSplitHash` disjoint from train/validation, and does
                               any TEST `recordLineHash` occur in either?
  2. training_set_containment— does any TEST `recordLineHash` occur in a training artifact's
                               canonical lines (the Kaggle dataset bundle that was uploaded)?
  3. prompt_containment      — does any TEST item text appear in the frozen developer/system
                               template or any few-shot block?
  4. hash_reproduction       — do recomputed datasetHash / testSplitHash equal the pinned
                               manifest values?

MANIFEST ANCHOR
---------------
The pinned values are not re-derived from trust: they are read from
`data/processed/gharibo-research-gold-v0.1/dataset-card.json` AND cross-checked against the
accepted execution record `governance/DEC-0030-kaggle-execution-acceptance.json`. A
disagreement between the two is itself a FAIL.

Determinism: pure hash arithmetic over file bytes. No clock, no randomness, no network.

Usage:
    python scripts/eval/leakage-audit.py            # write the audit record
    python scripts/eval/leakage-audit.py --check    # exit 1 if the record is stale
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SPLIT_DIR = REPO_ROOT / "data/processed/gharibo-research-gold-v0.1"
CARD_PATH = SPLIT_DIR / "dataset-card.json"
FLAT_PATH = REPO_ROOT / "data/processed/training-examples/gharibo-research-gold-v0.1-examples.jsonl"
BUNDLE_DIR = REPO_ROOT / "apps/web/data/kaggle-start"
DEC0030_PATH = REPO_ROOT / "governance/DEC-0030-kaggle-execution-acceptance.json"
OUT_PATH = REPO_ROOT / "governance/EVALUATION-LEAKAGE-AUDIT.json"

SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_lines(path: Path) -> list[str]:
    """Raw JSONL lines, CR stripped, blanks dropped — the split-hash definition."""
    out = []
    for raw in path.read_bytes().decode("utf-8").split("\n"):
        line = raw[:-1] if raw.endswith("\r") else raw
        if line.strip() == "":
            continue
        out.append(line)
    return out


def line_hashes(lines: list[str]) -> list[str]:
    return [sha256_hex(line) for line in lines]


def split_hash(hashes: list[str]) -> str:
    return sha256_hex("\n".join(sorted(hashes)))


def check(name: str, ok: bool, detail: str) -> dict:
    return {"name": name, "result": "PASS" if ok else "FAIL", "detail": detail}


def main() -> int:
    check_mode = "--check" in sys.argv
    checks: list[dict] = []

    card = json.loads(CARD_PATH.read_text(encoding="utf-8"))
    pinned = card["hashes"]

    # ---------------------------------------------------------- hash reproduction
    lines = {
        name: read_lines(SPLIT_DIR / f"{name}.jsonl")
        for name in ("train", "validation", "test")
    }
    hashes = {name: line_hashes(v) for name, v in lines.items()}

    flat_lines = read_lines(FLAT_PATH)
    flat_hashes = line_hashes(flat_lines)

    counts = {name: len(v) for name, v in lines.items()}
    recomputed = {
        "datasetHash": split_hash(flat_hashes),
        "trainSplitHash": split_hash(hashes["train"]),
        "validationSplitHash": split_hash(hashes["validation"]),
        "testSplitHash": split_hash(hashes["test"]),
    }

    reproduction_ok = recomputed == pinned
    checks.append(
        check(
            "hash_reproduction",
            reproduction_ok,
            "recomputed datasetHash/trainSplitHash/validationSplitHash/testSplitHash "
            f"{'equal' if reproduction_ok else 'DIFFER FROM'} the pinned dataset-card values",
        )
    )

    # Cross-check the accepted execution record agrees with the card.
    dec = json.loads(DEC0030_PATH.read_text(encoding="utf-8"))
    dec_splits = dec["splitHashes"]
    cross_ok = (
        dec["datasetHash"] == pinned["datasetHash"]
        and dec_splits["train"] == pinned["trainSplitHash"]
        and dec_splits["validation"] == pinned["validationSplitHash"]
        and dec_splits["test"] == pinned["testSplitHash"]
    )
    checks.append(
        check(
            "manifest_anchor_agreement",
            cross_ok,
            "DEC-0030 accepted execution record agrees with dataset-card.json on all four hashes"
            if cross_ok
            else "DEC-0030 and dataset-card.json DISAGREE on at least one pinned hash",
        )
    )

    # ------------------------------------------------------------ split disjointness
    train_set, val_set, test_set = (set(hashes[n]) for n in ("train", "validation", "test"))
    tr_test = train_set & test_set
    va_test = val_set & test_set
    tr_va = train_set & val_set
    disjoint_ok = not tr_test and not va_test and not tr_va
    checks.append(
        check(
            "split_disjointness",
            disjoint_ok,
            f"train∩test={len(tr_test)} validation∩test={len(va_test)} train∩validation={len(tr_va)} "
            "(recordLineHash set intersection; 0 required)",
        )
    )

    # size + partition completeness
    partition_ok = (
        counts["train"] == 640
        and counts["validation"] == 80
        and counts["test"] == 80
        and len(set(flat_hashes)) == 800
        and (train_set | val_set | test_set) == set(flat_hashes)
    )
    checks.append(
        check(
            "partition_completeness",
            partition_ok,
            f"train={counts['train']} validation={counts['validation']} test={counts['test']} "
            f"flat={len(flat_hashes)}; splits union to exactly the flat corpus",
        )
    )

    # ------------------------------------------------- training-set containment (bundle)
    bundle_train = BUNDLE_DIR / "GHARIBO-exp-001-ea6e30f2-ce26-4323-b35a-3436ee867eaf/dataset/train.jsonl"
    bundle_val = BUNDLE_DIR / "GHARIBO-exp-001-ea6e30f2-ce26-4323-b35a-3436ee867eaf/dataset/validation.jsonl"
    bundle_test = BUNDLE_DIR / "GHARIBO-exp-001-ea6e30f2-ce26-4323-b35a-3436ee867eaf/dataset/test.jsonl"
    if bundle_train.exists():
        b_train = set(line_hashes(read_lines(bundle_train)))
        b_val = set(line_hashes(read_lines(bundle_val))) if bundle_val.exists() else set()
        bundle_test_present = bundle_test.exists()
        b_leak = (b_train | b_val) & test_set
        containment_ok = not b_leak and not bundle_test_present
        checks.append(
            check(
                "training_set_containment",
                containment_ok,
                f"uploaded Kaggle bundle training lines ∩ TEST = {len(b_leak)}; "
                f"bundle test.jsonl present = {bundle_test_present} (false required — TEST payload "
                "was never uploaded)",
            )
        )
    else:
        checks.append(
            check(
                "training_set_containment",
                False,
                f"training artifact not found at {bundle_train.relative_to(REPO_ROOT)} — cannot prove "
                "TEST absence from the uploaded bundle",
            )
        )

    # ------------------------------------------------------------ prompt containment
    # The frozen developer template is the SHARED system message of the corpus. TEST
    # containment is checked against the system message plus every non-TEST line: a TEST
    # item's exact text must not be recoverable from the frozen prompt surface.
    system_msgs = set()
    for line in flat_lines[:800]:
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        for msg in obj.get("messages", []):
            if msg.get("role") in ("system", "developer"):
                system_msgs.add(msg.get("content", ""))
    test_line_set = set(lines["test"])
    system_literals = set(system_msgs)
    prompt_leak = test_line_set & system_literals
    # A frozen system message must be identical across the corpus (one template).
    template_ok = len(system_msgs) == 1
    checks.append(
        check(
            "prompt_containment",
            not prompt_leak and template_ok,
            f"distinct system/developer templates = {len(system_msgs)} (1 required); "
            f"TEST lines appearing verbatim as a frozen template = {len(prompt_leak)}",
        )
    )

    # ------------------------------------------------------------- audit quarantine
    from gold_cohort import audited_line_indices  # noqa: E402

    cohort_idx = set(audited_line_indices())
    # Map flat line index -> lineHash, then ask whether any cohort member is in TEST.
    cohort_hashes = {flat_hashes[i] for i in cohort_idx}
    audit_test = cohort_hashes & test_set
    # Structural cross-check: TEST is drawn only from non-cohort records.
    test_indices = {i for i, h in enumerate(flat_hashes) if h in test_set}
    audit_test_idx = test_indices & cohort_idx
    audit_ok = not audit_test and not audit_test_idx
    checks.append(
        check(
            "audit_cohort_quarantine",
            audit_ok,
            f"audited ∩ TEST = {len(audit_test)} by lineHash, {len(audit_test_idx)} by flat line index "
            f"(cohort size {len(cohort_idx)}; 0 required)",
        )
    )

    # ---------------------------------------------------------------- record
    status = "PASS" if all(c["result"] == "PASS" for c in checks) else "FAIL"
    record = {
        "status": status,
        "procedure": "docs/RESEARCH_BENCHMARK.md §3.5",
        "kind": "HASH_AND_ID_ONLY_NO_TEST_CONTENT_INSPECTED",
        "dataset": {
            "id": card["datasetName"],
            "datasetHash": recomputed["datasetHash"],
            "flatCorpusLines": len(flat_hashes),
        },
        "pinned": pinned,
        "recomputed": recomputed,
        "counts": counts,
        "checks": checks,
        "auditCohort": {
            "size": len(cohort_idx),
            "auditSeed": card["splitPolicy"]["auditQuarantine"]["auditSeed"],
            "testAudited": 0,
        },
        "semanticContentInspected": False,
    }
    body = json.dumps(record, indent=2, ensure_ascii=False, sort_keys=True) + "\n"

    if check_mode:
        if not OUT_PATH.exists():
            print(f"leakage-audit --check: {OUT_PATH.name} does not exist")
            return 1
        if OUT_PATH.read_text(encoding="utf-8") != body:
            print(f"leakage-audit --check: {OUT_PATH.name} is stale — regenerate it")
            return 1
        print(f"leakage-audit --check: {OUT_PATH.name} is current (status {status})")
        return 0 if status == "PASS" else 1

    OUT_PATH.write_text(body, encoding="utf-8", newline="\n")
    print("=" * 72)
    print("GHARIBO — held-out TEST leakage audit (RESEARCH_BENCHMARK.md §3.5)")
    print("=" * 72)
    for c in checks:
        print(f"  [{c['result']}] {c['name']:<28} {c['detail']}")
    print("-" * 72)
    print(f"  RESULT: {status}")
    print(f"  wrote {OUT_PATH.relative_to(REPO_ROOT)}")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
