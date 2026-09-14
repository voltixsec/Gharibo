/**
 * POST /api/data-factory/import — import JSONL records.
 */
import { NextRequest } from "next/server";
import { dataFactoryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { parseJsonl } from "@/lib/jsonl";
import { validateRecord } from "@/lib/validation";
import type { ValidationResult, VerificationStatus } from "@gharibo/shared";

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const text = await request.text();
    if (!text.trim()) {
      throw new HttpError(400, "Request body is empty");
    }

    const { rows, warnings } = parseJsonl(text);
    const imported: number[] = [];
    const allWarnings: ValidationResult[] = warnings.map((w) => ({
      validator: "jsonl_import",
      status: "WARNING" as const,
      message: w,
    }));

    const existing = dataFactoryRepository.list({ page: 1, pageSize: 1000 }).rows;

    for (const row of rows) {
      try {
        const record: any = {
          taskType: row.task_type ?? row.taskType ?? null,
          domain: row.domain ?? null,
          language: row.language ?? null,
          input: row.input ?? "",
          context: row.context ?? null,
          expectedOutput: row.expected_output ?? row.expectedOutput ?? null,
          chosenOutput: row.chosen_output ?? row.chosenOutput ?? null,
          rejectedOutput: row.rejected_output ?? row.rejectedOutput ?? null,
          source: row.source ?? null,
          sourceUrl: row.source_url ?? row.sourceUrl ?? null,
          license: row.license ?? null,
          verificationStatus: (row.verification_status ?? row.verificationStatus ?? "RAW") as VerificationStatus,
          qualityScore: row.quality_score ?? row.qualityScore ?? null,
          difficulty: row.difficulty ?? null,
          tags: row.tags ?? [],
          validationResults: [],
          sourceTrainingExampleId: row.source_training_example_id ?? row.sourceTrainingExampleId ?? null,
        };

        const validationResults = validateRecord(record, existing);
        record.validationResults = validationResults;

        const created = dataFactoryRepository.create(record);
        existing.push(created);
        imported.push(1);
      } catch (e) {
        allWarnings.push({
          validator: "jsonl_import",
          status: "FAIL",
          message: `Failed to import a record: ${e instanceof Error ? e.message : "unknown error"}`,
        });
      }
    }

    return { imported: imported.length, warnings: allWarnings };
  });
}
