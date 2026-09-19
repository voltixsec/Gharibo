/**
 * End-to-end API checks for the Playground routing and safety contract.
 *
 * Deliberately GPU-free: every check either exercises a REJECTION path (which
 * must happen before any inference) or inspects persisted state. This avoids
 * spending money waking the development GPU just to prove routing works.
 *
 * Every conversation created here is deleted again, so the database is left as
 * it was found.
 *
 * Usage: node api-checks.mjs <baseUrl>
 */
// Mutating suite: refuse to run unless started by the isolated runner, so it can
// never write into the owner's real SQLite database.
import { requireIsolatedVerification } from "./lib/verification-guard.mjs";
requireIsolatedVerification("api-checks.mjs");

const base = process.argv[2] ?? "http://localhost:3100";

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

const created = [];

async function makeConversation(body) {
  const res = await api("/api/conversations", { method: "POST", body: JSON.stringify(body) });
  if (res.status === 200 && res.json?.code === 0) created.push(res.json.data.id);
  return res;
}

async function cleanup() {
  for (const id of created) {
    await api(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
  }
}

try {
  // ---------------------------------------------------------------- 0. baseline
  const list = await api("/api/conversations");
  const before = list.json?.data?.length ?? 0;
  console.log(`baseline conversations: ${before}`);

  // ------------------------------------------- 1. sentinel must not be stored
  const sentinel = await makeConversation({
    title: "__qa_sentinel__",
    providerId: "gharibo-v1-runtime",
    modelId: "GHARIBO-V1",
  });
  record(
    "the V1 sentinel is rejected as provider_id (never written to the FK column)",
    sentinel.status === 400,
    `status=${sentinel.status}`,
  );

  // --------------------------------------------- 2. no routing -> clear error
  const noRoute = await makeConversation({ title: "__qa_no_route__", providerId: null, modelId: null });
  const noRouteId = noRoute.json?.data?.id;
  if (noRouteId) {
    const send = await api(`/api/conversations/${noRouteId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: "hello" }),
    });
    record(
      "a conversation with no model returns a clear NO_PROVIDER error",
      send.status === 400 && send.json?.error?.code === "NO_PROVIDER",
      `status=${send.status} code=${send.json?.error?.code}`,
    );

    // The rejected request must not have persisted anything.
    const after = await api(`/api/conversations/${noRouteId}`);
    record(
      "a rejected request leaves no half-written history",
      (after.json?.data?.messages ?? []).length === 0,
      `messages=${after.json?.data?.messages?.length}`,
    );
  }

  // ------------------------------- 3. V1 routing: clamp + oversized rejection
  const v1 = await makeConversation({
    title: "__qa_v1__",
    providerId: null,
    modelId: "GHARIBO-V1",
    maxTokens: 999999,
  });
  const v1Id = v1.json?.data?.id;
  if (v1Id) {
    record(
      "an oversized max_tokens is clamped on creation",
      v1.json?.data?.maxTokens === 512,
      `stored=${v1.json?.data?.maxTokens}`,
    );

    record(
      "the V1 representation round-trips (providerId null + modelId GHARIBO-V1)",
      v1.json?.data?.providerId === null && v1.json?.data?.modelId === "GHARIBO-V1",
      `providerId=${v1.json?.data?.providerId} modelId=${v1.json?.data?.modelId}`,
    );

    // A huge prompt must be rejected BEFORE any GPU work.
    const oversized = await api(`/api/conversations/${v1Id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: "x".repeat(40000) }),
    });
    record(
      "an oversized prompt is rejected before inference (413)",
      oversized.status === 413 && oversized.json?.error?.code === "PROMPT_TOO_LARGE",
      `status=${oversized.status} code=${oversized.json?.error?.code}`,
    );

    const stillEmpty = await api(`/api/conversations/${v1Id}`);
    record(
      "the oversized request persisted nothing",
      (stillEmpty.json?.data?.messages ?? []).length === 0,
      `messages=${stillEmpty.json?.data?.messages?.length}`,
    );

    // Malformed body handling.
    const malformed = await fetch(`${base}/api/conversations/${v1Id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    record("a malformed body is rejected with 400", malformed.status === 400, `status=${malformed.status}`);

    const empty = await api(`/api/conversations/${v1Id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: "" }),
    });
    record("an empty message is rejected with 400", empty.status === 400, `status=${empty.status}`);
  }

  // ------------------------------ 4. a real provider does NOT route to GHARIBO
  const providers = await api("/api/providers");
  const provider = (providers.json?.data ?? []).find((p) => p.isActive);
  if (!provider) {
    record("non-GHARIBO provider routing", false, "no active provider configured to test with");
  } else {
    const other = await makeConversation({
      title: "__qa_provider__",
      providerId: provider.id,
      modelId: provider.modelId,
      maxTokens: 128,
    });
    const otherId = other.json?.data?.id;
    if (otherId) {
      record(
        "a real provider id is stored (FK-valid)",
        other.json?.data?.providerId === provider.id,
        `providerId=${other.json?.data?.providerId}`,
      );

      const send = await api(`/api/conversations/${otherId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "ping" }),
      });

      // Whatever happens, it must NOT be a GHARIBO-V1 outcome. Either the
      // provider answered (200) or it failed as a provider (500/502/503), but
      // the request must never be silently redirected to the V1 runtime.
      const bodyText = send.text ?? "";
      const leakedToV1 = /GHARIBO-V1 runtime|V1 runtime is not configured/i.test(bodyText);
      record(
        "a non-GHARIBO provider is never silently routed to GHARIBO-V1",
        !leakedToV1,
        `status=${send.status}`,
      );
    }
  }

  // ------------------------------------------------- 5. isolation across reads
  const list2 = await api("/api/conversations");
  record(
    "conversation list is still readable",
    Array.isArray(list2.json?.data),
    `count=${list2.json?.data?.length}`,
  );
} finally {
  await cleanup();
  const list3 = await api("/api/conversations");
  const after = list3.json?.data?.length ?? -1;
  console.log(`cleanup: conversations now ${after}`);
  const leaked = (list3.json?.data ?? []).filter((c) => c.title.startsWith("__qa_"));
  record("all QA conversations were removed", leaked.length === 0, `leftover=${leaked.length}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
