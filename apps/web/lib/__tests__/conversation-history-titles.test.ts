/**
 * Conversation history + automatic titles + manual rename.
 *
 * Runs against an ISOLATED temp SQLite file (never `apps/web/data/gharibo.db`).
 *
 * The properties under test are the ones that are easy to break silently:
 *   - history starts at the FIRST user message and never loses it;
 *   - an automatic title is derived from that first accepted message only;
 *   - later messages never regenerate it;
 *   - a MANUAL rename is authoritative and is never overwritten;
 *   - the rename is guarded in SQL, so a stale client decision cannot win;
 *   - existing (legacy) conversations are not bulk-renamed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbPath = vi.hoisted(() => {
  const base = process.env.TEMP || process.env.TMPDIR || process.cwd();
  const dir = `${base}/gharibo-title-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const p = `${dir}/test.db`;
  process.env.DATABASE_PATH = p;
  return p;
});

import { conversationsRepository } from "@/lib/db/repositories";
import { db, closeDb } from "@/lib/db/index";
import {
  deriveConversationTitle,
  isAutoTitleEligible,
  DEFAULT_CONVERSATION_TITLE,
} from "@/lib/conversation-title.mjs";

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

/**
 * Creates a conversation the way the UI does: untitled, zero history.
 * Returns the FULL record (with messages) so tests can assert on history.
 */
function newChat() {
  const created = conversationsRepository.create({ title: DEFAULT_CONVERSATION_TITLE });
  return conversationsRepository.get(created.id)!;
}

/** The server-side auto-title step, mirroring the messages route. */
function autoTitleFromFirstMessage(
  id: string,
  firstUserMessage: string,
  isFirstUserMessage: boolean,
  persistedTitle: string,
) {
  if (!isFirstUserMessage) return false;
  if (!isAutoTitleEligible(persistedTitle)) return false;
  const derived = deriveConversationTitle(firstUserMessage);
  if (derived === DEFAULT_CONVERSATION_TITLE) return false;
  return conversationsRepository.renameIfUntitled(id, derived, DEFAULT_CONVERSATION_TITLE);
}

describe("history begins at the first user message", () => {
  it("a new conversation starts untitled with zero history", () => {
    const conv = newChat();
    expect(conv.title).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(conv.messages).toEqual([]);
  });

  it("the first user message survives titling and is message #1", () => {
    const conv = newChat();
    conversationsRepository.addMessage(conv.id, {
      role: "user",
      content: "Can you help me debug the provider routing issue in GHARIBO?",
    });
    autoTitleFromFirstMessage(
      conv.id,
      "Can you help me debug the provider routing issue in GHARIBO?",
      true,
      DEFAULT_CONVERSATION_TITLE,
    );

    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.messages.length).toBe(1);
    expect(loaded.messages[0].role).toBe("user");
    expect(loaded.messages[0].content).toContain("provider routing");
    expect(loaded.title).not.toBe(DEFAULT_CONVERSATION_TITLE);
  });

  it("full history reloads in order from message #1", () => {
    const conv = newChat();
    conversationsRepository.addMessage(conv.id, { role: "user", content: "first question" });
    autoTitleFromFirstMessage(conv.id, "first question", true, DEFAULT_CONVERSATION_TITLE);
    conversationsRepository.addMessage(conv.id, { role: "assistant", content: "first answer" });
    conversationsRepository.addMessage(conv.id, { role: "user", content: "second question" });
    conversationsRepository.addMessage(conv.id, { role: "assistant", content: "second answer" });

    const loaded = conversationsRepository.get(conv.id)!;
    expect(loaded.messages.map((m) => m.content)).toEqual([
      "first question",
      "first answer",
      "second question",
      "second answer",
    ]);
  });

  it("does not leak messages between conversations", () => {
    const a = newChat();
    const b = newChat();
    conversationsRepository.addMessage(a.id, { role: "user", content: "only in A" });
    conversationsRepository.addMessage(b.id, { role: "user", content: "only in B" });

    const loadedA = conversationsRepository.get(a.id)!;
    const loadedB = conversationsRepository.get(b.id)!;
    expect(loadedA.messages.map((m) => m.content)).toEqual(["only in A"]);
    expect(loadedB.messages.map((m) => m.content)).toEqual(["only in B"]);
  });
});

describe("automatic title happens once", () => {
  it("derives a title from the first accepted user message", () => {
    const conv = newChat();
    const changed = autoTitleFromFirstMessage(
      conv.id,
      "Compare NVIDIA NIM with OpenRouter for this project",
      true,
      DEFAULT_CONVERSATION_TITLE,
    );
    expect(changed).toBe(true);
    const title = conversationsRepository.get(conv.id)!.title;
    expect(title).toContain("NVIDIA");
    expect(title).toContain("OpenRouter");
  });

  it("derives an Arabic title from an Arabic first message", () => {
    const conv = newChat();
    const changed = autoTitleFromFirstMessage(
      conv.id,
      "عايز اعمل برنامج لإدارة المخازن والمشتريات للشركة",
      true,
      DEFAULT_CONVERSATION_TITLE,
    );
    expect(changed).toBe(true);
    const title = conversationsRepository.get(conv.id)!.title;
    expect(/[؀-ۿ]/.test(title)).toBe(true);
  });

  it("does NOT regenerate the title on later messages", () => {
    const conv = newChat();
    autoTitleFromFirstMessage(conv.id, "first topic about databases", true, DEFAULT_CONVERSATION_TITLE);
    const firstTitle = conversationsRepository.get(conv.id)!.title;

    // 100 more messages, none of which may change the title.
    for (let i = 0; i < 5; i += 1) {
      conversationsRepository.addMessage(conv.id, { role: "user", content: `later topic ${i}` });
      autoTitleFromFirstMessage(conv.id, `later topic ${i}`, false, firstTitle);
    }
    expect(conversationsRepository.get(conv.id)!.title).toBe(firstTitle);
  });

  it("leaves an unusable first message untitled", () => {
    const conv = newChat();
    const changed = autoTitleFromFirstMessage(conv.id, "???", true, DEFAULT_CONVERSATION_TITLE);
    expect(changed).toBe(false);
    expect(conversationsRepository.get(conv.id)!.title).toBe(DEFAULT_CONVERSATION_TITLE);
  });
});

describe("manual rename is authoritative", () => {
  it("a manual rename is never overwritten by auto-title logic", () => {
    const conv = newChat();
    autoTitleFromFirstMessage(conv.id, "initial question about storage", true, DEFAULT_CONVERSATION_TITLE);

    // The user renames.
    conversationsRepository.update(conv.id, { title: "برنامج المخازن" });
    expect(conversationsRepository.get(conv.id)!.title).toBe("برنامج المخازن");

    // Later messages must not regenerate the title.
    for (let i = 0; i < 3; i += 1) {
      conversationsRepository.addMessage(conv.id, { role: "user", content: `more ${i}` });
      autoTitleFromFirstMessage(
        conv.id,
        `more ${i}`,
        false,
        conversationsRepository.get(conv.id)!.title,
      );
    }
    expect(conversationsRepository.get(conv.id)!.title).toBe("برنامج المخازن");
  });

  it("survives a refetch (persisted, not local state)", () => {
    const conv = newChat();
    conversationsRepository.update(conv.id, { title: "Persisted Manual Title" });
    expect(conversationsRepository.get(conv.id)!.title).toBe("Persisted Manual Title");
    expect(conversationsRepository.list().find((c) => c.id === conv.id)!.title).toBe(
      "Persisted Manual Title",
    );
  });
});

describe("conditional rename is atomic at the repository level", () => {
  it("renames only while the persisted title is still the default", () => {
    const conv = newChat();
    expect(
      conversationsRepository.renameIfUntitled(conv.id, "First", DEFAULT_CONVERSATION_TITLE),
    ).toBe(true);
    // Second attempt is a no-op: the title is no longer the default.
    expect(
      conversationsRepository.renameIfUntitled(conv.id, "Second", DEFAULT_CONVERSATION_TITLE),
    ).toBe(false);
    expect(conversationsRepository.get(conv.id)!.title).toBe("First");
  });

  it("does not clobber a title set outside this request (stale-client safety)", () => {
    const conv = newChat();
    // Simulates: we read "New conversation", someone else renamed, then we write.
    conversationsRepository.update(conv.id, { title: "Renamed Elsewhere" });
    const changed = conversationsRepository.renameIfUntitled(
      conv.id,
      "Our Stale Derived Title",
      DEFAULT_CONVERSATION_TITLE,
    );
    expect(changed).toBe(false);
    expect(conversationsRepository.get(conv.id)!.title).toBe("Renamed Elsewhere");
  });

  it("treats a blank legacy title as untitled", () => {
    const conv = conversationsRepository.create({ title: "" });
    expect(
      conversationsRepository.renameIfUntitled(conv.id, "Recovered", DEFAULT_CONVERSATION_TITLE),
    ).toBe(true);
    expect(conversationsRepository.get(conv.id)!.title).toBe("Recovered");
  });
});

describe("existing conversations are not bulk-renamed", () => {
  it("legacy titles are left exactly as they were", () => {
    const legacy = conversationsRepository.create({ title: "Old hand-written title" });
    const another = conversationsRepository.create({ title: "Another old title" });

    // Nothing in this feature renames on read/list.
    conversationsRepository.list();
    conversationsRepository.get(legacy.id);

    expect(conversationsRepository.get(legacy.id)!.title).toBe("Old hand-written title");
    expect(conversationsRepository.get(another.id)!.title).toBe("Another old title");

    // And auto-titling explicitly declines them.
    expect(
      autoTitleFromFirstMessage(legacy.id, "brand new question", true, "Old hand-written title"),
    ).toBe(false);
    expect(conversationsRepository.get(legacy.id)!.title).toBe("Old hand-written title");
  });
});
