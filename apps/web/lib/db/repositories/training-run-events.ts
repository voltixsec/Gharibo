/**
 * Training run events repository — resilience state-transition audit log (§10).
 */
import { db } from "@/lib/db/index";
import type { RunStatus } from "@gharibo/shared";
import { genId, now } from "@/lib/utils";

export interface TrainingRunEventRow {
  id: string;
  runId: string;
  fromStatus: RunStatus | null;
  toStatus: RunStatus;
  reason: string | null;
  source: string;
  createdAt: string;
}

interface RawRow {
  id: string;
  run_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  source: string;
  created_at: string;
}

function rowToEvent(row: RawRow): TrainingRunEventRow {
  return {
    id: row.id,
    runId: row.run_id,
    fromStatus: (row.from_status as RunStatus | null) ?? null,
    toStatus: row.to_status as RunStatus,
    reason: row.reason,
    source: row.source,
    createdAt: row.created_at,
  };
}

export const trainingRunEventsRepository = {
  /**
   * Appends one transition event.
   *
   * `createdAt` is optional and defaults to "now". It exists so an external
   * execution can be reconciled truthfully: when a transition actually happened
   * on a remote worker (observed status change or a timestamp derived from the
   * worker's own log offsets), the audit row must carry THAT time rather than
   * the moment the bookkeeping caught up.
   */
  append(e: {
    runId: string;
    fromStatus: RunStatus | null;
    toStatus: RunStatus;
    reason?: string | null;
    source: string;
    createdAt?: string;
  }): TrainingRunEventRow {
    const id = genId();
    const ts = e.createdAt ?? now();
    db()
      .prepare(
        `INSERT INTO training_run_events (id, run_id, from_status, to_status, reason, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, e.runId, e.fromStatus, e.toStatus, e.reason ?? null, e.source, ts);
    return {
      id,
      runId: e.runId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      reason: e.reason ?? null,
      source: e.source,
      createdAt: ts,
    };
  },

  listByRun(runId: string): TrainingRunEventRow[] {
    const rows = db()
      .prepare("SELECT * FROM training_run_events WHERE run_id = ? ORDER BY created_at ASC")
      .all(runId) as RawRow[];
    return rows.map(rowToEvent);
  },
};
