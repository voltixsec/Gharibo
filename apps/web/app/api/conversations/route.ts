/**
 * GET /api/conversations — list all conversations.
 * POST /api/conversations — create a new conversation.
 *
 * CREATION INVARIANT
 * ------------------
 * `conversations.provider_id` has a foreign key to `providers(id)`. The
 * GHARIBO-V1 runtime has no providers row — it is addressed by environment
 * configuration — so its sentinel must never be stored here. Clients express
 * "use GHARIBO-V1" as `providerId: null, modelId: "GHARIBO-V1"`, and this route
 * rejects an attempt to store the sentinel instead of failing later with an
 * opaque SQLITE_CONSTRAINT error.
 *
 * Output tokens are clamped to the deployment ceiling on creation, so an unsafe
 * value can never reach the runtime merely by being persisted.
 */
import { NextRequest } from "next/server";
import { conversationsRepository, providersRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";
import { V1_RUNTIME_PROVIDER_ID } from "@/lib/runtime/gharibo-v1.mjs";
import { resolveDeploymentLimits, clampMaxOutputTokens } from "@/lib/runtime/deployment-limits.mjs";

const createSchema = z.object({
  title: z.string().min(1),
  providerId: z.string().nullable().default(null),
  modelId: z.string().nullable().default(null),
  systemPrompt: z.string().nullable().default(null),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().optional(),
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

    const { providerId } = parsed.data;

    if (providerId === V1_RUNTIME_PROVIDER_ID) {
      throw new HttpError(
        400,
        "The GHARIBO-V1 runtime sentinel must not be stored as provider_id. " +
          "Send providerId: null with modelId: \"GHARIBO-V1\" instead.",
      );
    }

    if (providerId !== null && !providersRepository.get(providerId)) {
      throw new HttpError(400, `Provider not found: ${providerId}`);
    }

    const limits = resolveDeploymentLimits(process.env);
    const { value: maxTokens } = clampMaxOutputTokens(parsed.data.maxTokens, limits);

    return conversationsRepository.create({ ...parsed.data, maxTokens });
  });
}
