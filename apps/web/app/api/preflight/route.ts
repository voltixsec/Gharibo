/**
 * GET /api/preflight — proxies to the Python trainer service.
 * Returns PreflightResult. Always renders a result (even if trainer is unreachable).
 */
import { NextRequest } from "next/server";
import { runPreflight } from "@/lib/preflight";
import { toApiResponse } from "@gharibo/shared";

export async function GET(request: NextRequest) {
  const baseModel = request.nextUrl.searchParams.get("baseModel") ?? undefined;
  const datasetId = request.nextUrl.searchParams.get("datasetId") ?? undefined;
  return toApiResponse(() => runPreflight(baseModel, datasetId));
}
