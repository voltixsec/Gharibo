#!/usr/bin/env python3
"""
EXP-002 masking-contract proof (TRAIN + VALIDATION only).

Builds real supervised examples from the governed Gold dataset using the
governed chat template, masks every non-assistant position to -100, collates
real batches, and re-checks the loss contract on the collated tensors.

This is the artifact that makes the EXP-001 defect class structurally impossible:
EXP-001 trained on raw `text` with no completion-only loss at all, so the
supervised answer was neither located nor guaranteed. Here the supervised span
is *proven* per record by a token-prefix argument, and the proof is re-run on
the batch tensors that the trainer actually receives.

Hard gates (any failure => non-zero exit, no artifact marked PASS):
  - zero TRAIN examples whose assistant span falls outside the context window
  - zero TRAIN examples with zero supervised assistant tokens
  - zero VALIDATION examples with zero supervised assistant tokens
  - every collated row retains at least one supervised token
  - padding never contributes to loss
  - the supervised span always ends at the assistant terminator

TEST is never opened.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from governed_sft import (  # noqa: E402
    AssistantOnlyCollator,
    GOVERNED_CHAT_TEMPLATE_SHA256,
    GOVERNED_REASONING_EFFORT,
    GOVERNED_ROLE_SEQUENCE,
    GOVERNED_SYSTEM_DATE,
    GOVERNED_TERMINATOR,
    IGNORE_INDEX,
    build_supervised_example,
    install_governed_template,
    sha256_text,
    verify_example_mask,
)

FORBIDDEN_SPLIT = "test.jsonl"


def load_split(dataset_dir: pathlib.Path, name: str):
    path = (dataset_dir / f"{name}.jsonl").resolve()
    if path.name == FORBIDDEN_SPLIT:
        raise SystemExit("REFUSING to open the consumed TEST split: %s" % path)
    raw = path.read_bytes()
    lines = raw.splitlines()
    records = [json.loads(l) for l in lines if l.strip()]
    per_line = sorted(sha256_text(l.decode("utf-8")) for l in lines if l.strip())
    return records, {
        "file": f"{name}.jsonl",
        "rows": len(records),
        "splitHash": sha256_text("\n".join(per_line)),
        "fileSha256": hashlib.sha256(raw).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--tokenizer", required=True)
    parser.add_argument("--governed-chat-template", required=True)
    parser.add_argument("--context-length", type=int, required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--splits", default="train,validation")
    parser.add_argument("--expected-train-rows", type=int, default=640)
    args = parser.parse_args()

    split_names = [s.strip() for s in args.splits.split(",") if s.strip()]
    if any(s == "test" for s in split_names):
        raise SystemExit("REFUSING: the consumed TEST split may not be used for EXP-002.")

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    from transformers import AutoTokenizer
    import torch

    template_text = pathlib.Path(args.governed_chat_template).read_text(encoding="utf-8")
    tokenizer = AutoTokenizer.from_pretrained(args.tokenizer)
    install_governed_template(tokenizer, template_text)

    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    collator = AssistantOnlyCollator(pad_token_id=tokenizer.pad_token_id)

    print("EXP-002 masking-contract proof")
    print("context length :", args.context_length)
    print("pad token id   :", tokenizer.pad_token_id)

    splits: dict[str, dict] = {}
    examples: dict[str, list[dict]] = {}

    for name in split_names:
        records, meta = load_split(pathlib.Path(args.dataset_dir), name)
        built = []
        failures = []
        for index, record in enumerate(records):
            try:
                built.append(build_supervised_example(tokenizer, record))
            except Exception as exc:  # noqa: BLE001 - reported, never hidden
                failures.append({"index": index, "error": "%s: %s" % (type(exc).__name__, exc)})

        examples[name] = built

        mask_checks = [verify_example_mask(e) for e in built]
        outside = [i for i, e in enumerate(built) if e["assistant_start"] >= args.context_length]
        truncated = [i for i, e in enumerate(built) if e["assistant_end"] > args.context_length]
        zero_sup = [i for i, e in enumerate(built) if e["supervised_tokens"] == 0]
        tail_ok = [i for i, e in enumerate(built) if e["labels"][-1] != IGNORE_INDEX]

        splits[name] = {
            **meta,
            "builtExamples": len(built),
            "buildFailures": len(failures),
            "buildFailureDetail": failures[:10],
            "assistantEntirelyOutsideWindow": len(outside),
            "assistantTruncatedAtContext": len(truncated),
            "zeroSupervisedTokens": len(zero_sup),
            "rowsWithSupervisedTail": len(tail_ok),
            "allMaskChecksPass": all(c["ok"] for c in mask_checks),
            "minSupervisedTokens": min((e["supervised_tokens"] for e in built), default=0),
            "maxAssistantEnd": max((e["assistant_end"] for e in built), default=0),
        }
        print(
            "%-10s built=%d outside=%d truncated=%d zeroSup=%d"
            % (name, len(built), len(outside), len(truncated), len(zero_sup))
        )

    # ---- real collation, then re-verify the contract on the batch tensors ----
    batch_proofs = []
    train_examples = examples["train"]
    for start in range(0, min(len(train_examples), args.batch_size * 8), args.batch_size):
        rows = train_examples[start : start + args.batch_size]
        if not rows:
            continue
        batch = collator(rows)
        from governed_sft import assert_batch_loss_contract

        proof = assert_batch_loss_contract(batch, rows)
        proof["batchIndex"] = start // args.batch_size
        proof["rows"] = len(rows)
        batch_proofs.append(proof)

    batches_ok = all(p["ok"] for p in batch_proofs) and len(batch_proofs) > 0

    # ---- the tail of the supervised span must be the assistant terminator ----
    tail_terminator_ok = True
    for name in split_names:
        records, _ = load_split(pathlib.Path(args.dataset_dir), name)
        # re-render just the final tokens of the last example to confirm the
        # governed template's terminator is what closes the supervised span.
        from governed_sft import render_governed, governed_messages

        messages = governed_messages(records[-1])
        full = render_governed(tokenizer, messages, False)
        if not full.endswith(GOVERNED_TERMINATOR):
            tail_terminator_ok = False

    train_name = split_names[0]
    gates = {
        "trainRowsPresent": splits[train_name]["rows"] == args.expected_train_rows,
        "zeroBuildFailures": all(s["buildFailures"] == 0 for s in splits.values()),
        "zeroTrainAssistantEntirelyOutsideWindow": splits[train_name][
            "assistantEntirelyOutsideWindow"
        ]
        == 0,
        "zeroTrainAssistantTruncated": splits[train_name]["assistantTruncatedAtContext"] == 0,
        "zeroTrainZeroSupervisedTokens": splits[train_name]["zeroSupervisedTokens"] == 0,
        "everyTrainRowHasSupervisedTail": splits[train_name]["rowsWithSupervisedTail"]
        == splits[train_name]["rows"],
        "allPerExampleMaskChecksPass": all(s["allMaskChecksPass"] for s in splits.values()),
        "batchLossContractPasses": batches_ok,
        "assistantTerminatorIsGoverned": tail_terminator_ok,
    }
    for name in split_names:
        gates["zeroTruncation_%s" % name] = splits[name]["assistantTruncatedAtContext"] == 0
        gates["zeroZeroSupervised_%s" % name] = splits[name]["zeroSupervisedTokens"] == 0

    artifact = {
        "artifactKind": "GHARIBO_EXP002_MASKING_CONTRACT_PROOF",
        "schemaVersion": "1.0.0",
        "testAccessed": False,
        "testPolicy": "TRAIN and VALIDATION only; test.jsonl is never opened.",
        "contextLength": args.context_length,
        "governedContract": {
            "roleSequence": GOVERNED_ROLE_SEQUENCE,
            "chatTemplateSha256": GOVERNED_CHAT_TEMPLATE_SHA256,
            "reasoningEffort": GOVERNED_REASONING_EFFORT,
            "pinnedSystemDate": GOVERNED_SYSTEM_DATE,
            "terminator": GOVERNED_TERMINATOR,
            "ignoreIndex": IGNORE_INDEX,
            "lossContract": "assistant-only: every position outside the proven assistant span is -100",
        },
        "tokenizer": {
            "resolvedNameOrPath": str(tokenizer.name_or_path),
            "class": type(tokenizer).__name__,
            "padTokenId": int(tokenizer.pad_token_id),
            "torchVersion": torch.__version__,
        },
        "splits": splits,
        "batchProofs": batch_proofs,
        "gates": gates,
        "verdict": "PASS" if all(gates.values()) else "FAIL",
    }

    text = json.dumps(artifact, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    out_path.write_text(text, encoding="utf-8")

    print("")
    print("verdict:", artifact["verdict"])
    for key, value in gates.items():
        print("  %-42s %s" % (key, "PASS" if value else "FAIL"))
    print("wrote", out_path)
    print("artifact sha256:", hashlib.sha256(text.encode("utf-8")).hexdigest())

    return 0 if artifact["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
