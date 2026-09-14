/**
 * KaggleTrainingWorker — Worker #1 (architecture M2 §2.3).
 *
 * Implements the provider-neutral `TrainingWorker` interface for Kaggle Notebooks
 * (free T4). The worker is PURE: it renders a notebook, lays out a bundle, and
 * describes operator steps — it never runs training, never touches a secret, and
 * never reaches the network.
 */
import type {
  BundleFile,
  NotebookArtifact,
  ResumePlan,
  ResumeRequest,
  TrainingPackage,
  WorkerCapabilities,
  WorkerInstructions,
  WorkerStatus,
} from "@gharibo/shared";
import type { BundleDatasetContents, TrainingWorker } from "../index";
import { renderNotebook as renderNotebookImpl } from "./notebook-render";
import { buildBundle as buildBundleImpl } from "./bundle";
import { instructions as instructionsImpl } from "./instructions";
import { normalizeStatus as normalizeStatusImpl } from "./status";

/** Kaggle free-tier capabilities (m2-stack-facts.md §1). */
export const KAGGLE_CAPABILITIES: WorkerCapabilities = {
  gpuClass: "NVIDIA T4 (16 GB, sm_75)",
  dtype: "fp16",
  supportsResume: true,
  supportsSecrets: true,
  persistentPath: "/kaggle/working",
  persistentQuotaBytes: 20 * 1024 ** 3,
  maxSessionSeconds: 43200,
};

/** Turns a resume request into the patch + steps for a NEW package (§9.3). */
export function planResume(req: ResumeRequest): ResumePlan {
  return {
    packagePatch: { resumeFromCheckpoint: req.resumeFromCheckpoint },
    instructions: [
      `Re-attach the previous run's output (or a Kaggle Dataset) that contains ${req.checkpointRef}.`,
      `Set checkpoint_policy.resume_from_checkpoint to ${req.resumeFromCheckpoint} (a NEW package is issued).`,
      "Run all cells again as a committed / Save-Version run; training resumes from the checkpoint " +
        "without restarting from zero.",
    ],
  };
}

/** The Kaggle worker implementation. */
export const kaggleTrainingWorker: TrainingWorker = {
  id: "kaggle",
  displayName: "Kaggle Notebooks (free T4)",
  capabilities: KAGGLE_CAPABILITIES,

  renderNotebook(pkg: TrainingPackage): NotebookArtifact {
    return renderNotebookImpl(pkg);
  },

  buildBundle(pkg: TrainingPackage, contents?: BundleDatasetContents): BundleFile[] {
    return buildBundleImpl(pkg, contents);
  },

  instructions(pkg: TrainingPackage): WorkerInstructions {
    return instructionsImpl(pkg);
  },

  normalizeStatus(raw: unknown): WorkerStatus {
    return normalizeStatusImpl(raw);
  },

  planResume(req: ResumeRequest): ResumePlan {
    return planResume(req);
  },
};
