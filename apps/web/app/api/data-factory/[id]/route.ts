/**
 * GET /api/data-factory/[id] — get a record.
 * PATCH /api/data-factory/[id] — update a record (re-runs validation on update).
 */
import { NextRequest } from "next/server";
import { dataFactoryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { validateRecord } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const record = dataFactoryRepository.get(params.id);
    if (!record) throw new HttpError(404, "Record not found");
    return record;
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(async () => {
    const current = dataFactoryRepository.get(params.id);
    if (!current) throw new HttpError(404, "Record not found");

    const body = await request.json();
    const merged = { ...current, ...body };

    // Re-run validation on the updated record
    const existing = dataFactoryRepository.list({ page: 1, pageSize: 1000 }).rows;
    merged.validationResults = validateRecord(merged, existing);

    const updated = dataFactoryRepository.update(params.id, body);
    if (!updated) throw new HttpError(404, "Record not found after update");

    // Apply validation results
    dataFactoryRepository.setValidation(params.id, merged.validationResults);

    return dataFactoryRepository.get(params.id);
  });
}
