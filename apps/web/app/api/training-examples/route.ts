/**
 * GET /api/training-examples — list training examples (optionally filtered by approvalState).
 * POST /api/training-examples — save a training example from the playground.
 */
import { NextRequest } from "next/server";
import { trainingExamplesRepository, dataFactoryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { validateRecord } from "@/lib/validation";
import { z } from "zod";

const createSchema = z.object({
  prompt: z.string().min(1),
  systemPrompt: z.string().nullable().default(null),
  response: z.string().min(1),
  approvedResponse: z.string().nullable().default(null),
  modelId: z.string().nullable().default(null),
  providerId: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  domain: z.string().nullable().default(null),
  language: z.string().nullable().default(null),
  qualityScore: z.number().nullable().default(null),
  sourceConversationId: z.string().nullable().default(null),
  sourceMessageId: z.string().nullable().default(null),
});

export async function GET(request: NextRequest) {
  const approvalState = request.nextUrl.searchParams.get("approvalState") as
    | "pending" | "approved" | "rejected" | null;
  return toApiResponse(() => trainingExamplesRepository.list(approvalState ?? undefined));
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    return trainingExamplesRepository.create(parsed.data);
  });
}
