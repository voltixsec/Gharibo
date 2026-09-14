/**
 * GET /api/datasets — list all datasets.
 * POST /api/datasets — assemble a dataset from approved records (auto-versions).
 */
import { NextRequest } from "next/server";
import { datasetsRepository, dataFactoryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  recordIds: z.array(z.string()).min(1),
});

export async function GET() {
  return toApiResponse(() => datasetsRepository.list());
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    return datasetsRepository.create(parsed.data.name, parsed.data.recordIds);
  });
}
