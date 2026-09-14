/**
 * GET /api/data-factory — list records (paginated, filtered).
 * POST /api/data-factory — create a new record.
 */
import { NextRequest } from "next/server";
import { dataFactoryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { validateRecord } from "@/lib/validation";
import type { VerificationStatus, ValidationResult } from "@gharibo/shared";
import { z } from "zod";

const createSchema = z.object({
  taskType: z.string().nullable().default(null),
  domain: z.string().nullable().default(null),
  language: z.string().nullable().default(null),
  input: z.string().min(1),
  context: z.string().nullable().default(null),
  expectedOutput: z.string().nullable().default(null),
  chosenOutput: z.string().nullable().default(null),
  rejectedOutput: z.string().nullable().default(null),
  source: z.string().nullable().default(null),
  sourceUrl: z.string().nullable().default(null),
  license: z.string().nullable().default(null),
  verificationStatus: z.enum(["RAW", "NORMALIZED", "REVIEW_REQUIRED", "APPROVED", "REJECTED", "TRAINING_READY"]).default("RAW"),
  qualityScore: z.number().nullable().default(null),
  difficulty: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  validationResults: z.array(z.object({
    validator: z.string(),
    status: z.enum(["PASS", "WARNING", "FAIL"]),
    message: z.string(),
  })).default([]),
  sourceTrainingExampleId: z.string().nullable().default(null),
});

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const page = parseInt(sp.get("page") ?? "1", 10);
  const pageSize = parseInt(sp.get("pageSize") ?? "20", 10);
  const status = sp.get("status") as VerificationStatus | null;
  const domain = sp.get("domain") ?? undefined;
  const search = sp.get("search") ?? undefined;

  return toApiResponse(() =>
    dataFactoryRepository.list({
      page,
      pageSize,
      status: status ?? undefined,
      domain,
      search,
    }),
  );
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }

    // Run validation on the new record
    const existing = dataFactoryRepository.list({ page: 1, pageSize: 1000 }).rows;
    const validationResults: ValidationResult[] = validateRecord(parsed.data as any, existing);
    parsed.data.validationResults = validationResults;

    return dataFactoryRepository.create(parsed.data as any);
  });
}
