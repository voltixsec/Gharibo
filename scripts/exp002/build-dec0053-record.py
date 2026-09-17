#!/usr/bin/env python3
"""
Records DEC-0053: Kaggle is the authorized compute host for EXP-002 training.

Supersedes the part of DEC-0050 that restricted compute to local hardware, and
re-scopes BLK-0006 so it no longer blocks training. Preserves the corrected
EXP-002 contract in full, and keeps evaluation, scoring and the sealed holdout
local.

Advances the master state to 1.32.0. Authorizes nothing to run.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MASTER_STATE = REPO_ROOT / "governance/GHARIBO_MASTER_STATE.json"
DECISION_PATH = REPO_ROOT / "governance/DEC-0053-kaggle-authorized-compute-host.json"
PILOT_SUMMARY = REPO_ROOT / "data/derived/exp002/package-pilot/launch-summary.json"
PROD_SUMMARY = REPO_ROOT / "data/derived/exp002/package-production/launch-summary.json"

NEW_VERSION = "1.32.0"
DATE = "2026-09-17"


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    pilot = json.loads(PILOT_SUMMARY.read_text(encoding="utf-8"))
    prod = json.loads(PROD_SUMMARY.read_text(encoding="utf-8"))

    for name, summary in (("pilot", pilot), ("production", prod)):
        if not summary["testAbsent"] or not summary["qualificationAbsent"]:
            raise SystemExit(
                "REFUSING: the %s payload contains the consumed TEST or the sealed "
                "qualification split." % name
            )

    decision_core = {
        "decisionId": "DEC-0053",
        "recordKind": "KAGGLE_AUTHORIZED_COMPUTE_HOST_FOR_EXP002_TRAINING",
        "recordRevision": 1,
        "recordDate": DATE,
        "status": "KAGGLE_AUTHORIZED_AS_TRAINING_COMPUTE_LOCAL_EVALUATION_PRESERVED",
        "authority": "Explicit human policy correction: Kaggle T4-class GPU is the authorized execution device for EXP-002 training; local GPU hardware must not be required.",
        "decision": (
            "Authorize Kaggle T4-class GPU as the compute host for EXP-002 training, superseding the "
            "part of DEC-0050 that restricted execution to local hardware. BLK-0006 is re-scoped: the "
            "local machine still cannot train, but local capability is no longer a requirement, so the "
            "blocker no longer blocks training. The governed 100-row PILOT runs first for end-to-end "
            "pipeline validation and is non-promotable with no V1 claim; the governed 560-row PRODUCTION "
            "run follows only if the pilot completes and every artifact and integrity check passes. The "
            "corrected EXP-002 contract is preserved unchanged. Kaggle is COMPUTE ONLY: the evaluation "
            "controller, all scoring, and the gold and qualification answers remain local. Nothing is "
            "authorized to run by this decision."
        ),
        "baselineCommit": "bb163fb48257a94fa8a803d3c91777b751111d4e",
        "computePolicy": {
            "trainingCompute": "KAGGLE_T4_CLASS",
            "accelerator": "NVIDIA Tesla T4 (Turing, sm_75), 16 GB",
            "worker": "KaggleTrainingWorker",
            "localGpuRequired": False,
            "runtimeMayLaterAlsoBeKaggle": True,
            "evaluationController": "LOCAL",
            "scoring": "LOCAL",
            "goldAndQualificationAnswers": "LOCAL",
            "holdoutUploadedToKaggle": False,
            "consumedTestUploadedToKaggle": False,
            "supersedes": [
                "DEC-0050 executionPolicy.training (LOCAL_ONLY)",
                "DEC-0050 blocker BLK-0006 blocks[] entry for training",
            ],
        },
        "preservedContract": {
            "contextLength": 3072,
            "silentDowngrade": False,
            "governedChatTemplateSha256": "a4c9919cbbd4acdd51ccffe22da049264b1b73e59055fa58811a99efbd7c8146",
            "governedChatTemplateSetExplicitly": True,
            "lossContract": "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
            "assistantOnlyMaskProvenByTokenPrefix": True,
            "zeroSupervisionRows": 0,
            "zeroTruncatedAssistantSpans": True,
            "sealedQualificationHoldoutUploaded": False,
            "consumedTestUsedForTuning": False,
            "roleSequence": "system -> user -> assistant",
            "terminator": "<|return|>",
            "pinnedSystemDate": "2026-09-15",
            "statement": (
                "The corrected EXP-002 contract is preserved in full. Only the compute host changed. "
                "The pilot and the production run use the SAME representation, template, loss contract "
                "and context length; only the row count, checkpoint cadence and projected runtime differ."
            ),
        },
        "pilotPackage": {
            "experimentId": pilot["experimentId"],
            "mode": "pilot",
            "rows": pilot["datasetIdentities"]["splits"]["train"]["rows"],
            "splitHash": pilot["datasetIdentities"]["splits"]["train"]["splitHash"],
            "packageId": pilot["packageId"],
            "recipeHash": pilot["recipeHash"],
            "notebookFilename": pilot["notebook"]["filename"],
            "notebookSha256": pilot["notebook"]["sha256"],
            "manifestSha256": pilot["packageManifestSha256"],
            "payloadFiles": [f["name"] for f in pilot["datasetIdentities"]["payloadFiles"]],
            "projectedHours": 0.61,
            "promotable": False,
            "v1Claim": False,
            "purpose": "End-to-end pipeline validation only.",
            "checkpointPolicy": "save_steps=25, save_total_limit=1, terminal checkpoint only",
            "verification": (
                "The rendered notebook's representation cells were executed against the real pilot "
                "payload: 100 examples built, 54,317 supervised tokens, 90,696 masked tokens, max "
                "assistant end 2689 of 3072, minimum 300 supervised tokens per row, zero truncated "
                "assistant spans, zero zero-supervision rows. Verdict PASS."
            ),
        },
        "productionPackage": {
            "experimentId": prod["experimentId"],
            "mode": "production",
            "rows": prod["datasetIdentities"]["splits"]["train"]["rows"],
            "devRows": prod["datasetIdentities"]["splits"]["dev"]["rows"],
            "splitHash": prod["datasetIdentities"]["splits"]["train"]["splitHash"],
            "packageId": prod["packageId"],
            "recipeHash": prod["recipeHash"],
            "notebookFilename": prod["notebook"]["filename"],
            "notebookSha256": prod["notebook"]["sha256"],
            "manifestSha256": prod["packageManifestSha256"],
            "payloadFiles": [f["name"] for f in prod["datasetIdentities"]["payloadFiles"]],
            "projectedHours": 3.07,
            "hardStopHours": 4.0,
            "promotable": False,
            "gatedOnPilot": True,
        },
        "artifactHashSupersession": {
            "note": (
                "DEC-0049 recorded a notebook sha256 of 03850abeee72c5f87d75d30cfeb745decfaed7a09d03150fbaefed42f14e47a3 "
                "for the production package. The package was subsequently REBUILT by the mode-aware builder "
                "(the datasetVersion label and the mode fields changed the manifest), so the current production "
                "notebook hash is %s. The CONTRACT is unchanged and its recipe hash is identical "
                "(%s); only the rendered artifact hash moved. DEC-0049 is left intact as history."
                % (prod["notebook"]["sha256"], prod["recipeHash"])
            ),
            "contractChanged": False,
            "recipeHashUnchanged": prod["recipeHash"],
        },
        "kaggleDatasetIds": {
            "status": "NOT_YET_CREATED",
            "detail": (
                "The repository records no Kaggle Dataset slug. The governed payload travels inside the "
                "launch bundle as dataset/train.jsonl (and dataset/dev.jsonl for production), and the "
                "notebook locates it under /kaggle/working/dataset or recursively under /kaggle/input. "
                "If the payload is attached as a private Kaggle Dataset instead, its slug must be created "
                "at push time and recorded; no slug is invented here."
            ),
            "exp001KernelRef": "vokaigharibo/gharibo-exp-001-kaggle-start-fec22ca2",
            "exp001Accelerator": "NvidiaTeslaT4",
        },
        "launchSequence": [
            "1. Push the PILOT kernel only. Maximum one push.",
            "2. Verify the pilot artifacts: adapter, metrics, manifest, loss-contract evidence, CHECKSUMS rollup.",
            "3. Verify zero truncation, zero zero-supervision rows, and that no TEST or qualification payload was present.",
            "4. Only then push the PRODUCTION kernel.",
            "5. Evaluation and scoring remain local; the sealed qualification split is not uploaded.",
        ],
        "notAuthorizedByThisDecision": [
            "any kernel push",
            "any training execution, pilot or production",
            "any evaluation run",
            "uploading the sealed qualification split",
            "uploading the consumed TEST split",
            "any model promotion",
            "GHARIBO-V1 creation",
        ],
        "references": [
            "governance/DEC-0052-exp002-runtime-projection-and-pilot.json",
            "governance/DEC-0051-local-runtime-and-evaluation-contract.json",
            "governance/DEC-0050-local-only-execution-policy.json",
            "governance/DEC-0049-exp002-training-contract-preparation.json",
            "data/derived/exp002/package-pilot/launch-summary.json",
            "data/derived/exp002/package-production/launch-summary.json",
            "data/derived/exp002/runtime-projection.json",
            "data/derived/exp002/preflight.json",
            "data/derived/exp002/splits/pilot-manifest.json",
        ],
        "next": "AWAIT_EXPLICIT_PILOT_LAUNCH_AUTHORIZATION",
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
    if previous != "1.31.0":
        raise SystemExit("REFUSING: expected master state 1.31.0, found %s" % previous)

    state["masterStateVersion"] = NEW_VERSION
    state["updatedAt"] = DATE

    state["decisions"].append(
        {
            "id": "DEC-0053",
            "date": DATE,
            "title": "Kaggle authorized as the EXP-002 training compute host",
            "status": "ACCEPTED",
            "decision": decision_record["decision"],
            "rationale": (
                "The local machine has no usable CUDA device, but the governed contract does not depend "
                "on WHERE it runs. Kaggle T4-class hardware is the device the EXP-001 timing baseline was "
                "measured on, so the runtime projection applies to it directly. Re-scoping the compute "
                "host rather than the contract preserves every corrected property of EXP-002 and keeps "
                "evaluation, scoring and the sealed holdout local."
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
                "DEC-0053 Kaggle T4 authorized as the EXP-002 training compute host, superseding the "
                "DEC-0050 local-hardware restriction and re-scoping BLK-0006 so it no longer blocks "
                "training. Pilot (100 rows, 0.61 h) and production (560 rows, 3.07 h) packages prepared. "
                "Evaluation, scoring and the sealed holdout remain local. Nothing authorized to run."
            ),
            "commit": None,
            "commitStatus": "PENDING_CHECKPOINT",
            "commitNote": "Records a compute-host policy correction and prepared packages only.",
            "changes": [
                "authorized Kaggle T4-class GPU as the EXP-002 training compute host",
                "superseded DEC-0050's LOCAL_ONLY training restriction and removed BLK-0006 from the training block path",
                "re-scoped BLK-0006 to record that local training is unavailable but not required",
                "prepared the governed 100-row PILOT package (non-promotable, no V1 claim)",
                "prepared the governed 560-row PRODUCTION package, gated on a successful pilot",
                "preserved the corrected contract: context 3072, no silent downgrade, governed template, explicit response-only masking, zero zero-supervision rows",
                "kept evaluation, scoring and the gold/qualification answers local; neither the sealed holdout nor the consumed TEST split is uploaded",
                "recorded that the production notebook hash moved on rebuild while the recipe hash is unchanged",
                "recorded that no Kaggle Dataset slug exists and none was invented",
            ],
        }
    )

    t = state["training"]["exp002"]
    t["executionPolicy"] = "KAGGLE_TRAINING_LOCAL_EVALUATION"
    t["computeHost"] = "KAGGLE_T4_CLASS"
    t["localGpuRequired"] = False
    t["kaggleAuthorized"] = True
    t["status"] = "PILOT_PACKAGE_PREPARED_AWAITING_LAUNCH_AUTHORIZATION"
    t["pilot"] = {
        "experimentId": pilot["experimentId"],
        "packageId": pilot["packageId"],
        "recipeHash": pilot["recipeHash"],
        "notebookSha256": pilot["notebook"]["sha256"],
        "rows": pilot["datasetIdentities"]["splits"]["train"]["rows"],
        "splitHash": pilot["datasetIdentities"]["splits"]["train"]["splitHash"],
        "projectedHours": 0.61,
        "promotable": False,
        "trainingAuthorized": False,
        "kernelPushesPerformed": 0,
    }
    t["production"] = {
        "experimentId": prod["experimentId"],
        "packageId": prod["packageId"],
        "recipeHash": prod["recipeHash"],
        "notebookSha256": prod["notebook"]["sha256"],
        "rows": prod["datasetIdentities"]["splits"]["train"]["rows"],
        "splitHash": prod["datasetIdentities"]["splits"]["train"]["splitHash"],
        "projectedHours": 3.07,
        "hardStopHours": 4.0,
        "gatedOnPilot": True,
        "trainingAuthorized": False,
        "kernelPushesPerformed": 0,
    }
    t["supersededNextAction"] = (
        "The DEC-0050 'no local compute' block is superseded by DEC-0053. Kaggle T4 is the "
        "authorized training host; local hardware is not required."
    )

    e = state["experiments"]["GHARIBO-exp-002"]
    e["executionPolicy"] = "KAGGLE_TRAINING_LOCAL_EVALUATION"
    e["computeHost"] = "KAGGLE_T4_CLASS"
    e["readinessStatus"] = "PILOT_PACKAGE_PREPARED_AWAITING_LAUNCH_AUTHORIZATION"
    e["pilotPackageId"] = pilot["packageId"]
    e["productionPackageId"] = prod["packageId"]
    e["promotionBlockedReason"] = (
        "No training has run and no evaluation result exists. A pilot adapter is non-promotable by "
        "construction. Additionally BLK-0005 records that no independent source corpus exists, so any "
        "V1 claim must state that it rests on the sealed EXP-002 qualification split."
    )

    for blocker in state["blockers"]:
        if blocker.get("id") == "BLK-0006":
            blocker["status"] = "RE_SCOPED_NOT_BLOCKING"
            blocker["blocks"] = []
            blocker["title"] = "Local hardware cannot execute the governed EXP-002 recipe (not blocking)"
            blocker["detail"] = (
                "The only NVIDIA device on this machine is a GeForce GT 730 (GK208, sm_35) behind driver "
                "391.35 with 1-4 GB of DDR3, below the compute-capability, driver and VRAM floors of the "
                "governed stack. DEC-0053 authorizes Kaggle T4-class hardware as the training compute host, "
                "so local capability is no longer a requirement and this issue no longer blocks training. "
                "It remains recorded because it is still true of the local machine."
            )

    state["validation"]["results"].append(
        {
            "gate": "exp002:pilot-package",
            "command": "npx vite-node scripts/exp002/build-exp002-package.ts --mode=pilot",
            "status": "PASS",
            "exitCode": 0,
            "evidence": (
                "Pilot package built: 100 rows, splitHash b8250d98..., packageId %s. The rendered "
                "notebook's representation cells were executed against the real pilot payload and passed: "
                "100 examples, 54,317 supervised tokens, 90,696 masked, max assistant end 2689/3072, "
                "min 300 supervised per row, zero truncated spans, zero zero-supervision rows. TEST and "
                "qualification payloads absent." % pilot["packageId"]
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
