/**
 * Validators for Data Factory records.
 * Each validator returns ValidationResult[] (may be multiple).
 * Status: PASS / WARNING / FAIL. Never silently discards.
 */
import type { DataFactoryRecord, ValidationResult } from "@gharibo/shared";

/**
 * Schema validation — checks that required structural fields exist and are correct types.
 */
export function validateSchema(record: DataFactoryRecord): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (typeof record.input !== "string" || record.input.length === 0) {
    results.push({
      validator: "schema",
      status: "FAIL",
      message: "Field 'input' must be a non-empty string",
    });
  } else {
    results.push({ validator: "schema", status: "PASS", message: "input is valid" });
  }

  if (record.tags !== undefined && !Array.isArray(record.tags)) {
    results.push({
      validator: "schema",
      status: "FAIL",
      message: "Field 'tags' must be an array",
    });
  }

  if (record.validationResults !== undefined && !Array.isArray(record.validationResults)) {
    results.push({
      validator: "schema",
      status: "FAIL",
      message: "Field 'validationResults' must be an array",
    });
  }

  return results;
}

/**
 * Required fields check — ensures core data fields are present.
 */
export function validateRequiredFields(record: DataFactoryRecord): ValidationResult[] {
  const results: ValidationResult[] = [];

  // input is always required
  if (!record.input || record.input.trim().length === 0) {
    results.push({
      validator: "required_fields",
      status: "FAIL",
      message: "Required field 'input' is missing or empty",
    });
  }

  // For APPROVED/TRAINING_READY records, chosenOutput should be present
  if ((record.verificationStatus === "APPROVED" || record.verificationStatus === "TRAINING_READY") &&
      (!record.chosenOutput || record.chosenOutput.trim().length === 0)) {
    results.push({
      validator: "required_fields",
      status: "WARNING",
      message: `Records in ${record.verificationStatus} status should have chosenOutput populated`,
    });
  }

  // Language is recommended but not strictly required
  if (!record.language) {
    results.push({
      validator: "required_fields",
      status: "WARNING",
      message: "Field 'language' is recommended but not set",
    });
  }

  return results;
}

/**
 * Duplicate detection — checks if the input or chosenOutput matches existing records.
 */
export function validateDuplicate(
  record: DataFactoryRecord,
  existing: DataFactoryRecord[],
): ValidationResult[] {
  const results: ValidationResult[] = [];

  const normalizedInput = record.input.trim().toLowerCase();

  for (const other of existing) {
    if (other.id === record.id) continue;

    // Exact duplicate on input
    if (other.input.trim().toLowerCase() === normalizedInput) {
      results.push({
        validator: "duplicate",
        status: "WARNING",
        message: `Exact duplicate input found in record ${other.id}`,
      });
      return results;
    }

    // Exact duplicate on chosenOutput
    if (record.chosenOutput && other.chosenOutput &&
        other.chosenOutput.trim().toLowerCase() === record.chosenOutput.trim().toLowerCase()) {
      results.push({
        validator: "duplicate",
        status: "WARNING",
        message: `Duplicate chosenOutput found in record ${other.id}`,
      });
      return results;
    }
  }

  results.push({ validator: "duplicate", status: "PASS", message: "No duplicates detected" });
  return results;
}

/**
 * URL / source presence — recommends that records have a source.
 */
export function validateUrlSource(record: DataFactoryRecord): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!record.source && !record.sourceUrl) {
    results.push({
      validator: "url_source",
      status: "WARNING",
      message: "No source or sourceUrl provided — provenance tracking recommended",
    });
  } else {
    // Validate URL format if provided
    if (record.sourceUrl) {
      try {
        new URL(record.sourceUrl);
        results.push({ validator: "url_source", status: "PASS", message: "sourceUrl is valid" });
      } catch {
        results.push({
          validator: "url_source",
          status: "WARNING",
          message: "sourceUrl is not a valid URL",
        });
      }
    } else {
      results.push({ validator: "url_source", status: "PASS", message: "source is provided" });
    }
  }

  return results;
}

/**
 * Field type validation — checks that numeric and typed fields have correct values.
 */
export function validateFieldTypes(record: DataFactoryRecord): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (record.qualityScore !== null && record.qualityScore !== undefined) {
    if (typeof record.qualityScore !== "number" || record.qualityScore < 0 || record.qualityScore > 1) {
      results.push({
        validator: "field_type",
        status: "WARNING",
        message: "qualityScore should be a number between 0 and 1",
      });
    } else {
      results.push({ validator: "field_type", status: "PASS", message: "qualityScore is valid" });
    }
  }

  if (record.tags.some((t) => typeof t !== "string")) {
    results.push({
      validator: "field_type",
      status: "FAIL",
      message: "All tags must be strings",
    });
  }

  return results;
}
