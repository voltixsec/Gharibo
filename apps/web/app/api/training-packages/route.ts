/**
 * GET  /api/training-packages — list issued packages (?experimentId=).
 * POST /api/training-packages — build + validate + persist a new immutable package.
 */
import { NextRequest } from "next/server";
import { trainingPackagesRepository } from "@/lib/db/repositories";
import { buildPackageForRun } from "@/lib/training/export";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const createSchema = z.object({
  experimentId: z.string().min(1),
  runId: z.string().min(1),
  datasetId: z.string().min(1),
  workerId: z.literal("kaggle").optional(),
});

export async function GET(request: NextRequest) {
  return toApiResponse(() => {
    const experimentId = request.nextUrl.searchParams.get("experimentId");
    const rows = experimentId
      ? trainingPackagesRepository.listByExperiment(experimentId)
      : trainingPackagesRepository.list();
    return rows.map((r) => ({
      id: r.id,
      experimentId: r.experimentId,
      schemaVersion: r.schemaVersion,
      datasetId: r.datasetId,
      datasetVersionId: r.datasetVersionId,
      runId: r.runId,
      workerId: r.workerId,
      notebookSha256: r.notebookSha256,
      bundlePath: r.bundlePath,
      createdAt: r.createdAt,
    }));
  });
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    // Fails loudly (400) on any package ERROR — see validatePackage.
    const result = buildPackageForRun(parsed.data);
    return result.pkg;
  });
}
