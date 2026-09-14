/**
 * POST /api/training-runs/[id]/import-results — import real run results (M2-P1-01/P1-02).
 *
 * Verifies artifact integrity against the manifest-of-hashes (§5.3/§8) and records the
 * terminal state EXPLICITLY (never silently guessed — §10.3). No metrics are fabricated:
 * only the values supplied by a real run are stored.
 */
import { NextRequest } from "next/server";
import {
  experimentsRepository,
  trainingArtifactsRepository,
  trainingPackagesRepository,
  trainingRunsRepository,
} from "@/lib/db/repositories";
import { parseManifest } from "@/lib/training/package";
import { artifactRollup } from "@/lib/training/hash";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const artifactSchema = z.object({
  relativePath: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "artifact sha256 must be 64-hex"),
  sizeBytes: z.number().int().nonnegative().default(0),
  kind: z.string().min(1).default("artifact"),
});

const importSchema = z.object({
  manifest: z.string().min(1),
  metrics: z.record(z.unknown()).default({}),
  artifacts: z.array(artifactSchema).default([]),
  rollupHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  outcome: z.enum(["COMPLETED", "FAILED", "INTERRUPTED"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(async () => {
    const json = await request.json();
    const parsed = importSchema.safeParse(json);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    const body = parsed.data;

    const runId = params.id;
    const run = trainingRunsRepository.get(runId);
    if (!run) throw new HttpError(404, "Training run not found");

    // The imported manifest must reference a package GHARIBO actually issued.
    let imported;
    try {
      imported = parseManifest(body.manifest);
    } catch {
      throw new HttpError(400, "Imported manifest is not valid JSON");
    }
    const packageRow = trainingPackagesRepository.get(imported.packageId);
    if (!packageRow) {
      throw new HttpError(400, `Imported manifest references an unknown package: ${imported.packageId}`);
    }

    // Artifact integrity (P1-02): re-hash the manifest-of-hashes and compare.
    if (body.artifacts.length > 0) {
      if (!body.rollupHash) {
        throw new HttpError(400, "rollupHash is required when artifacts are provided (artifact integrity check)");
      }
      const recomputed = artifactRollup(
        body.artifacts.map((a) => ({ relativePath: a.relativePath, sha256: a.sha256 })),
      );
      if (recomputed !== body.rollupHash) {
        throw new HttpError(400, `Artifact rollup mismatch: ${recomputed} != ${body.rollupHash}`);
      }
      trainingArtifactsRepository.replaceForPackage(
        packageRow.id,
        body.artifacts.map((a) => ({
          relativePath: a.relativePath,
          kind: a.kind,
          sha256: a.sha256,
          sizeBytes: a.sizeBytes,
        })),
        recomputed,
      );
    }

    // Advance to RUNNING if the operator never marked it, then set the explicit outcome.
    if (run.status === "QUEUED") {
      trainingRunsRepository.transition(runId, "RUNNING", { source: "import", reason: "results imported" });
    }
    const current = trainingRunsRepository.get(runId)!;
    if (current.status === "RUNNING") {
      trainingRunsRepository.transition(runId, body.outcome, {
        source: "import",
        reason: `imported results (outcome=${body.outcome})`,
      });
    } else if (current.status !== body.outcome) {
      throw new HttpError(400, `Cannot import results for a run in status ${current.status}`);
    }

    trainingRunsRepository.setMetrics(runId, body.metrics);
    trainingRunsRepository.setTimes(runId, {
      startTime: body.startedAt ?? current.startTime,
      endTime: body.finishedAt ?? new Date().toISOString(),
    });

    // Attach the imported provenance to the experiment, when one exists.
    const experiment = experimentsRepository.list().find((e) => e.trainingRunId === runId);
    if (experiment) {
      experimentsRepository.setProvenance(
        experiment.id,
        {
          ...(experiment.provenance ?? {}),
          package_id: packageRow.id,
          artifact_rollup_hash: body.rollupHash ?? null,
          imported_at: new Date().toISOString(),
          outcome: body.outcome,
          metrics_keys: Object.keys(body.metrics),
        },
        imported as unknown as Record<string, unknown>,
      );
    }

    return trainingRunsRepository.get(runId);
  });
}
