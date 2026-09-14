/**
 * Kaggle status normalisation (architecture M2 §2.3, §10.3).
 *
 * Maps a Kaggle run's terminal signals to a normalised WorkerStatus. This is a
 * SUGGESTION only: per §10.3, `INTERRUPTED` vs `FAILED` is set EXPLICITLY by the
 * import step / operator, never silently guessed. The heuristic's suggestion is
 * carried in `detail`, and the recorded state is written by the import path.
 */
import type { WorkerStatus } from "@gharibo/shared";

/** The signals a Kaggle run exposes after a session ends. */
export interface KaggleRunSignals {
  /** A `COMPLETED` marker file was written under /kaggle/working. */
  hasCompletionMarker?: boolean;
  /** A traceback / exception marker was found. */
  hasTraceback?: boolean;
  /** A checkpoint-<step> directory exists. */
  hasCheckpoint?: boolean;
  /** A trainer_state.json exists. */
  hasTrainerState?: boolean;
  /** The operator cancelled the run. */
  cancelled?: boolean;
  /** ISO 8601 timestamp of the observation. */
  updatedAt?: string;
}

/** Normalises raw Kaggle signals into a WorkerStatus (suggestion only). */
export function normalizeStatus(raw: unknown): WorkerStatus {
  const s = (raw ?? {}) as KaggleRunSignals;
  const updatedAt = s.updatedAt ?? new Date().toISOString();

  if (s.cancelled) {
    return { state: "CANCELLED", detail: "Run cancelled by the operator.", updatedAt };
  }
  if (s.hasCompletionMarker) {
    return {
      state: "COMPLETED",
      detail: "Completion marker present under /kaggle/working.",
      updatedAt,
    };
  }
  if (s.hasTraceback) {
    return { state: "FAILED", detail: "Traceback / exception marker present.", updatedAt };
  }

  const resumeHint =
    s.hasCheckpoint && s.hasTrainerState
      ? " A checkpoint and trainer_state.json exist — the run is RESUMABLE."
      : " No checkpoint + trainer_state.json pair found.";
  return {
    state: "INTERRUPTED",
    detail:
      "Session ended with no completion marker and no traceback (suggestion only — the recorded " +
      `state is set explicitly by the import step / operator).${resumeHint}`,
    updatedAt,
  };
}
