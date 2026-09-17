#!/usr/bin/env node
/**
 * EXP-002 pre-training gate artifact.
 *
 * Composes the measured evidence (token window, masking contract, governed
 * split) with the governed recipe and the Harmony extraction regression into ONE
 * machine-readable preflight record, and evaluates the hard gates.
 *
 * The gates fail closed. A FAIL verdict is a non-zero exit and means DO NOT TRAIN.
 *
 * Required by `governance/DEC-0048-exp001-training-objective-defect.json`
 * (`exp002.requiredPreTrainingGates`).
 *
 * Usage:
 *   node scripts/exp002/build-exp002-preflight.mjs [--check]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXP002_ID,
  EXP002_SPLIT,
  EXPECTED_RUNTIME,
  GOVERNED_CHAT_TEMPLATE_PATH,
  GOVERNED_CHAT_TEMPLATE_SHA256,
  HYPERPARAMETERS,
  LOSS_CONTRACT,
  MEASURED_MAX_RENDERED_TOKENS,
  SEQUENCE_LENGTH,
  TOKEN_WINDOW_ARTIFACT,
  MASKING_CONTRACT_ARTIFACT,
  canonicalJson,
  recipeDefinition,
  recipeHash,
} from "../../apps/web/lib/training/exp002-recipe.mjs";
import {
  containsHiddenChannel,
  extractFinalChannel,
  finalChannelOrNull,
} from "../../apps/web/lib/runtime/harmony-final.mjs";
import { runExtractionRegression } from "../../apps/web/lib/runtime/harmony-final-fixtures.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_PATH = resolve(REPO_ROOT, "data/derived/exp002/preflight.json");

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const readJson = (relPath) => JSON.parse(readFileSync(resolve(REPO_ROOT, relPath), "utf8"));
const readText = (relPath) => readFileSync(resolve(REPO_ROOT, relPath), "utf8");

function main() {
  const check = process.argv.includes("--check");

  const tokenWindow = readJson(TOKEN_WINDOW_ARTIFACT);
  const masking = readJson(MASKING_CONTRACT_ARTIFACT);
  const splitManifest = readJson(EXP002_SPLIT.manifestPath);

  // The governed chat template must hash to the pinned value, on disk, now.
  const templateText = readText(GOVERNED_CHAT_TEMPLATE_PATH);
  const templateSha = sha256(templateText);

  const extraction = runExtractionRegression(
    extractFinalChannel,
    containsHiddenChannel,
    finalChannelOrNull,
  );

  // ---------------------------------------------------------------------
  // Generated-artifact contract agreement.
  //
  // Pilot Kaggle Version 1 died pre-training because the PACKAGE the notebook
  // received said `dtype: "fp16"` while the notebook asserted `float32`. The
  // source of truth was a hardcoded literal in the package builder. This check
  // reads the GENERATED artifacts — the manifest the notebook will actually
  // receive and the rendered notebook itself — so the contradiction cannot be
  // reintroduced by any future edit to any single file.
  // ---------------------------------------------------------------------
  const packageModes = ["pilot", "production"];
  const packageAgreement = [];

  /**
   * Extracts the manifest the notebook will ACTUALLY receive, by joining the
   * notebook's cell sources into raw Python and reading the literal between the
   * `r'''` fences. String-matching the escaped notebook JSON would be fragile;
   * parsing the real payload is not.
   */
  function embeddedManifest(notebookJson) {
    const raw = notebookJson.cells
      .map((c) => (Array.isArray(c.source) ? c.source.join("") : String(c.source)))
      .join("\n");
    const open = raw.indexOf("PACKAGE = json.loads(r'''");
    if (open === -1) return null;
    const from = raw.indexOf("'''", open) + 3;
    const to = raw.indexOf("'''", from);
    if (to === -1) return null;
    try {
      return JSON.parse(raw.slice(from, to).trim());
    } catch {
      return null;
    }
  }

  /** Python source with `#` comments removed, so only executable code is tested. */
  function executableOnly(pythonSource) {
    return pythonSource
      .split("\n")
      .map((line) => {
        const at = line.indexOf("#");
        return at === -1 ? line : line.slice(0, at);
      })
      .join("\n");
  }

  for (const mode of packageModes) {
    const manifestPath = `data/derived/exp002/package-${mode}/package-manifest.json`;
    const summaryPath = `data/derived/exp002/package-${mode}/launch-summary.json`;
    if (!existsSync(resolve(REPO_ROOT, manifestPath))) continue;

    const manifest = readJson(manifestPath);
    const summary = readJson(summaryPath);
    const notebookPath = `data/derived/exp002/package-${mode}/${summary.notebook.filename}`;
    const notebookJson = readJson(notebookPath);
    const rawPython = notebookJson.cells
      .map((c) => (Array.isArray(c.source) ? c.source.join("") : String(c.source)))
      .join("\n");
    const code = executableOnly(rawPython);

    const delivered = embeddedManifest(notebookJson);
    const governedDtype = HYPERPARAMETERS.dtype;

    packageAgreement.push({
      mode,
      manifestDtype: manifest.dtype,
      recipeDtype: manifest.exp002?.declared_dtype,
      governedDtype,
      // What the notebook will read at runtime, parsed from the delivered payload.
      deliveredDtype: delivered?.dtype ?? null,
      deliveredDeclaredDtype: delivered?.exp002?.declared_dtype ?? null,
      deliveredSequenceLength: delivered?.sequence_length ?? null,
      // Executable-code assertions, comments excluded.
      assertsDtypeIsGoverned:
        code.includes(`PACKAGE['dtype'] == '${governedDtype}'`) &&
        code.includes("PACKAGE['exp002']['declared_dtype']"),
      rejectsSilentDowngrade: !code.includes("max_seq_length = 512"),
      assertsContextLength:
        code.includes("CONTEXT_POLICY['chosen_context_length']") &&
        code.includes("example['assistant_end'] <= max_seq_length"),
      agree:
        manifest.dtype === governedDtype &&
        manifest.exp002?.declared_dtype === governedDtype &&
        delivered?.dtype === governedDtype &&
        delivered?.exp002?.declared_dtype === governedDtype &&
        delivered?.sequence_length === SEQUENCE_LENGTH &&
        code.includes(`PACKAGE['dtype'] == '${governedDtype}'`) &&
        code.includes("PACKAGE['exp002']['declared_dtype']") &&
        !code.includes("max_seq_length = 512"),
    });
  }

  const trainWindow = tokenWindow.measurements.train;
  const devWindow = tokenWindow.measurements.dev;

  const visibility = (measurement, context) => measurement.assistantVisibilityByContext[String(context)];

  // ---------------------------------------------------------------------
  // Hard gates
  // ---------------------------------------------------------------------
  const gates = {
    // --- data integrity ---
    trainRowsMatchGovernedSplit:
      masking.splits.train.rows === EXP002_SPLIT.train.rows &&
      trainWindow.rows === EXP002_SPLIT.train.rows,
    devRowsMatchGovernedSplit:
      masking.splits.dev.rows === EXP002_SPLIT.dev.rows &&
      devWindow.rows === EXP002_SPLIT.dev.rows,
    splitIsPartitionOf720:
      splitManifest.splits.train.rows +
        splitManifest.splits.dev.rows +
        splitManifest.splits.qualification.rows ===
      720,
    splitHashesMatchManifest:
      splitManifest.splits.train.splitHash === EXP002_SPLIT.train.splitHash &&
      splitManifest.splits.dev.splitHash === EXP002_SPLIT.dev.splitHash &&
      splitManifest.splits.qualification.splitHash === EXP002_SPLIT.qualification.splitHash,

    // --- the EXP-001 defect class, made impossible ---
    zeroTrainAssistantEntirelyOutsideWindow:
      visibility(trainWindow, SEQUENCE_LENGTH).zero === 0 &&
      masking.splits.train.assistantEntirelyOutsideWindow === 0,
    zeroTrainAssistantTruncated:
      visibility(trainWindow, SEQUENCE_LENGTH).partial === 0 &&
      masking.splits.train.assistantTruncatedAtContext === 0,
    zeroDevAssistantTruncated:
      visibility(devWindow, SEQUENCE_LENGTH).partial === 0 &&
      masking.splits.dev.assistantTruncatedAtContext === 0,
    zeroTrainZeroSupervisedTokens:
      masking.splits.train.zeroSupervisedTokens === 0,
    zeroDevZeroSupervisedTokens: masking.splits.dev.zeroSupervisedTokens === 0,
    everyTrainRowHasSupervisedTail:
      masking.splits.train.rowsWithSupervisedTail === masking.splits.train.rows,
    measuredMaxFitsChosenContext: MEASURED_MAX_RENDERED_TOKENS < SEQUENCE_LENGTH,

    // --- representation + loss contract ---
    governedTemplateHashMatches: templateSha === GOVERNED_CHAT_TEMPLATE_SHA256,
    tokenizerIdentityMatchesGovernedTemplate:
      tokenWindow.tokenizer.governedChatTemplateSha256 === GOVERNED_CHAT_TEMPLATE_SHA256,
    pinnedSystemDateApplied:
      tokenWindow.tokenizer.pinnedSystemDate === "2026-09-15" &&
      masking.governedContract.pinnedSystemDate === "2026-09-15",
    lossContractIsExplicitMask:
      LOSS_CONTRACT.kind === "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK" &&
      LOSS_CONTRACT.reliesOnTrainerDefault === false,
    maskingContractVerdictPass: masking.verdict === "PASS",
    batchLossContractPasses: masking.gates.batchLossContractPasses === true,

    // --- role contract parity ---
    // Parity is structural: the inference prompt render is proven to be a token
    // prefix of the training render on every row, so the prompt the model sees at
    // inference is byte-identical to the prompt it was trained against.
    roleSequenceIsGoverned: Object.keys(trainWindow.roleSequences).every(
      (seq) => seq === "system -> user -> assistant",
    ),
    roleSequenceParityTrainDev:
      JSON.stringify(Object.keys(trainWindow.roleSequences)) ===
      JSON.stringify(Object.keys(devWindow.roleSequences)),
    trainInferencePromptParityProvenByPrefix:
      masking.gates.zeroBuildFailures === true &&
      masking.splits.train.buildFailures === 0,

    // --- extraction determinism ---
    extractionRegressionPass: extraction.pass === true,

    // --- generated-artifact contract agreement (pilot Version 1 remediation) ---
    packageDtypeAgreesAcrossArtifacts:
      packageAgreement.length > 0 && packageAgreement.every((p) => p.agree),
    pilotPackageDtypeIsGoverned:
      packageAgreement.find((p) => p.mode === "pilot")?.manifestDtype ===
      HYPERPARAMETERS.dtype,
    productionPackageDtypeIsGoverned:
      packageAgreement.find((p) => p.mode === "production")?.manifestDtype ===
      HYPERPARAMETERS.dtype,

    // --- isolation ---
    noConsumedTestAccess:
      tokenWindow.testAccessed === false &&
      masking.testAccessed === false &&
      splitManifest.source.splitsNeverOpened.includes("test") &&
      splitManifest.source.splitsUsed.includes("train") &&
      splitManifest.source.splitsUsed.includes("validation") &&
      !splitManifest.source.splitsUsed.includes("test"),
    qualificationSealed:
      EXP002_SPLIT.qualification.readPolicy === "SEALED_UNTIL_V1_PROMOTION_GATE",
    consumedTestNotReusable:
      EXP002_SPLIT.consumedTest.reusableAsPromotionEvidence === false,
  };

  const failed = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  const preflight = {
    artifactKind: "GHARIBO_EXP002_PREFLIGHT",
    schemaVersion: "1.0.0",
    experimentId: EXP002_ID,
    recipeHash: recipeHash(),
    recipe: recipeDefinition(),

    data: {
      trainRows: masking.splits.train.rows,
      devRows: masking.splits.dev.rows,
      // Qualification rows come from the split manifest only: the qualification
      // payload is sealed and is never tokenized or measured.
      qualificationRows: splitManifest.splits.qualification.rows,
      splitSeed: EXP002_SPLIT.seed,
      splitHashes: {
        train: splitManifest.splits.train.splitHash,
        dev: splitManifest.splits.dev.splitHash,
        qualification: splitManifest.splits.qualification.splitHash,
      },
      qualificationSealed: true,
      consumedTestSplitHash: EXP002_SPLIT.consumedTest.splitHash,
      consumedTestUsed: false,
      lineageDisclosure: splitManifest.lineageDisclosure,
    },

    contractAgreement: {
      governedDtype: HYPERPARAMETERS.dtype,
      governedSequenceLength: SEQUENCE_LENGTH,
      packages: packageAgreement,
      statement:
        "Each generated package's declared dtype, the governed recipe dtype, and the " +
        "dtype the rendered notebook asserts are all required to be equal. Pilot Kaggle " +
        "Version 1 failed pre-training because they were not.",
    },
    tokenizer: tokenWindow.tokenizer,
    roleSequence: Object.keys(trainWindow.roleSequences)[0],

    contextPolicy: {
      chosenContextLength: SEQUENCE_LENGTH,
      measuredMaxRenderedTokens: MEASURED_MAX_RENDERED_TOKENS,
      rule: "smallest candidate context with zero partial and zero zero-visibility assistant spans across TRAIN and DEV",
      train: {
        renderedTokens: trainWindow.renderedTokens,
        assistantStart: trainWindow.assistantStart,
        assistantEnd: trainWindow.assistantEnd,
        supervisedTokens: trainWindow.supervisedTokens,
        assistantContentTokens: trainWindow.assistantContentTokens,
      },
      dev: {
        renderedTokens: devWindow.renderedTokens,
        assistantStart: devWindow.assistantStart,
        assistantEnd: devWindow.assistantEnd,
        supervisedTokens: devWindow.supervisedTokens,
        assistantContentTokens: devWindow.assistantContentTokens,
      },
      visibilityAtChosenContext: {
        trainFull: visibility(trainWindow, SEQUENCE_LENGTH).full,
        trainPartial: visibility(trainWindow, SEQUENCE_LENGTH).partial,
        trainZero: visibility(trainWindow, SEQUENCE_LENGTH).zero,
        devFull: visibility(devWindow, SEQUENCE_LENGTH).full,
        devPartial: visibility(devWindow, SEQUENCE_LENGTH).partial,
        devZero: visibility(devWindow, SEQUENCE_LENGTH).zero,
      },
      visibilityAcrossCandidateContexts: {
        train: trainWindow.assistantVisibilityByContext,
        dev: devWindow.assistantVisibilityByContext,
      },
    },

    lossContract: {
      ...LOSS_CONTRACT,
      supervisedTokens: {
        train: masking.splits.train.minSupervisedTokens,
        dev: masking.splits.dev.minSupervisedTokens,
        trainMin: masking.splits.train.minSupervisedTokens,
      },
      batchProofs: masking.batchProofs,
      perExampleMaskChecksPass: masking.splits.train.allMaskChecksPass,
    },

    harmonyFinalContract: {
      finalChannel: "final",
      terminator: "<|return|>",
      hiddenChannels: ["analysis", "commentary"],
      deterministic: true,
      regression: {
        pass: extraction.pass,
        caseCount: extraction.caseCount,
        passed: extraction.passed,
        failed: extraction.failed,
        failures: extraction.failures,
      },
    },

    expectedRuntime: EXPECTED_RUNTIME,

    isolation: {
      testAccessed: false,
      testPolicy:
        "The consumed Gold v0.1 TEST split is never read, tokenized or scored as EXP-002 promotion evidence.",
      qualificationReadPolicy: "SEALED_UNTIL_V1_PROMOTION_GATE",
      kagglePayloadContainsTest: false,
      kagglePayloadContainsQualification: false,
      kagglePayloadContainsGoldAnswersForScoring: false,
    },

    externalLaunch: {
      required: true,
      authorizationPhrase: "AUTHORIZE EXP-002 TRAINING LAUNCH",
      authorizedLaunches: 0,
      maximumKernelPushes: 1,
      kernelPushesPerformed: 0,
    },

    gates,
    verdict: failed.length === 0 ? "PASS" : "FAIL",
    failedGates: failed,
  };

  const text = JSON.stringify(preflight, null, 2) + "\n";

  if (check) {
    if (!existsSync(OUT_PATH) || readFileSync(OUT_PATH, "utf8") !== text) {
      console.error("DRIFT: data/derived/exp002/preflight.json is not byte-identical");
      process.exit(1);
    }
    console.log("PASS: EXP-002 preflight is byte-identical (no drift)");
    console.log("verdict:", preflight.verdict);
    process.exit(preflight.verdict === "PASS" ? 0 : 1);
  }

  writeFileSync(OUT_PATH, text, "utf8");

  console.log("EXP-002 preflight");
  console.log("=".repeat(64));
  console.log("experiment id :", EXP002_ID);
  console.log("recipe hash   :", preflight.recipeHash);
  console.log("context length:", SEQUENCE_LENGTH);
  console.log("train rows    :", preflight.data.trainRows);
  console.log("dev rows      :", preflight.data.devRows);
  console.log("qual rows     :", preflight.data.qualificationRows, "(SEALED)");
  console.log("terminator    :", preflight.harmonyFinalContract.terminator);
  console.log("");
  for (const [name, ok] of Object.entries(gates)) {
    console.log("  %s %s", ok ? "PASS" : "FAIL", name);
  }
  console.log("");
  console.log("verdict:", preflight.verdict);
  console.log("wrote", OUT_PATH);
  console.log("preflight sha256:", sha256(text));

  process.exit(preflight.verdict === "PASS" ? 0 : 1);
}

main();
