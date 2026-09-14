/**
 * GET /api/evaluations/[id] — get an evaluation result.
 */
import { NextRequest } from "next/server";
import { evaluationsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const result = evaluationsRepository.get(params.id);
    if (!result) throw new HttpError(404, "Evaluation not found");
    return result;
  });
}
