/**
 * PATCH /api/conversations/[id]/messages/[msgId] — set quality signal on a message.
 */
import { NextRequest } from "next/server";
import { conversationsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const schema = z.object({
  qualitySignal: z.enum(["good", "bad", "neutral"]).nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; msgId: string } },
) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    const updated = conversationsRepository.setMessageQuality(params.msgId, parsed.data.qualitySignal);
    if (!updated) throw new HttpError(404, "Message not found");
    return updated;
  });
}
