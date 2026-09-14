/**
 * Validation engine orchestrator.
 * Runs all validators on a DataFactoryRecord and returns ValidationResult[].
 * Never silently discards records — always reports PASS/WARNING/FAIL.
 */
import type { DataFactoryRecord, ValidationResult } from "@gharibo/shared";
import { validateSchema, validateRequiredFields, validateDuplicate, validateUrlSource, validateFieldTypes } from "./validators";

export { validateSchema, validateRequiredFields, validateDuplicate, validateUrlSource, validateFieldTypes } from "./validators";

/**
 * Runs all validators on a record.
 * @param record - The record to validate.
 * @param existingRecords - Other records (for duplicate detection).
 * @returns Array of validation results.
 */
export function validateRecord(
  record: DataFactoryRecord,
  existingRecords: DataFactoryRecord[] = [],
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 1. Schema validation
  results.push(...validateSchema(record));

  // 2. Required fields
  results.push(...validateRequiredFields(record));

  // 3. Duplicate detection
  results.push(...validateDuplicate(record, existingRecords));

  // 4. URL / source presence
  results.push(...validateUrlSource(record));

  // 5. Field type validation
  results.push(...validateFieldTypes(record));

  return results;
}

/** Returns the worst status from a list of validation results. */
export function worstStatus(results: ValidationResult[]): "PASS" | "WARNING" | "FAIL" {
  if (results.some((r) => r.status === "FAIL")) return "FAIL";
  if (results.some((r) => r.status === "WARNING")) return "WARNING";
  return "PASS";
}
