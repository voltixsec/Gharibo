/**
 * GET /api/research/[id] — get a research record.
 */
import { NextRequest } from "next/server";
import { researchRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const record = researchRepository.get(params.id);
    if (!record) throw new HttpError(404, "Research record not found");
    return record;
  });
}
