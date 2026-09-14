/**
 * GET /api/training-packages/[id] — get an issued package (camelCase) + manifest
 * + the exact operator instructions for its worker (single source of truth).
 */
import { NextRequest } from "next/server";
import { trainingPackagesRepository } from "@/lib/db/repositories";
import { parseManifest } from "@/lib/training/package";
import { getTrainingWorker } from "@/lib/workers";
import { toApiResponse, HttpError } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const row = trainingPackagesRepository.get(params.id);
    if (!row) throw new HttpError(404, "Training package not found");
    const pkg = parseManifest(row.manifest);
    const worker = getTrainingWorker((row.workerId as "kaggle") ?? "kaggle");
    return {
      package: pkg,
      manifest: row.manifest,
      instructions: worker.instructions(pkg),
    };
  });
}
