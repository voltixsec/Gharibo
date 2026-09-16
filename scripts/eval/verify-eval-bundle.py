#!/usr/bin/env python
"""
verify-eval-bundle.py — deterministic PASS/FAIL privacy + integrity verifier for the governed
Kaggle evaluation launch bundle.

WHY THIS EXISTS
---------------
`prepare-eval-launch.mjs` proves the bundle was BUILT correctly. This script proves the bundle
that actually sits on disk is SAFE TO UPLOAD. Those are different claims, and the second one is
the one that matters: the whole evaluation design depends on the model being structurally
incapable of seeing the gold answers.

The builder's own --check is not enough, because it compares the bundle against the builder's
expectations. This verifier works from the OTHER side of the wire: it loads the real gold corpus
and asks whether any of it is reachable from the upload payload. A bug in the projection logic
would be invisible to the builder but caught here.

CHECKS
  A. STRUCTURE   — exactly the four expected payload files, no extras
  B. NO ANSWERS  — no answer-bearing FILE exists (gold/test/train/validation)
  C. NO ECHO     — no gold answer STRING is reachable from the bundle
  D. FIDELITY    — all 80 system/user turns survive byte-exactly and in the same order
  E. INTEGRITY   — the pinned hashes match the recorded launch plan
  F. NO TRAINING — the payload carries no TRAIN/VALIDATION split

Usage:
  python scripts/eval/verify-eval-bundle.py            # report
  python scripts/eval/verify-eval-bundle.py --quiet    # exit code only
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "apps/web/data/kaggle-eval/gharibo-eval-001"
ITEMS = ROOT / ".workbuddy-ai/eval-items"

EXPECTED_PAYLOAD = {
    "dataset/dataset-metadata.json",
    "dataset/prompts.jsonl",
    "kernel/gharibo-eval-001.ipynb",
    "kernel/kernel-metadata.json",
    "launch-plan.json",
}

# A file whose NAME matches any of these must never exist in the evaluation bundle.
ANSWER_BEARING_FILES = ("gold.jsonl", "test.jsonl", "train.jsonl", "validation.jsonl")

MIN_LEAK_LENGTH = 40

passed = 0
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "", quiet: bool = False) -> None:
    global passed
    if ok:
        passed += 1
        if not quiet:
            print(f"  PASS  {name}")
    else:
        failures.append(f"{name} — {detail}" if detail else name)
        print(f"  FAIL  {name}{' — ' + detail if detail else ''}")


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load_jsonl(path: pathlib.Path) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def normalize_for_scan(text: str) -> str:
    """Collapse a payload to a form that is immune to JSON escaping.

    A leak does not have to arrive as a literal substring. If an answer document is embedded inside
    a JSON string, its newlines become the two characters `\\` `n`, its quotes become `\\"`, and a
    naive line-based or exact-substring scan sees nothing. Comparing NORMALISED text on both sides
    closes that gap.
    """
    text = text.replace("\\n", "\n").replace('\\"', '"').replace("\\/", "/").replace("\\\\", "\\")
    text = text.replace("\r", "")
    # Collapse runs of whitespace so indentation differences cannot hide a leak either.
    return " ".join(text.split())


def gold_strings(record: dict, min_length: int = MIN_LEAK_LENGTH):
    """Every non-trivial string inside a gold record's answer payload.

    Two answer shapes exist in this corpus and BOTH must be covered:

      * `gold_raw` — the complete answer document (~1 KB of JSON) as the model was expected to
        emit it. A leak of this is the worst case.
      * the parsed `gold` object — short taxonomy labels and entity names (`SYSTEM`,
        `Visitor Management-integrated Access Control System`). These are SHORTER than any
        sensible global threshold, so they are checked with a much lower one.
    """

    def walk(node):
        if isinstance(node, dict):
            for value in node.values():
                yield from walk(value)
        elif isinstance(node, list):
            for value in node:
                yield from walk(value)
        elif isinstance(node, str) and len(node.strip()) >= min_length:
            yield node.strip()

    yield from walk(record.get("gold", {}))

    raw = record.get("gold_raw")
    if isinstance(raw, str):
        stripped = raw.strip()
        if len(stripped) >= 60:
            yield stripped
        for line in stripped.splitlines():
            line = line.strip()
            if len(line) >= 24:
                yield line


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    quiet = args.quiet

    if not BUNDLE.exists():
        print(f"verify-eval-bundle: bundle not found at {BUNDLE.relative_to(ROOT)}")
        print("  run: node scripts/eval/prepare-eval-launch.mjs")
        return 1

    prompts_path = BUNDLE / "dataset/prompts.jsonl"
    plan_path = BUNDLE / "launch-plan.json"
    gold_path = ITEMS / "gold.jsonl"
    source_prompts = ITEMS / "prompts.jsonl"

    # ---------------------------------------------------------------- A. structure
    on_disk = {
        str(p.relative_to(BUNDLE)).replace("\\", "/")
        for p in BUNDLE.rglob("*")
        if p.is_file()
    }
    check(
        "bundle contains exactly the expected payload files",
        on_disk == EXPECTED_PAYLOAD,
        f"missing={sorted(EXPECTED_PAYLOAD - on_disk)} unexpected={sorted(on_disk - EXPECTED_PAYLOAD)}",
        quiet,
    )

    # ---------------------------------------------------------------- B. no answer files
    present = [f for f in ANSWER_BEARING_FILES if (BUNDLE / "dataset" / f).exists()]
    check(
        "no answer-bearing file exists anywhere in the bundle",
        not present,
        f"PRIVACY VIOLATION: found {present}",
        quiet,
    )
    # Also catch an answer file hidden under a different directory.
    stray = [
        str(p.relative_to(BUNDLE)).replace("\\", "/")
        for p in BUNDLE.rglob("*")
        if p.is_file() and p.name in ANSWER_BEARING_FILES
    ]
    check("no answer-bearing file name anywhere below the bundle root", not stray, f"found {stray}", quiet)

    if not prompts_path.exists():
        print("verify-eval-bundle: dataset/prompts.jsonl missing — cannot continue")
        return 1

    bundle_text = prompts_path.read_text(encoding="utf-8")
    # Escape-agnostic view of the payload. See normalize_for_scan: a leak embedded inside a JSON
    # string would otherwise be invisible to a literal substring scan.
    bundle_norm = normalize_for_scan(bundle_text)
    projected = load_jsonl(prompts_path)

    # ---------------------------------------------------------------- C. no answer echo
    # A match is only a violation if the string is NOT already visible in that item's own prompt.
    # Two benign classes exist and must not be counted:
    #   1. the item_id, which is a content hash and legitimately appears inside the gold record;
    #   2. descriptive text that the prompt itself already contains (the model is meant to see it).
    if gold_path.exists():
        gold_rows = load_jsonl(gold_path)
        by_id = {r["item_id"]: r for r in projected}
        id_echo = 0
        prompt_echo = 0
        true_leaks: list[tuple[str, str]] = []

        for g in gold_rows:
            item = by_id.get(g.get("item_id"))
            if item is None:
                # an item in gold with no matching prompt is itself a defect
                true_leaks.append((str(g.get("item_id")), "<gold item has no projected prompt>"))
                continue
            # A string that belongs to THIS item's own prompt is legitimately visible to the model.
            # Everything else from the answer payload is a leak wherever it appears in the payload.
            own_text = normalize_for_scan(json.dumps(item, ensure_ascii=False))
            for value in gold_strings(g):
                if normalize_for_scan(value) not in bundle_norm:
                    continue
                if value in str(g.get("item_id", "")):
                    id_echo += 1
                elif normalize_for_scan(value) in own_text:
                    prompt_echo += 1
                else:
                    true_leaks.append((str(g.get("item_id")), value[:70]))

        check(
            "no acceptance answer is reachable from the upload payload",
            len(true_leaks) == 0,
            f"{len(true_leaks)} genuine leak(s): {true_leaks[:3]}",
            quiet,
        )

        # And the low-threshold sweep: this corpus's answers are frequently SHORT taxonomy labels
        # ('SYSTEM', 'IDENTITY_WORKFLOW_ARCHITECTURE'), which a length-filtered scan would miss by
        # construction. Any such label that the item's OWN prompt does not already contain, and
        # that is not the item_id, is a leak.
        short_leaks: list[tuple[str, str]] = []
        for g in gold_rows:
            item = by_id.get(g.get("item_id"))
            if item is None:
                continue
            item_text = json.dumps(item, ensure_ascii=False)
            gold_obj = g.get("gold", {})
            labels = set()
            for key in ("entity_type",):
                if isinstance(gold_obj.get(key), str):
                    labels.add(gold_obj[key])
            for path in gold_obj.get("taxonomy_path", []) or []:
                if isinstance(path, str):
                    labels.add(path)
            for entity in gold_obj.get("entities", []) or []:
                if isinstance(entity, dict):
                    for key in ("type", "name"):
                        if isinstance(entity.get(key), str) and len(entity[key]) >= 12:
                            labels.add(entity[key])
            for label in labels:
                if not label.strip():
                    continue
                if label in str(g.get("item_id", "")) or label in item_text:
                    continue
                # Only a leak if it is actually present somewhere in the payload.
                if label in bundle_text:
                    short_leaks.append((str(g.get("item_id")), label))

        check(
            "no short taxonomy or entity label leaks into the payload",
            len(short_leaks) == 0,
            f"{len(short_leaks)} label leak(s): {short_leaks[:3]}",
            quiet,
        )

        if not quiet:
            print(
                f"        (benign matches excluded: {id_echo} item_id echoes, "
                f"{prompt_echo} strings already present in the item's own prompt)"
            )

        # ------------------------------------------------------------ D. fidelity
        originals = load_jsonl(source_prompts) if source_prompts.exists() else []
        if originals:
            check(
                "item count matches the governed TEST split",
                len(projected) == len(originals),
                f"bundle={len(projected)} source={len(originals)}",
                quiet,
            )
            check(
                "item ids match the governed order exactly",
                [r["item_id"] for r in projected] == [r["item_id"] for r in originals],
                "order or membership differs",
                quiet,
            )
            drifted = [
                p["item_id"]
                for o, p in zip(originals, projected)
                if o["prompt"].get("system", "") != p["prompt"].get("system", "")
                or o["prompt"].get("user", "") != p["prompt"].get("user", "")
            ]
            check(
                "every system/user turn survives byte-exactly",
                not drifted,
                f"{len(drifted)} item(s) changed, e.g. {drifted[:2]}",
                quiet,
            )
            check(
                "every item carries a non-empty user turn",
                all(str(r["prompt"].get("user", "")).strip() for r in projected),
                "an item has an empty user turn",
                quiet,
            )
    else:
        check("gold corpus available to prove answer-absence", False, f"missing {gold_path}", quiet)

    # ---------------------------------------------------------------- C2. no extra keys
    extra_keys = sorted(
        {k for r in projected for k in r if k not in ("item_id", "prompt")}
    )
    check(
        "every projected item carries only item_id and prompt",
        not extra_keys,
        f"unexpected key(s): {extra_keys}",
        quiet,
    )
    extra_prompt_keys = sorted(
        {k for r in projected for k in r.get("prompt", {}) if k not in ("system", "user")}
    )
    check(
        "every prompt carries only system and user",
        not extra_prompt_keys,
        f"unexpected key(s): {extra_prompt_keys}",
        quiet,
    )

    # ---------------------------------------------------------------- E. integrity
    if plan_path.exists():
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        check(
            "recorded prompts sha256 matches the bundle bytes",
            plan.get("promptsSha256") == sha256_file(prompts_path),
            f"recorded={plan.get('promptsSha256')} actual={sha256_file(prompts_path)}",
            quiet,
        )
        nb = BUNDLE / "kernel/gharibo-eval-001.ipynb"
        if nb.exists():
            check(
                "recorded notebook sha256 matches the bundle notebook",
                plan.get("notebookSha256") == sha256_file(nb),
                "notebook hash drift between the plan and the payload",
                quiet,
            )
        check(
            "launch plan declares the prompts-only payload basis",
            plan.get("payloadBasis") == "PROMPTS_ONLY",
            f"payloadBasis={plan.get('payloadBasis')!r}",
            quiet,
        )
        check(
            "launch plan declares no gold payload was included",
            plan.get("goldPayloadIncluded") is False and plan.get("goldPayloadAccessed") is False,
            "the plan claims gold travelled or was accessed",
            quiet,
        )
        check(
            "launch plan declares the BASE-then-CANDIDATE arm order",
            plan.get("armOrder") == "BASE_THEN_CANDIDATE" and plan.get("arms") == ["base", "candidate"],
            f"arms={plan.get('arms')} order={plan.get('armOrder')!r}",
            quiet,
        )
        check(
            "launch plan records zero metric values produced",
            plan.get("metricValuesProduced") == 0,
            f"metricValuesProduced={plan.get('metricValuesProduced')!r} — no score may exist pre-execution",
            quiet,
        )
        check(
            "launch plan pins the candidate adapter identity",
            plan.get("candidateAdapterSha256")
            == "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
            f"candidateAdapterSha256={plan.get('candidateAdapterSha256')!r}",
            quiet,
        )
    else:
        check("launch-plan.json present", False, "missing — run prepare-eval-launch.mjs", quiet)

    # ---------------------------------------------------------------- F. no training data
    check(
        "the upload carries no TRAIN or VALIDATION split",
        not any((BUNDLE / "dataset" / f).exists() for f in ("train.jsonl", "validation.jsonl")),
        "a training split is present in the evaluation bundle",
        quiet,
    )

    # ---------------------------------------------------------------- report
    total = passed + len(failures)
    print("-" * 64)
    if not failures:
        print(f"RESULT: PASSED — {passed}/{total} check(s); the bundle is safe to upload.")
        return 0
    print(f"RESULT: FAILED — {len(failures)} of {total} check(s) failed:")
    for f in failures:
        print(f"  • {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
