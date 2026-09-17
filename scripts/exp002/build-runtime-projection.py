#!/usr/bin/env python3
"""
EXP-002 training-runtime projection, anchored on the REAL EXP-001 execution.

Every EXP-001 number below is measured evidence recovered from
`governance/GHARIBO_MASTER_STATE.json` -> `training.executionCompletion.derivedTimestamps`,
which the DEC-0030 acceptance derived from the authenticated Kaggle lastRunTime
anchor plus relative kernel-log offsets. Nothing here is estimated where a
measurement exists.

The EXP-002 side is a projection. It is modelled from the measured per-token cost
of the baseline run and the measured token geometry of the governed split. The
model, its inputs and its uncertainty band are all recorded so the projection can
be audited or replaced with a real measurement later.

Output: data/derived/exp002/runtime-projection.json (byte-deterministic).
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "data/derived/exp002/runtime-projection.json"

# ---------------------------------------------------------------------------
# EXP-001 baseline — MEASURED (not estimated)
# ---------------------------------------------------------------------------

BASELINE = {
    "experimentId": "GHARIBO-exp-001",
    "hardware": "NVIDIA Tesla T4 (Turing, sm_75), 16 GB",
    "effectivePrecision": "float32 (engine-imposed for gpt-oss on Turing)",
    "examples": 640,
    "contextLength": 512,
    "epochs": 1,
    "perDeviceTrainBatchSize": 1,
    "gradientAccumulationSteps": 4,
    "optimizerSteps": 160,
    # All 640 examples rendered between 949 and 2689 tokens and were truncated to
    # exactly max_length=512, so the processed token count is exact, not an average.
    "processedTokens": 640 * 512,
    "processedTokensBasis": "every example truncated to exactly max_length=512 (DEC-0048 forensic audit)",
    "timings": {
        "setupSeconds": 263.574344109,
        "setupBasis": "run start -> trainer start, from derivedTimestamps.trainerStartOffsetSeconds",
        "setupIncludes": "dependency install, 4-bit model load, tokenizer/template setup, rendering, dataset build",
        "coreTrainingSeconds": 4041.9648,
        "coreBasis": "train_runtime reported by the trainer (DEC-0030 / docs/TRAINING_STRATEGY.md v1.4.0)",
        "postTrainingSeconds": 2.454462751,
        "postBasis": "training finished -> run complete (checkpoint save, manifest, checksums)",
        "totalRunSeconds": 4310.044056347,
    },
    "crossCheck": {
        "derivedCoreFromOffsets": 4044.015249487,
        "reportedTrainRuntime": 4041.9648,
        "differenceSeconds": 2.050449487,
        "verdict": "CONSISTENT (trainer-internal bookkeeping overhead, <0.06%)",
    },
}

# ---------------------------------------------------------------------------
# Architecture cost model — from the pinned model config, not guessed
# ---------------------------------------------------------------------------

ARCHITECTURE = {
    "source": "openai/gpt-oss-20b config.json @ 6cee5e81ee83917806bbde320786a8fb61efebee",
    "hiddenSize": 2880,
    "numHiddenLayers": 24,
    "numAttentionHeads": 64,
    "numKeyValueHeads": 8,
    "headDim": 64,
    "intermediateSize": 2880,
    "numLocalExperts": 32,
    "numExpertsPerTok": 4,
    "slidingWindow": 128,
    "layerTypes": "alternating: 12 sliding_attention + 12 full_attention",
    "totalParameters": 20918738496,
}

#: Only the 12 full-attention layers have a length-quadratic attention term.
FULL_ATTENTION_LAYERS = 12


def flops_per_token(length: int) -> dict[str, float]:
    """Forward FLOPs per token at a given sequence length."""
    hidden = ARCHITECTURE["hiddenSize"]
    layers = ARCHITECTURE["numHiddenLayers"]
    q_dim = ARCHITECTURE["numAttentionHeads"] * ARCHITECTURE["headDim"]
    kv_dim = ARCHITECTURE["numKeyValueHeads"] * ARCHITECTURE["headDim"]
    experts = ARCHITECTURE["numExpertsPerTok"]
    inter = ARCHITECTURE["intermediateSize"]

    # Length-independent per-token work: QKV + output projection + active MoE experts.
    qkv = 2 * hidden * (q_dim + 2 * kv_dim)
    o_proj = 2 * q_dim * hidden
    moe = experts * 3 * 2 * hidden * inter  # SwiGLU: gate, up, down
    linear_per_layer = qkv + o_proj + moe

    # Length-quadratic per-token work: QK^T + AV on the full-attention layers.
    # Per layer per sequence: 4 * L^2 * q_dim  ->  per token: 4 * L * q_dim.
    attn_per_token = FULL_ATTENTION_LAYERS * 4 * length * q_dim

    linear_total = linear_per_layer * layers
    return {
        "linearPerToken": float(linear_total),
        "attentionPerToken": float(attn_per_token),
        "totalPerToken": float(linear_total + attn_per_token),
    }


def build_cost_ratio() -> dict:
    at_512 = flops_per_token(512)
    at_3072 = flops_per_token(3072)
    ratio = at_3072["totalPerToken"] / at_512["totalPerToken"]
    return {
        "method": (
            "forward-FLOPs-per-token model using the pinned gpt-oss-20b config. The per-token cost is "
            "linear + quadratic-in-L: only the 12 full_attention layers contribute the quadratic term; "
            "the 12 sliding_attention layers (window 128) contribute an L-independent term that is "
            "present at both lengths and therefore cancels in the ratio."
        ),
        "flopsPerTokenAt512": at_512,
        "flopsPerTokenAt3072": at_3072,
        "ratio3072over512": ratio,
        "ratioRounded": round(ratio, 4),
        "attentionShareAt512": at_512["attentionPerToken"] / at_512["totalPerToken"],
        "attentionShareAt3072": at_3072["attentionPerToken"] / at_3072["totalPerToken"],
    }


# ---------------------------------------------------------------------------
# EXP-002 measured token geometry
# ---------------------------------------------------------------------------

TOKEN_GEOMETRY = {
    "source": "measured with the governed template and the pinned tokenizer",
    "governedSplitRows": 560,
    "governedSplitHash": "94da02d6cc7a99146a1bfc3084d5a99f1ab96e262a6c48f025c92cd79de53cf8",
    "allRows": {
        "rows": 560,
        "renderedTokensTotal": 807113,
        "renderedTokensMean": 1441.27,
        "renderedTokensMax": 2689,
    },
    "firstHundredRows": {
        "rows": 100,
        "renderedTokensTotal": 145013,
        "renderedTokensMean": 1450.13,
        "renderedTokensMax": 2689,
        "note": (
            "The first 100 rows of the governed train ordering, i.e. a deterministic prefix. If a "
            "100-row training set is adopted, the SUBSET DEFINITION must be governed explicitly; this "
            "projection uses the deterministic prefix as the concrete instance."
        ),
    },
}

#: Uncertainty band on the per-token cost ratio.
RATIO_BANDS = {
    "optimistic": 1.00,
    "architectureModel": None,  # filled from the FLOP model
    "conservative": 1.30,
    "pathologicalLinearInLength": 6.00,
}

#: Setup cost is dominated by fixed work (install + 4-bit model load), which does
#: not scale with dataset size. The measured 263.574 s is therefore used as the
#: setup figure for every configuration, and the rendering/build delta is treated
#: as immaterial at these row counts. This is deliberately CONSERVATIVE for the
#: smaller configurations.
SETUP_SECONDS = BASELINE["timings"]["setupSeconds"]
POST_SECONDS = BASELINE["timings"]["postTrainingSeconds"]


def project(rows: int, total_tokens: int, ratio: float) -> dict:
    seconds_per_token_512 = BASELINE["timings"]["coreTrainingSeconds"] / BASELINE["processedTokens"]
    core = total_tokens * ratio * seconds_per_token_512
    total = core + SETUP_SECONDS + POST_SECONDS
    return {
        "rows": rows,
        "processedTokens": total_tokens,
        "optimizerSteps": rows // BASELINE["gradientAccumulationSteps"],
        "secondsPerTokenAt512": seconds_per_token_512,
        "ratio": ratio,
        "setupSeconds": SETUP_SECONDS,
        "coreTrainingSeconds": core,
        "postTrainingSeconds": POST_SECONDS,
        "totalSeconds": total,
        "setupMinutes": SETUP_SECONDS / 60,
        "coreTrainingMinutes": core / 60,
        "totalMinutes": total / 60,
        "totalHours": total / 3600,
    }


def verdict_for(total_hours: float) -> str:
    if total_hours > 4.0:
        return "DO_NOT_LAUNCH"
    if total_hours > 3.0:
        return "INVESTIGATE_BEFORE_LAUNCH"
    if total_hours <= 2.0:
        return "WITHIN_TARGET_1_TO_2_HOURS"
    return "ACCEPTABLE_ABOVE_TARGET"


def main() -> int:
    ratio_model = build_cost_ratio()
    RATIO_BANDS["architectureModel"] = ratio_model["ratio3072over512"]

    configurations = [
        {
            "id": "A_STATED_100_ROWS",
            "label": "TRAIN = 100, context 3072 (the configuration stated in the request)",
            "rows": 100,
            "tokens": TOKEN_GEOMETRY["firstHundredRows"]["renderedTokensTotal"],
            "inGovernedContract": False,
        },
        {
            "id": "B_GOVERNED_560_ROWS",
            "label": "TRAIN = 560, context 3072 (the currently GOVERNED EXP-002 split)",
            "rows": 560,
            "tokens": TOKEN_GEOMETRY["allRows"]["renderedTokensTotal"],
            "inGovernedContract": True,
        },
        {
            "id": "C_ORIGINAL_GOLD_TRAIN_640",
            "label": "TRAIN = 640, context 3072 (the original Gold v0.1 TRAIN split)",
            "rows": 640,
            "tokens": 640 * 1447,
            "inGovernedContract": False,
        },
    ]

    projections = []
    for config in configurations:
        bands = {}
        for band_name, ratio in RATIO_BANDS.items():
            bands[band_name] = project(config["rows"], config["tokens"], ratio)

        central = bands["architectureModel"]
        projections.append(
            {
                "id": config["id"],
                "label": config["label"],
                "rows": config["rows"],
                "processedTokens": config["tokens"],
                "inGovernedContract": config["inGovernedContract"],
                "bands": bands,
                "centralTotalHours": central["totalHours"],
                "centralTotalMinutes": central["totalMinutes"],
                "verdict": verdict_for(central["totalHours"]),
                "verdictRange": {
                    "optimistic": verdict_for(bands["optimistic"]["totalHours"]),
                    "architectureModel": verdict_for(bands["architectureModel"]["totalHours"]),
                    "conservative": verdict_for(bands["conservative"]["totalHours"]),
                    "pathologicalLinearInLength": verdict_for(
                        bands["pathologicalLinearInLength"]["totalHours"]
                    ),
                },
            }
        )

    # ------------------------------------------------------------------ comparison
    stated_first_order = 100 * 3072
    actual_tokens_100 = TOKEN_GEOMETRY["firstHundredRows"]["renderedTokensTotal"]

    artifact = {
        "artifactKind": "GHARIBO_EXP002_RUNTIME_PROJECTION",
        "schemaVersion": "1.0.0",
        "executionPolicy": "LOCAL_ONLY",
        "baseline": BASELINE,
        "architecture": ARCHITECTURE,
        "costRatioModel": ratio_model,
        "tokenGeometry": TOKEN_GEOMETRY,
        "ratioBands": RATIO_BANDS,
        "projections": projections,
        "firstOrderModelComparison": {
            "model": "processed tokens = rows x context length (every sequence assumed full length)",
            "exp001FirstOrderTokens": 640 * 512,
            "exp002FirstOrderTokensAsStated": stated_first_order,
            "ratioAsStated": stated_first_order / (640 * 512),
            "exp002ActualTokensFor100Rows": actual_tokens_100,
            "overstatementFactor": stated_first_order / actual_tokens_100,
            "explanation": (
                "The first-order model is a valid workload PROXY for EXP-001, where every example was "
                "truncated to exactly max_length=512, so it is exact there. It is NOT exact for EXP-002: "
                "with per-device batch size 1 and packing disabled there is no padding, so the cost is "
                "driven by the REAL rendered lengths (mean 1450 tokens at context 3072), not by the "
                "context ceiling. The first-order figure therefore overstates the 100-row workload by "
                "about %.1fx. The conclusion is unchanged and in fact more favourable, but the correct "
                "driver is the measured length distribution."
                % (stated_first_order / actual_tokens_100)
            ),
        },
        "overheadSeparation": {
            "setupSeconds": SETUP_SECONDS,
            "coreTrainingSecondsReportedSeparately": True,
            "postTrainingSeconds": POST_SECONDS,
            "note": (
                "Setup and post-training overhead are reported separately from core training time, as "
                "requested. Setup is dominated by fixed work (dependency install and the 4-bit model "
                "load) and does not scale with row count at these sizes."
            ),
        },
        "explicitlyNotUsed": {
            "evaluationRunDuration": (
                "The ~12 h evaluation run was INFERENCE evaluation, not training. It is excluded from "
                "this projection entirely."
            ),
        },
        "blockingFindings": [
            {
                "id": "RP-1",
                "finding": "CONFIGURATION_DISCREPANCY",
                "severity": "MATERIAL",
                "detail": (
                    "The request states TRAIN = 100. The governed EXP-002 contract prepared under "
                    "DEC-0049 uses the 560-row split. Adopting 100 rows would remove 460 training "
                    "examples (an 82% reduction in training data) and is a MATERIAL dataset change "
                    "that the standing rule requires to be evidenced and governed before training. "
                    "This projection is the evidence; the governance decision is separate and has NOT "
                    "been taken."
                ),
            },
            {
                "id": "RP-2",
                "finding": "NO_LOCAL_COMPUTE_TARGET",
                "severity": "BLOCKING",
                "detail": (
                    "This projection is anchored on the EXP-001 T4 baseline. The local machine has no "
                    "usable CUDA device (BLK-0006: GT 730, sm_35, 2018 driver, 1-4 GB VRAM), so the "
                    "projected runtime cannot be realised locally. A projection is not a launch "
                    "authorization, and there is currently nothing to launch on."
                ),
            },
            {
                "id": "RP-3",
                "finding": "CHECKPOINT_POLICY_MUST_BE_REDERIVED_IF_ROW_COUNT_CHANGES",
                "severity": "ADVISORY",
                "detail": (
                    "The declared EXP-002 checkpoint policy uses save_steps=140, derived from "
                    "560 rows / (batch 1 x grad-accum 4) = 140 optimizer steps. At 100 rows the run is "
                    "25 optimizer steps, so save_steps=140 would never fire and only the terminal "
                    "checkpoint would exist. The policy must be re-declared coherently with the row "
                    "count, and the checkpoint selection rule (terminal checkpoint only) must be "
                    "restated for the new step count."
                ),
            },
        ],
        "verdict": {
            "statedConfigurationWithinTarget": projections[0]["verdict"],
            "governedConfigurationVerdict": projections[1]["verdict"],
            "statement": (
                "The stated 100-row configuration projects to well inside the 1-2 hour target band. "
                "The currently governed 560-row configuration projects to roughly 3 hours, which is "
                "the investigate-before-launch band rather than the do-not-launch band. Neither can "
                "run locally, and adopting the 100-row set is an ungovened material change."
            ),
        },
    }

    text = json.dumps(artifact, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text, encoding="utf-8")

    print("EXP-002 RUNTIME PROJECTION (baseline: real EXP-001 execution)")
    print("=" * 70)
    t = BASELINE["timings"]
    print("EXP-001 setup        : %.1f s (%.2f min)" % (t["setupSeconds"], t["setupSeconds"] / 60))
    print("EXP-001 core training: %.1f s (%.2f min)" % (t["coreTrainingSeconds"], t["coreTrainingSeconds"] / 60))
    print("EXP-001 post         : %.1f s" % t["postTrainingSeconds"])
    print("EXP-001 total        : %.1f s (%.2f min)" % (t["totalRunSeconds"], t["totalRunSeconds"] / 60))
    print("cost ratio r(3072/512): %.4f" % ratio_model["ratio3072over512"])
    print("")
    for p in projections:
        c = p["bands"]["architectureModel"]
        print("%-28s rows=%-4d tokens=%-8d" % (p["id"], p["rows"], p["processedTokens"]))
        print("    core %6.1f min | setup %5.1f min | post %.1f s | TOTAL %6.1f min (%.2f h)"
              % (c["coreTrainingMinutes"], c["setupMinutes"], c["postTrainingSeconds"], c["totalMinutes"], c["totalHours"]))
        print("    verdict: %s" % p["verdict"])
    print("")
    print("first-order overstatement for 100 rows: %.2fx" % artifact["firstOrderModelComparison"]["overstatementFactor"])
    print("")
    print("blocking findings:")
    for b in artifact["blockingFindings"]:
        print("  [%s] %s" % (b["severity"], b["finding"]))
    print("")
    print("wrote", OUT_PATH)
    print("artifact sha256:", hashlib.sha256(text.encode("utf-8")).hexdigest())
    return 0


if __name__ == "__main__":
    sys.exit(main())
