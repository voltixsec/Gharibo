/**
 * GET /api/datasets/[id] — get a dataset with its records.
 */
import { NextRequest } from "next/server";
import { datasetsRepository, dataFactoryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const dataset = datasetsRepository.get(params.id);
    if (!dataset) throw new HttpError(404, "Dataset not found");
    // Attach full record objects
    const records = dataset.records.map((r) => dataFactoryRepository.get(r.recordId)).filter(Boolean);
    return { ...dataset, records };
  });
}
