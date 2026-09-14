/**
 * Smoke tests for GHARIBO AI LAB.
 *
 * Tests three core areas:
 * 1. API response envelope (ok / err / toApiResponse)
 * 2. Validation engine (validateRecord, worstStatus, individual validators)
 * 3. JSONL parser (parseJsonl, toJsonl)
 *
 * Uses vitest.
 */

import { describe, it, expect } from "vitest";

// --- API response envelope ---
import { ok, err, HttpError, toApiResponse } from "@gharibo/shared";

// --- Validation engine ---
import {
  validateSchema,
  validateRequiredFields,
  validateDuplicate,
  validateUrlSource,
  validateFieldTypes,
  validateRecord,
  worstStatus,
} from "@/lib/validation";
import type { DataFactoryRecord, ValidationResult } from "@gharibo/shared";

// --- JSONL ---
import { toJsonl, parseJsonl } from "@/lib/jsonl";

// ============================================================
// 1. API Response Envelope
// ============================================================

describe("API response envelope", () => {
  describe("ok()", () => {
    it("returns code 0 with data and message 'ok'", () => {
      const result = ok({ name: "test" });
      expect(result.code).toBe(0);
      expect(result.message).toBe("ok");
      expect(result.data).toEqual({ name: "test" });
    });

    it("works with arrays", () => {
      const result = ok([1, 2, 3]);
      expect(result.code).toBe(0);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it("works with null data", () => {
      const result = ok(null);
      expect(result.code).toBe(0);
      expect(result.data).toBeNull();
    });

    it("works with string data", () => {
      const result = ok("hello");
      expect(result.code).toBe(0);
      expect(result.data).toBe("hello");
    });
  });

  describe("err()", () => {
    it("returns non-zero code with null data and error message", () => {
      const result = err(400, "Bad request");
      expect(result.code).toBe(400);
      expect(result.data).toBeNull();
      expect(result.message).toBe("Bad request");
    });

    it("returns 500 for internal errors", () => {
      const result = err(500, "Internal server error");
      expect(result.code).toBe(500);
      expect(result.data).toBeNull();
    });
  });

  describe("HttpError", () => {
    it("creates an error with code and message", () => {
      const error = new HttpError(404, "Not found");
      expect(error.code).toBe(404);
      expect(error.message).toBe("Not found");
      expect(error.name).toBe("HttpError");
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("toApiResponse()", () => {
    it("wraps a successful sync function in ok()", async () => {
      const response = await toApiResponse(() => 42);
      const body = await response.json();
      expect(body.code).toBe(0);
      expect(body.data).toBe(42);
      expect(body.message).toBe("ok");
    });

    it("wraps a successful async function in ok()", async () => {
      const response = await toApiResponse(async () => "async-result");
      const body = await response.json();
      expect(body.code).toBe(0);
      expect(body.data).toBe("async-result");
    });

    it("wraps an HttpError in err() with correct status", async () => {
      const response = await toApiResponse(() => {
        throw new HttpError(400, "Validation failed");
      });
      const body = await response.json();
      expect(body.code).toBe(400);
      expect(body.data).toBeNull();
      expect(body.message).toBe("Validation failed");
      expect(response.status).toBe(400);
    });

    it("wraps a generic Error in err(500)", async () => {
      const response = await toApiResponse(() => {
        throw new Error("Something went wrong");
      });
      const body = await response.json();
      expect(body.code).toBe(500);
      expect(body.data).toBeNull();
      expect(body.message).toBe("Something went wrong");
      expect(response.status).toBe(500);
    });

    it("wraps a non-Error throw in err(500) with generic message", async () => {
      const response = await toApiResponse(() => {
        throw "string error"; // eslint-disable-line no-throw-literal
      });
      const body = await response.json();
      expect(body.code).toBe(500);
      expect(body.data).toBeNull();
    });
  });
});

// ============================================================
// 2. Validation Engine
// ============================================================

/** Helper: creates a minimal valid DataFactoryRecord. */
function makeRecord(overrides: Partial<DataFactoryRecord> = {}): DataFactoryRecord {
  return {
    id: "test-id",
    taskType: null,
    domain: null,
    language: "en",
    input: "What is 2+2?",
    context: null,
    expectedOutput: "4",
    chosenOutput: "4",
    rejectedOutput: null,
    source: "test-source",
    sourceUrl: null,
    license: null,
    verificationStatus: "RAW",
    qualityScore: null,
    difficulty: null,
    tags: [],
    validationResults: [],
    sourceTrainingExampleId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Validation engine", () => {
  describe("validateSchema()", () => {
    it("passes when input is a non-empty string", () => {
      const record = makeRecord({ input: "valid input" });
      const results = validateSchema(record);
      const schemaResult = results.find((r) => r.validator === "schema");
      expect(schemaResult).toBeDefined();
      expect(schemaResult!.status).toBe("PASS");
    });

    it("fails when input is empty", () => {
      const record = makeRecord({ input: "" });
      const results = validateSchema(record);
      const failResult = results.find(
        (r) => r.validator === "schema" && r.status === "FAIL",
      );
      expect(failResult).toBeDefined();
      expect(failResult!.message).toContain("input");
    });
  });

  describe("validateRequiredFields()", () => {
    it("passes when input is present", () => {
      const record = makeRecord({ input: "valid", language: "en" });
      const results = validateRequiredFields(record);
      const fails = results.filter((r) => r.status === "FAIL");
      expect(fails).toHaveLength(0);
    });

    it("fails when input is missing or empty", () => {
      const record = makeRecord({ input: "  " });
      const results = validateRequiredFields(record);
      const fail = results.find((r) => r.status === "FAIL");
      expect(fail).toBeDefined();
      expect(fail!.message).toContain("input");
    });

    it("warns when language is not set", () => {
      const record = makeRecord({ input: "valid", language: null });
      const results = validateRequiredFields(record);
      const warn = results.find(
        (r) => r.validator === "required_fields" && r.status === "WARNING",
      );
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("language");
    });

    it("warns when APPROVED record has no chosenOutput", () => {
      const record = makeRecord({
        input: "valid",
        language: "en",
        verificationStatus: "APPROVED",
        chosenOutput: null,
      });
      const results = validateRequiredFields(record);
      const warn = results.find((r) => r.status === "WARNING");
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("chosenOutput");
    });
  });

  describe("validateDuplicate()", () => {
    it("passes when no duplicates exist", () => {
      const record = makeRecord({ input: "unique input", chosenOutput: "unique answer" });
      const existing: DataFactoryRecord[] = [
        makeRecord({ id: "other-1", input: "different input", chosenOutput: "different answer" }),
      ];
      const results = validateDuplicate(record, existing);
      const pass = results.find((r) => r.status === "PASS");
      expect(pass).toBeDefined();
    });

    it("warns when exact duplicate input found", () => {
      const record = makeRecord({ input: "duplicate input" });
      const existing: DataFactoryRecord[] = [
        makeRecord({ id: "other-1", input: "duplicate input" }),
      ];
      const results = validateDuplicate(record, existing);
      const warn = results.find((r) => r.status === "WARNING");
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("duplicate");
    });

    it("does not flag itself as duplicate", () => {
      const record = makeRecord({ id: "self", input: "same input", chosenOutput: "same answer" });
      const existing: DataFactoryRecord[] = [
        makeRecord({ id: "self", input: "same input", chosenOutput: "same answer" }),
      ];
      const results = validateDuplicate(record, existing);
      const pass = results.find((r) => r.status === "PASS");
      expect(pass).toBeDefined();
    });
  });

  describe("validateUrlSource()", () => {
    it("warns when no source or sourceUrl", () => {
      const record = makeRecord({ source: null, sourceUrl: null });
      const results = validateUrlSource(record);
      const warn = results.find((r) => r.status === "WARNING");
      expect(warn).toBeDefined();
    });

    it("passes when source is provided", () => {
      const record = makeRecord({ source: "manual", sourceUrl: null });
      const results = validateUrlSource(record);
      const pass = results.find((r) => r.status === "PASS");
      expect(pass).toBeDefined();
    });

    it("passes when sourceUrl is a valid URL", () => {
      const record = makeRecord({
        source: null,
        sourceUrl: "https://example.com/data",
      });
      const results = validateUrlSource(record);
      const pass = results.find((r) => r.status === "PASS");
      expect(pass).toBeDefined();
    });

    it("warns when sourceUrl is not a valid URL", () => {
      const record = makeRecord({
        source: null,
        sourceUrl: "not-a-url",
      });
      const results = validateUrlSource(record);
      const warn = results.find((r) => r.status === "WARNING");
      expect(warn).toBeDefined();
    });
  });

  describe("validateFieldTypes()", () => {
    it("passes when qualityScore is valid number 0-1", () => {
      const record = makeRecord({ qualityScore: 0.85 });
      const results = validateFieldTypes(record);
      const pass = results.find((r) => r.status === "PASS");
      expect(pass).toBeDefined();
    });

    it("warns when qualityScore is out of range", () => {
      const record = makeRecord({ qualityScore: 1.5 });
      const results = validateFieldTypes(record);
      const warn = results.find((r) => r.status === "WARNING");
      expect(warn).toBeDefined();
    });

    it("warns when qualityScore is negative", () => {
      const record = makeRecord({ qualityScore: -0.5 });
      const results = validateFieldTypes(record);
      const warn = results.find((r) => r.status === "WARNING");
      expect(warn).toBeDefined();
    });

    it("passes when qualityScore is null (optional)", () => {
      const record = makeRecord({ qualityScore: null });
      const results = validateFieldTypes(record);
      const qualityResults = results.filter((r) => r.validator === "field_type");
      // null qualityScore should produce no qualityScore-related result
      expect(qualityResults.every((r) => r.status !== "WARNING" || !r.message.includes("qualityScore"))).toBe(true);
    });

    it("passes when all tags are strings", () => {
      const record = makeRecord({ tags: ["tag1", "tag2"] });
      const results = validateFieldTypes(record);
      const fail = results.find((r) => r.status === "FAIL");
      expect(fail).toBeUndefined();
    });
  });

  describe("validateRecord() — orchestrator", () => {
    it("runs all validators and returns combined results", () => {
      // Use language: null to trigger a required_fields WARNING so that validator appears
      const record = makeRecord({ input: "valid input", language: null, source: "test", chosenOutput: "unique answer" });
      const results = validateRecord(record, []);
      expect(results.length).toBeGreaterThan(0);

      const validators = new Set(results.map((r) => r.validator));
      expect(validators.has("schema")).toBe(true);
      expect(validators.has("required_fields")).toBe(true);
      expect(validators.has("duplicate")).toBe(true);
      expect(validators.has("url_source")).toBe(true);
      // field_type only appears when qualityScore is set or tags have non-strings
      // so it may or may not appear depending on the record
    });

    it("returns FAIL for a record with empty input", () => {
      const record = makeRecord({ input: "" });
      const results = validateRecord(record, []);
      const hasFail = results.some((r) => r.status === "FAIL");
      expect(hasFail).toBe(true);
    });

    it("does not throw on any input (never silently discards)", () => {
      const record = makeRecord({ input: "test", tags: [] as any });
      expect(() => validateRecord(record, [])).not.toThrow();
    });
  });

  describe("worstStatus()", () => {
    it("returns FAIL if any result is FAIL", () => {
      const results: ValidationResult[] = [
        { validator: "a", status: "PASS", message: "" },
        { validator: "b", status: "FAIL", message: "" },
        { validator: "c", status: "WARNING", message: "" },
      ];
      expect(worstStatus(results)).toBe("FAIL");
    });

    it("returns WARNING if no FAIL but some WARNING", () => {
      const results: ValidationResult[] = [
        { validator: "a", status: "PASS", message: "" },
        { validator: "b", status: "WARNING", message: "" },
      ];
      expect(worstStatus(results)).toBe("WARNING");
    });

    it("returns PASS if all results are PASS", () => {
      const results: ValidationResult[] = [
        { validator: "a", status: "PASS", message: "" },
        { validator: "b", status: "PASS", message: "" },
      ];
      expect(worstStatus(results)).toBe("PASS");
    });

    it("returns PASS for empty results array", () => {
      expect(worstStatus([])).toBe("PASS");
    });
  });
});

// ============================================================
// 3. JSONL Parser
// ============================================================

describe("JSONL parser", () => {
  describe("toJsonl()", () => {
    it("converts an array of objects to JSONL text", () => {
      const rows = [
        { a: 1, b: "x" },
        { a: 2, b: "y" },
      ];
      const text = toJsonl(rows);
      const lines = text.split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual({ a: 1, b: "x" });
      expect(JSON.parse(lines[1])).toEqual({ a: 2, b: "y" });
    });

    it("returns empty string for empty array", () => {
      expect(toJsonl([])).toBe("");
    });

    it("handles single row", () => {
      const text = toJsonl([{ id: "abc" }]);
      expect(text).toBe('{"id":"abc"}');
    });
  });

  describe("parseJsonl()", () => {
    it("parses valid JSONL text into rows", () => {
      const text = '{"a":1}\n{"a":2}\n{"a":3}';
      const { rows, warnings } = parseJsonl(text);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ a: 1 });
      expect(rows[2]).toEqual({ a: 3 });
      expect(warnings).toHaveLength(0);
    });

    it("returns warnings for malformed lines", () => {
      const text = '{"a":1}\nnot json\n{"a":3}';
      const { rows, warnings } = parseJsonl(text);
      expect(rows).toHaveLength(2);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("Line 2");
    });

    it("skips empty lines", () => {
      const text = '{"a":1}\n\n\n{"a":2}';
      const { rows, warnings } = parseJsonl(text);
      expect(rows).toHaveLength(2);
      expect(warnings).toHaveLength(0);
    });

    it("handles empty text", () => {
      const { rows, warnings } = parseJsonl("");
      expect(rows).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    it("handles text with only whitespace", () => {
      const { rows, warnings } = parseJsonl("   \n  \n  ");
      expect(rows).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    it("supports generic type parameter", () => {
      const text = '{"id":"x","name":"test"}';
      const { rows } = parseJsonl<{ id: string; name: string }>(text);
      expect(rows[0].id).toBe("x");
      expect(rows[0].name).toBe("test");
    });

    it("round-trips: toJsonl -> parseJsonl preserves data", () => {
      const original = [
        { id: "1", value: 100 },
        { id: "2", value: 200 },
      ];
      const text = toJsonl(original);
      const { rows } = parseJsonl(text);
      expect(rows).toEqual(original);
    });
  });
});
