/**
 * POST /api/data-factory/[id]/transition — server-side Gold Pipeline transition (§7.3).
 * Rejects any illegal move with 400.
 */
import { NextRequest } from "next/server";
import { dataFactoryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError, type VerificationStatus } from "@gharibo/shared";
import { z } from "zod";

const transitionSchema = z.object({
  to: z.enum(["RAW", "NORMALIZED", "REVIEW_REQUIRED", "APPROVED", "REJECTED", "TRAINING_READY"]),
  reason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    return dataFactoryRepository.transition(params.id, parsed.data.to as VerificationStatus, {
      reason: parsed.data.reason,
    });
  });
}
