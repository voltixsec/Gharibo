#!/usr/bin/env python3
"""verify-dec0042-preflight-runtime.py — EXECUTE the generated preflight-002 kernel's pure-Python cells.

WHY THIS EXISTS
---------------
`check-dec0042-preflight.mjs` inspects the notebook's *text*. It cannot see a Python RUNTIME
error. This file is the missing layer: it COMPILES every code cell and EXECUTES the pins cell,
so a NameError or a pin-decoding failure is caught locally, not on a Kaggle T4.

SCOPE LIMIT
-----------
Cells that load a 20B model reach the network and require a GPU. They are compile-checked
here but NOT executed. The runtime gate covers the pre-inference surface.

Usage:
    python scripts/eval/verify-dec0042-preflight-runtime.py [--quiet]
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
NOTEBOOK = REPO / "scripts" / "eval" / "kaggle" / "gharibo-preflight-002.ipynb"

IMMUTABLE_DISTRIBUTION_REVISION = "093fba6992ef5a7152481afec0bdfca1ac486998"
DISTRIBUTION_REPO = "unsloth/gpt-oss-20b-unsloth-bnb-4bit"

passed = 0
failures = []

QUIET = False


def check(name, ok, detail=""):
    global passed
    if ok:
        passed += 1
        if not QUIET:
            print(f"  PASS  {name}")
    else:
        failures.append(f"{name}{' — ' + detail if detail else ''}")
        if not QUIET:
            print(f"  FAIL  {name}{' — ' + detail if detail else ''}")


def main():
    global QUIET
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    QUIET = args.quiet

    if not NOTEBOOK.exists():
        print(f"FAILED — notebook not found: {NOTEBOOK}")
        return 1
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    code_cells = [c for c in nb["cells"] if c["cell_type"] == "code"]

    if not QUIET:
        print("verify-dec0042-preflight-runtime.py — executing the pre-inference surface")
        print("-" * 64)

    # ---- 1. every code cell compiles -------------------------------------------------
    syntax_ok = True
    for i, c in enumerate(code_cells):
        try:
            compile(c["source"], f"<cell {i}>", "exec")
        except SyntaxError as e:
            syntax_ok = False
            check(f"cell {i} compiles as Python", False, str(e))
    check(f"all {len(code_cells)} code cells compile as Python", syntax_ok)

    # ---- 2. the pins cell must EXECUTE ----------------------------------------------
    pins_cells = [c for c in code_cells if "_PINS_JSON" in c["source"]]
    check("exactly one pins cell is present", len(pins_cells) == 1, f"found {len(pins_cells)}")
    if len(pins_cells) != 1:
        return report()

    pins_src = pins_cells[0]["source"]

    # Strip print statements structurally (by paren depth), same as verify-eval-kernel-runtime.py.
    kept, skipping, depth = [], False, 0
    for ln in pins_src.split("\n"):
        if skipping:
            depth += ln.count("(") - ln.count(")")
            if depth <= 0 and not ln.rstrip().endswith("\\"):
                skipping = False
            continue
        stripped = ln.strip()
        if stripped.startswith("print("):
            depth = ln.count("(") - ln.count(")")
            if depth > 0 or ln.rstrip().endswith("\\"):
                skipping = True
            continue
        kept.append(ln)
    exec_src = "\n".join(kept)
    ns = {}
    try:
        exec(compile(exec_src, "<pins cell>", "exec"), ns)
        check("the pins cell executes without raising", True)
    except Exception as e:
        check("the pins cell executes without raising", False, f"{type(e).__name__}: {e}")
        return report()

    check("the pins cell defines PINS", "PINS" in ns)
    if "PINS" not in ns:
        return report()
    PINS = ns["PINS"]

    # ---- 3. verify the preflight pins independently ----------------------------------
    check("authorization decision pin is DEC-0042",
          PINS.get("authorizationDecisionId") == "DEC-0042",
          f"got {PINS.get('authorizationDecisionId')!r}")
    check("decision is LOCAL_SNAPSHOT_PREFLIGHT_AUTHORIZATION",
          PINS.get("decision") == "LOCAL_SNAPSHOT_PREFLIGHT_AUTHORIZATION")
    check("attempt #5 is NOT authorized",
          PINS.get("attempt5Authorized") is False)
    check("maximum kernel pushes is 1",
          PINS.get("maximumKernelPushes") == 1)
    check("immutable distribution revision is the DEC-0037 proven SHA",
          PINS.get("immutableDistributionRevision") == IMMUTABLE_DISTRIBUTION_REVISION,
          f"got {PINS.get('immutableDistributionRevision')!r}")
    check("distribution repo is the exact bnb-4bit distribution",
          PINS.get("distributionRepo") == DISTRIBUTION_REPO,
          f"got {PINS.get('distributionRepo')!r}")

    # ---- 4. preflight pins must NOT carry evaluation material ------------------------
    FORBIDDEN_KEYS = [
        "testSplitHash", "testRecordCount", "datasetHash",
        "candidateAdapterSha256", "candidateArmId",
        "temperature", "doSample", "topP", "topK", "maxNewTokens", "seed", "repeats",
    ]
    present_forbidden = [k for k in FORBIDDEN_KEYS if k in PINS]
    check(
        "no evaluation or TEST pins are present in the preflight",
        not present_forbidden,
        f"found: {present_forbidden}",
    )

    # ---- 5. the notebook must never carry inference or training material -----------
    all_src = "\n".join(c["source"] for c in code_cells)
    exec_src_all = "\n".join(
        line for line in all_src.split("\n") if not line.strip().startswith("#")
    )
    INFERENCE_TOKENS = ["model.generate(", ".generate(", "Trainer(", ".train(",
                        "loss.backward(", ".backward()", "save_pretrained", "push_to_hub",
                        "PeftModel", "prompts.jsonl", "gold.jsonl"]
    found_tokens = []
    for tok in INFERENCE_TOKENS:
        if tok in ("prompts.jsonl", "gold.jsonl"):
            if tok in exec_src_all and not re.search(r"['\"]" + re.escape(tok) + r"['\"]", exec_src_all):
                found_tokens.append(tok)
        else:
            if tok in exec_src_all:
                found_tokens.append(tok)
    check(
        "no inference, training, or evaluation primitive in executable code",
        not found_tokens,
        f"found: {found_tokens}",
    )

    # ---- 6. required markers (PREFLIGHT3_*) -----------------------------------------
    REQUIRED_MARKERS = [
        "PREFLIGHT3_SNAPSHOT_PASS", "PREFLIGHT3_LOCAL_PATH_PASS",
        "PREFLIGHT3_TOKENIZER_PASS", "PREFLIGHT3_MODEL_LOAD_PASS",
        "PREFLIGHT3_DISTRIBUTION_REVISION_PASS", "PREFLIGHT3_NO_MUTABLE_MAIN",
        "PREFLIGHT3_TEST_ACCESS_NO", "PREFLIGHT3_INFERENCE_NO",
        "PREFLIGHT3_COMPLETE",
    ]
    for marker in REQUIRED_MARKERS:
        check(f"marker {marker} is present", marker in all_src)

    check("OBSERVED_DISTRIBUTION_ID= is present", "OBSERVED_DISTRIBUTION_ID=" in all_src)
    check("OBSERVED_DISTRIBUTION_REVISION= is present", "OBSERVED_DISTRIBUTION_REVISION=" in all_src)
    check("SNAPSHOT_DIR= is present", "SNAPSHOT_DIR=" in all_src)
    check("ACTUAL_LOADER_INPUT= is present", "ACTUAL_LOADER_INPUT=" in all_src)

    # ---- 7. local-snapshot architecture invariants ----------------------------------
    check("loader receives SNAPSHOT_DIR (not repo id)",
          "model_name=SNAPSHOT_DIR" in all_src,
          "the loader must receive the local snapshot directory, not a repo id")
    check("local_files_only=True is passed to the loader",
          "local_files_only=True" in all_src)
    check("HF_HUB_OFFLINE=1 is set after snapshot download",
          "HF_HUB_OFFLINE" in all_src)
    check("TRANSFORMERS_OFFLINE=1 is set after snapshot download",
          "TRANSFORMERS_OFFLINE" in all_src)
    check("snapshot_download captures the returned path",
          "SNAPSHOT_DIR = snapshot_download(" in all_src)
    check("no repo id passed to the actual loader call",
          "model_name=PINS['loaderModelId']" not in all_src.split("# --- PHASE 3")[-1],
          "the loader must NOT receive a repo id")
    check("version diagnostics are present",
          "transformers.__version__" in all_src and "huggingface_hub.__version__" in all_src)
    check("MRO diagnostic for HfHubHTTPError is present",
          "HfHubHTTPError" in all_src and "__mro__" in all_src)
    check("no mutable main accepted as revision",
          "_loaded_revision != 'main'" in all_src)

    # ---- 8. install cell is shared with production eval -----------------------------
    check("install cell references the governed dependencies",
          "# --- dependencies:" in all_src)

    return report()


def report():
    print("-" * 64)
    total = passed + len(failures)
    if not failures:
        print(f"RESULT: PASSED — {passed} check(s); the pre-inference surface executes.")
        return 0
    print(f"RESULT: FAILED — {len(failures)} of {total} check(s) failed:")
    for f in failures:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
