/**
 * GET /api/evaluations — list evaluation results (optionally filtered by modelId).
 * POST /api/evaluations — create an evaluation result.
 */
import { NextRequest } from "next/server";
import { evaluationsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const createSchema = z.object({
  modelId: z.string().min(1),
  benchmarkCategory: z.enum([
    "Reasoning", "Coding", "Instruction Following", "Structured Output",
    "Research", "Source Fidelity", "Hallucination Resistance",
    "Data Extraction", "Classification", "Deduplication", "Tool Use",
  ]),
  score: z.number().nullable().default(null),
  baseModelScore: z.number().nullable().default(null),
  regressions: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get("modelId") ?? undefined;
  return toApiResponse(() => evaluationsRepository.list(modelId));
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    return evaluationsRepository.create(parsed.data);
  });
}
