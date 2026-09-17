#!/usr/bin/env python3
"""
EXP-002 local hardware qualification and training-feasibility determination.

Deterministic: the probe evidence is captured verbatim (so the verdict is
auditable), the feasibility rules are explicit, and the artifact is byte-stable.

Policy context: the project execution policy is LOCAL ONLY. Kaggle is not an
authorized compute path. This artifact answers exactly one question — can the
current local machine execute the GOVERNED EXP-002 recipe without silently
changing the training contract?

It never guesses. Where a probe could not be completed the artifact records that
as an unresolved observation rather than assuming a value.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "data/derived/exp002/local-hardware-qualification.json"

# ---------------------------------------------------------------------------
# Captured probe evidence (verbatim, from the local machine, 2026-09-17)
# ---------------------------------------------------------------------------

GPU_PROBE = {
    "source": "Win32_VideoController + Win32_PnPEntity (WMI)",
    "adapters": [
        {
            "name": "NVIDIA GeForce GT 730",
            "pnpDeviceId": "PCI\\VEN_10DE&DEV_0F02&SUBSYS_00000000&REV_A1\\4&32491029&0&0008",
            "vendorDeviceId": "10DE:0F02",
            "adapterRamBytesReported": 4293918720,
            "adapterRamNote": (
                "Win32_VideoController.AdapterRAM is a 32-bit field and saturates; "
                "the GT 730 ships in 1 GB / 2 GB / 4 GB DDR3 variants."
            ),
            "status": "OK",
            "configManagerErrorCode": 0,
        },
        {
            "name": "Intel(R) UHD Graphics 630",
            "adapterRamBytesReported": 1073741824,
            "role": "integrated graphics",
            "usableForTraining": False,
            "reason": "No supported PyTorch backend for UHD 630 on Windows.",
        },
    ],
    "nvidiaDriverFileVersion": "23.21.13.9135",
    "nvidiaDriverMarketingBranch": "391.35",
    "nvidiaDriverReleaseEra": "2018-03",
    "nvidiaSmiPath": "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
    "nvidiaSmiOutputBytes": 0,
    "nvidiaSmiNote": (
        "nvidia-smi exists but returns ZERO bytes of output and no usable exit code, so "
        "the NVML query interface is not functional in this environment. The governed "
        "notebook's pre-flight VRAM check therefore cannot run at all here."
    ),
    "cudaDriverLibrary": {"path": "C:\\Windows\\System32\\nvcuda.dll", "fileVersion": "23.21.13.9135"},
    "cudaToolkitInstalled": False,
    "nvccOnPath": False,
}

SYSTEM_PROBE = {
    "manufacturer": "Dell Inc.",
    "model": "OptiPlex 3080",
    "cpu": "Intel(R) Core(TM) i5-10500 CPU @ 3.10GHz",
    "cpuCores": 6,
    "cpuLogicalProcessors": 12,
    "totalRamBytes": 38387658752,
    "totalRamGiB": 35.75,
    "freePhysicalRamGiB": 13.38,
    "os": "Microsoft Windows 11 Pro Insider Preview",
    "osVersion": "10.0.26220",
    "osBuild": "26220",
    "disks": [
        {"device": "C:", "totalGiB": 475.95, "freeGiB": 180.03},
        {"device": "D:", "totalGiB": 931.51, "freeGiB": 621.12},
    ],
}

TORCH_PROBE = {
    "environment": "C:\\Users\\dell\\.workbuddy-ai\\binaries\\python\\envs\\gharibo-exp002",
    "python": "3.13.14",
    "torch": "2.14.0+cpu",
    "cudaBuild": None,
    "cudaAvailable": False,
    "deviceCount": 0,
    "archList": [],
    "note": (
        "The installed build is CPU-only, so `cuda_available=False` alone does not prove "
        "the hardware is unusable. The hardware verdict rests on the driver/CUDA ceiling "
        "and the compute-capability floor, which are independent of the installed wheel."
    ),
}

# ---------------------------------------------------------------------------
# Hardware capability facts derived from the probe
# ---------------------------------------------------------------------------

GPU_ARCHITECTURE = {
    "chip": "GK208 (Kepler 2.0)",
    "vendorDeviceId": "10DE:0F02",
    "computeCapability": "3.5",
    "sm": "sm_35",
    "memoryType": "DDR3",
}

# Stack floors the governed recipe depends on.
STACK_FLOORS = {
    "pytorch2CudaMinComputeCapability": "5.0",
    "pytorch2CudaMinDriverWindows": "452.xx (CUDA 11.8) or newer",
    "tritonMinComputeCapability": "7.0",
    "bitsandbytes4bitMinCuda": "11.0",
    "governedRecipePrecision": "float32 (engine-imposed for gpt-oss on Turing)",
}

# Measured requirement from the accepted EXP-001 engine qualification (BLK-0002 /
# DEC-0030): gpt-oss-20b loaded 4-bit QLoRA on a 16 GB T4 with a 14 GB floor.
REQUIRED_VRAM_GB_MIN = 14.0
REQUIRED_VRAM_GB_RECOMMENDED = 16.0

# ---------------------------------------------------------------------------
# Feasibility rules — each independently fatal
# ---------------------------------------------------------------------------

def build_blockers() -> list[dict]:
    return [
        {
            "id": "HW-1",
            "blocker": "COMPUTE_CAPABILITY_BELOW_STACK_FLOOR",
            "observed": "GK208 = sm_35 (compute capability 3.5)",
            "required": "sm_50 or newer for any PyTorch 2.x CUDA build; sm_70 or newer for Triton",
            "fatal": True,
            "detail": (
                "Every PyTorch 2.x CUDA wheel is compiled for Maxwell (sm_50) and newer. "
                "Triton, which the Unsloth engine requires, targets sm_70 and newer. A "
                "Kepler sm_35 device is below the floor of the entire modern training "
                "stack, so no governed dependency can execute on it."
            ),
        },
        {
            "id": "HW-2",
            "blocker": "DRIVER_CUDA_CEILING_FAR_BELOW_REQUIREMENT",
            "observed": "NVIDIA driver 391.35 (2018-03); nvcuda.dll 23.21.13.9135",
            "required": "Windows driver >= 452.xx for the CUDA 11.8 runtime that PyTorch 2.x links",
            "fatal": True,
            "detail": (
                "Driver 391.35 supports CUDA up to 9.1. PyTorch 2.x links the CUDA 11.8/12.x "
                "runtime, and bitsandbytes 4-bit NF4 requires CUDA >= 11.x. The installed "
                "driver is roughly six years below the floor, so no CUDA-enabled wheel can "
                "initialise."
            ),
        },
        {
            "id": "HW-3",
            "blocker": "VRAM_SHORTFALL",
            "observed": "1 GB / 2 GB / 4 GB DDR3 (GT 730 variants)",
            "required": ">= 14.0 GB (16 GB recommended) for gpt-oss-20b 4-bit QLoRA at the declared context",
            "fatal": True,
            "detail": (
                "gpt-oss-20b in 4-bit needs roughly 12 GB for the weights alone before any "
                "activation memory, and the accepted engine qualification measured a 14 GB "
                "floor on a 16 GB T4. The shortfall is at minimum 3.5x and at most 14x, "
                "before activations at context length 3072."
            ),
        },
        {
            "id": "HW-4",
            "blocker": "PREFLIGHT_INSTRUMENTATION_NOT_FUNCTIONAL",
            "observed": "nvidia-smi returns 0 bytes; no CUDA toolkit; no nvcc",
            "required": "A working NVML query path so the governed pre-flight VRAM gate can run",
            "fatal": False,
            "detail": (
                "The governed notebook's budget gate calls torch.cuda.mem_get_info() and "
                "asserts a 14 GB floor. With no functional CUDA device the gate cannot "
                "produce a verdict, so a local run could not even prove it had failed "
                "honestly."
            ),
        },
    ]


def build_alternatives() -> list[dict]:
    return [
        {
            "id": "ALT-A",
            "title": "Add a local GPU that meets the governed floor",
            "recipeImpact": "NONE - the governed recipe runs unchanged",
            "requirements": [
                "VRAM >= 16 GB (24 GB preferred, for headroom at context 3072)",
                "Compute capability >= 7.0 (Turing or newer) so Triton is supported",
                "A driver new enough for CUDA 11.8+ (>= 452.xx on Windows)",
                "CPU-only torch must be replaced with a CUDA build in the training environment",
            ],
            "examples": [
                "RTX 4060 Ti 16 GB",
                "RTX 4070 Ti SUPER 16 GB",
                "RTX 3090 24 GB",
                "RTX 4090 24 GB",
            ],
            "assessment": "FASTEST_TECHNICALLY_VALID_LOCAL_ALTERNATIVE",
            "why": (
                "It is the only option that preserves the governed training contract exactly: "
                "same base model, same Harmony representation, same 3072 context, same "
                "assistant-only loss, same 560/80 split. No governance change to the recipe "
                "is required, so it does not reopen the DEC-0048 defect class."
            ),
            "caveat": (
                "Requires hardware acquisition and a driver/CUDA install. The OptiPlex 3080 "
                "is a small-form-factor desktop; PSU and physical clearance must be checked "
                "before assuming a 16-24 GB card will fit."
            ),
        },
        {
            "id": "ALT-B",
            "title": "CPU-only training of the governed recipe",
            "recipeImpact": "NONE, but the recipe cannot run as specified",
            "requirements": [
                "gpt-oss-20b 4-bit resident weights ~12 GB, against 13.38 GiB free physical RAM",
                "Activations for context 3072 on top of that",
                "bitsandbytes CPU 4-bit kernels are not the supported path for a gpt-oss MoE",
            ],
            "assessment": "INFEASIBLE",
            "why": (
                "The 4-bit weights alone would consume essentially all free RAM before any "
                "activation, optimizer or gradient memory. Even setting memory aside, the "
                "compute budget is out of reach: 560 examples at ~1447 mean rendered tokens "
                "is ~810K tokens per epoch through a 21B-parameter MoE (3.6B active) on 6 "
                "cores, which is on the order of tens to hundreds of hours per epoch."
            ),
            "caveat": "No silent precision, context or supervision reduction is permitted to make this fit.",
        },
        {
            "id": "ALT-C",
            "title": "Swap to a smaller locally-runnable base model",
            "recipeImpact": "MATERIAL - requires evidence and a governance update before training",
            "requirements": [
                "A new base model identity and pinned revision",
                "A new chat-template / representation contract (the governed contract is "
                "Harmony-specific: <|channel|>final, <|return|> terminator)",
                "Re-measurement of the TRAIN/DEV token distribution under the new template",
                "A re-derived context length and a re-proven assistant-only mask",
                "A new EXP-002 preflight PASS",
            ],
            "assessment": "NOT_A_SMALL_CHANGE",
            "why": (
                "gpt-oss-20b is the smallest model in its own family, so there is no smaller "
                "sibling. Any other family changes the tokenizer, the chat template and the "
                "Harmony channel contract that DEC-0049 governs. That is a new representation "
                "contract, not a configuration tweak, and it must be evidenced and governed "
                "before any training."
            ),
            "caveat": (
                "It would also run on CPU only, because this machine has no usable CUDA device "
                "for any model size."
            ),
        },
        {
            "id": "ALT-D",
            "title": "Remote or rented GPU compute",
            "recipeImpact": "NONE, but it is outside the current execution policy",
            "assessment": "EXCLUDED_BY_POLICY",
            "why": (
                "The project execution policy is LOCAL ONLY. Kaggle is not an authorized "
                "compute path, and paid providers are prohibited by the zero-cost constraint. "
                "This option is recorded for completeness only and is not recommended."
            ),
            "caveat": "Would require an explicit policy change before it could be considered.",
        },
    ]


def main() -> int:
    blockers = build_blockers()
    alternatives = build_alternatives()

    fatal = [b for b in blockers if b["fatal"]]
    canTrainLocally = len(fatal) == 0

    artifact = {
        "artifactKind": "GHARIBO_EXP002_LOCAL_HARDWARE_QUALIFICATION",
        "schemaVersion": "1.0.0",
        "experimentId": "GHARIBO-exp-002",
        "executionPolicy": "LOCAL_ONLY",
        "policyNote": (
            "Kaggle is NOT an authorized compute path for EXP-002. Training, evaluation, "
            "qualification, scoring and runtime validation are all local-only."
        ),
        "probedAt": "2026-09-17",
        "probes": {
            "gpu": GPU_PROBE,
            "system": SYSTEM_PROBE,
            "torch": TORCH_PROBE,
        },
        "derivedHardware": {
            "gpu": GPU_ARCHITECTURE,
            "usableCudaDevice": False,
            "usableCudaDeviceReason": (
                "No device on this machine satisfies the compute-capability and driver floors "
                "of the governed stack."
            ),
            "stackFloors": STACK_FLOORS,
        },
        "governedRequirement": {
            "baseModel": "openai/gpt-oss-20b",
            "method": "QLoRA + SFT (4-bit)",
            "contextLength": 3072,
            "lossContract": "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
            "trainRows": 560,
            "devRows": 80,
            "batch": {"perDeviceTrainBatchSize": 1, "gradientAccumulationSteps": 4},
            "effectivePrecision": "float32 (engine-imposed for gpt-oss on Turing)",
            "vramGbMinimum": REQUIRED_VRAM_GB_MIN,
            "vramGbRecommended": REQUIRED_VRAM_GB_RECOMMENDED,
            "measuredRequirementSource": (
                "Accepted EXP-001 engine qualification (BLK-0002 / DEC-0030): gpt-oss-20b "
                "loaded 4-bit QLoRA on a 16 GB T4 with a 14 GB floor."
            ),
        },
        "blockers": blockers,
        "fatalBlockerCount": len(fatal),
        "trainingFeasibility": {
            "canExecuteGovernedRecipeLocally": canTrainLocally,
            "verdict": "YES" if canTrainLocally else "NO",
            "statement": (
                "The governed EXP-002 recipe cannot execute on this machine. No training was "
                "started, and no part of the training contract was reduced to make it fit."
                if not canTrainLocally
                else "The governed EXP-002 recipe can execute on this machine."
            ),
        },
        "alternatives": alternatives,
        "recommendedAlternative": "ALT-A",
        "hardRuleCompliance": {
            "silentlyReducedContextLength": False,
            "silentlyReducedModel": False,
            "silentlyReducedDataset": False,
            "silentlyReducedSupervision": False,
            "silentlyReducedPrecision": False,
            "silentlyReducedTargetCoverage": False,
            "silentlyChangedLossContract": False,
            "trainingStarted": False,
            "statement": (
                "STOPPED BEFORE TRAINING. The exact governed configuration does not fit the "
                "local hardware, so nothing was reduced and nothing was run."
            ),
        },
        "holdoutPolicy": {
            "split": "EXP-002 qualification",
            "rows": 80,
            "status": "SEALED_UNREAD",
            "mayBeUsedAs": (
                "A pre-declared LOCAL held-out qualification set: it was sealed before EXP-002 "
                "training and does not influence training, prompt design, hyperparameters, "
                "checkpoint choice or model selection."
            ),
            "mustNotBeCalled": [
                "an independent external benchmark",
                "a second-corpus evaluation",
            ],
            "truthfulDescription": (
                "An internal sealed qualification holdout drawn from the governed Gold "
                "distribution."
            ),
            "openCondition": (
                "Not to be opened or scored until the training recipe and checkpoint policy "
                "are frozen."
            ),
        },
        "gitIntegrity": {
            "head": "bb163fb48257a94fa8a803d3c91777b751111d4e",
            "originMain": "bb163fb48257a94fa8a803d3c91777b751111d4e",
            "fsck": "CLEAN",
            "recoveryBackupPreserved": ".git/objects/pack/_stale-backup/",
            "maintenancePerformedThisSession": False,
        },
    }

    text = json.dumps(artifact, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text, encoding="utf-8")

    print("EXP-002 local hardware qualification")
    print("=" * 64)
    print("GPU            :", GPU_PROBE["adapters"][0]["name"], "/", GPU_ARCHITECTURE["chip"])
    print("compute cap    :", GPU_ARCHITECTURE["computeCapability"], "(%s)" % GPU_ARCHITECTURE["sm"])
    print("driver         :", GPU_PROBE["nvidiaDriverMarketingBranch"], "(%s)" % GPU_PROBE["nvidiaDriverReleaseEra"])
    print("VRAM reported  : %.2f GB (variant range 1-4 GB DDR3)" % (GPU_PROBE["adapters"][0]["adapterRamBytesReported"] / 1024**3))
    print("CPU            :", SYSTEM_PROBE["cpu"], "(%dC/%dT)" % (SYSTEM_PROBE["cpuCores"], SYSTEM_PROBE["cpuLogicalProcessors"]))
    print("RAM            : %.2f GiB total, %.2f GiB free" % (SYSTEM_PROBE["totalRamGiB"], SYSTEM_PROBE["freePhysicalRamGiB"]))
    print("disk free      : C: %.1f GiB, D: %.1f GiB" % (SYSTEM_PROBE["disks"][0]["freeGiB"], SYSTEM_PROBE["disks"][1]["freeGiB"]))
    print("")
    print("fatal blockers :", len(fatal))
    for blocker in blockers:
        print("  [%s] %s" % ("FATAL" if blocker["fatal"] else "info ", blocker["blocker"]))
    print("")
    print("TRAINING FEASIBILITY:", artifact["trainingFeasibility"]["verdict"])
    print("recommended alternative:", artifact["recommendedAlternative"])
    print("wrote", OUT_PATH)
    print("artifact sha256:", hashlib.sha256(text.encode("utf-8")).hexdigest())

    return 0


if __name__ == "__main__":
    sys.exit(main())
