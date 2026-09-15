#!/usr/bin/env node
/**
 * build-dec0030-acceptance.mjs — deterministic generator for the DEC-0030 record.
 *
 * DEC-0030 is the POST-EXECUTION acceptance decision for GHARIBO-exp-001. It records
 * what actually happened on the Kaggle worker: attempt 3 reached
 * `KernelWorkerStatus.COMPLETE`, real training executed (640 examples, 160 steps, 1 epoch)
 * and real artifacts were produced.
 *
 * It also records — without hiding — the one runtime fact that did not match the
 * authorized package: the package declared `dtype = "fp16"`, but the Unsloth runtime
 * emitted float16-won't-work and switched to float32. That is accepted here as a
 * MATERIAL RUNTIME DEVIATION, not silently absorbed and not retroactively edited into
 * the immutable package.
 *
 * DETERMINISM
 * ----------
 * The body is a pure constant: no clock, no filesystem, no environment. `acceptedAt`
 * is a fixed literal, so the acceptance hash is stable across runs and machines.
 *
 * Usage:
 *   node scripts/training/build-dec0030-acceptance.mjs          # write governance/DEC-0030-*.json
 *   node scripts/training/build-dec0030-acceptance.mjs --check  # exit 1 if the file is stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0030-kaggle-execution-acceptance.json";

/** Canonical form: object keys sorted recursively (the repo-wide hash convention). */
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

export const sha256Canonical = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/**
 * The DEC-0030 acceptance body, minus its own hash. Every field is either a value read
 * off the downloaded Kaggle result, a value read off the authenticated Kaggle CLI, or a
 * governance conclusion drawn from those two. Nothing here is estimated.
 */
export function executionAcceptanceBody() {
  return {
    // ---------------------------------------------------------------- identity
    status: "KAGGLE_EXECUTION_COMPLETED_ACCEPTED",
    decisionId: "DEC-0030",
    supersedesDecisionId: null,
    scope: "POST_EXECUTION_ACCEPTANCE_AND_LIFECYCLE_RECONCILIATION",
    packageId: "78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2",
    runId: "ea6e30f2-ce26-4323-b35a-3436ee867eaf",
    experimentId: "GHARIBO-exp-001",
    datasetId: "GHARIBO-Research-Gold-v0.1",

    // ------------------------------------------------- provenance chain carried forward
    issuanceReceiptHash: "878b961f03ba069b82b4eb82530e7ebdfa4f8644ab159beff0a9adc7935f99bd",
    executionAuthorizationHash: "8c089dd9c6967dd33c32f64128bc7e939e8019a27c2428897c23156a075d07bf",
    startAuthorizationHash: "4bb2d0b2d38ddd39ce85277c5806838a162620970adf07a6d52844ccf7b2734f",
    launchAuthorizationHash: "ec78b2678d0f764b026246806c9e4b3e15d2c241084ec401ef24afc08e051e5b",
    authorizedCodeSnapshot: "107cb4be7ae3d1f61c2d6852e432308342bc14e4",
    recipeHash: "c2360979bf3de8d91a01ec1c9fe792acc7207ba25a20a94c610fa7084c7fdcdd",
    qualificationHash: "6d15bcf5ff7b120f34c7cb968eab196be285ad92b4ad2e76c44412360113dcc0",
    engineFreeze: "unsloth-freeze-2026.09.15",
    datasetHash: "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
    splitHashes: {
      train: "84025de18403b8660d9702877b2b6fd329cedb886cad0095ab67e4daa3828ad2",
      validation: "063fb4422aed247b3f92c0f0d5b1291af46fd4357ca48829a7e7f6ce98815787",
      test: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
    },
    recordFormat: "harmony-messages-v1",

    // ------------------------------------------------------------- external execution
    worker: "kaggle",
    accelerator: "NvidiaTeslaT4",
    kernelRef: "vokaigharibo/gharibo-exp-001-kaggle-start-fec22ca2",
    kernelVersion: 3,
    attemptNumber: 3,
    artifactNotebookSha256: "dda3b050034afa0922bda573565ff8f678767e62a944a01d597761aec254b4b1",
    artifactLaunchBundleHash: "b3b4efc8f4b4c04eedd8610b6b4cdb479817d638e971ce8e8c9b67079d587efb",
    externalStatus: "KernelWorkerStatus.COMPLETE",
    externalRunStartedAt: "2026-09-15T18:35:56.230Z",
    externalObservedRunningAt: "2026-09-15T18:36:27Z",

    /**
     * TIMESTAMP HONESTY
     * -----------------
     * The Kaggle kernel log carries RELATIVE offsets only (no absolute clock). The single
     * authoritative absolute anchor is the Kaggle API `lastRunTime` for kernel version 3,
     * which equals the governed push time recorded in the launch ledger. Trainer-relative
     * timestamps below are DERIVED from that anchor plus the measured log offset; they are
     * not independent observations and must not be quoted as such.
     */
    timestampBasis: "KAGGLE_LASTRUNTIME_ANCHOR_PLUS_RELATIVE_KERNEL_LOG_OFFSET",
    timestampAnchorSource: "authenticated Kaggle API lastRunTime for kernel version 3",
    derivedTimestamps: {
      trainerStartOffsetSeconds: 263.574344109,
      trainerStartedAt: "2026-09-15T18:40:19.804Z",
      trainingFinishedOffsetSeconds: 4307.589593596,
      trainingFinishedAt: "2026-09-15T19:47:43.819Z",
      runCompleteOffsetSeconds: 4310.044056347,
      runCompletedAt: "2026-09-15T19:47:46.274Z",
    },

    executionStarted: true,
    trainingStarted: true,
    trainingCompleted: true,
    fromStatus: "QUEUED",
    toStatus: "COMPLETED",
    lifecyclePath: ["QUEUED", "RUNNING", "COMPLETED"],

    // ------------------------------------------------------------------ real training
    training: {
      numExamples: 640,
      numEpochs: 1,
      totalSteps: 160,
      globalStep: 160,
      epoch: 1,
      perDeviceTrainBatchSize: 1,
      gradientAccumulationSteps: 4,
      totalBatchSize: 4,
      trainableParameters: 3981312,
      totalParametersReportedByRuntime: 20918738496,
      trainRuntimeSeconds: 4041.9648,
      trainSamplesPerSecond: 0.158,
      trainStepsPerSecond: 0.04,
      totalFlos: 3.998929070850048e16,
      trainLoss: 0.6016419500112533,
      firstStepLoss: 4.6434,
      finalStepLoss: 0.2192,
      minStepLoss: 0.1439,
      maxStepLoss: 4.745,
      meanStepLoss: 0.60164375,
      firstStepGradNorm: 15.750786781311035,
      finalStepGradNorm: 1.048417091369629,
      loggedSteps: 160,
      completionMarker: "COMPLETED",
    },

    runtime: {
      gpuModel: "Tesla T4",
      gpuCount: 2,
      dataParallelGpus: 1,
      modelShardedAcrossGpus: true,
      cuda: "12.8",
      torch: "2.10.0+cu128",
      triton: "3.6.0",
      python: "3.12.13",
      note: "The 4-bit loader placed weights on both T4s (5.680 GiB each); data parallelism stayed at 1. The package declares no GPU count, so this is a runtime observation rather than a recipe deviation.",
    },

    /**
     * THE fp16 -> float32 FACT. Recorded, not buried.
     *
     * Classification rationale: the deviation is engine-imposed (Unsloth refuses fp16 for
     * gpt_oss and switches to fp32), not operator-authored, and no recipe field was
     * retroactively edited. But the authorized package DID declare `dtype = "fp16"` and the
     * run did NOT train in fp16, so per the repository's own standard (a governed field that
     * does not hold at execution time is a material fact) this requires explicit acceptance
     * rather than silent absorption.
     */
    runtimeDeviation: {
      declaredDtype: "fp16",
      effectiveDtype: "float32",
      classification: "MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION",
      operatorAuthored: false,
      engineImposed: true,
      recipeEditedRetroactively: false,
      packageDtypeFieldUnchanged: true,
      evidence: [
        "t=109.379s stdout: Unsloth: Using float16 precision for gpt_oss won't work! Using float32.",
        "t=257.934s stdout: Unsloth: Switching to float32 training since model cannot work with float16",
      ],
      adapterStorageDtype: "F32",
      adapterStorageDtypeEvidence:
        "safetensors header: 96 tensors, dtype F32, 15938048 bytes == 3981312 params x 4 bytes + 12800-byte header",
      scope: "GHARIBO-exp-001 only",
      consequence:
        "The produced adapter is fp32. The effective dtype must be declared honestly for any future run instead of assuming fp16.",
    },

    /**
     * PARAMETER-COUNT RECONCILIATION.
     * The qualification recorded 11045084736 total parameters; the training log reported
     * 20918738496. Both describe the SAME model. Resolved by artifact, not by assertion.
     */
    parameterCountReview: {
      qualificationTotalParameters: 11045084736,
      runtimeTotalParameters: 20918738496,
      trainableParametersBoth: 3981312,
      trainableTensorCount: 96,
      verdict: "ACCOUNTING_DIFFERENCE_NOT_MODEL_IDENTITY_MISMATCH",
      basis: [
        "The qualification harness counted parameters with a plain sum of param.numel() over the live model (scripts/qualify/qualify-kaggle-env.mjs, count_parameters). Under bitsandbytes 4-bit, quantized weights are stored two-per-byte, so numel() reports roughly half the logical count.",
        "Solving 2*packed + unquantized = 20918738496 with packed = 11045084736 - unquantized yields unquantized = 1171430976, which matches embed_tokens (201088 x 2880 = 579133440) + lm_head (579133440) plus the per-layer norms, attention biases, sinks and MoE routers that 4-bit conversion leaves alone.",
        "The adapter carries 96 tensors named base_model.model.model.layers.{0..23}.self_attn.{q_proj,v_proj}.lora_{A,B}.weight with shapes lora_A [16, 2880], q_proj lora_B [4096, 16], v_proj lora_B [512, 16]: 24 layers, hidden 2880, 64 query heads and 8 KV heads at head_dim 64 - exactly openai/gpt-oss-20b at the pinned revision 6cee5e81ee83917806bbde320786a8fb61efebee.",
        "Trainable parameters are byte-identical (3981312) in the qualification and the training run, so the two runs cannot have loaded different models.",
      ],
      authoritativeTotalForThisRun: 20918738496,
      qualificationArtifactNotEdited: true,
    },

    // ------------------------------------------------------------------- TEST policy
    testPolicy: {
      testPayloadUploaded: false,
      testPayloadAccessed: false,
      testUsage: "HASH_INTEGRITY_ONLY",
      testRecordsParsed: 0,
      testSplitHash: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
      evidence: [
        "runtime stdout: train=640 validation=80 test=ABSENT (permanently held out)",
        "runtime stdout: TEST usage: HASH_INTEGRITY_ONLY",
        "runtime stdout: dataset hash (metadata anchor, TEST never read): 84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
        "the governed Kaggle dataset bundle contains train.jsonl and validation.jsonl only; no test.jsonl was uploaded",
        "the raw TEST payload was never opened to produce this acceptance record - path, hash and log metadata only",
      ],
    },

    // ------------------------------------------------------------------- artifacts
    artifacts: {
      source: "Kaggle kernel version 3 output (external result download)",
      resultDirLabel: "kaggle-results/GHARIBO-exp-001",
      completionMarker: "COMPLETED",
      checksumFileEntries: 130,
      checksumFilesVerified: 129,
      checksumMismatches: 0,
      checksumFilesAbsentLocally: ["__notebook__.ipynb"],
      absentFileNote:
        "Kaggle's internal executed-notebook copy: not served by the authenticated output API and not a model or result artifact. Its declared hash still participates in the rollup, so the rollup validates the full 130-entry manifest.",
      rollupHash: "788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885",
      rollupRecomputedMatches: true,
      rollupAlgorithm: 'sha256 over "\\n".join(sorted(`${relativePath}\\t${sha256}`))',
      finalAdapterSha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
      checkpoint160Sha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
      checkpoint150Sha256: "5e062fa0bbba3c5276e3d6086f8e7dc0a7e1605c2dbf8c1d989ecbfe5a140249",
      adapterTensorCount: 96,
      adapterStorageDtype: "F32",
      checkpointSteps: [150, 160],
      registeredKinds: [
        "final_adapter",
        "checkpoint_160",
        "checkpoint_150",
        "trainer_state",
        "metrics",
        "manifest",
        "checksums",
      ],
      commitPolicy:
        "Model binaries are never committed to the public repository; GitHub carries source, governance and tests only.",
    },

    // ------------------------------------------------------------------ evaluation
    evaluation: {
      status: "NOT_RUN",
      executed: false,
      authorizationStatus: "EVALUATION_READY_AWAITING_AUTHORIZATION",
      note: "No accepted governance rule authorizes held-out TEST evaluation at this stage. Training completion does not authorize TEST use, and TEST must not be used for validation, model selection, prompt engineering or checkpoint selection.",
      nextGate: "EXPLICIT_EVALUATION_AUTHORIZATION_REQUIRED",
    },

    // ------------------------------------------------------------------- promotion
    promotion: {
      promoted: false,
      targetModel: "GHARIBO-V0.1",
      targetStatus: "NOT_CREATED",
      reason:
        "Training completion is not model promotion. Promotion requires at least one real evaluation result; none exists.",
    },

    /**
     * ATTEMPT HISTORY. Attempts 1 and 2 are preserved verbatim as ERROR-before-training.
     * DEC-0030 does not supersede DEC-0027/0028/0029: it accepts the outcome of the artifact
     * DEC-0029 authorized, so supersedesDecisionId is null.
     */
    executionAttemptHistory: [
      {
        attemptNumber: 1,
        decisionId: "DEC-0027",
        kernelVersion: 1,
        artifactNotebookSha256: "f849aa41a8c4affbaae9b4e0d5cf049d14c818df3289619eba8b0a1471e33ddf",
        artifactLaunchBundleHash: "fec22ca290645035fc807f3cc6dec40c5f26389b18f490e932c4bd05e31cb4c0",
        externalStatus: "KernelWorkerStatus.ERROR",
        rootCauseClass: "DEPENDENCY_INSTALL_FAILURE_WITH_DIAGNOSTIC_SUPPRESSED",
        trainingStarted: false,
        testPayloadUploaded: false,
        testPayloadAccessed: false,
      },
      {
        attemptNumber: 2,
        decisionId: "DEC-0028",
        kernelVersion: 2,
        artifactNotebookSha256: "be4af0d4f9a492e7c6b5a2b713b205e17adf7d34d0d0f62aaf1589977cec54ba",
        artifactLaunchBundleHash: "4380da6382a1484ed41388661057c4a9c1c60f7ae34d612380a4b6f36da21230",
        externalStatus: "KernelWorkerStatus.ERROR",
        rootCauseClass: "FROZEN_SET_RESOLVER_UNSATISFIABLE_IN_SINGLE_TRANSACTION",
        trainingStarted: false,
        testPayloadUploaded: false,
        testPayloadAccessed: false,
      },
      {
        attemptNumber: 3,
        decisionId: "DEC-0029",
        kernelVersion: 3,
        artifactNotebookSha256: "dda3b050034afa0922bda573565ff8f678767e62a944a01d597761aec254b4b1",
        artifactLaunchBundleHash: "b3b4efc8f4b4c04eedd8610b6b4cdb479817d638e971ce8e8c9b67079d587efb",
        externalStatus: "KernelWorkerStatus.COMPLETE",
        rootCauseClass: null,
        trainingStarted: true,
        testPayloadUploaded: false,
        testPayloadAccessed: false,
      },
    ],

    recipe: {
      method: "QLoRA + SFT",
      quantization: "4-bit",
      declaredDtype: "fp16",
      effectiveDtype: "float32",
      sequenceLength: 512,
      loraR: 16,
      loraAlpha: 32,
      targetModules: ["q_proj", "v_proj"],
      perDeviceTrainBatchSize: 1,
      gradientAccumulationSteps: 4,
      effectiveBatchSize: 4,
      learningRate: 0.0002,
      epochs: 1,
      seed: 42,
      optimizer: "adamw_8bit",
      lrSchedulerType: "linear",
      warmupSteps: 5,
      weightDecay: 0.01,
      baseModel: "openai/gpt-oss-20b",
      baseModelRevision: "6cee5e81ee83917806bbde320786a8fb61efebee",
      loaderModelId: "unsloth/gpt-oss-20b",
      note: "Byte-identical to the DEC-0027/DEC-0028/DEC-0029 governed recipe except for the effective dtype, which the runtime imposed. No recipe field was edited after the fact.",
    },

    acceptedAt: "2026-09-15T20:22:22Z",
  };
}

/** The acceptance hash: sha256 over the canonical body, excluding the hash itself. */
export function executionAcceptanceHash(body = executionAcceptanceBody()) {
  return sha256Canonical(body);
}

export function executionAcceptance() {
  const body = executionAcceptanceBody();
  return { ...body, acceptanceHash: executionAcceptanceHash(body) };
}

function main() {
  const record = executionAcceptance();
  const outPath = join(ROOT, OUT_REL);
  const serialized = JSON.stringify(record, null, 2) + "\n";

  if (process.argv.includes("--check")) {
    if (!existsSync(outPath)) {
      console.error(`FAIL ${OUT_REL} is missing`);
      process.exit(1);
    }
    const onDisk = readFileSync(outPath, "utf8");
    if (onDisk !== serialized) {
      console.error(`FAIL ${OUT_REL} is stale — run: node scripts/training/build-dec0030-acceptance.mjs`);
      process.exit(1);
    }
    console.log(`PASS ${OUT_REL} is up to date (acceptanceHash=${record.acceptanceHash})`);
    return;
  }

  writeFileSync(outPath, serialized, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`acceptanceHash: ${record.acceptanceHash}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
