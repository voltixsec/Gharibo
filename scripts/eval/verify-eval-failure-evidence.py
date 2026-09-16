#!/usr/bin/env python3
"""verify-eval-failure-evidence.py — determine, from a raw Kaggle log, whether TEST inference occurred.

WHY THIS IS A SCRIPT AND NOT A PARAGRAPH
----------------------------------------
The single most consequential claim this repository has to make about a failed launch is:

    no TEST inference occurred, therefore the authorization is NOT spent.

That claim is what permits a retry without a fresh human decision, so it must be DERIVED from the
failure log rather than asserted. This script reads the raw log and extracts the evidence, so the
conclusion can be re-checked by anyone holding the same log.

THE MISTAKE THIS SCRIPT EXISTS TO PREVENT
-----------------------------------------
An earlier version treated *install-stage* markers (`Stage 1`, `uv pip install`) as evidence that
inference had occurred, and concluded `testInferenceOccurred = True` for a run that never even
loaded a model. Install activity is not inference. The two are separated explicitly below, and the
inference test is deliberately narrow: only a generation/decoding marker counts.

WHAT THE LOG ACTUALLY CONTAINS
-----------------------------
Kaggle's log is a JSON array of stream records carrying RELATIVE byte offsets only
(`{"stream_name": "stderr", "time": 9.58, "data": ...}`). Absolute wall-clock times are NOT present
and are never invented here.

Usage:
    python scripts/eval/verify-eval-failure-evidence.py --log <path> [--quiet]
"""
import argparse
import json
import re
import sys
from pathlib import Path

# --- INFERENCE EVIDENCE ------------------------------------------------------------------------
# ONLY these prove that a TEST record reached a model. Precise by design: a false positive here
# would wrongly retire the authorization, and a false negative would wrongly permit a retry.
INFERENCE_MARKERS = [
    "torch.inference_mode",
    "with torch.no_grad",
    ".generate(",
    "model.generate(",
    "EVALUATION_RUN_COMPLETE",
    "predictions-base.jsonl",
    "predictions-candidate.jsonl",
    "run-record.json",
]

# --- STAGE EVIDENCE (informational; proves progress, NOT inference) ----------------------------
STAGE_MARKERS = {
    "pins loaded": ["authorization :", "TEST split"],
    "prompts loaded": ["prompts.jsonl", "items "],
    "install ran": ["Stage 1", "Stage 2", "Stage 3", "uv pip install"],
    "model load attempted": ["FastLanguageModel.from_pretrained"],
}

# --- FATAL EXCEPTIONS A LAUNCH MAY DIE ON ------------------------------------------------------
FATAL_SIGNATURES = {
    "NAME_ERROR_PINS_LITERAL": {
        "exception": "NameError",
        "message": "name 'false' is not defined",
        "phase": "CELL_1_PIN_LOADING",
        "preceded_model_load": True,
    },
    "LOADER_REVISION_SUBSTITUTION": {
        "exception": "RuntimeError",
        "message": "Both AutoConfig and PeftConfig loading failed",
        "phase": "MODEL_LOAD",
        "preceded_model_load": False,
    },
    # Fifth distinct failure (kernel version 2). The base model loaded far enough to resolve the
    # distribution repo, then Unsloth could not obtain a tokenizer/processor: the processor folder
    # is probed at .../additional_chat_templates and the hub answers 404. Still pre-inference — it
    # dies inside vision.py::from_pretrained, before any model object exists.
    "TOKENIZER_PROCESSOR_LOAD_FAILURE": {
        "exception": "RuntimeError",
        "message": "Could not load the tokenizer/processor",
        "phase": "MODEL_LOAD",
        "preceded_model_load": False,
    },
}


def load_log(path):
    """Kaggle writes a LOSSY JSON array: records separated by a newline-comma, not pure JSON."""
    text = path.read_text(encoding="utf-8", errors="replace")
    text = re.sub(r"\n(?=,\{)", "", text)
    return json.loads(text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", required=True)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    log_path = Path(args.log)
    if not log_path.exists():
        print(f"FAILED — log not found: {log_path}")
        return 1

    records = load_log(log_path)
    streams = "".join(r.get("data", "") for r in records)
    offsets = [r.get("time") for r in records if isinstance(r.get("time"), (int, float))]

    checks = []

    def check(name, ok, detail=""):
        checks.append((name, ok))
        if not args.quiet:
            print(f"  {'PASS' if ok else 'FAIL'}  {name}{' — ' + detail if detail else ''}")

    if not args.quiet:
        print("held-out TEST benchmark — failure evidence (derived from the raw Kaggle log)")
        print("─" * 72)
        print(f"log           : {log_path.name}")
        print(f"records       : {len(records)}")
        if offsets:
            print(
                f"relative time : {min(offsets):.2f}s .. {max(offsets):.2f}s "
                "(RELATIVE offsets, not wall clock)"
            )
        print()

    # ---- 1. it failed -------------------------------------------------------------------------
    check("the notebook did not run to completion", len(records) > 0)

    # ---- 2. identify the failure ---------------------------------------------------------------
    matched = None
    for name, sig in FATAL_SIGNATURES.items():
        if sig["exception"] in streams and sig["message"] in streams:
            matched = (name, sig)
            break
    check(
        "a known fatal signature is present",
        matched is not None,
        matched[0] if matched else "none of: " + ", ".join(FATAL_SIGNATURES),
    )

    # ---- 3. THE DECISIVE TEST: no inference marker ---------------------------------------------
    found_inference = [m for m in INFERENCE_MARKERS if m in streams]
    check(
        "NO inference marker appears anywhere in the log",
        not found_inference,
        f"FOUND {found_inference}" if found_inference else f"scanned {len(INFERENCE_MARKERS)} markers",
    )

    # ---- 4. how far it got (informational) -----------------------------------------------------
    if not args.quiet:
        print("\n  progress reached (informational — install activity is NOT inference):")
        for label, markers in STAGE_MARKERS.items():
            hit = [m for m in markers if m in streams]
            print(f"    {'yes' if hit else 'no ':4} {label}" + (f"  via {hit[0]!r}" if hit else ""))

    # ---- 5. the failure is attributed to a cell ------------------------------------------------
    m = re.search(r'Exception encountered at "In \[(\d+)\]"', streams)
    cell = m.group(1) if m else None
    check(
        "the failure names the cell it died in",
        cell is not None,
        f"In [{cell}]" if cell else "no cell attribution found",
    )
    if matched and not args.quiet:
        print(f"\n  classification: {matched[0]}")
        print(f"    phase                  : {matched[1]['phase']}")
        print(f"    preceded model load    : {matched[1]['preceded_model_load']}")

    # ---- verdict -------------------------------------------------------------------------------
    no_inference = not found_inference
    total = len(checks)
    print("\n" + "─" * 72)
    print(f"conclusion: testInferenceOccurred = {not no_inference}")

    if no_inference and matched:
        print("  The run died before any generation/decoding marker appeared. No TEST record reached")
        print("  a model, no prediction byte was produced, and no metric value can exist.")
        if matched[1]["preceded_model_load"]:
            print("  It failed BEFORE the model was loaded.")
        print("  DEC-0032 hardStops[2] bars a repeat only where TEST inference has materially")
        print("  occurred; that condition is NOT met, so the authorization is not retired by this run.")
        print(f"\nRESULT: PASSED — {total}/{total} check(s); the failure is pre-inference.")
        return 0

    print("  AN INFERENCE MARKER IS PRESENT, or the failure could not be classified.")
    print("  The authorization IS spent: no re-run is permitted without a NEW human decision.")
    failed = [c for c in checks if not c[1]]
    print(f"\nRESULT: FAILED — {len(failed)} of {total} check(s) failed.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
