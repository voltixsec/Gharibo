/**
 * Pre-flight check types — hardware/environment readiness.
 * @gharibo/shared
 */

/** Status of a single pre-flight check item. */
export type PreflightStatus = "READY" | "NOT_READY" | "UNKNOWN";

/** A single pre-flight check item. */
export interface PreflightCheckItem {
  /** Check identifier, e.g. "python", "torch", "cuda", "gpu", "vram". */
  check: string;
  status: PreflightStatus;
  /** Human-readable detail, e.g. "PyTorch 2.4.0" or "nvidia-smi not available". */
  detail: string;
}

/** Full pre-flight result returned by the trainer service. */
export interface PreflightResult {
  overallReady: boolean;
  items: PreflightCheckItem[];
  checkedAt: string;
}
