/**
 * Exact operator steps to run a package on the Kaggle worker (architecture M2 §2.3).
 * No secrets, no personal paths. Zero-cost only.
 */
import type { TrainingPackage, WorkerInstructions } from "@gharibo/shared";

/** The stable Kaggle secret name used for the optional HF token (NAME only). */
export const HF_TOKEN_SECRET_NAME = "HF_TOKEN";

/** Returns the exact operator steps for this package. */
export function instructions(pkg: TrainingPackage): WorkerInstructions {
  const exp = pkg.experimentId;
  const dest = pkg.artifactDestination;
  const steps: string[] = [
    "In GHARIBO, open Training → Export Training Package and download the bundle ZIP.",
    "Unzip it: you get manifest.json, dataset/{train,validation,test}.jsonl, " +
      `notebook/${exp}.ipynb, README.md and CHECKSUMS.sha256.`,
    "Create a Kaggle Dataset and upload the unzipped folder (or attach the files).",
    "Create a new Kaggle Notebook (Python).",
    "Attach the Kaggle Dataset as an input to the notebook.",
    "Enable Internet: Notebook Settings → Internet → On (required for pinned installs and model download).",
    "Select accelerator: GPU T4 x2. The recipe uses a SINGLE device (device 0 only) — no multi-GPU is required.",
  ];

  if (dest && dest.kind === "hf") {
    steps.push(
      `Add a Kaggle Secret named ${dest.tokenSecretName ?? HF_TOKEN_SECRET_NAME} containing a Hugging Face token ` +
        "that can write to the PRIVATE repo. Never paste the token into a cell — the notebook reads it by name.",
    );
  } else {
    steps.push(
      "No artifact destination is configured: local /kaggle/working export is the complete result. " +
        "No Kaggle Secret is needed.",
    );
  }

  steps.push(
    `Open notebook/${exp}.ipynb (upload it into the notebook, or copy it into /kaggle/working).`,
    "Run all cells. The notebook verifies the dataset/split hashes and pinned dependency versions, " +
      "and aborts loudly before training if VRAM or dtype is wrong.",
    "Run as a committed / Save-Version run so /kaggle/working persists as notebook Output.",
    "If the session ends before training finishes, keep the output. Re-attach it (or a Kaggle Dataset) " +
      "and resume from the latest outputs/checkpoint-<step> via GHARIBO Training → Resume.",
    "When the run completes, download the output (adapter/, metrics.json, manifest.json, CHECKSUMS.sha256) " +
      "and import it back via GHARIBO Training → run → Import results.",
    "ZERO-COST: this workflow uses only the free Kaggle tier and (optionally) a private HF repo within " +
      "the free allowance. No paid training provider and no paid storage are used.",
  );

  return {
    title: `Run ${exp} on Kaggle (free T4)`,
    steps,
  };
}

/** Renders the operator instructions as a README markdown document. */
export function renderReadme(pkg: TrainingPackage, instr: WorkerInstructions): string {
  const lines: string[] = [];
  lines.push(`# ${instr.title}`);
  lines.push("");
  lines.push(`- **Experiment:** ${pkg.experimentId}`);
  lines.push(`- **Package id:** ${pkg.packageId}`);
  lines.push(`- **Schema version:** ${pkg.schemaVersion}`);
  lines.push(`- **Base model:** ${pkg.baseModel} @ ${pkg.baseModelRevision}`);
  lines.push(`- **Loader model:** ${pkg.loaderModelId}`);
  lines.push(`- **Method:** ${pkg.method} (${pkg.quantization})`);
  lines.push(`- **dtype / seq length:** ${pkg.dtype} / ${pkg.sequenceLength}`);
  lines.push(`- **Dataset hash:** ${pkg.dataset.datasetHash}`);
  lines.push(`- **Evaluation:** NOT_RUN (declared intent only — no metrics are claimed)`);
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  instr.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push("");
  lines.push("## Zero-cost policy");
  lines.push("");
  lines.push(
    "This run executes on the free Kaggle tier only. No paid training provider and no paid " +
      "storage are used anywhere in this workflow.",
  );
  lines.push("");
  return lines.join("\n");
}
