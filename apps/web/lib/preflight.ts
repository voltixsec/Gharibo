/**
 * Pre-flight proxy — calls the Python trainer service, and (M2) honours `dataset_id`
 * by checking the selected dataset version locally.
 *
 * If the trainer service is unreachable, returns a PreflightResult with
 * overallReady=false and a trainer_service NOT_READY item (so the UI always renders).
 */
import { config } from "@/lib/config";
import { datasetsRepository } from "@/lib/db/repositories";
import type { PreflightResult, PreflightCheckItem, PreflightStatus } from "@gharibo/shared";

interface TrainerPreflightResponse {
  overall_ready: boolean;
  items: Array<{ check: string; status: string; detail: string }>;
  checked_at: string;
}

/**
 * Runs the pre-flight check by calling the trainer service.
 * @param baseModel - Optional base model name to check availability.
 * @param datasetId - Optional dataset ID; M2 checks its version is TRAINING_READY.
 */
export async function runPreflight(
  baseModel?: string,
  datasetId?: string,
): Promise<PreflightResult> {
  const params = new URLSearchParams();
  if (baseModel) params.set("base_model", baseModel);
  if (datasetId) params.set("dataset_id", datasetId);

  const url = `${config.trainerUrl}/preflight${params.toString() ? "?" + params.toString() : ""}`;

  // M2: honour dataset_id locally (the trainer service only receives it as a hint).
  const datasetCheck = checkDatasetVersion(datasetId);
  const datasetItems = datasetCheck ? [datasetCheck] : [];
  const datasetReady = datasetCheck ? datasetCheck.status === "READY" : true;

  let trainerItems: PreflightCheckItem[];
  let trainerReady: boolean;
  let checkedAt: string;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Trainer returned ${response.status}`);
    }

    const data = (await response.json()) as TrainerPreflightResponse;
    trainerItems = data.items.map(mapItem);
    trainerReady = data.overall_ready;
    checkedAt = data.checked_at || new Date().toISOString();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    trainerItems = [
      {
        check: "trainer_service",
        status: "NOT_READY" as PreflightStatus,
        detail: `Trainer service unreachable at ${config.trainerUrl}: ${message}`,
      },
    ];
    trainerReady = false;
    checkedAt = new Date().toISOString();
  }

  return {
    overallReady: trainerReady && datasetReady,
    items: [...trainerItems, ...datasetItems],
    checkedAt,
  };
}

/** Checks that the selected dataset version exists and is TRAINING_READY. */
function checkDatasetVersion(datasetId?: string): PreflightCheckItem | null {
  if (!datasetId) return null;
  const dataset = datasetsRepository.get(datasetId);
  if (!dataset) {
    return {
      check: "dataset_version",
      status: "NOT_READY",
      detail: `Dataset not found: ${datasetId}`,
    };
  }
  if (dataset.status !== "TRAINING_READY") {
    return {
      check: "dataset_version",
      status: "NOT_READY",
      detail: `Dataset "${dataset.name}" ${dataset.version} is ${dataset.status ?? "DRAFT"} — cut a TRAINING_READY version first`,
    };
  }
  const hash = dataset.datasetHash ?? "unknown";
  return {
    check: "dataset_version",
    status: "READY",
    detail: `Dataset "${dataset.name}" ${dataset.version} is TRAINING_READY (hash ${hash.slice(0, 12)}…)`,
  };
}

/** Maps the Python service's snake_case response to our TS type. */
function mapItem(item: { check: string; status: string; detail: string }): PreflightCheckItem {
  return {
    check: item.check,
    status: item.status as PreflightStatus,
    detail: item.detail,
  };
}
