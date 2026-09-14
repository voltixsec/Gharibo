/**
 * POST /api/data-factory/bulk — bulk approve/reject/tag records.
 */
import { NextRequest } from "next/server";
import { dataFactoryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["approve", "reject", "tag"]),
  value: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    if (parsed.data.action === "tag" && !parsed.data.value) {
      throw new HttpError(400, "value is required for tag action");
    }
    const updated = dataFactoryRepository.bulk(parsed.data.ids, parsed.data.action, parsed.data.value);
    return { updated };
  });
}
