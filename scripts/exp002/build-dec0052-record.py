#!/usr/bin/env python3
"""
Records DEC-0052: the empirical EXP-002 runtime projection and a governed
100-row PILOT configuration, without disturbing the governed 560-row contract.

Advances the master state to 1.31.0. Authorizes nothing to run.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MASTER_STATE = REPO_ROOT / "governance/GHARIBO_MASTER_STATE.json"
DECISION_PATH = REPO_ROOT / "governance/DEC-0052-exp002-runtime-projection-and-pilot.json"
PROJECTION_PATH = REPO_ROOT / "data/derived/exp002/runtime-projection.json"
TRAIN_SPLIT = REPO_ROOT / "data/derived/exp002/splits/train.jsonl"

NEW_VERSION = "1.31.0"
DATE = "2026-09-17"
PILOT_ROWS = 100


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def split_hash(lines: list[bytes]) -> str:
    per_line = sorted(sha256_text(l.rstrip(b"\r").decode("utf-8")) for l in lines if l.strip())
    return sha256_text("\n".join(per_line))


def main() -> int:
    projection = json.loads(PROJECTION_PATH.read_text(encoding="utf-8"))

    lines = [l for l in TRAIN_SPLIT.read_bytes().splitlines() if l.strip()]
    pilot_lines = lines[:PILOT_ROWS]
    pilot_hash = split_hash(pilot_lines)
    pilot_bytes = b"\n".join(pilot_lines) + b"\n"

    by_id = {p["id"]: p for p in projection["projections"]}
    stated = by_id["A_STATED_100_ROWS"]
    governed = by_id["B_GOVERNED_560_ROWS"]

    decision_core = {
        "decisionId": "DEC-0052",
        "recordKind": "EMPIRICAL_RUNTIME_PROJECTION_AND_GOVERNED_PILOT_CONFIGURATION",
        "recordRevision": 1,
        "recordDate": DATE,
        "status": "PROJECTION_ACCEPTED_PILOT_GOVERNED_PRODUCTION_CONTRACT_UNCHANGED",
        "authority": "Human instruction to use the real EXP-001 runtime as the primary timing baseline, with a stated EXP-002 configuration of TRAIN=100 and context=3072, and explicit runtime thresholds: target 1-2 h, investigate above 3 h, do not launch above 4 h.",
        "decision": (
            "Accept the empirical runtime projection anchored on the real EXP-001 execution and govern a "
            "100-row PILOT configuration for EXP-002. The projection shows the pilot total run time at "
            "0.61 h and the currently governed 560-row configuration at 3.07 h, both INSIDE the 4 h hard "
            "stop. The 560-row governed contract is therefore NOT reduced: it remains the production "
            "configuration, and the 100-row set is recorded as a governed PILOT for pipeline validation. "
            "No training is authorized anywhere, and the local hardware blocker BLK-0006 is unchanged."
        ),
        "baselineCommit": "bb163fb48257a94fa8a803d3c91777b751111d4e",
        "executionPolicy": "LOCAL_ONLY",
        "empiricalBaseline": {
            "source": "governance/GHARIBO_MASTER_STATE.json -> training.executionCompletion.derivedTimestamps",
            "derivedFrom": "authenticated Kaggle lastRunTime anchor plus relative kernel-log offsets (DEC-0030)",
            "experiment": "GHARIBO-exp-001",
            "hardware": projection["baseline"]["hardware"],
            "examples": projection["baseline"]["examples"],
            "contextLength": projection["baseline"]["contextLength"],
            "processedTokens": projection["baseline"]["processedTokens"],
            "setupSeconds": projection["baseline"]["timings"]["setupSeconds"],
            "coreTrainingSeconds": projection["baseline"]["timings"]["coreTrainingSeconds"],
            "postTrainingSeconds": projection["baseline"]["timings"]["postTrainingSeconds"],
            "totalRunSeconds": projection["baseline"]["timings"]["totalRunSeconds"],
            "crossCheck": projection["baseline"]["crossCheck"],
        },
        "costRatioModel": {
            "ratio3072over512": projection["costRatioModel"]["ratio3072over512"],
            "method": projection["costRatioModel"]["method"],
            "attentionShareAt512": projection["costRatioModel"]["attentionShareAt512"],
            "attentionShareAt3072": projection["costRatioModel"]["attentionShareAt3072"],
        },
        "projections": [
            {
                "id": p["id"],
                "label": p["label"],
                "rows": p["rows"],
                "processedTokens": p["processedTokens"],
                "setupMinutes": p["bands"]["architectureModel"]["setupMinutes"],
                "coreTrainingMinutes": p["bands"]["architectureModel"]["coreTrainingMinutes"],
                "totalHours": p["centralTotalHours"],
                "verdict": p["verdict"],
                "verdictRange": p["verdictRange"],
                "inGovernedContract": p["inGovernedContract"],
            }
            for p in projection["projections"]
        ],
        "pilotConfiguration": {
            "id": "GHARIBO-exp-002-pilot",
            "rows": PILOT_ROWS,
            "definition": "the first 100 rows of the governed EXP-002 train ordering (a deterministic prefix)",
            "splitHash": pilot_hash,
            "fileBytes": len(pilot_bytes),
            "sourceSplitHash": "94da02d6cc7a99146a1bfc3084d5a99f1ab96e262a6c48f025c92cd79de53cf8",
            "processedTokens": stated["processedTokens"],
            "projectedTotalHours": stated["centralTotalHours"],
            "projectedVerdict": stated["verdict"],
            "checkpointPolicy": {
                "optimizerSteps": PILOT_ROWS // 4,
                "derivation": "100 rows / (per-device batch 1 x grad-accum 4) = 25 optimizer steps",
                "saveStrategy": "steps",
                "saveSteps": 25,
                "saveTotalLimit": 1,
                "selectionRule": "TERMINAL_CHECKPOINT_ONLY",
                "note": (
                    "The governed 560-row policy used save_steps=140, which would never fire at 100 rows. "
                    "The pilot policy is re-derived so exactly one checkpoint exists: the terminal one."
                ),
            },
            "purpose": (
                "Validate the governed pipeline end to end (representation, assistant-only mask, "
                "final-channel contract, artifact capture) at roughly one sixth of the production cost, "
                "before committing to a full run."
            ),
            "notASubstituteFor": (
                "It is NOT a substitute for the governed 560-row production run and cannot be promoted. "
                "A pilot adapter carries no promotion claim."
            ),
        },
        "productionContractUnchanged": {
            "rows": governed["rows"],
            "splitHash": "94da02d6cc7a99146a1bfc3084d5a99f1ab96e262a6c48f025c92cd79de53cf8",
            "projectedTotalHours": governed["centralTotalHours"],
            "projectedVerdict": governed["verdict"],
            "statement": (
                "The governed EXP-002 contract is NOT reduced. The runtime constraint does not require it: "
                "the governed configuration projects to 3.07 h, inside the 4 h hard stop. Reducing to 100 "
                "rows would remove 460 training examples (82% of the training data) for a runtime saving "
                "that the evidence shows is not needed."
            ),
        },
        "firstOrderModelCorrection": projection["firstOrderModelComparison"],
        "blockingFindings": projection["blockingFindings"],
        "overheadSeparation": projection["overheadSeparation"],
        "explicitlyNotUsed": projection["explicitlyNotUsed"],
        "notAuthorizedByThisDecision": [
            "any training execution, pilot or production",
            "any evaluation run",
            "opening or scoring the sealed qualification split",
            "any model promotion",
            "GHARIBO-V1 creation",
            "any remote or paid compute",
            "any reduction of the governed 560-row training contract",
        ],
        "references": [
            "governance/DEC-0051-local-runtime-and-evaluation-contract.json",
            "governance/DEC-0050-local-only-execution-policy.json",
            "governance/DEC-0049-exp002-training-contract-preparation.json",
            "governance/DEC-0030-kaggle-execution-acceptance.json",
            "data/derived/exp002/runtime-projection.json",
            "data/derived/exp002/token-window-exp002.json",
            "data/derived/exp002/splits/split-manifest.json",
            "data/derived/exp002/local-hardware-qualification.json",
            "docs/TRAINING_STRATEGY.md",
        ],
        "next": "AWAIT_LOCAL_COMPUTE_MEETING_THE_GOVERNED_FLOOR",
    }

    decision_hash = sha256_text(canonical_json(decision_core))
    decision_record = dict(decision_core)
    decision_record["decisionHash"] = decision_hash

    DECISION_PATH.write_text(
        json.dumps(decision_record, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print("wrote", DECISION_PATH)
    print("decisionHash:", decision_hash)
    print("pilot splitHash:", pilot_hash)

    # ---------------------------------------------------------------- master state
    state = json.loads(MASTER_STATE.read_text(encoding="utf-8"))
    previous = state["masterStateVersion"]
    if previous != "1.30.0":
        raise SystemExit("REFUSING: expected master state 1.30.0, found %s" % previous)

    state["masterStateVersion"] = NEW_VERSION
    state["updatedAt"] = DATE

    state["decisions"].append(
        {
            "id": "DEC-0052",
            "date": DATE,
            "title": "Empirical EXP-002 runtime projection and governed 100-row pilot",
            "status": "ACCEPTED",
            "decision": decision_record["decision"],
            "rationale": (
                "The EXP-001 execution records its own phase timings: setup 263.574 s, core training "
                "4041.965 s and post-training 2.454 s, cross-checking the reported train_runtime to within "
                "0.06%. Projecting that measured per-token cost through the pinned gpt-oss-20b architecture "
                "(12 full-attention layers, 12 sliding-window layers) gives a 3072/512 per-token cost ratio "
                "of 1.082. The stated 100-row configuration therefore projects to 0.61 h and the governed "
                "560-row configuration to 3.07 h, both inside the 4 h hard stop, so no reduction of the "
                "governed contract is warranted."
            ),
            "scope": ["training", "experiments", "roadmap"],
            "references": decision_record["references"],
            "supersedes": None,
            "supersededBy": None,
            "architectureChanging": False,
        }
    )

    state["history"].append(
        {
            "revision": NEW_VERSION,
            "date": DATE,
            "summary": (
                "DEC-0052 empirical EXP-002 runtime projection anchored on the real EXP-001 execution "
                "(setup 4.39 min, core 67.37 min, post 2.45 s), with a governed 100-row pilot at 0.61 h "
                "projected and the governed 560-row contract left UNCHANGED at 3.07 h. Nothing authorized "
                "to run."
            ),
            "commit": None,
            "commitStatus": "PENDING_CHECKPOINT",
            "commitNote": "Records a projection and a pilot configuration only. No training is authorized.",
            "changes": [
                "recovered the measured EXP-001 phase timings from the recorded derivedTimestamps and cross-checked them against train_runtime",
                "derived a 3072/512 per-token cost ratio of 1.082 from the pinned gpt-oss-20b architecture (12 full-attention + 12 sliding-window layers)",
                "projected the stated 100-row configuration to 0.61 h total and the governed 560-row configuration to 3.07 h, both inside the 4 h hard stop",
                "recorded that the first-order rows x context proxy overstates the 100-row workload by 2.12x because batch size 1 with packing disabled means no padding",
                "governed a 100-row PILOT configuration (deterministic prefix, re-derived 25-step checkpoint policy) without reducing the governed 560-row production contract",
                "recorded that the 12 h evaluation run is inference evaluation and is excluded from the projection",
                "did not authorize any training, evaluation or promotion",
            ],
        }
    )

    state["training"]["exp002"]["runtimeProjection"] = {
        "artifact": "data/derived/exp002/runtime-projection.json",
        "baselineExperiment": "GHARIBO-exp-001",
        "baselineTotalSeconds": projection["baseline"]["timings"]["totalRunSeconds"],
        "costRatio3072over512": projection["costRatioModel"]["ratio3072over512"],
        "governedConfigProjectedHours": governed["centralTotalHours"],
        "governedConfigVerdict": governed["verdict"],
        "pilotConfigProjectedHours": stated["centralTotalHours"],
        "pilotConfigVerdict": stated["verdict"],
        "hardStopHours": 4.0,
    }

    state["training"]["exp002"]["pilotConfiguration"] = {
        "id": "GHARIBO-exp-002-pilot",
        "rows": PILOT_ROWS,
        "splitHash": pilot_hash,
        "optimizerSteps": PILOT_ROWS // 4,
        "projectedHours": stated["centralTotalHours"],
        "promotable": False,
        "trainingAuthorized": False,
    }

    state["validation"]["results"].append(
        {
            "gate": "exp002:runtime-projection",
            "command": "python scripts/exp002/build-runtime-projection.py",
            "status": "PASS",
            "exitCode": 0,
            "evidence": (
                "Empirical projection from the real EXP-001 execution: setup 263.574 s, core 4041.965 s, "
                "post 2.454 s, total 4310.044 s, cross-checked against train_runtime to within 0.06%. "
                "Cost ratio 1.082 from the pinned architecture. 100-row pilot projects to 0.61 h; governed "
                "560-row configuration projects to 3.07 h; both inside the 4 h hard stop."
            ),
            "verifiedAt": DATE,
        }
    )

    MASTER_STATE.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print("master state advanced:", previous, "->", NEW_VERSION)
    return 0


if __name__ == "__main__":
    sys.exit(main())
