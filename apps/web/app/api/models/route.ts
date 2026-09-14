/**
 * GET /api/models — list model registry entries.
 * POST /api/models — register a new model.
 */
import { NextRequest } from "next/server";
import { modelRegistryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const createSchema = z.object({
  modelName: z.string().min(1),
  version: z.string().min(1),
  baseModel: z.string().nullable().default(null),
  trainingRunId: z.string().nullable().default(null),
  datasetVersion: z.string().nullable().default(null),
  trainingMethod: z.string().nullable().default(null),
  checkpointLocation: z.string().nullable().default(null),
  adapterLocation: z.string().nullable().default(null),
  evaluationScore: z.record(z.unknown()).default({}),
  status: z.enum(["EXPERIMENT", "CANDIDATE", "ACCEPTED", "DEPRECATED"]).default("EXPERIMENT"),
  notes: z.string().nullable().default(null),
});

export async function GET() {
  return toApiResponse(() => modelRegistryRepository.list());
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    return modelRegistryRepository.create(parsed.data);
  });
}
