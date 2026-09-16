#!/usr/bin/env python3
"""verify-preflight-kernel-runtime.py — EXECUTE the generated preflight kernel's pure-Python cells.

WHY THIS EXISTS
---------------
`check-preflight-kernel.mjs` inspects the notebook's *text*. It cannot see a Python RUNTIME
error. This file is the missing layer: it COMPILES every code cell and EXECUTES the pins cell,
so a NameError or a pin-decoding failure is caught locally, not on a Kaggle T4.

SCOPE LIMIT
-----------
Cells that load a 20B model reach the network and require a GPU. They are compile-checked
here but NOT executed. The runtime gate covers the pre-inference surface.

Usage:
    python scripts/eval/verify-preflight-kernel-runtime.py [--quiet]
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
NOTEBOOK = REPO / "scripts" / "eval" / "kaggle" / "gharibo-preflight-001.ipynb"

IMMUTABLE_DISTRIBUTION_REVISION = "093fba6992ef5a7152481afec0bdfca1ac486998"

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
        print("verify-preflight-kernel-runtime.py — executing the pre-inference surface")
        print("─" * 64)

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
    check("authorization decision pin is DEC-0041",
          PINS.get("authorizationDecisionId") == "DEC-0041",
          f"got {PINS.get('authorizationDecisionId')!r}")
    check("decision is NO_INFERENCE_PREFLIGHT_AUTHORIZATION",
          PINS.get("decision") == "NO_INFERENCE_PREFLIGHT_AUTHORIZATION")
    check("attempt #5 is NOT authorized",
          PINS.get("attempt5Authorized") is False)
    check("maximum kernel pushes is 1",
          PINS.get("maximumKernelPushes") == 1)
    check("immutable distribution revision is the DEC-0037 proven SHA",
          PINS.get("immutableDistributionRevision") == IMMUTABLE_DISTRIBUTION_REVISION,
          f"got {PINS.get('immutableDistributionRevision')!r}")

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
    # Strip comments before scanning
    exec_src_all = "\n".join(
        line for line in all_src.split("\n") if not line.strip().startswith("#")
    )
    INFERENCE_TOKENS = ["model.generate(", ".generate(", "Trainer(", ".train(",
                        "loss.backward(", ".backward()", "save_pretrained", "push_to_hub",
                        "PeftModel", "prompts.jsonl", "gold.jsonl"]
    # prompts.jsonl and gold.jsonl are allowed as string literals in the forbidden-names set
    found_tokens = []
    for tok in INFERENCE_TOKENS:
        if tok in ("prompts.jsonl", "gold.jsonl"):
            # Only flag if they appear outside string-literal position
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

    # ---- 6. required markers ---------------------------------------------------------
    REQUIRED_MARKERS = [
        "PREFLIGHT_INSTALL_PASS", "PREFLIGHT_TOKENIZER_PASS", "PREFLIGHT_MODEL_LOAD_PASS",
        "PREFLIGHT_DISTRIBUTION_ID_PASS", "PREFLIGHT_DISTRIBUTION_REVISION_PASS",
        "PREFLIGHT_BASE_REVISION_PASS", "PREFLIGHT_TEST_ACCESS_NO",
        "PREFLIGHT_INFERENCE_NO", "PREFLIGHT_COMPLETE",
    ]
    for marker in REQUIRED_MARKERS:
        check(f"marker {marker} is present", marker in all_src)

    check("OBSERVED_DISTRIBUTION_ID= is present", "OBSERVED_DISTRIBUTION_ID=" in all_src)
    check("OBSERVED_DISTRIBUTION_REVISION= is present", "OBSERVED_DISTRIBUTION_REVISION=" in all_src)

    return report()


def report():
    print("─" * 64)
    total = passed + len(failures)
    if not failures:
        print(f"RESULT: PASSED — {passed} check(s); the pre-inference surface executes.")
        return 0
    print(f"RESULT: FAILED — {len(failures)} of {total} check(s) failed:")
    for f in failures:
        print(f"  • {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
