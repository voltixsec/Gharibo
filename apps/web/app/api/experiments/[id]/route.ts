/**
 * GET /api/experiments/[id] — get an experiment.
 */
import { NextRequest } from "next/server";
import { experimentsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const exp = experimentsRepository.get(params.id);
    if (!exp) throw new HttpError(404, "Experiment not found");
    return exp;
  });
}
