/**
 * GET /api/training-workers — discovery of available training workers.
 * Exposes only `id` / `displayName` / `capabilities`; the UI never branches on workerId.
 */
import { TRAINING_WORKERS } from "@/lib/workers";
import { toApiResponse } from "@gharibo/shared";

export async function GET() {
  return toApiResponse(() =>
    TRAINING_WORKERS.map((w) => ({
      id: w.id,
      displayName: w.displayName,
      capabilities: w.capabilities,
    })),
  );
}
