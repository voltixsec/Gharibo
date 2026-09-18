/**
 * GET    /api/conversations/[id] — get a conversation with its messages.
 * PATCH  /api/conversations/[id] — update title / settings / routing.
 * DELETE /api/conversations/[id] — delete a conversation.
 *
 * PATCH applies the same routing invariant as creation: the GHARIBO-V1 sentinel
 * is never written into `provider_id`, and output tokens are clamped to the
 * deployment ceiling.
 */
import { NextRequest, NextResponse } from "next/server";
import { conversationsRepository, providersRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError, ok } from "@gharibo/shared";
import { z } from "zod";
import { V1_RUNTIME_PROVIDER_ID } from "@/lib/runtime/gharibo-v1.mjs";
import { resolveDeploymentLimits, clampMaxOutputTokens } from "@/lib/runtime/deployment-limits.mjs";

const patchSchema = z
  .object({
    title: z.string().min(1).max(200),
    providerId: z.string().nullable(),
    modelId: z.string().nullable(),
    systemPrompt: z.string().nullable(),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().positive(),
    toolsEnabled: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const conv = conversationsRepository.get(params.id);
    if (!conv) throw new HttpError(404, "Conversation not found");
    return conv;
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(async () => {
    const existing = conversationsRepository.get(params.id);
    if (!existing) throw new HttpError(404, "Conversation not found");

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }

    const patch = { ...parsed.data };

    if (patch.providerId === V1_RUNTIME_PROVIDER_ID) {
      throw new HttpError(
        400,
        "The GHARIBO-V1 runtime sentinel must not be stored as provider_id. " +
          "Send providerId: null with modelId: \"GHARIBO-V1\" instead.",
      );
    }

    if (patch.providerId !== undefined && patch.providerId !== null) {
      if (!providersRepository.get(patch.providerId)) {
        throw new HttpError(400, `Provider not found: ${patch.providerId}`);
      }
    }

    if (patch.maxTokens !== undefined) {
      const limits = resolveDeploymentLimits(process.env);
      patch.maxTokens = clampMaxOutputTokens(patch.maxTokens, limits).value;
    }

    const updated = conversationsRepository.update(params.id, patch);
    if (!updated) throw new HttpError(404, "Conversation not found");
    return updated;
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const success = conversationsRepository.remove(params.id);
  if (!success) {
    return NextResponse.json(
      { code: 404, data: null, message: "Conversation not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(ok({ id: params.id }));
}
