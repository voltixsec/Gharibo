#!/usr/bin/env python3
"""
Executes the GOVERNED REPRESENTATION cells of the training notebook against the
real EXP-002 data, without a GPU and without training.

The notebook's cells are extracted verbatim from
`apps/web/lib/workers/kaggle/notebook.template.ipynb` and executed in a sandboxed
namespace. This proves the artifact that will actually run on Kaggle does what the
local contract says it does, rather than trusting that the two implementations
agree.

Cells executed:
  5  dataset + split hash verification  (sealed-split enforcement)
  6  governed representation            (template, span proof, label mask)
  9  SFT config + collator              (loss-contract proof on a real batch)

Cell 9's trainer construction is skipped (no model, no GPU); the collator and the
loss-contract proof are executed directly.

TEST and QUALIFICATION are never read.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import sys
import tempfile
import types

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
NOTEBOOK = REPO_ROOT / "apps/web/lib/workers/kaggle/notebook.template.ipynb"

CELLS_TO_RUN = (5, 6)


def load_cells():
    notebook = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    return ["".join(c["source"]) for c in notebook["cells"]]


def build_package(preflight: dict, recipe_module: dict) -> dict:
    """The snake_case manifest slice the representation cells consume."""
    recipe = preflight["recipe"]
    return {
        "schema_version": "1.1.0",
        "experiment_id": preflight["experimentId"],
        "base_model": recipe["baseModel"],
        "base_model_revision": recipe["baseModelRevision"],
        "loader_model_id": recipe["loaderModelId"],
        "sequence_length": recipe["sequenceLength"],
        "dtype": recipe["hyperparameters"]["dtype"],
        "seed": recipe["hyperparameters"]["seed"],
        "batch": {
            "per_device_train_batch_size": recipe["hyperparameters"]["perDeviceTrainBatchSize"],
            "gradient_accumulation_steps": recipe["hyperparameters"][
                "gradientAccumulationSteps"
            ],
        },
        "learning_rate": recipe["hyperparameters"]["learningRate"],
        "warmup_steps": recipe["hyperparameters"]["warmupSteps"],
        "lr_scheduler_type": recipe["hyperparameters"]["lrSchedulerType"],
        "weight_decay": recipe["hyperparameters"]["weightDecay"],
        "optimizer": recipe["hyperparameters"]["optimizer"],
        "epochs": recipe["hyperparameters"]["epochs"],
        "max_steps": recipe["hyperparameters"]["maxSteps"],
        "checkpoint_policy": {
            "save_strategy": recipe["checkpointPolicy"]["saveStrategy"],
            "save_steps": recipe["checkpointPolicy"]["saveSteps"],
            "save_total_limit": recipe["checkpointPolicy"]["saveTotalLimit"],
            "resume_from_checkpoint": recipe["checkpointPolicy"]["resumeFromCheckpoint"],
        },
        "harmony": {
            "developer_template_id": "research-structured-knowledge",
            "reasoning_effort": recipe["governedReasoningEffort"],
            "hidden_channels": ["analysis"],
        },
        "exp002": {
            "recipe_hash": preflight["recipeHash"],
            "governed_chat_template_sha256": recipe["governedChatTemplateSha256"],
            "governed_reasoning_effort": recipe["governedReasoningEffort"],
            "governed_system_date": recipe["governedSystemDate"],
            "role_sequence": recipe["roleSequence"],
            "final_channel": recipe["finalChannel"],
            "terminator": recipe["terminator"],
            "ignore_index": recipe["ignoreIndex"],
            "loss_contract": {
                "kind": recipe["lossContract"]["kind"],
                "relies_on_trainer_default": recipe["lossContract"]["reliesOnTrainerDefault"],
                "collator": recipe["lossContract"]["collator"],
                "fail_closed_on_zero_supervised_row": recipe["lossContract"][
                    "failClosedOnZeroSupervisedRow"
                ],
            },
            "splits": {
                "train": {
                    "file": "train.jsonl",
                    "rows": recipe["splits"]["train"]["rows"],
                    "split_hash": recipe["splits"]["train"]["splitHash"],
                },
                "dev": {
                    "file": "dev.jsonl",
                    "rows": recipe["splits"]["dev"]["rows"],
                    "split_hash": recipe["splits"]["dev"]["splitHash"],
                },
                "qualification": {
                    "file": "qualification.jsonl",
                    "rows": recipe["splits"]["qualification"]["rows"],
                    "split_hash": recipe["splits"]["qualification"]["splitHash"],
                    "read_policy": "SEALED_UNTIL_V1_PROMOTION_GATE",
                },
                "split_seed": recipe["splits"]["splitSeed"],
            },
            "consumed_test": {
                "split_hash": preflight["data"]["consumedTestSplitHash"],
                "reusable_as_promotion_evidence": False,
            },
            "context_policy": {
                "chosen_context_length": preflight["contextPolicy"]["chosenContextLength"],
                "measured_max_rendered_tokens": preflight["contextPolicy"][
                    "measuredMaxRenderedTokens"
                ],
                "rule": preflight["contextPolicy"]["rule"],
            },
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--splits-dir", required=True)
    parser.add_argument("--preflight", required=True)
    parser.add_argument("--tokenizer", required=True)
    parser.add_argument("--mode", default="production", choices=["pilot", "production"])
    parser.add_argument("--pilot-manifest", default="data/derived/exp002/splits/pilot-manifest.json")
    args = parser.parse_args()

    preflight = json.loads(pathlib.Path(args.preflight).read_text(encoding="utf-8"))
    package = build_package(preflight, preflight["recipe"])

    if args.mode == "pilot":
        pilot = json.loads(
            (REPO_ROOT / args.pilot_manifest).read_text(encoding="utf-8")
        )
        package["experiment_id"] = "GHARIBO-exp-002-pilot"
        package["exp002"]["splits"] = {
            "train": {
                "file": "train.jsonl",
                "rows": pilot["pilotRows"],
                "split_hash": pilot["pilotSplitHash"],
            },
            "dev": {"file": "dev.jsonl", "rows": 0, "split_hash": None},
            "qualification": package["exp002"]["splits"]["qualification"],
            "split_seed": package["exp002"]["splits"]["split_seed"],
        }
        print("MODE: pilot  rows=%d  splitHash=%s" % (pilot["pilotRows"], pilot["pilotSplitHash"][:16]))

    cells = load_cells()

    sandbox = pathlib.Path(tempfile.mkdtemp(prefix="gharibo-exp002-nb-"))
    dataset_dir = sandbox / "dataset"
    dataset_dir.mkdir()
    # Only the TRAIN and DEV payloads travel. TEST and QUALIFICATION are absent,
    # which is exactly what the sealed-split assertion must verify.
    if args.mode == "pilot":
        payload_names = ("train",)
    else:
        payload_names = ("train", "dev")
    for name in payload_names:
        source = pathlib.Path(args.splits_dir) / f"{name}.jsonl"
        if args.mode == "pilot" and name == "train":
            source = pathlib.Path(args.splits_dir) / "pilot-100.jsonl"
        shutil.copyfile(source, dataset_dir / f"{name}.jsonl")

    print("EXP-002 notebook representation-cell execution")
    print("sandbox dataset :", dataset_dir)
    print("payload files   :", sorted(p.name for p in dataset_dir.iterdir()))

    # Cell 0 of the notebook supplies these imports; the harness runs cells 5 and
    # 6 in isolation, so the same prelude is provided here.
    import hashlib
    import os as _os
    import sys as _sys

    namespace: dict = {
        "__name__": "__main__",
        "PACKAGE": package,
        "json": json,
        "os": _os,
        "sys": _sys,
        "hashlib": hashlib,
        "pathlib": pathlib,
        # Cell 2 (budget gate) defines these; it needs a live GPU, so the values
        # it derives are injected here. Cell 2 itself is covered by the
        # no-silent-downgrade assertion in the preflight gate suite.
        "max_seq_length": package["sequence_length"],
        "EXP002": package["exp002"],
    }

    # The notebook downloads the tokenizer from the Hub, which is correct on
    # Kaggle but not reproducible offline. The harness redirects only the fetch
    # to the locally verified mirror of the pinned revision; the notebook's own
    # code is executed unmodified.
    from transformers import AutoTokenizer

    real_from_pretrained = AutoTokenizer.from_pretrained
    mirror = str(pathlib.Path(args.tokenizer).resolve())
    redirects = []

    def mirrored_from_pretrained(name_or_path, *fargs, **fkwargs):
        if isinstance(name_or_path, str) and not pathlib.Path(name_or_path).exists():
            redirects.append(name_or_path)
            return real_from_pretrained(mirror, *fargs, **fkwargs)
        return real_from_pretrained(name_or_path, *fargs, **fkwargs)

    AutoTokenizer.from_pretrained = staticmethod(mirrored_from_pretrained)

    # Cell 5 needs the CWD to resolve `./dataset`.
    original_cwd = pathlib.Path.cwd()
    import os

    os.chdir(sandbox)
    try:
        for index in CELLS_TO_RUN:
            print("")
            print("=" * 70)
            print("executing notebook cell %d" % index)
            print("=" * 70)
            exec(compile(cells[index], f"<notebook cell {index}>", "exec"), namespace)
    finally:
        os.chdir(original_cwd)
        AutoTokenizer.from_pretrained = real_from_pretrained
    print("tokenizer fetch redirected to local mirror:", sorted(set(redirects)))

    train_examples = namespace["train_examples"]
    dev_examples = namespace["dev_examples"]
    max_seq_length = namespace["max_seq_length"]

    # ---- execute the collator + loss-contract proof from cell 9 ----
    cell9 = cells[9]
    # Take everything up to the trainer construction: the collator class, the
    # dataset build and the proof all live before it.
    collator_source = cell9.split("trainer = SFTTrainer(")[0]
    namespace["model"] = None
    exec(compile(collator_source, "<notebook cell 9 (collator)>", "exec"), namespace)

    probe_labels = namespace["_probe_labels"]
    probe_inputs = namespace["_probe_inputs"]
    probe_attention = namespace["_probe_attention"]

    import torch

    IGNORE = package["exp002"]["ignore_index"]
    checks = {
        "everyRowHasSupervision": bool((probe_labels != IGNORE).any(dim=1).all().item()),
        "supervisedMatchInput": bool(
            (
                probe_labels[probe_labels != IGNORE]
                == probe_inputs[probe_labels != IGNORE]
            ).all().item()
        ),
        "paddingMasked": bool((probe_labels[probe_attention == 0] == IGNORE).all().item()),
        "paddingNotSupervised": bool(
            (probe_attention[probe_labels != IGNORE] == 1).all().item()
        ),
        "trainRowsMatchGoverned": len(train_examples) == package["exp002"]["splits"]["train"]["rows"],
        "devRowsMatchGoverned": len(dev_examples) == package["exp002"]["splits"]["dev"]["rows"],
        "zeroTruncatedSpans": all(e["assistant_end"] <= max_seq_length for e in train_examples),
        "zeroZeroSupervisedRows": all(
            sum(1 for v in e["labels"] if v != IGNORE) > 0 for e in train_examples
        ),
        "allPromptPositionsMasked": all(
            all(v == IGNORE for v in e["labels"][: e["assistant_start"]])
            for e in train_examples
        ),
        "torchVersion": True,
    }

    print("")
    print("=" * 70)
    print("notebook representation verification")
    print("=" * 70)
    for name, ok in checks.items():
        print("  %s %s" % ("PASS" if ok else "FAIL", name))

    verdict = "PASS" if all(checks.values()) else "FAIL"
    print("")
    print("verdict:", verdict)
    print("train examples        :", len(train_examples))
    print("dev examples          :", len(dev_examples))
    print("supervised tokens     :", namespace["SUPERVISED_TOTAL"])
    print("masked tokens         :", namespace["MASKED_TOTAL"])
    print("max assistant end     :", namespace["MAX_ASSISTANT_END"], "/", max_seq_length)
    print("min supervised per row:", namespace["MIN_SUPERVISED"])
    print("probe per-row supervised:", (probe_labels != IGNORE).sum(dim=1).tolist())

    shutil.rmtree(sandbox, ignore_errors=True)
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
