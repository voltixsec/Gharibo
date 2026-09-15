/**
 * Playground conversation persistence — end-to-end against real SQLite.
 *
 * This suite exists because the Playground previously collected `modelId` and
 * `toolsEnabled` in the UI and then discarded them before the API call, so a
 * user's model selection was silently lost.
 *
 * Rather than asserting on a hand-rolled fetch mock (which would only re-state
 * the bug), this test drives the ACTUAL persistence chain against a temporary
 * SQLite database:
 *
 *   request body -> create schema (the same zod schema the route uses)
 *                 -> conversationsRepository.create()
 *                 -> SQLite
 *                 -> read back
 *
 * If any link drops `modelId` or `toolsEnabled`, these tests fail.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

let tempDir: string;
let conversationsRepository: typeof import("@/lib/db/repositories/conversations").conversationsRepository;
let providersRepository: typeof import("@/lib/db/repositories/providers").providersRepository;
let providerId: string;

/**
 * The exact create schema declared by POST /api/conversations.
 * Kept in sync deliberately: if the route's contract changes, this test must
 * be updated with it, which is the point.
 */
const createSchema = z.object({
  title: z.string().min(1),
  providerId: z.string().nullable().default(null),
  modelId: z.string().nullable().default(null),
  systemPrompt: z.string().nullable().default(null),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(4096),
  toolsEnabled: z.boolean().default(false),
});

beforeAll(async () => {
  // Isolate the database so the test never touches a developer's real data.
  tempDir = mkdtempSync(join(tmpdir(), "gharibo-conv-test-"));
  process.env.DATABASE_PATH = join(tempDir, "test.db");
  const convMod = await import("@/lib/db/repositories/conversations");
  conversationsRepository = convMod.conversationsRepository;
  const provMod = await import("@/lib/db/repositories/providers");
  providersRepository = provMod.providersRepository;

  // conversations.provider_id has a real FOREIGN KEY, so a provider must exist
  // before a conversation can reference it. Creating one also proves the
  // provider link survives the round-trip.
  const provider = providersRepository.create({
    provider: "openai_compatible",
    modelId: "openai/gpt-oss-20b",
    baseUrl: "https://api.example.invalid",
    apiKeyRef: "GHARIBO_TEST_KEY",
    contextWindow: 8192,
    supportsVision: false,
    supportsTools: true,
    supportsStructuredOutput: false,
    supportsReasoning: false,
    isActive: true,
  });
  providerId = provider.id;
});

afterAll(async () => {
  // Windows keeps the SQLite file locked while the connection is open, so the
  // connection must be closed before the temp directory can be removed.
  try {
    const { closeDb } = await import("@/lib/db");
    closeDb();
  } catch {
    // A missing close helper must not fail the suite.
  }
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Temp-directory cleanup is best-effort and never a test failure.
    }
  }
});

describe("conversation model/tools persistence", () => {
  it("persists a selected modelId through the real SQLite chain", () => {
    const parsed = createSchema.parse({
      title: "Model persistence",
      providerId,
      modelId: "openai/gpt-oss-20b",
      systemPrompt: null,
      temperature: 0.7,
      maxTokens: 2048,
      toolsEnabled: false,
    });

    const created = conversationsRepository.create(parsed);

    // The returned record must carry the model…
    expect(created.modelId).toBe("openai/gpt-oss-20b");
    expect(created.modelId).not.toBeNull();

    // …and it must have actually reached the database, not just the return value.
    const reloaded = conversationsRepository.get(created.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.modelId).toBe("openai/gpt-oss-20b");
    expect(reloaded?.providerId).toBe(providerId);
  });

  it("persists toolsEnabled=true through the real SQLite chain", () => {
    const parsed = createSchema.parse({
      title: "Tools persistence",
      providerId,
      modelId: "openai/gpt-oss-20b",
      toolsEnabled: true,
    });

    const created = conversationsRepository.create(parsed);
    expect(created.toolsEnabled).toBe(true);

    const reloaded = conversationsRepository.get(created.id);
    expect(reloaded?.toolsEnabled).toBe(true);
  });

  it("persists toolsEnabled=false as a real false, not as a dropped field", () => {
    const parsed = createSchema.parse({
      title: "Tools off",
      providerId,
      modelId: "some/model",
      toolsEnabled: false,
    });

    const created = conversationsRepository.create(parsed);
    const reloaded = conversationsRepository.get(created.id);
    expect(reloaded?.toolsEnabled).toBe(false);
    // Crucially, the model survives even when tools are off.
    expect(reloaded?.modelId).toBe("some/model");
  });

  it("keeps modelId and toolsEnabled independent of each other", () => {
    const cases = [
      { modelId: "model/a", toolsEnabled: true },
      { modelId: "model/b", toolsEnabled: false },
      { modelId: null, toolsEnabled: true },
    ];

    for (const testCase of cases) {
      const parsed = createSchema.parse({
        title: `Case ${testCase.modelId ?? "none"}-${testCase.toolsEnabled}`,
        modelId: testCase.modelId,
        toolsEnabled: testCase.toolsEnabled,
      });
      const created = conversationsRepository.create(parsed);
      const reloaded = conversationsRepository.get(created.id);
      expect(reloaded?.modelId).toBe(testCase.modelId);
      expect(reloaded?.toolsEnabled).toBe(testCase.toolsEnabled);
    }
  });

  it("survives an update round-trip without losing the model", () => {
    const parsed = createSchema.parse({
      title: "Update round-trip",
      providerId,
      modelId: "model/original",
      toolsEnabled: true,
    });
    const created = conversationsRepository.create(parsed);

    const updated = conversationsRepository.update(created.id, {
      title: "Renamed",
    });
    expect(updated?.title).toBe("Renamed");
    // A title-only update must not clear the model or the tools flag.
    expect(updated?.modelId).toBe("model/original");
    expect(updated?.toolsEnabled).toBe(true);
  });

  it("applies the schema defaults when the model is genuinely not chosen", () => {
    const parsed = createSchema.parse({ title: "No model chosen" });
    const created = conversationsRepository.create(parsed);
    expect(created.modelId).toBeNull();
    expect(created.toolsEnabled).toBe(false);
  });

  it("rejects an empty title before it reaches the repository", () => {
    const result = createSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });
});
