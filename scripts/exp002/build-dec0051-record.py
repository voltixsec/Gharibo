#!/usr/bin/env python3
"""
Records DEC-0051: the local GHARIBO V1 runtime/provider contract, the local
evaluation controller, and the final-channel guard wired into the chat path.

Advances the master state to 1.30.0. Authorizes nothing to run.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MASTER_STATE = REPO_ROOT / "governance/GHARIBO_MASTER_STATE.json"
DECISION_PATH = REPO_ROOT / "governance/DEC-0051-local-runtime-and-evaluation-contract.json"

NEW_VERSION = "1.30.0"
DATE = "2026-09-17"


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    decision_core = {
        "decisionId": "DEC-0051",
        "recordKind": "LOCAL_RUNTIME_CONTRACT_AND_EVALUATION_CONTROLLER",
        "recordRevision": 1,
        "recordDate": DATE,
        "status": "RUNTIME_CONTRACT_AND_EVAL_CONTROLLER_COMPLETE_NOTHING_AUTHORIZED_TO_RUN",
        "authority": "Mission instruction to complete the V1 runtime/provider contract, the local evaluation controller and the UI integration locally, without GPU execution.",
        "decision": (
            "Accept the local GHARIBO V1 runtime contract and the local evaluation controller. "
            "The runtime is addressed as a provider-neutral OpenAI-compatible endpoint configured "
            "entirely from environment variable references, so model identity is independent of "
            "its host. Every answer passes through deterministic final-channel extraction before "
            "it can leave the server, so Harmony analysis can never reach a user or a scorer. "
            "Health is a real network probe that never reports ready from configuration alone. "
            "The evaluation controller keeps the sealed qualification payload and all gold answers "
            "local, refuses to open the sealed split without an explicit flag, and emits no "
            "placeholder score. Nothing is authorized to run."
        ),
        "baselineCommit": "bb163fb48257a94fa8a803d3c91777b751111d4e",
        "executionPolicy": "LOCAL_ONLY",
        "runtimeContract": {
            "module": "apps/web/lib/runtime/gharibo-v1.mjs",
            "extractionModule": "apps/web/lib/runtime/harmony-final.mjs",
            "statusEndpoint": "apps/web/app/api/runtime/v1/route.ts",
            "modelIdentity": "GHARIBO-V1",
            "providerNeutral": True,
            "hostingBinding": "NONE - configured from environment only",
            "configuration": {
                "baseUrl": "GHARIBO_V1_BASE_URL",
                "apiKeyRef": "GHARIBO_V1_API_KEY_REF",
                "modelId": "GHARIBO_V1_MODEL_ID",
            },
            "secretPolicy": (
                "The credential is held as an environment variable NAME. A literal credential in "
                "the reference slot is rejected outright, and only a redacted descriptor "
                "(host, model id, reference name) may cross a client boundary."
            ),
            "healthPolicy": (
                "ONLINE is returned only after a real 2xx probe of /v1/models. Configuration "
                "alone is reported UNCONFIGURED. A reachable-but-rejecting endpoint is "
                "UNAUTHORIZED. No state is ever invented."
            ),
            "hostingLabelPolicy": (
                "A self-hosted endpoint is labelled DEVELOPMENT_EPHEMERAL_RUNTIME and "
                "isProduction is always false. No production hosting is claimed."
            ),
            "finalChannelPolicy": (
                "extractV1Answer runs every response through deterministic final-channel "
                "extraction. A response carrying hidden-channel content but no final channel "
                "fails closed rather than surfacing raw model text."
            ),
        },
        "uiIntegration": {
            "chatPath": "apps/web/app/api/conversations/[id]/messages/route.ts",
            "guard": (
                "When the conversation's provider endpoint IS the configured V1 runtime, the "
                "streamed deltas are buffered and only the extracted final channel is emitted. "
                "Other providers stream unchanged, so no unrelated UI behaviour is rewritten."
            ),
            "detection": (
                "Endpoint identity, not a new schema field: no migration, and any provider "
                "pointing at the same runtime receives the same guard."
            ),
            "analysisExposure": "PREVENTED",
        },
        "evaluationController": {
            "module": "scripts/eval/local-eval-controller.mjs",
            "planArtifact": "data/derived/exp002/eval/eval-plan.json",
            "guarantees": [
                "refuses to run without an explicit --open-qualification flag",
                "plan mode does NOT read the sealed payload at all (status SEALED_NOT_READ)",
                "re-derives the seal hash at run time and aborts on mismatch",
                "health-probes the runtime and aborts if it is not ONLINE",
                "sends one prompt per item; the holdout payload never leaves the process",
                "gold answers never leave the process; only local hashes are persisted",
                "every output passes through final-channel extraction before scoring",
                "emits no placeholder score: scoring is delegated to the repository metric implementation",
            ],
            "holdoutDescription": (
                "An internal sealed qualification holdout drawn from the governed Gold "
                "distribution. It must not be called an independent external benchmark or a "
                "second-corpus evaluation."
            ),
            "payloadReadThisSession": False,
        },
        "testEvidence": {
            "v1RuntimeTestFile": "apps/web/lib/__tests__/exp002-v1-runtime.test.ts",
            "v1RuntimeCases": 25,
            "harmonyFinalCases": 19,
            "totalSuite": 279,
            "suiteResult": "PASS",
            "typecheck": "PASS",
            "covers": [
                "provider configuration resolves",
                "health state is truthful",
                "request body uses the canonical V1 inference contract",
                "final-only Harmony response is returned",
                "analysis channel is excluded",
                "API errors propagate safely",
                "unavailable runtime is handled",
                "no secret reaches client output",
                "model identity/version is correct",
            ],
        },
        "notAuthorizedByThisDecision": [
            "any training execution",
            "any evaluation run",
            "opening or scoring the sealed qualification split",
            "any model promotion",
            "GHARIBO-V1 creation",
            "any remote or paid compute",
        ],
        "references": [
            "governance/DEC-0050-local-only-execution-policy.json",
            "governance/DEC-0049-exp002-training-contract-preparation.json",
            "apps/web/lib/runtime/gharibo-v1.mjs",
            "apps/web/lib/runtime/harmony-final.mjs",
            "apps/web/app/api/runtime/v1/route.ts",
            "apps/web/app/api/conversations/[id]/messages/route.ts",
            "apps/web/lib/__tests__/exp002-v1-runtime.test.ts",
            "scripts/eval/local-eval-controller.mjs",
            "data/derived/exp002/local-hardware-qualification.json",
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

    state = json.loads(MASTER_STATE.read_text(encoding="utf-8"))
    previous = state["masterStateVersion"]
    if previous != "1.29.0":
        raise SystemExit("REFUSING: expected master state 1.29.0, found %s" % previous)

    state["masterStateVersion"] = NEW_VERSION
    state["updatedAt"] = DATE

    state["decisions"].append(
        {
            "id": "DEC-0051",
            "date": DATE,
            "title": "Local V1 runtime/provider contract and local evaluation controller",
            "status": "ACCEPTED",
            "decision": decision_record["decision"],
            "rationale": (
                "The runtime contract makes model identity independent of its host and makes "
                "Harmony analysis structurally unable to reach a user or a scorer: every answer "
                "passes through deterministic final-channel extraction, and a response with no "
                "final channel fails closed. Health is a real probe. The evaluation controller "
                "keeps the sealed holdout and all gold answers local, refuses to open the sealed "
                "split without an explicit flag, and does not read the payload in plan mode."
            ),
            "scope": ["architecture", "training", "experiments", "integrations", "roadmap"],
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
                "DEC-0051 local V1 runtime/provider contract, final-channel guard wired into the "
                "chat path, and a local evaluation controller that never uploads the sealed "
                "holdout or any gold answer. 279 tests and typecheck PASS. Nothing authorized to run."
            ),
            "commit": None,
            "commitStatus": "PENDING_CHECKPOINT",
            "commitNote": "Records local implementation only. No training, evaluation or promotion.",
            "changes": [
                "added apps/web/lib/runtime/gharibo-v1.mjs: provider-neutral V1 runtime contract, env-only configuration, literal-credential rejection, real health probe, final-channel-only answer extraction",
                "added apps/web/app/api/runtime/v1/route.ts: real health descriptor with no secret material",
                "guarded the conversation chat path so a V1 runtime answer is final-channel-only and analysis can never reach a client",
                "added scripts/eval/local-eval-controller.mjs: local-only evaluation with a sealed-split guard, seal-integrity re-derivation, prompts-only inference and no placeholder score",
                "added 25 V1 runtime contract tests; total suite 279 PASS",
                "recorded that the sealed qualification payload was NOT read this session",
                "did not authorize any training, evaluation or promotion",
            ],
        }
    )

    state["validation"]["results"].append(
        {
            "gate": "exp002:v1-runtime-contract",
            "command": "node node_modules/vitest/vitest.mjs run --root apps/web",
            "status": "PASS",
            "exitCode": 0,
            "evidence": (
                "279 tests PASS across 13 files, including 25 V1 runtime contract cases and 19 "
                "Harmony final-channel extraction cases. Typecheck PASS. Analysis exposure "
                "prevented on every path; no secret reaches client output."
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
