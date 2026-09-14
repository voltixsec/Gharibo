/**
 * GET /api/conversations/[id] — get a conversation with messages.
 * DELETE /api/conversations/[id] — delete a conversation.
 */
import { NextRequest, NextResponse } from "next/server";
import { conversationsRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError, ok } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  return toApiResponse(() => {
    const conv = conversationsRepository.get(params.id);
    if (!conv) throw new HttpError(404, "Conversation not found");
    return conv;
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const success = conversationsRepository.remove(params.id);
  if (!success) {
    return NextResponse.json(
      { code: 404, data: null, message: "Conversation not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(ok({ id: params.id }));
}
