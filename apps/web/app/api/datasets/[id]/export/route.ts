/**
 * GET /api/datasets/[id]/export — export dataset records as JSONL.
 */
import { NextRequest } from "next/server";
import { datasetsRepository, dataFactoryRepository } from "@/lib/db/repositories";
import { jsonlResponse } from "@/lib/jsonl";
import { HttpError } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const dataset = datasetsRepository.get(params.id);
  if (!dataset) {
    return new Response("Dataset not found", { status: 404 });
  }

  const records = dataset.records.map((r) => dataFactoryRepository.get(r.recordId)).filter(Boolean);
  const rows = records.map((r) => ({
    id: r!.id,
    task_type: r!.taskType,
    domain: r!.domain,
    language: r!.language,
    input: r!.input,
    context: r!.context,
    expected_output: r!.expectedOutput,
    chosen_output: r!.chosenOutput,
    rejected_output: r!.rejectedOutput,
    source: r!.source,
    source_url: r!.sourceUrl,
    license: r!.license,
    verification_status: r!.verificationStatus,
    quality_score: r!.qualityScore,
    tags: r!.tags,
  }));

  return jsonlResponse(rows, `dataset-${params.id}.jsonl`);
}
