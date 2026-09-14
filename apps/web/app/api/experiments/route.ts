/**
 * GET /api/experiments — list experiments.
 * POST /api/experiments — create an experiment.
 */
import { NextRequest } from "next/server";
import { experimentsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const createSchema = z.object({
  codeVersion: z.string().nullable().default(null),
  modelId: z.string().nullable().default(null),
  datasetVersion: z.string().nullable().default(null),
  configuration: z.record(z.unknown()).default({}),
  seed: z.number().int().nullable().default(null),
  results: z.record(z.unknown()).default({}),
  notes: z.string().nullable().default(null),
  trainingRunId: z.string().nullable().default(null),
});

export async function GET() {
  return toApiResponse(() => experimentsRepository.list());
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    return experimentsRepository.create(parsed.data);
  });
}
