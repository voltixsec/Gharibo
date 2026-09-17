#!/usr/bin/env python3
"""
Records DEC-0049 (EXP-002 training-contract preparation) and advances the master
state to 1.28.0.

Deterministic: same inputs -> byte-identical governance JSON.

Nothing here authorizes training. DEC-0049 records that the EXP-002 pre-GPU gate
has been built and PASSES, and that the external Kaggle launch remains
UNAUTHORIZED pending an explicit human decision.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MASTER_STATE = REPO_ROOT / "governance/GHARIBO_MASTER_STATE.json"
DECISION_PATH = REPO_ROOT / "governance/DEC-0049-exp002-training-contract-preparation.json"
PREFLIGHT_PATH = REPO_ROOT / "data/derived/exp002/preflight.json"
SUMMARY_PATH = REPO_ROOT / "data/derived/exp002/package/launch-summary.json"

NEW_VERSION = "1.28.0"
DATE = "2026-09-17"


def canonical_json(value) -> str:
    """Deterministic JSON: sorted keys, no spaces — the project's hash convention."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    preflight = json.loads(PREFLIGHT_PATH.read_text(encoding="utf-8"))
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))

    if preflight["verdict"] != "PASS":
        raise SystemExit("REFUSING: the EXP-002 preflight verdict is %s" % preflight["verdict"])

    recipe_hash = preflight["recipeHash"]
    package_id = summary["packageId"]
    notebook_sha = summary["notebook"]["sha256"]

    decision_core = {
        "decisionId": "DEC-0049",
        "recordKind": "EXP002_TRAINING_CONTRACT_PREPARATION",
        "recordRevision": 1,
        "recordDate": DATE,
        "status": "EXP002_CONTRACT_PREPARED_TRAINING_NOT_AUTHORIZED",
        "authority": "Explicit mission instruction to prepare the corrected EXP-002 training contract from TRAIN and VALIDATION only, prove the supervision contract locally, and stop at the external Kaggle launch authorization gate.",
        "decision": (
            "Accept the prepared GHARIBO-exp-002 training contract. The EXP-001 defect class "
            "is made structurally impossible: the assistant Gold payload is located per record "
            "by a token-prefix proof, every non-assistant position is masked to -100, and any "
            "record that cannot be proven fails closed. The effective context length is 3072, "
            "chosen from measured TRAIN and DEV token distributions with zero truncated "
            "assistant spans. A new governed qualification split is sealed for the V1 "
            "promotion gate. The consumed Gold v0.1 TEST split is never a source. "
            "No Kaggle launch is authorized by this decision."
        ),
        "baselineCommit": "bb163fb48257a94fa8a803d3c91777b751111d4e",
        "experimentId": "GHARIBO-exp-002",
        "recipeHash": recipe_hash,
        "packageId": package_id,
        "notebookSha256": notebook_sha,
        "effectiveContextLength": preflight["contextPolicy"]["chosenContextLength"],
        "measuredMaxRenderedTokens": preflight["contextPolicy"]["measuredMaxRenderedTokens"],
        "lossContract": {
            "kind": "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
            "reliesOnTrainerDefault": False,
            "collator": "AssistantOnlyCollator",
            "ignoreIndex": -100,
            "failClosedOnZeroSupervisedRow": True,
            "assistantOnlyLossFlagUsable": False,
            "assistantOnlyLossFlagReason": (
                "TRL's assistant_only_loss requires {% generation %} markers in the chat "
                "template; the governed gpt-oss template does not carry them."
            ),
        },
        "representation": {
            "roleSequence": preflight["roleSequence"],
            "chatTemplateSha256": preflight["tokenizer"]["governedChatTemplateSha256"],
            "chatTemplateSource": {
                "repoId": "openai/gpt-oss-20b",
                "revision": "6cee5e81ee83917806bbde320786a8fb61efebee",
            },
            "terminator": preflight["harmonyFinalContract"]["terminator"],
            "pinnedSystemDate": preflight["tokenizer"]["pinnedSystemDate"],
            "finding": (
                "The loader repository (unsloth/gpt-oss-20b) ships a patched chat template "
                "whose only behavioural difference for this dataset is that it terminates the "
                "final assistant message with <|end|> where the identity model's template "
                "terminates it with <|return|>. <|return|> is the unambiguous "
                "end-of-final-message marker, so the identity template is governed and is SET "
                "explicitly and asserted by hash rather than inherited from the loader repo."
            ),
            "roleContractFinding": (
                "Under the governed template a leading `system` and a leading `developer` "
                "message render to byte-identical text, so the declared role-contract mismatch "
                "recorded in DEC-0048 does not manifest as a rendered-token difference. The "
                "governed contract preserves the frozen dataset's own `system` role and pins "
                "the template by hash so no future divergence can pass unnoticed."
            ),
        },
        "splits": {
            "seed": preflight["data"]["splitSeed"],
            "train": {
                "rows": preflight["data"]["trainRows"],
                "splitHash": preflight["data"]["splitHashes"]["train"],
            },
            "dev": {
                "rows": preflight["data"]["devRows"],
                "splitHash": preflight["data"]["splitHashes"]["dev"],
            },
            "qualification": {
                "rows": preflight["data"]["qualificationRows"],
                "splitHash": preflight["data"]["splitHashes"]["qualification"],
                "policy": "SEALED_UNTIL_V1_PROMOTION_GATE",
            },
            "consumedTest": {
                "splitHash": preflight["data"]["consumedTestSplitHash"],
                "used": False,
                "reusableAsPromotionEvidence": False,
            },
        },
        "gates": {
            "preflightVerdict": preflight["verdict"],
            "gateCount": len(preflight["gates"]),
            "failedGates": preflight["failedGates"],
            "zeroTrainAssistantEntirelyOutsideWindow": True,
            "zeroTrainAssistantTruncated": True,
            "zeroTrainZeroSupervisedTokens": True,
            "everyTrainRowHasSupervisedTail": True,
            "batchLossContractProven": True,
            "extractionRegressionPass": preflight["harmonyFinalContract"]["regression"]["pass"],
            "extractionRegressionCases": preflight["harmonyFinalContract"]["regression"]["caseCount"],
            "noConsumedTestAccess": True,
            "roleContractParity": "PROVEN_BY_TOKEN_PREFIX",
        },
        "openIssue": {
            "id": "BLK-0005",
            "title": "No new independent source corpus exists for an independent V1 benchmark",
            "detail": (
                "The EXP-002 qualification split is drawn from Gold v0.1 TRAIN+VALIDATION and is "
                "sealed before training, so it is a valid held-out measurement over the EXP-002 "
                "development distribution. It is NOT an independent second corpus: the "
                "repository has no committed deterministic generator mapping raw UCL source "
                "records to gold examples, so a genuinely new gold cohort requires a new "
                "governed annotation process. A V1 promotion claim must state exactly which of "
                "the two it rests on."
            ),
        },
        "externalLaunch": {
            "required": True,
            "authorized": False,
            "authorizationPhrase": "AUTHORIZE EXP-002 TRAINING LAUNCH",
            "maximumKernelPushes": 1,
            "kernelPushesPerformed": 0,
        },
        "notAuthorizedByThisDecision": [
            "Kaggle kernel push",
            "training execution",
            "qualification-set access",
            "evaluation",
            "model promotion",
            "GHARIBO-V1 creation",
        ],
        "references": [
            "governance/DEC-0048-exp001-training-objective-defect.json",
            "governance/DEC-0030-kaggle-execution-acceptance.json",
            "data/derived/exp002/preflight.json",
            "data/derived/exp002/token-window-exp002.json",
            "data/derived/exp002/masking-contract.json",
            "data/derived/exp002/splits/split-manifest.json",
            "data/derived/exp002/package/launch-summary.json",
            "apps/web/lib/training/exp002-recipe.mjs",
            "apps/web/lib/runtime/harmony-final.mjs",
            "apps/web/lib/workers/kaggle/notebook.template.ipynb",
            "scripts/exp002/build-exp002-preflight.mjs",
            "scripts/exp002/build_masking_contract.py",
            "scripts/exp002/cut_exp002_split.py",
            "docs/TRAINING_STRATEGY.md",
        ],
        "next": "AWAIT_EXPLICIT_HUMAN_LAUNCH_AUTHORIZATION",
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

    # ---------------------------------------------------------------- master state
    state = json.loads(MASTER_STATE.read_text(encoding="utf-8"))
    previous = state["masterStateVersion"]
    if previous != "1.27.0":
        raise SystemExit("REFUSING: expected master state 1.27.0, found %s" % previous)

    state["masterStateVersion"] = NEW_VERSION
    state["updatedAt"] = DATE

    state["decisions"].append(
        {
            "id": "DEC-0049",
            "date": DATE,
            "title": "Prepare the corrected EXP-002 training contract; external launch not authorized",
            "status": "ACCEPTED",
            "decision": decision_record["decision"],
            "rationale": (
                "The EXP-002 pre-GPU gate PASSES on measured evidence: 560 TRAIN and 80 DEV "
                "examples build with zero build failures, zero assistant spans outside the "
                "declared 3072-token context, zero truncated assistant spans and zero "
                "zero-supervised rows. The assistant-only label mask is verified on real "
                "collated batch tensors, and the deterministic Harmony final-channel "
                "extraction regression passes. The consumed TEST split is never a source."
            ),
            "scope": ["training", "experiments", "models", "datasets", "roadmap"],
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
                "DEC-0049 EXP-002 training-contract preparation: assistant-only supervision "
                "proven by token-prefix span proof, 3072-token context chosen from measured "
                "distributions, sealed qualification split created, deterministic Harmony "
                "final-channel extraction regression passing. External launch NOT authorized."
            ),
            "commit": None,
            "commitStatus": "PENDING_CHECKPOINT",
            "commitNote": (
                "Records preparation only. No Kaggle launch, no training, no evaluation and no "
                "promotion is authorized by this revision."
            ),
            "changes": [
                "recorded the EXP-002 governed recipe hash %s" % recipe_hash,
                "recorded the EXP-002 package id %s" % package_id,
                "recorded the rendered notebook sha256 %s" % notebook_sha,
                "chose a 3072-token effective context from measured TRAIN and DEV distributions with zero truncated assistant spans",
                "implemented an explicit assistant-only -100 label mask that fails closed on any unprovable record",
                "governed the identity model's chat template by hash instead of inheriting the loader repository's patched template",
                "pinned the template-injected system-header date to remove representation nondeterminism",
                "created and sealed an EXP-002 qualification split (80 rows) before training",
                "kept the consumed Gold v0.1 TEST split out of every EXP-002 source path",
                "opened BLK-0005 for the absent independent source corpus",
                "did not authorize any Kaggle launch, training, evaluation or promotion",
            ],
        }
    )

    state["experiments"]["GHARIBO-exp-002"] = {
        "id": "GHARIBO-exp-002",
        "status": "EXPERIMENT",
        "baseModel": "openai/gpt-oss-20b",
        "baseModelRevision": "6cee5e81ee83917806bbde320786a8fb61efebee",
        "loaderModelId": "unsloth/gpt-oss-20b",
        "loaderModelRevision": "e220476dc09936adfed96d0451acfa3601c23bd7",
        "datasetVersion": "GHARIBO-Research-Gold-v0.1",
        "datasetSplitSeed": preflight["data"]["splitSeed"],
        "datasetSplitNote": (
            "EXP-002 re-split of Gold v0.1 TRAIN+VALIDATION (720 rows) with seed 20260917; "
            "560 train / 80 dev / 80 sealed qualification. The consumed Gold v0.1 TEST split "
            "is never a source."
        ),
        "method": "QLoRA + SFT",
        "engine": "Unsloth Core",
        "worker": "KaggleTrainingWorker",
        "promotionTarget": "GHARIBO-V1",
        "recipeHash": recipe_hash,
        "packageId": package_id,
        "notebookSha256": notebook_sha,
        "effectiveContextLength": preflight["contextPolicy"]["chosenContextLength"],
        "lossContract": "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
        "preflightVerdict": preflight["verdict"],
        "preflightGateCount": len(preflight["gates"]),
        "trainingAuthorized": False,
        "authorizationDecisionId": None,
        "kernelPushesPerformed": 0,
        "kernelPushesRemaining": 1,
        "evaluationStatus": "NOT_RUN",
        "evaluationScore": None,
        "readinessStatus": "CONTRACT_PREPARED_AWAITING_LAUNCH_AUTHORIZATION",
        "promotable": False,
        "promotionBlockedReason": (
            "Training has not been authorized, no run exists and no evaluation result exists. "
            "Additionally BLK-0005 records that no independent source corpus exists, so any V1 "
            "claim must state that it rests on the sealed EXP-002 qualification split."
        ),
        "qualificationSplit": {
            "rows": preflight["data"]["qualificationRows"],
            "splitHash": preflight["data"]["splitHashes"]["qualification"],
            "policy": "SEALED_UNTIL_V1_PROMOTION_GATE",
        },
        "references": [
            "governance/DEC-0049-exp002-training-contract-preparation.json",
            "data/derived/exp002/preflight.json",
            "data/derived/exp002/package/launch-summary.json",
        ],
    }

    state["models"]["derivedModels"].append(
        {
            "id": "GHARIBO-exp-002",
            "status": "EXPERIMENT",
            "note": (
                "Corrected training contract prepared and gated locally. No training has been "
                "authorized, no run exists and no evaluation has occurred."
            ),
        }
    )

    # The canonical scheme names the first accepted, production-ready model
    # GHARIBO-V1 (docs/MODEL_REGISTRY.md). It is registered here as a RESERVED
    # name only: training completion and even a passing evaluation do not create
    # it, and this revision does not create it either.
    if not any(
        m.get("id") == "GHARIBO-V1" for m in state["models"]["derivedModels"]
    ):
        state["models"]["derivedModels"].append(
            {
                "id": "GHARIBO-V1",
                "status": "NOT_CREATED",
                "note": (
                    "Reserved name for the first accepted, production-ready model. Cannot be "
                    "created without evaluation and explicit promotion (ADR-0008). No "
                    "evaluation result exists, so it stays NOT_CREATED."
                ),
            }
        )

    state["training"]["exp002"] = {
        "status": "CONTRACT_PREPARED_NOT_AUTHORIZED",
        "recipeHash": recipe_hash,
        "packageId": package_id,
        "notebookSha256": notebook_sha,
        "effectiveContextLength": preflight["contextPolicy"]["chosenContextLength"],
        "lossContract": "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
        "preflightVerdict": preflight["verdict"],
        "preflightPath": "data/derived/exp002/preflight.json",
        "trainingAuthorized": False,
        "authorizationPhrase": "AUTHORIZE EXP-002 TRAINING LAUNCH",
        "maximumKernelPushes": 1,
        "kernelPushesPerformed": 0,
        "testPayloadInBundle": False,
        "qualificationPayloadInBundle": False,
    }

    state["blockers"].append(
        {
            "id": "BLK-0005",
            "status": "OPEN",
            "title": "No new independent source corpus exists for an independent V1 benchmark",
            "detail": (
                "The repository has no committed deterministic generator that maps raw UCL "
                "source records to gold examples; the 800 governed examples were sampled during "
                "the M3A session. A genuinely new, previously-unused gold cohort therefore "
                "requires a new governed annotation process. Until it exists, the strongest "
                "available qualification set is the sealed EXP-002 split (80 rows drawn from "
                "Gold v0.1 TRAIN+VALIDATION before training), and any V1 claim must be stated in "
                "those terms rather than as an independent second-corpus benchmark."
            ),
            "blocks": ["V1-PROMOTION"],
            "references": [
                "governance/DEC-0049-exp002-training-contract-preparation.json",
                "data/derived/exp002/splits/split-manifest.json",
                "docs/RESEARCH_BENCHMARK.md",
            ],
        }
    )

    for action in state["nextActions"]:
        if action["id"] == "ACT-0001":
            action["status"] = "COMPLETE"
            action["note"] = (
                "Completed by DEC-0049. The EXP-002 preflight PASSES on measured evidence; the "
                "training package and notebook are prepared; no launch is authorized."
            )
        if action["id"] == "ACT-0002":
            action["status"] = "COMPLETE"
            action["note"] = (
                "Addressed by DEC-0049: the EXP-002 recipe declares dtype float32, matching the "
                "engine-imposed effective dtype, rather than inheriting a declared fp16."
            )

    state["nextActions"].append(
        {
            "id": "ACT-0003",
            "priority": "P0",
            "action": (
                "Await the single explicit human authorization 'AUTHORIZE EXP-002 TRAINING "
                "LAUNCH' before any Kaggle kernel push. The prepared package, notebook and "
                "private training payload are ready; one push is the maximum."
            ),
            "requires": "DEC-0049",
            "references": [
                "governance/DEC-0049-exp002-training-contract-preparation.json",
                "data/derived/exp002/preflight.json",
                "data/derived/exp002/package/launch-summary.json",
            ],
            "status": "BLOCKED_ON_HUMAN_AUTHORIZATION",
            "note": "Zero pushes performed; one available. No training, evaluation or promotion performed.",
        }
    )

    state["nextActions"].append(
        {
            "id": "ACT-0004",
            "priority": "P1",
            "action": (
                "Decide the V1 qualification basis: either commission a new governed gold "
                "annotation process over previously-unused UCL source records, or accept the "
                "sealed EXP-002 qualification split and state the V1 claim in those exact terms."
            ),
            "requires": "BLK-0005",
            "references": [
                "governance/DEC-0049-exp002-training-contract-preparation.json",
                "data/derived/exp002/splits/split-manifest.json",
            ],
            "status": "OPEN",
            "note": "This is the only remaining blocker to an honest V1 claim.",
        }
    )

    state["validation"]["results"].append(
        {
            "gate": "exp002:preflight",
            "command": "node scripts/exp002/build-exp002-preflight.mjs",
            "status": "PASS",
            "exitCode": 0,
            "evidence": (
                "EXP-002 pre-GPU gate PASS: %d/%d gates, 560 TRAIN and 80 DEV rows, zero "
                "assistant spans outside the 3072-token context, zero truncated spans, zero "
                "zero-supervised rows, batch loss contract proven, deterministic Harmony "
                "final-channel extraction regression PASS, no consumed TEST access."
                % (len(preflight["gates"]), len(preflight["gates"]))
            ),
            "verifiedAt": DATE,
        }
    )

    MASTER_STATE.write_text(
        # Preserve the file's existing key order: the master state is
        # hand-maintained in a fixed section order, not sorted.
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print("master state advanced:", previous, "->", NEW_VERSION)

    return 0


if __name__ == "__main__":
    sys.exit(main())
