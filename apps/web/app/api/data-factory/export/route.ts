/**
 * GET /api/data-factory/export — export records as JSONL.
 * Optional ?status= filter.
 */
import { NextRequest } from "next/server";
import { dataFactoryRepository } from "@/lib/db/repositories";
import { jsonlResponse } from "@/lib/jsonl";
import type { VerificationStatus } from "@gharibo/shared";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") as VerificationStatus | null;
  const records = status
    ? dataFactoryRepository.listByStatus(status)
    : dataFactoryRepository.listAll();

  const rows = records.map((r) => ({
    id: r.id,
    task_type: r.taskType,
    domain: r.domain,
    language: r.language,
    input: r.input,
    context: r.context,
    expected_output: r.expectedOutput,
    chosen_output: r.chosenOutput,
    rejected_output: r.rejectedOutput,
    source: r.source,
    source_url: r.sourceUrl,
    license: r.license,
    verification_status: r.verificationStatus,
    quality_score: r.qualityScore,
    difficulty: r.difficulty,
    tags: r.tags,
    validation_results: r.validationResults,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }));

  return jsonlResponse(rows, "data-factory-export.jsonl");
}
