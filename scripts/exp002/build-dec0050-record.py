#!/usr/bin/env python3
"""
Records DEC-0050 (LOCAL-ONLY execution policy + local hardware infeasibility) and
advances the master state to 1.29.0.

Supersedes every pending governance statement that treated a Kaggle launch as the
next action. Nothing here authorizes training anywhere.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MASTER_STATE = REPO_ROOT / "governance/GHARIBO_MASTER_STATE.json"
DECISION_PATH = REPO_ROOT / "governance/DEC-0050-local-only-execution-policy.json"
HW_PATH = REPO_ROOT / "data/derived/exp002/local-hardware-qualification.json"
PREFLIGHT_PATH = REPO_ROOT / "data/derived/exp002/preflight.json"

NEW_VERSION = "1.29.0"
DATE = "2026-09-17"


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    hw = json.loads(HW_PATH.read_text(encoding="utf-8"))
    preflight = json.loads(PREFLIGHT_PATH.read_text(encoding="utf-8"))

    if hw["trainingFeasibility"]["verdict"] != "NO":
        raise SystemExit(
            "REFUSING: this record documents local hardware INFEASIBILITY, but the "
            "qualification artifact reports %s" % hw["trainingFeasibility"]["verdict"]
        )

    decision_core = {
        "decisionId": "DEC-0050",
        "recordKind": "EXECUTION_POLICY_LOCAL_ONLY_AND_LOCAL_HARDWARE_QUALIFICATION",
        "recordRevision": 1,
        "recordDate": DATE,
        "status": "LOCAL_ONLY_POLICY_ACCEPTED_EXP002_BLOCKED_ON_LOCAL_HARDWARE",
        "authority": "Explicit human correction: EXP-002 training, evaluation, qualification, scoring and runtime validation are LOCAL ONLY. Kaggle is no longer an authorized compute path.",
        "decision": (
            "Adopt LOCAL ONLY as the binding execution policy for GHARIBO-exp-002 and supersede "
            "every pending governance statement that treated a Kaggle kernel launch as the next "
            "action, including the DEC-0049 externalLaunch authorization block and next-action "
            "ACT-0003. Accept the local hardware qualification finding that the governed EXP-002 "
            "recipe CANNOT execute on the current machine, because the available GPU is a "
            "GeForce GT 730 (GK208, sm_35) behind a 2018 driver with 1-4 GB of DDR3. No part of "
            "the training contract was reduced, and no training was started."
        ),
        "baselineCommit": "bb163fb48257a94fa8a803d3c91777b751111d4e",
        "experimentId": "GHARIBO-exp-002",
        "executionPolicy": {
            "training": "LOCAL_ONLY",
            "evaluation": "LOCAL_ONLY",
            "qualificationHoldout": "LOCAL_ONLY",
            "scoring": "LOCAL_ONLY",
            "runtimeValidation": "LOCAL_ONLY",
            "uiIntegration": "LOCAL_ONLY",
            "kaggleAuthorized": False,
            "supersedes": [
                "DEC-0049.externalLaunch (Kaggle launch authorization gate)",
                "nextAction ACT-0003 (await AUTHORIZE EXP-002 TRAINING LAUNCH)",
                "master state training.exp002.authorizationPhrase",
            ],
        },
        "localHardware": {
            "artifact": "data/derived/exp002/local-hardware-qualification.json",
            "gpu": "NVIDIA GeForce GT 730",
            "chip": hw["derivedHardware"]["gpu"]["chip"],
            "vendorDeviceId": hw["derivedHardware"]["gpu"]["vendorDeviceId"],
            "computeCapability": hw["derivedHardware"]["gpu"]["computeCapability"],
            "sm": hw["derivedHardware"]["gpu"]["sm"],
            "driver": "391.35 (2018-03)",
            "cudaToolkitInstalled": False,
            "nvidiaSmiFunctional": False,
            "cpu": "Intel(R) Core(TM) i5-10500 (6C/12T @3.10GHz)",
            "totalRamGiB": hw["probes"]["system"]["totalRamGiB"],
            "freePhysicalRamGiB": hw["probes"]["system"]["freePhysicalRamGiB"],
            "diskFreeGiB": {
                "C:": hw["probes"]["system"]["disks"][0]["freeGiB"],
                "D:": hw["probes"]["system"]["disks"][1]["freeGiB"],
            },
            "usableCudaDevice": False,
        },
        "infeasibility": {
            "verdict": "NO",
            "fatalBlockerCount": hw["fatalBlockerCount"],
            "fatalBlockers": [
                {
                    "id": b["id"],
                    "blocker": b["blocker"],
                    "observed": b["observed"],
                    "required": b["required"],
                }
                for b in hw["blockers"]
                if b["fatal"]
            ],
            "estimatedRequirement": {
                "vramGbMinimum": hw["governedRequirement"]["vramGbMinimum"],
                "vramGbRecommended": hw["governedRequirement"]["vramGbRecommended"],
                "computeCapabilityMinimum": "7.0 (Turing or newer) so Triton is supported",
                "driverMinimumWindows": "452.xx for the CUDA 11.8 runtime PyTorch 2.x links",
                "measuredSource": hw["governedRequirement"]["measuredRequirementSource"],
            },
        },
        "hardRuleCompliance": hw["hardRuleCompliance"],
        "alternatives": [
            {
                "id": a["id"],
                "title": a["title"],
                "recipeImpact": a["recipeImpact"],
                "assessment": a["assessment"],
            }
            for a in hw["alternatives"]
        ],
        "recommendedAlternative": hw["recommendedAlternative"],
        "recommendedAlternativeStatement": (
            "Add a local GPU meeting the governed floor (>= 16 GB VRAM, compute capability "
            ">= 7.0, a driver new enough for CUDA 11.8+). It is the only option that preserves "
            "the governed training contract exactly, so it does not reopen the DEC-0048 defect "
            "class. Swapping the base model is a MATERIAL recipe change (new tokenizer, new chat "
            "template, new Harmony channel contract) and requires its own evidence and "
            "governance before any training."
        ),
        "qualificationHoldout": hw["holdoutPolicy"],
        "unchangedByThisDecision": {
            "recipeHash": preflight["recipeHash"],
            "preflightVerdict": preflight["verdict"],
            "preflightGateCount": len(preflight["gates"]),
            "contextLength": preflight["contextPolicy"]["chosenContextLength"],
            "lossContract": "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
            "trainRows": preflight["data"]["trainRows"],
            "devRows": preflight["data"]["devRows"],
            "statement": (
                "The prepared EXP-002 contract is NOT discarded and NOT weakened. Every "
                "measured artifact, the governed chat template, the assistant-only loss proof, "
                "the sealed qualification split and the local preflight PASS all remain valid "
                "and are the contract a future local GPU must execute unchanged."
            ),
        },
        "notAuthorizedByThisDecision": [
            "any training execution",
            "any evaluation",
            "opening or scoring the sealed qualification split",
            "any model promotion",
            "GHARIBO-V1 creation",
            "any Kaggle kernel push",
            "any remote or paid compute",
        ],
        "references": [
            "governance/DEC-0049-exp002-training-contract-preparation.json",
            "governance/DEC-0048-exp001-training-objective-defect.json",
            "data/derived/exp002/local-hardware-qualification.json",
            "data/derived/exp002/preflight.json",
            "data/derived/exp002/splits/split-manifest.json",
            "docs/TRAINING_STRATEGY.md",
            "docs/MODEL_REGISTRY.md",
        ],
        "next": "LOCAL_HARDWARE_REQUIRED_OR_GOVERNED_RECIPE_CHANGE",
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
    if previous != "1.28.0":
        raise SystemExit("REFUSING: expected master state 1.28.0, found %s" % previous)

    state["masterStateVersion"] = NEW_VERSION
    state["updatedAt"] = DATE

    state["decisions"].append(
        {
            "id": "DEC-0050",
            "date": DATE,
            "title": "Adopt LOCAL ONLY execution policy; EXP-002 blocked on local hardware",
            "status": "ACCEPTED",
            "decision": decision_record["decision"],
            "rationale": (
                "The local machine's only NVIDIA device is a GeForce GT 730 (GK208, sm_35) "
                "behind driver 391.35 with 1-4 GB DDR3. That is below the compute-capability "
                "floor of every PyTorch 2.x CUDA build, below Triton's sm_70 floor, below the "
                "CUDA 11.8 driver floor, and far below the 14 GB VRAM floor measured for "
                "gpt-oss-20b 4-bit QLoRA. Each is independently fatal, so the governed recipe "
                "cannot run locally without reducing the contract, which is forbidden."
            ),
            "scope": ["training", "experiments", "models", "roadmap"],
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
                "DEC-0050 LOCAL ONLY execution policy: Kaggle is no longer an authorized "
                "compute path, every pending Kaggle-launch next-action is superseded, and the "
                "local hardware qualification reports the governed EXP-002 recipe CANNOT "
                "execute on this machine (GT 730 sm_35, 2018 driver, 1-4 GB VRAM). No contract "
                "was reduced and no training was started."
            ),
            "commit": None,
            "commitStatus": "PENDING_CHECKPOINT",
            "commitNote": (
                "Records a policy change and a hardware determination only. Nothing is "
                "authorized to run."
            ),
            "changes": [
                "adopted LOCAL ONLY for training, evaluation, qualification, scoring, runtime validation and UI integration",
                "superseded the DEC-0049 Kaggle launch authorization block and next-action ACT-0003",
                "recorded the exact local hardware: GeForce GT 730 (GK208, sm_35), driver 391.35, 1-4 GB DDR3, i5-10500, 35.75 GiB RAM, 180 GiB free on C:",
                "recorded three independent fatal blockers: compute capability below the PyTorch/Triton floor, driver CUDA ceiling below the PyTorch 2.x floor, and a 3.5x-14x VRAM shortfall",
                "recorded that no context length, model, dataset, supervision, precision, target coverage or loss contract was reduced",
                "preserved the prepared EXP-002 contract, its preflight PASS and its sealed qualification split unchanged",
                "opened BLK-0006 for the local hardware shortfall",
            ],
        }
    )

    exp = state["experiments"]["GHARIBO-exp-002"]
    exp["readinessStatus"] = "BLOCKED_LOCAL_HARDWARE_INFEASIBLE"
    exp["trainingAuthorized"] = False
    exp["evaluationStatus"] = "NOT_RUN"
    exp["evaluationScore"] = None
    exp["promotable"] = False
    exp["executionPolicy"] = "LOCAL_ONLY"
    exp["localHardwareVerdict"] = "NO"
    exp["localHardwareArtifact"] = "data/derived/exp002/local-hardware-qualification.json"
    exp["promotionBlockedReason"] = (
        "DEC-0050: the governed recipe cannot execute on the local hardware, so no run and no "
        "evaluation result exists. Additionally BLK-0005 records that no independent source "
        "corpus exists, so any future V1 claim must state that it rests on the sealed EXP-002 "
        "qualification split."
    )

    training = state["training"]["exp002"]
    training["status"] = "BLOCKED_LOCAL_HARDWARE_INFEASIBLE"
    training["executionPolicy"] = "LOCAL_ONLY"
    training["trainingAuthorized"] = False
    training["localHardwareVerdict"] = "NO"
    training["localHardwareArtifact"] = "data/derived/exp002/local-hardware-qualification.json"
    training["kaggleAuthorized"] = False
    # Supersede every Kaggle-launch field so no reader can mistake a launch for
    # the next action.
    training.pop("authorizationPhrase", None)
    training.pop("maximumKernelPushes", None)
    training.pop("kernelPushesPerformed", None)
    training["supersededNextAction"] = (
        "ACT-0003 (await 'AUTHORIZE EXP-002 TRAINING LAUNCH') is superseded by DEC-0050. "
        "There is no Kaggle authorization gate."
    )

    state["blockers"].append(
        {
            "id": "BLK-0006",
            "status": "OPEN",
            "title": "Local hardware cannot execute the governed EXP-002 recipe",
            "detail": (
                "The only NVIDIA device on this machine is a GeForce GT 730 (GK208, PCI "
                "10DE:0F02, compute capability 3.5 / sm_35) behind driver 391.35 from 2018, "
                "with 1-4 GB of DDR3. Three independent fatal blockers apply: sm_35 is below "
                "the sm_50 floor of every PyTorch 2.x CUDA wheel and below Triton's sm_70 "
                "floor; driver 391.35 caps CUDA at 9.1 while PyTorch 2.x links CUDA 11.8+; and "
                "1-4 GB VRAM is 3.5x to 14x below the measured 14 GB floor for gpt-oss-20b "
                "4-bit QLoRA. CPU-only execution is infeasible as well: the 4-bit weights alone "
                "(~12 GB) would consume essentially all 13.38 GiB of free RAM before any "
                "activation, and ~810K tokens per epoch through a 21B-parameter MoE on 6 cores "
                "is tens to hundreds of hours. Nothing was reduced to make it fit."
            ),
            "blocks": ["STAGE-1", "V1-PROMOTION"],
            "references": [
                "governance/DEC-0050-local-only-execution-policy.json",
                "data/derived/exp002/local-hardware-qualification.json",
            ],
        }
    )

    for action in state["nextActions"]:
        if action["id"] == "ACT-0003":
            action["status"] = "SUPERSEDED"
            action["supersededBy"] = "DEC-0050"
            # The action TEXT is rewritten too, not just the status: leaving a
            # pending-sounding Kaggle instruction in the record would let a reader
            # mistake a launch for the next action.
            action["action"] = (
                "SUPERSEDED by DEC-0050. There is no Kaggle launch gate and no "
                "authorization phrase to await: Kaggle is not an authorized compute path "
                "for EXP-002. Retained here only so the supersession is auditable."
            )
            action["requires"] = "DEC-0050"
            action["references"] = [
                "governance/DEC-0050-local-only-execution-policy.json",
                "data/derived/exp002/local-hardware-qualification.json",
            ]
            action["note"] = (
                "Superseded by DEC-0050. The prepared EXP-002 package, notebook and payload "
                "remain valid but unexecutable on the current local hardware (BLK-0006)."
            )

    state["nextActions"].append(
        {
            "id": "ACT-0005",
            "priority": "P0",
            "action": (
                "Provide local compute that meets the governed floor, or authorize a governed "
                "recipe change. Fastest valid path: a local GPU with >= 16 GB VRAM, compute "
                "capability >= 7.0 and a driver new enough for CUDA 11.8+, which runs the "
                "prepared EXP-002 contract unchanged. A base-model swap is a MATERIAL change "
                "requiring new evidence and a new preflight before any training."
            ),
            "requires": "BLK-0006",
            "references": [
                "governance/DEC-0050-local-only-execution-policy.json",
                "data/derived/exp002/local-hardware-qualification.json",
                "data/derived/exp002/preflight.json",
            ],
            "status": "OPEN",
            "note": (
                "No training, evaluation or promotion is authorized. The prepared contract and "
                "the sealed qualification split are preserved unchanged."
            ),
        }
    )

    state["validation"]["results"].append(
        {
            "gate": "exp002:local-hardware",
            "command": "python scripts/exp002/build-local-hardware-qualification.py",
            "status": "PASS",
            "exitCode": 0,
            "evidence": (
                "Local hardware qualification recorded: GeForce GT 730 (GK208, sm_35), driver "
                "391.35, 1-4 GB DDR3, i5-10500, 35.75 GiB RAM. Training feasibility verdict NO "
                "with 3 fatal blockers. No context length, model, dataset, supervision, "
                "precision, target coverage or loss contract was reduced; no training started."
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
