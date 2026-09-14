/**
 * TrainingWorker abstraction types (architecture M2 §2.1).
 * @gharibo/shared
 *
 * The interface is PURE: every method is a total function from a TrainingPackage
 * (plain data) to an artifact. No method touches a GPU, the network, or a secret.
 * Kaggle is Worker #1, not the architecture.
 */

/** The only worker id required in M2. */
export type TrainingWorkerId = "kaggle";

/** Worker-native run state, normalised into GHARIBO resilience states (§10). */
export type WorkerRunState =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "INTERRUPTED"
  | "RESUMABLE"
  | "CANCELLED";

/** The only worker-specific surface the UI reads; it never branches on workerId. */
export interface WorkerCapabilities {
  /** e.g. "NVIDIA T4 (16 GB, sm_75)". */
  gpuClass: string;
  /** T4 = Turing: bf16 unsupported. */
  dtype: "fp16";
  supportsResume: boolean;
  /** Kaggle Secrets. */
  supportsSecrets: boolean;
  /** e.g. "/kaggle/working". */
  persistentPath: string;
  /** 20 * 1024 ** 3. */
  persistentQuotaBytes: number;
  /** ~12h. */
  maxSessionSeconds: number;
}

/** A normalised worker status. */
export interface WorkerStatus {
  state: WorkerRunState;
  detail: string;
  /** ISO 8601. */
  updatedAt: string;
}

/** A request to resume an interrupted run from a persisted checkpoint. */
export interface ResumeRequest {
  runId: string;
  /** Re-attached output dir or Kaggle Dataset path. */
  checkpointRef: string;
  /** checkpoint-<step> directory. */
  resumeFromCheckpoint: string;
}

/** The patch + steps that yield a NEW immutable package. */
export interface ResumePlan {
  packagePatch: { resumeFromCheckpoint: string };
  instructions: string[];
}

/** A deterministic, self-contained notebook. */
export interface NotebookArtifact {
  /** e.g. "GHARIBO-exp-001.ipynb". */
  filename: string;
  /** Deterministic .ipynb JSON. */
  content: string;
  sha256: string;
}

/** One UTF-8 file in the on-disk bundle. Binary artifacts are not bundled. */
export interface BundleFile {
  /** e.g. "manifest.json". */
  relativePath: string;
  content: string;
  sha256: string;
}

/** Exact operator steps to run a package on a worker (no secrets). */
export interface WorkerInstructions {
  title: string;
  steps: string[];
}
