#!/usr/bin/env python3
"""verify-eval-kernel-runtime.py — EXECUTE the generated kernel's pure-Python cells.

WHY THIS EXISTS
---------------
`check-eval-kernel.mjs` inspects the notebook's *text* and the pins *object in Node*. Neither
can see a Python RUNTIME error, and the DEC-0034 launch failed on exactly that:

    NameError: name 'false' is not defined        (cell 1, 9.58 s)

The pins had been emitted as a raw JSON literal into Python source. All 41 checks that existed
at the time PASSED on that notebook, because not one of them ran the artifact. A static check
is necessary but not sufficient: this file is the missing layer.

WHAT IT DOES
------------
1. Every code cell must COMPILE as Python.
2. Every cell that is self-contained and model-free must EXECUTE, with its asserts live.
3. The governed pins cell is executed and its decoded contract is verified independently.

SCOPE LIMIT — STATED PLAINLY
---------------------------
Cells 2..N load a 20B model and reach the network. They are compile-checked and scanned here
but NOT executed: doing so would require the accelerator this gate exists to avoid needing. The
runtime gate therefore covers the pre-inference surface, which is where the observed failure
lived. It is not a substitute for the run itself, and it does not claim to be.

Usage:
    python scripts/eval/verify-eval-kernel-runtime.py [--quiet]
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
NOTEBOOK = REPO / "scripts" / "eval" / "kaggle" / "gharibo-eval-001.ipynb"

ADAPTER_SHA256 = "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f"
BASE_REVISION = "6cee5e81ee83917806bbde320786a8fb61efebee"

# The declared decoding contract: value AND exact type (RESEARCH_BENCHMARK.md 7.1).
DECODING_CONTRACT = {
    "temperature": (0.0, float),
    "topP": (1.0, float),
    "topK": (0, int),
    "maxNewTokens": (1024, int),
    "seed": (0, int),
    "repeats": (1, int),
}

passed = 0
failures = []


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


QUIET = False


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
        print("verify-eval-kernel-runtime.py — executing the pre-inference surface")
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

    # Execute verbatim, including every assert. The gate's own diagnostic print() calls are
    # dropped so its output stays parseable — but a print() STATEMENT may span several physical
    # lines (open paren, continuation lines, close paren), and dropping only the first line
    # leaves the continuations behind as orphaned, indented source. That is not a weaker gate,
    # it is a BROKEN one: it reports an IndentationError in a perfectly valid notebook.
    #
    # So the print statements are removed structurally, by paren depth, not line by line:
    #   'print(' opens a statement; following lines are continuations while depth > 0 (or while
    #   the line ends in a backslash); the statement ends when depth returns to 0.
    # A print( that is itself the whole statement on one line ends immediately.
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

    # ---- 3. the decoded contract, verified independently of the notebook's own asserts ---
    deps = PINS.get("engineDependencies")
    check(
        "engineDependencies carries all 9 frozen specs",
        isinstance(deps, list) and len(deps) == 9,
        f"len={len(deps) if isinstance(deps, list) else 'not a list'}",
    )
    check(
        "every engineDependencies entry carries name+spec",
        isinstance(deps, list)
        and all(isinstance(d, dict) and d.get("name") and d.get("spec") for d in deps),
        "an empty entry means the pin set was shredded",
    )

    for key, (want, want_type) in DECODING_CONTRACT.items():
        got = PINS.get(key)
        ok = type(got) is want_type and got == want
        check(
            f"decoding pin {key} == {want!r} ({want_type.__name__})",
            ok,
            f"got {got!r} ({type(got).__name__})",
        )
    check("decoding pin doSample is the boolean False", PINS.get("doSample") is False,
          f"got {PINS.get('doSample')!r}")

    check("adapter sha256 pin is the accepted value",
          PINS.get("candidateAdapterSha256") == ADAPTER_SHA256)
    check("base revision pin is the accepted value",
          PINS.get("baseModelRevision") == BASE_REVISION)
    # The kernel now runs under the ATTEMPT #4 authorization (DEC-0038), which amended — and did not
    # replace — DEC-0032. Both facts are pinned: the live authorization must be DEC-0038, and the
    # prior one must still be recorded as DEC-0032, so the delegation chain stays traceable.
    check("authorization decision pin is DEC-0044 (attempt #5)",
          PINS.get("authorizationDecisionId") == "DEC-0044",
          f"got {PINS.get('authorizationDecisionId')!r}")
    check("prior authorization pin is DEC-0038 (prior evaluation attempt)",
          PINS.get("priorAuthorizationDecisionId") == "DEC-0038",
          f"got {PINS.get('priorAuthorizationDecisionId')!r}")
    check("attempt number pin is 5", PINS.get("attemptNumber") == 5,
          f"got {PINS.get('attemptNumber')!r}")
    check("the ONE-push bound is pinned",
          PINS.get("maximumKernelPushes") == 1,
          f"got {PINS.get('maximumKernelPushes')!r}")
    check("decision scope pin is AUTHORIZED WITH LIMITS",
          PINS.get("decision") == "AUTHORIZED WITH LIMITS")
    check("held-out TEST record count pin is 80", PINS.get("testRecordCount") == 80)

    # ---- 4. the notebook must never carry a promotion or a gold payload --------------
    all_src = "\n".join(c["source"] for c in code_cells)
    for tok in ("GHARIBO-V0.1", "save_pretrained", "push_to_hub"):
        check(f"notebook contains no promotion/artifact token {tok!r}", tok not in all_src)
    check(
        "the notebook refuses to run if a gold payload is present",
        re.search(r"assert\s+len\(golds\)\s*==\s*0", all_src) is not None,
        "the inference environment must be proven gold-free, not assumed gold-free",
    )

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
