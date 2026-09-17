#!/usr/bin/env python3
"""
Records DEC-0054: the EXP-002 pilot Version 1 pre-training failure, the dtype
source fix, and the corrected Version 2 relaunch.

Advances the master state to 1.33.0.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MASTER_STATE = REPO_ROOT / "governance/GHARIBO_MASTER_STATE.json"
DECISION_PATH = REPO_ROOT / "governance/DEC-0054-pilot-v1-dtype-failure-and-v2-relaunch.json"

NEW_VERSION = "1.33.0"
DATE = "2026-09-17"

OLD = {
    "pilotPackageId": "067bec301c6af0a2a675e41ba17548a6fb2b8f56b4787010322451b2b6668066",
    "pilotNotebookSha256": "2425a1b38d84d414a858b2eaa4ea1052ebfbc6810413e7ccf58f2f41c8b70599",
    "productionPackageId": "5167db5f48678f79ed836b76070c021988af64874ed72c4f64faef362902d2bc",
    "productionNotebookSha256": "37fe02a39e58f594ee28a6a9793b2d3ca6e05b59f25f21c9e0b54a491fb395f5",
}
NEW = {
    "pilotPackageId": "3d770b8996ed3e7bc460544d374152731e718a6e6339a5dc25332ed4660aaf97",
    "pilotRecipeHash": "d1851753a05a0d2b560ccd8d47b82318fd69261b66aa0e9274f259e67a0e93a3",
    "pilotNotebookSha256": "95ed4d279df02d6fe7f5788faeee2d022cf3377cedc1088026fa251537b4f050",
    "pilotManifestSha256": "b911f37cd5c986a2919475788327ff475a4e2038fe29dda873e1c586f09136e8",
    "productionPackageId": "ff9ab5e5187bf53012107a9a788c29574b2719de5fd496ba8a47d3470a6ddbdd",
    "productionNotebookSha256": "65a50b0e2a4568ca23c4a6e2e5c9be9140ae6591a22a2151a60d45c9e901cbd2",
}


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    decision_core = {
        "decisionId": "DEC-0054",
        "recordKind": "EXP002_PILOT_V1_PRETRAINING_DTYPE_FAILURE_AND_V2_RELAUNCH",
        "recordRevision": 1,
        "recordDate": DATE,
        "status": "V1_RECORDED_AS_PRETRAINING_CONTRACT_FAILURE_V2_PUSHED",
        "authority": "Human authorization to repair the dtype contract at source, rebuild the governed artifacts, validate locally, and push a corrected EXP-002 pilot kernel without stopping for further approval.",
        "decision": (
            "Record GHARIBO-exp-002-pilot Kaggle Version 1 as a REAL PRE-TRAINING CONTRACT FAILURE "
            "caused by a dtype mismatch: the generated package declared dtype=fp16 while the governed "
            "recipe and the notebook both declared float32, so the run aborted on its own assertion "
            "before any training began. Correct the SOURCE OF TRUTH in four places rather than patching "
            "the generated notebook, rebuild every governed artifact, add a fail-closed preflight gate "
            "that compares the dtype the notebook actually receives against the governed recipe, and "
            "push corrected Version 2. No training result, optimizer step or completion evidence is "
            "claimed for Version 1, because none exists."
        ),
        "baselineCommit": "bb163fb48257a94fa8a803d3c91777b751111d4e",
        "version1Failure": {
            "kernelRef": "vokaigharibo/gharibo-exp-002-pilot",
            "kernelVersion": 1,
            "terminalStatus": "KernelWorkerStatus.ERROR",
            "classification": "PRE_TRAINING_CONTRACT_FAILURE",
            "notAClassificationOf": [
                "a failed optimization run",
                "a failed training run",
                "a model-quality result",
            ],
            "hardware": "NVIDIA Tesla T4, sm_75, ~14.6 GB VRAM",
            "failedBefore": "training started",
            "error": (
                "AssertionError: This recipe declares dtype=float32 because the Unsloth gpt-oss path "
                "on Turing refuses fp16. Got: 'fp16'"
            ),
            "observedDtype": "fp16",
            "assertedDtype": "float32",
            "optimizerStepsCompleted": 0,
            "trainingEvidenceProduced": False,
        },
        "rootCause": {
            "summary": "A hardcoded dtype literal in the package builder contradicted the governed recipe.",
            "defectiveSites": [
                {
                    "path": "scripts/exp002/build-exp002-package.ts",
                    "was": 'dtype: "fp16"',
                    "role": "THE INJECTION POINT - the value the notebook actually received",
                },
                {
                    "path": "packages/shared/src/types/training-package.ts",
                    "was": 'dtype: "fp16"',
                    "role": "type literal that made the wrong value the only compilable one",
                },
                {
                    "path": "packages/shared/src/types/training-worker.ts",
                    "was": 'dtype: "fp16"',
                    "role": "worker capability declaration",
                },
                {
                    "path": "apps/web/lib/workers/kaggle/index.ts",
                    "was": 'dtype: "fp16"',
                    "role": "Kaggle worker capability value",
                },
                {
                    "path": "apps/web/lib/training/validate.ts",
                    "was": 'rule 8: dtype must be "fp16"',
                    "role": "validator that would have rejected the correct value",
                },
                {
                    "path": "apps/web/lib/workers/kaggle/notebook.template.ipynb",
                    "was": "selected_dtype = 'fp16' if cap_major < 8 else 'bf16'",
                    "role": "notebook advertised fp16 on a T4, contradicting its own assertion",
                },
            ],
            "whyTheRecipeWasRight": (
                "DEC-0030 recorded a MATERIAL_RUNTIME_DEVIATION for EXP-001: declaredDtype fp16, "
                "effectiveDtype float32, engineImposed true, with engine stdout 'Using float16 "
                "precision for gpt_oss won't work! Using float32' and 'Switching to float32 training "
                "since model cannot work with float16'. The stored adapter is F32 (safetensors header, "
                "96 tensors). float32 is therefore the only honest declaration for this stack."
            ),
        },
        "sourceFix": {
            "principle": "Fix the source of truth and regenerate. The generated notebook was never hand-edited as the primary fix.",
            "changes": [
                "package builder now reads dtype from the governed recipe instead of hardcoding it",
                "TrainingPackage.dtype widened to fp16 | bf16 | float32; loaderModelRevision added and pinned",
                "WorkerCapabilities.dtype widened; Kaggle capability set to float32 with the DEC-0030 rationale",
                "validate.ts rule 8 admits fp16 and float32 and still rejects bf16 (Turing has no bf16 units)",
                "validate.ts rule 9 admits sequence_length 3072 as a measured, allow-listed governed value",
                "notebook hardware cell now reads the dtype from the package and asserts it agrees with the recipe, instead of guessing from compute capability",
                "notebook model-load cell passes the declared dtype explicitly and asserts the engine honoured it",
                "exp002 recipe gains declaredDtype, surfaced as exp002.declared_dtype in the manifest",
            ],
            "newGate": {
                "id": "packageDtypeAgreesAcrossArtifacts",
                "mechanism": (
                    "The preflight PARSES the manifest embedded in the rendered notebook (the exact "
                    "payload the notebook will receive) and requires it to equal the governed recipe "
                    "dtype and the manifest dtype, and requires the notebook's executable code to "
                    "assert the governed dtype and to contain no silent sequence-length downgrade. "
                    "Comments are stripped before the code checks, so documentation cannot mask a defect."
                ),
                "failClosed": True,
                "wouldHaveCaughtVersion1": True,
            },
        },
        "artifactIdentities": {
            "note": "A changed package/notebook hash after a legitimate contract correction is EXPECTED. The recipe hash is unchanged because the recipe was always correct.",
            "recipeHashUnchanged": NEW["pilotRecipeHash"],
            "recipeHashUnchangedReason": (
                "The governed recipe already declared float32. Only the builder that consumed it was "
                "wrong, so the immutable contract identity did not move."
            ),
            "pilot": {
                "packageId": {"old": OLD["pilotPackageId"], "new": NEW["pilotPackageId"]},
                "notebookSha256": {
                    "old": OLD["pilotNotebookSha256"],
                    "new": NEW["pilotNotebookSha256"],
                },
                "manifestSha256": NEW["pilotManifestSha256"],
            },
            "production": {
                "packageId": {"old": OLD["productionPackageId"], "new": NEW["productionPackageId"]},
                "notebookSha256": {
                    "old": OLD["productionNotebookSha256"],
                    "new": NEW["productionNotebookSha256"],
                },
            },
        },
        "kaggleDataset": {
            "id": "vokaigharibo/gharibo-exp-002-pilot-train",
            "recreated": False,
            "reasonNotRecreated": (
                "The remote payload was downloaded and its sha256 recomputed: "
                "0de7275c492f4e3234ee808ba127c41e4bb094a37c4f1e7bf8ba4a5856126151 at 572915 bytes, "
                "identical to the governed local pilot payload. No objective evidence justified recreation."
            ),
            "remoteSha256Verified": "0de7275c492f4e3234ee808ba127c41e4bb094a37c4f1e7bf8ba4a5856126151",
            "bytes": 572915,
            "soleTrainingSource": True,
        },
        "version2Launch": {
            "kernelRef": "vokaigharibo/gharibo-exp-002-pilot",
            "kernelVersion": 2,
            "pushedAt": DATE,
            "observedStatus": "KernelWorkerStatus.RUNNING",
            "metadata": {
                "language": "python",
                "kernelType": "notebook",
                "isPrivate": True,
                "enableGpu": True,
                "enableTpu": False,
                "enableInternet": True,
                "datasetSources": ["vokaigharibo/gharibo-exp-002-pilot-train"],
                "encoding": "UTF-8 without BOM, LF newlines",
            },
            "prePushGates": {"count": 37, "passed": 37, "verdict": "PASS"},
            "bundleContents": ["GHARIBO-exp-002-pilot.ipynb", "kernel-metadata.json"],
            "testPayloadInBundle": False,
            "qualificationPayloadInBundle": False,
            "trainPayloadInBundle": False,
        },
        "preservedContract": {
            "trainRows": 100,
            "contextLength": 3072,
            "dtype": "float32",
            "lossContract": "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
            "ignoreIndex": -100,
            "roleSequence": "system -> user -> assistant",
            "terminator": "<|return|>",
            "optimizerSteps": 25,
            "checkpointPolicy": "save_steps=25, save_total_limit=1, terminal checkpoint only",
            "zeroSupervisionRows": 0,
            "zeroTruncatedAssistantSpans": True,
            "maxAssistantEnd": 2689,
            "statement": (
                "No context, row count, supervision, model, masking quality or target coverage was "
                "reduced. The only change is the honesty of the dtype declaration, which the recipe "
                "already required."
            ),
        },
        "notAuthorizedByThisDecision": [
            "EXP-002 production 560-row training",
            "V1 promotion",
            "evaluation on the sealed qualification split",
            "TEST reuse",
            "paid compute",
            "destructive repository operations",
            "claiming a training result for Version 1",
        ],
        "references": [
            "governance/DEC-0053-kaggle-authorized-compute-host.json",
            "governance/DEC-0052-exp002-runtime-projection-and-pilot.json",
            "governance/DEC-0048-exp001-training-objective-defect.json",
            "data/derived/exp002/preflight.json",
            "data/derived/exp002/package-pilot/launch-summary.json",
            "data/derived/exp002/package-pilot/package-manifest.json",
            "data/derived/exp002/kaggle-pilot/kernel-metadata.json",
            "scripts/exp002/build_kaggle_pilot_bundle.py",
            "scripts/exp002/build-exp002-package.ts",
            "apps/web/lib/training/validate.ts",
            "packages/shared/src/types/training-package.ts",
        ],
        "next": "MONITOR_VERSION_2_AND_VERIFY_ARTIFACTS",
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
    if previous != "1.32.0":
        raise SystemExit("REFUSING: expected master state 1.32.0, found %s" % previous)

    state["masterStateVersion"] = NEW_VERSION
    state["updatedAt"] = DATE

    state["decisions"].append(
        {
            "id": "DEC-0054",
            "date": DATE,
            "title": "EXP-002 pilot V1 dtype failure corrected at source; V2 pushed and RUNNING",
            "status": "ACCEPTED",
            "decision": decision_record["decision"],
            "rationale": (
                "Version 1 aborted on its own dtype assertion before training, so it is a "
                "pre-training contract failure, not a training result. The defect was a hardcoded "
                "fp16 literal in the package builder contradicting the governed recipe, the shared "
                "types, the worker capability and the validator. All six sites were corrected at "
                "source and a fail-closed preflight gate now compares the dtype the notebook "
                "actually receives against the governed recipe."
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
                "DEC-0054 EXP-002 pilot V1 recorded as a pre-training dtype contract failure; the "
                "defect corrected at source in six places; a fail-closed artifact-agreement gate added; "
                "artifacts rebuilt; corrected Kaggle Version 2 pushed and observed RUNNING."
            ),
            "commit": None,
            "commitStatus": "PENDING_CHECKPOINT",
            "commitNote": (
                "Records a repair and a relaunch. No training result is claimed; the pilot remains "
                "non-promotable."
            ),
            "changes": [
                "recorded pilot Kaggle Version 1 as a REAL pre-training contract failure with zero optimizer steps and no training evidence",
                "recorded the dtype root cause across six sites: package builder, shared package type, worker type, worker capability, validator rule 8, and the notebook hardware cell",
                "corrected the source of truth so the package builder reads dtype from the governed recipe",
                "widened the validator to admit float32 while still rejecting bf16 (Turing has no bf16 units)",
                "admitted sequence_length 3072 as a measured, allow-listed governed value",
                "added the fail-closed packageDtypeAgreesAcrossArtifacts preflight gate, which parses the manifest the notebook actually receives",
                "rebuilt the pilot and production packages and recorded old -> new identities; the recipe hash is unchanged because the recipe was always correct",
                "verified the remote Kaggle Dataset by downloading and re-hashing it; not recreated",
                "passed 37/37 pre-push gates and pushed corrected kernel Version 2",
                "recorded Version 2 as RUNNING; no training result, promotion or V1 claim is made",
            ],
        }
    )

    t = state["training"]["exp002"]
    t["status"] = "PILOT_V2_RUNNING"
    t["pilot"]["packageId"] = NEW["pilotPackageId"]
    t["pilot"]["notebookSha256"] = NEW["pilotNotebookSha256"]
    t["pilot"]["kernelVersion"] = 2
    t["pilot"]["kernelRef"] = "vokaigharibo/gharibo-exp-002-pilot"
    t["pilot"]["kernelPushesPerformed"] = 1
    t["pilot"]["observedStatus"] = "KernelWorkerStatus.RUNNING"
    t["pilot"]["version1"] = {
        "kernelVersion": 1,
        "terminalStatus": "KernelWorkerStatus.ERROR",
        "classification": "PRE_TRAINING_CONTRACT_FAILURE",
        "optimizerStepsCompleted": 0,
        "trainingEvidenceProduced": False,
    }
    t["production"]["packageId"] = NEW["productionPackageId"]
    t["production"]["notebookSha256"] = NEW["productionNotebookSha256"]

    e = state["experiments"]["GHARIBO-exp-002"]
    e["readinessStatus"] = "PILOT_V2_RUNNING"
    e["pilotPackageId"] = NEW["pilotPackageId"]
    e["productionPackageId"] = NEW["productionPackageId"]
    e["evaluationStatus"] = "NOT_RUN"
    e["evaluationScore"] = None
    e["promotable"] = False

    state["validation"]["results"].append(
        {
            "gate": "exp002:pilot-kaggle-bundle",
            "command": "python scripts/exp002/build_kaggle_pilot_bundle.py",
            "status": "PASS",
            "exitCode": 0,
            "evidence": (
                "37/37 pre-push gates green. Verified: 100 train rows, train sha256 "
                "0de7275c...6151 at 572915 bytes matching the remote dataset, delivered dtype "
                "float32 agreeing with the recipe and the manifest, context 3072 with no silent "
                "downgrade in executable code, explicit assistant-only mask with fail-closed zero "
                "supervision, checkpoint policy matching 25 steps, TEST and qualification absent, "
                "no credential-shaped strings, metadata UTF-8 without BOM with LF newlines, GPU on, "
                "TPU off, internet on, kernel private, dataset source governed."
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
