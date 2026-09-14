/**
 * GET /api/providers — list all providers.
 * POST /api/providers — create a new provider.
 */
import { NextRequest } from "next/server";
import { providersRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const providerSchema = z.object({
  provider: z.enum(["openai_compatible", "ollama", "vllm", "huggingface"]),
  modelId: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKeyRef: z.string().nullable().default(null),
  contextWindow: z.number().int().positive().default(4096),
  supportsVision: z.boolean().default(false),
  supportsTools: z.boolean().default(false),
  supportsStructuredOutput: z.boolean().default(false),
  supportsReasoning: z.boolean().default(false),
  displayName: z.string().optional(),
  isActive: z.boolean().default(true),
});

export async function GET() {
  return toApiResponse(() => providersRepository.list());
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = providerSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    return providersRepository.create(parsed.data);
  });
}
