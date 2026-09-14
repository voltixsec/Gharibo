/**
 * GET /api/training-runs — list all training runs.
 * POST /api/training-runs — create a training run (status DRAFT).
 */
import { NextRequest } from "next/server";
import { trainingRunsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const createSchema = z.object({
  baseModel: z.string().min(1),
  method: z.enum(["lora", "qlora", "sft"]),
  datasetId: z.string().nullable().default(null),
  datasetVersion: z.string().nullable().default(null),
  trainExamples: z.number().int().nullable().default(null),
  validationExamples: z.number().int().nullable().default(null),
  epochs: z.number().int().nullable().default(null),
  learningRate: z.number().nullable().default(null),
  batchSize: z.number().int().nullable().default(null),
  gradientAccumulation: z.number().int().nullable().default(null),
  loraRank: z.number().int().nullable().default(null),
  loraAlpha: z.number().int().nullable().default(null),
  targetModules: z.array(z.string()).default([]),
  quantization: z.string().nullable().default(null),
  seed: z.number().int().nullable().default(null),
  device: z.string().nullable().default(null),
  startTime: z.string().nullable().default(null),
  endTime: z.string().nullable().default(null),
  checkpointPath: z.string().nullable().default(null),
  logs: z.string().nullable().default(null),
  metrics: z.record(z.unknown()).default({}),
  preflightResult: z.string().nullable().default(null),
});

export async function GET() {
  return toApiResponse(() => trainingRunsRepository.list());
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    // Training runs are always created as DRAFT — execution is P1
    return trainingRunsRepository.create({ ...parsed.data, status: "DRAFT" });
  });
}
