/**
 * GET /api/training-runs/[id] — get a training run.
 * PATCH /api/training-runs/[id] — update status / preflight result.
 */
import { NextRequest } from "next/server";
import { trainingRunsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const schema = z.object({
  status: z
    .enum([
      "DRAFT",
      "QUEUED",
      "RUNNING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "INTERRUPTED",
      "RESUMABLE",
    ])
    .optional(),
  preflightResult: z.string().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const run = trainingRunsRepository.get(params.id);
    if (!run) throw new HttpError(404, "Training run not found");
    return run;
  });
}

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

    // A status change goes through the guarded state machine (§10.2); other fields
    // (e.g. preflightResult) are applied directly.
    if (parsed.data.status) {
      const transitioned = trainingRunsRepository.transition(params.id, parsed.data.status, {
        source: "api",
        reason: "operator update",
      });
      if (!transitioned) throw new HttpError(404, "Training run not found");
      if (parsed.data.preflightResult !== undefined) {
        return trainingRunsRepository.update(params.id, {
          preflightResult: parsed.data.preflightResult,
        });
      }
      return transitioned;
    }

    const updated = trainingRunsRepository.update(params.id, parsed.data);
    if (!updated) throw new HttpError(404, "Training run not found");
    return updated;
  });
}
