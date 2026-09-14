/**
 * GET /api/datasets/[id]/splits — deterministic split policy, hashes and counts.
 */
import { NextRequest } from "next/server";
import { datasetsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const dataset = datasetsRepository.get(params.id);
    if (!dataset) throw new HttpError(404, "Dataset not found");
    const splits = datasetsRepository.getSplits(params.id);
    return {
      splitPolicy: dataset.splitPolicy,
      splitHashes: dataset.splitHashes,
      counts: {
        train: splits.train.length,
        validation: splits.validation.length,
        test: splits.test.length,
      },
    };
  });
}
