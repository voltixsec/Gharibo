/**
 * POST /api/training-runs/[id]/resume — issue a NEW immutable resume package (§9.3).
 * Resume never mutates a package: it sets checkpoint_policy.resume_from_checkpoint and
 * re-issues with a new package_id.
 */
import { NextRequest } from "next/server";
import { trainingPackagesRepository, trainingRunsRepository } from "@/lib/db/repositories";
import { parseManifest, finalizePackage, serializeManifest } from "@/lib/training/package";
import { getTrainingWorker } from "@/lib/workers";
import { toApiResponse, HttpError, type TrainingPackage } from "@gharibo/shared";
import { z } from "zod";

const resumeSchema = z.object({
  checkpointRef: z.string().min(1),
  resumeFromCheckpoint: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(async () => {
    const json = await request.json();
    const parsed = resumeSchema.safeParse(json);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }

    const runId = params.id;
    let run = trainingRunsRepository.get(runId);
    if (!run) throw new HttpError(404, "Training run not found");

    const packageRow = trainingPackagesRepository.getByRun(runId);
    if (!packageRow) throw new HttpError(400, "No package is linked to this run");

    const worker = getTrainingWorker((packageRow.workerId as "kaggle") ?? "kaggle");
    const plan = worker.planResume({
      runId,
      checkpointRef: parsed.data.checkpointRef,
      resumeFromCheckpoint: parsed.data.resumeFromCheckpoint,
    });

    // Operator may mark INTERRUPTED → RESUMABLE explicitly before resuming.
    if (run.status === "INTERRUPTED") {
      run = trainingRunsRepository.transition(runId, "RESUMABLE", {
        source: "api",
        reason: "resume requested",
      })!;
    }
    if (run.status !== "RESUMABLE") {
      throw new HttpError(
        400,
        `Run must be RESUMABLE (or INTERRUPTED) to resume; current status: ${run.status}`,
      );
    }

    // Issue a NEW package with the resume point set (immutability preserved).
    const base = parseManifest(packageRow.manifest);
    const newPkg: TrainingPackage = finalizePackage({
      ...base,
      checkpointPolicy: {
        ...base.checkpointPolicy,
        resumeFromCheckpoint: plan.packagePatch.resumeFromCheckpoint,
      },
      createdAt: new Date().toISOString(),
    });
    const manifest = serializeManifest(newPkg);
    const notebook = worker.renderNotebook(newPkg);

    const newRow = trainingPackagesRepository.create({
      manifest,
      experimentId: newPkg.experimentId,
      datasetId: packageRow.datasetId,
      datasetVersionId: packageRow.datasetVersionId,
      runId,
      notebookSha256: notebook.sha256,
      bundlePath: null,
      workerId: worker.id,
    });

    trainingRunsRepository.setPackage(runId, newRow.id);
    trainingRunsRepository.setResumeFromCheckpoint(runId, parsed.data.resumeFromCheckpoint);
    trainingRunsRepository.transition(runId, "QUEUED", {
      source: "api",
      reason: `resume package issued (${newRow.id.slice(0, 12)})`,
    });

    return { package: newPkg };
  });
}
