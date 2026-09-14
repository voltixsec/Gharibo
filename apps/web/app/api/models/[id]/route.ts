/**
 * GET /api/models/[id] — get a model registry entry.
 * PATCH /api/models/[id] — promote status / update notes.
 */
import { NextRequest } from "next/server";
import { modelRegistryRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["EXPERIMENT", "CANDIDATE", "ACCEPTED", "DEPRECATED"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const entry = modelRegistryRepository.get(params.id);
    if (!entry) throw new HttpError(404, "Model not found");
    return entry;
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    const updated = modelRegistryRepository.update(params.id, parsed.data);
    if (!updated) throw new HttpError(404, "Model not found");
    return updated;
  });
}
