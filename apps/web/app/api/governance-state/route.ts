/**
 * GET /api/governance-state — the dashboard read-model as JSON.
 *
 * The read-model itself is server-only (it touches node:fs), so client
 * components cannot import it directly without dragging `node:fs` into the
 * browser bundle. This route is the boundary: client components fetch the
 * derived truth instead.
 *
 * The payload is derived from governance/GHARIBO_MASTER_STATE.json. Nothing is
 * fabricated; unavailable values are returned as null and the UI renders them
 * as "unavailable".
 */
import { NextResponse } from "next/server";
import {
  getProjectState,
  getExperimentInfo,
  getGoldDatasetInfo,
  getModelStateInfo,
  getBlockerInfo,
  getEngineInfo,
  getTrainingLifecycle,
  getProjectStateForTopbar,
  isStateAvailable,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    code: 0,
    data: {
      available: isStateAvailable(),
      project: getProjectState(),
      experiment: getExperimentInfo(),
      gold: getGoldDatasetInfo(),
      model: getModelStateInfo(),
      blockers: getBlockerInfo(),
      engine: getEngineInfo(),
      lifecycle: getTrainingLifecycle(),
      topbar: getProjectStateForTopbar(),
    },
  });
}
