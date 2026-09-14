/**
 * GET /api/conversations — list all conversations.
 * POST /api/conversations — create a new conversation.
 */
import { NextRequest } from "next/server";
import { conversationsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  providerId: z.string().nullable().default(null),
  modelId: z.string().nullable().default(null),
  systemPrompt: z.string().nullable().default(null),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(4096),
  toolsEnabled: z.boolean().default(false),
});

export async function GET() {
  return toApiResponse(() => conversationsRepository.list());
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    return conversationsRepository.create(parsed.data);
  });
}
