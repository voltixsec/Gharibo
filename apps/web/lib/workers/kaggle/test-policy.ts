/**
 * Governed TEST-payload policy (architecture M2 §3.3; M3B dataset governance).
 *
 * A package may declare `dataset.splitPolicy.testHeldOut`. When it does, the TEST
 * payload is permanently held out and only its HASH may travel with the bundle
 * (`HASH_INTEGRITY_ONLY`). The payload itself must never be written into a bundle,
 * attached to a Kaggle Dataset, or named in the operator steps.
 *
 * This is data-driven rather than Kaggle-specific: a package whose split policy does
 * NOT hold TEST out keeps the legacy three-split bundle layout.
 *
 * Rationale (incident GHARIBO-exp-001, first governed launch): the generic worker
 * assumed TRAIN + VALIDATION + TEST unconditionally, so it both emitted a
 * `dataset/test.jsonl` file and instructed the operator to upload it, while the
 * governed run deliberately ships TRAIN + VALIDATION only.
 */
import type { TrainingPackage } from "@gharibo/shared";

/** The dataset split names a bundle may carry. */
export type PayloadSplit = "train" | "validation" | "test";

/** True when the package's split policy permanently holds the TEST payload out. */
export function isTestPayloadHeldOut(pkg: TrainingPackage): boolean {
  const policy = pkg.dataset.splitPolicy as { testHeldOut?: unknown } | null | undefined;
  return policy?.testHeldOut === true;
}

/**
 * The splits whose PAYLOAD may be written to a bundle, in canonical order.
 * TEST is omitted whenever the split policy holds it out.
 */
export function bundlePayloadSplits(pkg: TrainingPackage): PayloadSplit[] {
  return isTestPayloadHeldOut(pkg) ? ["train", "validation"] : ["train", "validation", "test"];
}

/** Human-readable split list, e.g. `train, validation` or `train, validation, test`. */
export function payloadSplitLabel(pkg: TrainingPackage): string {
  return bundlePayloadSplits(pkg).join(", ");
}

/** True when a bundle produced for this package carries a TEST payload file. */
export function bundleCarriesTestPayload(pkg: TrainingPackage): boolean {
  return bundlePayloadSplits(pkg).includes("test");
}
