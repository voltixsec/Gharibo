/**
 * Conversation isolation, message ordering and persistence.
 *
 * Runs against an ISOLATED temp SQLite file (never `apps/web/data/gharibo.db`).
 *
 * These tests exist because the Playground's correctness depends on properties
 * that are easy to break silently:
 *   - a NEW conversation must start with zero history;
 *   - one conversation's messages must never appear in another;
 *   - user/assistant turns must be ordered deterministically even when two rows
 *     share a millisecond-resolution timestamp;
 *   - an assistant reply must be persisted exactly once;
 *   - the GHARIBO-V1 runtime sentinel must never be stored in `provider_id`,
 *     which carries a foreign key to `providers(id)`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Point the DB singleton at a throwaway temp file BEFORE any import reads config.
const dbPath = vi.hoisted(() => {
  const base = process.env.TEMP || process.env.TMPDIR || process.cwd();
  const dir = `${base}/gharibo-conv-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const p = `${dir}/test.db`;
  process.env.DATABASE_PATH = p;
  return p;
});

import { conversationsRepository, providersRepository } from "@/lib/db/repositories";
import { db, closeDb } from "@/lib/db/index";
import { V1_MODEL_ID, V1_RUNTIME_PROVIDER_ID } from "@/lib/runtime/gharibo-v1.mjs";

beforeAll(() => {
  db();
});

afterAll(() => {
  closeDb();
  try {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("conversation isolation", () => {
  it("a new conversation starts with zero history", () => {
    const conv = conversationsRepository.create({ title: "Fresh" });
    const loaded = conversationsRepository.get(conv.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toEqual([]);
  });

  it("never leaks messages from one conversation into another", () => {
    const a = conversationsRepository.create({ title: "A" });
    const b = conversationsRepository.create({ title: "B" });

    conversationsRepository.addMessage(a.id, { role: "user", content: "only in A" });
    conversationsRepository.addMessage(a.id, { role: "assistant", content: "reply in A" });

    const loadedB = conversationsRepository.get(b.id);
    expect(loadedB!.messages).toHaveLength(0);

    const loadedA = conversationsRepository.get(a.id);
    expect(loadedA!.messages.map((m) => m.content)).toEqual(["only in A", "reply in A"]);
  });

  it("keeps system prompts scoped to their own conversation", () => {
    const a = conversationsRepository.create({ title: "SysA", systemPrompt: "You are A" });
    const b = conversationsRepository.create({ title: "SysB", systemPrompt: "You are B" });

    expect(conversationsRepository.get(a.id)!.systemPrompt).toBe("You are A");
    expect(conversationsRepository.get(b.id)!.systemPrompt).toBe("You are B");
  });

  it("deleting a conversation removes its messages", () => {
    const conv = conversationsRepository.create({ title: "Doomed" });
    conversationsRepository.addMessage(conv.id, { role: "user", content: "bye" });
    expect(conversationsRepository.remove(conv.id)).toBe(true);
    expect(conversationsRepository.get(conv.id)).toBeNull();

    const orphans = db()
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?")
      .get(conv.id) as { n: number };
    expect(orphans.n).toBe(0);
  });
});

describe("message ordering", () => {
  it("orders user before assistant when timestamps collide", () => {
    const conv = conversationsRepository.create({ title: "Ordering" });

    const user = conversationsRepository.addMessage(conv.id, {
      role: "user",
      content: "question",
    });
    const assistant = conversationsRepository.addMessage(conv.id, {
      role: "assistant",
      content: "answer",
    });

    // Force an exact collision on the millisecond-resolution timestamp. Without
    // the rowid tiebreaker the rendered order would be non-deterministic.
    const collide = db().prepare("UPDATE messages SET created_at = ? WHERE id = ?");
    collide.run("2026-01-01T00:00:00.000Z", user.id);
    collide.run("2026-01-01T00:00:00.000Z", assistant.id);

    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("preserves insertion order across many colliding rows", () => {
    const conv = conversationsRepository.create({ title: "ManyCollide" });
    const ids: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const msg = conversationsRepository.addMessage(conv.id, {
        role: i % 2 === 0 ? "user" : "assistant",
        content: `m${i}`,
      });
      ids.push(msg.id);
    }
    const collide = db().prepare("UPDATE messages SET created_at = ? WHERE id = ?");
    for (const id of ids) collide.run("2026-01-01T00:00:00.000Z", id);

    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.messages.map((m) => m.content)).toEqual([
      "m0",
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
    ]);
  });

  it("getMessages and get() agree on order", () => {
    const conv = conversationsRepository.create({ title: "Agree" });
    conversationsRepository.addMessage(conv.id, { role: "user", content: "1" });
    conversationsRepository.addMessage(conv.id, { role: "assistant", content: "2" });

    const viaGet = conversationsRepository.get(conv.id)!.messages.map((m) => m.id);
    const viaGetMessages = conversationsRepository.getMessages(conv.id).map((m) => m.id);
    expect(viaGet).toEqual(viaGetMessages);
  });
});

describe("assistant persistence", () => {
  it("persists an assistant reply exactly once", () => {
    const conv = conversationsRepository.create({ title: "Once" });
    conversationsRepository.addMessage(conv.id, { role: "user", content: "hi" });
    conversationsRepository.addMessage(conv.id, { role: "assistant", content: "hello" });

    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  it("records the model and provider identity on the assistant turn", () => {
    const conv = conversationsRepository.create({
      title: "Identity",
      providerId: null,
      modelId: V1_MODEL_ID,
    });
    conversationsRepository.addMessage(conv.id, { role: "user", content: "hi" });
    const reply = conversationsRepository.addMessage(conv.id, {
      role: "assistant",
      content: "hello",
      modelId: V1_MODEL_ID,
      providerId: null,
    });

    expect(reply.modelId).toBe(V1_MODEL_ID);
    expect(reply.providerId).toBeNull();
  });
});

describe("routing columns", () => {
  it("round-trips the V1 representation: providerId null + modelId GHARIBO-V1", () => {
    const conv = conversationsRepository.create({
      title: "V1",
      providerId: null,
      modelId: V1_MODEL_ID,
    });
    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.providerId).toBeNull();
    expect(loaded.modelId).toBe(V1_MODEL_ID);
  });

  it("round-trips a real provider id", () => {
    const provider = providersRepository.create({
      provider: "openai_compatible",
      modelId: "llama-3.1-8b",
      baseUrl: "http://localhost:11434",
      apiKeyRef: null,
      contextWindow: 8192,
      supportsVision: false,
      supportsTools: false,
      supportsStructuredOutput: false,
      supportsReasoning: false,
      displayName: "Local Llama",
      isActive: true,
    });

    const conv = conversationsRepository.create({
      title: "Other",
      providerId: provider.id,
      modelId: "llama-3.1-8b",
    });

    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.providerId).toBe(provider.id);
    expect(loaded.modelId).toBe("llama-3.1-8b");
  });

  it("PROVES the constraint: storing the sentinel in provider_id is rejected", () => {
    // `conversations.provider_id` is a FOREIGN KEY to providers(id) and
    // `foreign_keys = ON`. This is exactly why the sentinel must never be
    // written there — the routing contract stores providerId null instead.
    expect(() =>
      conversationsRepository.create({
        title: "Bad",
        providerId: V1_RUNTIME_PROVIDER_ID,
        modelId: V1_MODEL_ID,
      }),
    ).toThrow();
  });
});

describe("settings persistence", () => {
  it("clamps the stored max tokens and keeps temperature", () => {
    const conv = conversationsRepository.create({
      title: "Settings",
      temperature: 0.35,
      maxTokens: 256,
      toolsEnabled: false,
    });
    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.temperature).toBeCloseTo(0.35);
    expect(loaded.maxTokens).toBe(256);
    expect(loaded.toolsEnabled).toBe(false);
  });

  it("updates settings without disturbing messages", () => {
    const conv = conversationsRepository.create({ title: "Patch" });
    conversationsRepository.addMessage(conv.id, { role: "user", content: "keep me" });

    conversationsRepository.update(conv.id, { title: "Renamed", maxTokens: 128 });

    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.title).toBe("Renamed");
    expect(loaded.maxTokens).toBe(128);
    expect(loaded.messages.map((m) => m.content)).toEqual(["keep me"]);
  });

  it("records a quality signal on a single message", () => {
    const conv = conversationsRepository.create({ title: "Quality" });
    const msg = conversationsRepository.addMessage(conv.id, {
      role: "assistant",
      content: "rate me",
    });

    conversationsRepository.setMessageQuality(msg.id, "good");

    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.messages[0].qualitySignal).toBe("good");
  });
});
