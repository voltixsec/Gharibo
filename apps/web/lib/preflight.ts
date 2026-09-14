/**
 * Pre-flight proxy — calls the Python trainer service.
 * If the service is unreachable, returns a PreflightResult with overallReady=false
 * and a trainer_service NOT_READY item (so the UI always renders a result).
 */
import { config } from "@/lib/config";
import type { PreflightResult, PreflightCheckItem, PreflightStatus } from "@gharibo/shared";

interface TrainerPreflightResponse {
  overall_ready: boolean;
  items: Array<{ check: string; status: string; detail: string }>;
  checked_at: string;
}

/**
 * Runs the pre-flight check by calling the trainer service.
 * @param baseModel - Optional base model name to check availability.
 * @param datasetId - Optional dataset ID to check validity.
 */
export async function runPreflight(
  baseModel?: string,
  datasetId?: string,
): Promise<PreflightResult> {
  const params = new URLSearchParams();
  if (baseModel) params.set("base_model", baseModel);
  if (datasetId) params.set("dataset_id", datasetId);

  const url = `${config.trainerUrl}/preflight${params.toString() ? "?" + params.toString() : ""}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Trainer returned ${response.status}`);
    }

    const data = (await response.json()) as TrainerPreflightResponse;

    return {
      overallReady: data.overall_ready,
      items: data.items.map(mapItem),
      checkedAt: data.checked_at || new Date().toISOString(),
    };
  } catch (error) {
    // Return a result that always renders — trainer service unreachable
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      overallReady: false,
      items: [
        {
          check: "trainer_service",
          status: "NOT_READY" as PreflightStatus,
          detail: `Trainer service unreachable at ${config.trainerUrl}: ${message}`,
        },
      ],
      checkedAt: new Date().toISOString(),
    };
  }
}

/** Maps the Python service's snake_case response to our TS type. */
function mapItem(item: { check: string; status: string; detail: string }): PreflightCheckItem {
  return {
    check: item.check,
    status: item.status as PreflightStatus,
    detail: item.detail,
  };
}
