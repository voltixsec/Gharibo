/**
 * PATCH /api/training-examples/[id] — edit/approve/reject a training example.
 */
import { NextRequest } from "next/server";
import { trainingExamplesRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const schema = z.object({
  approvedResponse: z.string().nullable().optional(),
  approvalState: z.enum(["pending", "approved", "rejected"]).optional(),
  qualityScore: z.number().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    const updated = trainingExamplesRepository.update(params.id, parsed.data);
    if (!updated) throw new HttpError(404, "Training example not found");
    return updated;
  });
}
