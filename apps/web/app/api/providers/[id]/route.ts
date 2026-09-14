/**
 * GET /api/providers/[id] — get a provider.
 * PATCH /api/providers/[id] — update a provider.
 * DELETE /api/providers/[id] — delete a provider.
 */
import { NextRequest, NextResponse } from "next/server";
import { providersRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError, ok } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const provider = providersRepository.get(params.id);
    if (!provider) throw new HttpError(404, "Provider not found");
    return provider;
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(async () => {
    const body = await request.json();
    const updated = providersRepository.update(params.id, body);
    if (!updated) throw new HttpError(404, "Provider not found");
    return updated;
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const success = providersRepository.remove(params.id);
  if (!success) {
    return NextResponse.json(
      { code: 404, data: null, message: "Provider not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(ok({ id: params.id }));
}
