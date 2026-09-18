/**
 * GHARIBO V1 application integration — plumbing verification.
 *
 * The route drives V1 inference through `runV1Chat`, which uses the canonical
 * request builder, the server-side token resolver and the final-channel guard.
 * This test proves that end-to-end path works: a real HTTP server returns an
 * OpenAI-compatible body containing real Harmony (analysis + final channels),
 * `runV1Chat` calls it with the canonical request, and only the final channel
 * ever becomes the answer.
 *
 * IMPORTANT: this is plumbing verification against a LOCAL stand-in endpoint,
 * not a live GHARIBO-V1 run. A genuine live inference cannot be exercised here
 * because the Kaggle runtime is DEVELOPMENT_EPHEMERAL and exposes no persistent
 * endpoint (the documented serving blocker). The functions under test are the
 * exact ones the production route uses, so a passing run proves the wiring is
 * correct; it is NOT a claim that V1 itself was executed live.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import {
  V1_ENV,
  V1_MODEL_ID,
  resolveV1RuntimeConfig,
  runV1Chat,
} from "@/lib/runtime/gharibo-v1.mjs";

const ANALYSIS = "Compare the payload against the taxonomy before answering.";
const ANSWER = '{"entityType":"SYSTEM","externalKey":"system:security:sip-voip-intercom"}';
const RAW_HARMONY =
  `<|start|>assistant<|channel|>analysis<|message|>${ANALYSIS}<|end|>` +
  `<|start|>assistant<|channel|>final<|message|>${ANSWER}<|return|>`;

const ANALYSIS_ONLY = `<|start|>assistant<|channel|>analysis<|message|>${ANALYSIS}<|end|>`;

interface Harness {
  baseUrl: string;
  setHandler: (h: (req: http.IncomingMessage, res: http.ServerResponse) => void) => void;
  close: () => Promise<void>;
}

function startServer(): Promise<Harness> {
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void = () => {};
  const server = http.createServer((req, res) => handler(req, res));
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        setHandler: (h) => {
          handler = h;
        },
        close: () =>
          new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

function openAiBody(content: string) {
  return JSON.stringify({ choices: [{ message: { content, role: "assistant" } }] });
}

let harness: Harness;

beforeAll(async () => {
  harness = await startServer();
  process.env[V1_ENV.baseUrl] = harness.baseUrl;
  process.env[V1_ENV.apiKeyRef] = "GHARIBO_V1_API_KEY";
  process.env.GHARIBO_V1_API_KEY = "test-token";
});

afterAll(async () => {
  await harness.close();
  delete process.env[V1_ENV.baseUrl];
  delete process.env[V1_ENV.apiKeyRef];
  delete process.env.GHARIBO_V1_API_KEY;
});

const v1Config = () => resolveV1RuntimeConfig(process.env);
const token = () => process.env.GHARIBO_V1_API_KEY ?? null;
const messages = [{ role: "user", content: "extract the entity" }];
const options = { systemPrompt: "You are GHARIBO.", temperature: 0.2, maxTokens: 3072 };

describe("V1 application integration (plumbing)", () => {
  it("NORMAL: returns only the final channel, never the analysis channel", async () => {
    harness.setHandler((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(openAiBody(RAW_HARMONY));
    });

    const result = await runV1Chat({ config: v1Config(), token: token(), messages, options });

    expect(result.ok).toBe(true);
    expect(result.answer).toBe(ANSWER);
    expect(result.answer).not.toContain(ANALYSIS);
    expect(JSON.stringify(result)).not.toContain(ANALYSIS);
  });

  it("STRUCTURED: a JSON final channel is returned verbatim", async () => {
    const structured = '{"records":[{"name":"ACME"}]}';
    const harmony =
      `<|start|>assistant<|channel|>analysis<|message|>thinking<|end|>` +
      `<|start|>assistant<|channel|>final<|message|>${structured}<|return|>`;
    harness.setHandler((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(openAiBody(harmony));
    });

    const result = await runV1Chat({ config: v1Config(), token: token(), messages, options });

    expect(result.ok).toBe(true);
    expect(result.answer).toBe(structured);
  });

  it("SENDS the canonical request (system first, model set from env, stream false)", async () => {
    let captured: any = null;
    harness.setHandler((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        captured = JSON.parse(body);
        res.setHeader("Content-Type", "application/json");
        res.end(openAiBody(RAW_HARMONY));
      });
    });

    await runV1Chat({ config: v1Config(), token: token(), messages, options });

    expect(captured.stream).toBe(false);
    expect((captured.messages as any[])[0]).toEqual({
      role: "system",
      content: "You are GHARIBO.",
    });
    expect(captured.model).toBe(V1_MODEL_ID);
    expect(captured.temperature).toBe(0.2);
    expect(captured.max_tokens).toBe(3072);
  });

  it("SENDS the bearer token resolved server-side", async () => {
    let auth: string | undefined;
    harness.setHandler((req, res) => {
      auth = req.headers["authorization"];
      res.setHeader("Content-Type", "application/json");
      res.end(openAiBody(RAW_HARMONY));
    });

    await runV1Chat({ config: v1Config(), token: token(), messages, options });

    expect(auth).toBe("Bearer test-token");
  });

  it("MALFORMED / NO FINAL CHANNEL: fails closed, never leaks analysis", async () => {
    harness.setHandler((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(openAiBody(ANALYSIS_ONLY));
    });

    const result = await runV1Chat({ config: v1Config(), token: token(), messages, options });

    expect(result.ok).toBe(false);
    expect(result.answer).toBeNull();
    expect(result.reason).toBe("NO_FINAL_CHANNEL");
    expect(JSON.stringify(result)).not.toContain(ANALYSIS);
  });

  it("no choices / empty content: fails closed", async () => {
    harness.setHandler((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [] }));
    });
    const empty = await runV1Chat({ config: v1Config(), token: token(), messages, options });
    expect(empty.ok).toBe(false);
  });

  it("PROVIDER UNAVAILABLE: a non-2xx response throws (route surfaces as Error)", async () => {
    harness.setHandler((_req, res) => {
      res.statusCode = 500;
      res.end("runtime boom");
    });

    await expect(
      runV1Chat({ config: v1Config(), token: token(), messages, options }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("PROVIDER UNAVAILABLE: an unreachable endpoint throws", async () => {
    const down = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:1",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_API_KEY",
    });
    await expect(
      runV1Chat({ config: down, token: null, messages, options }),
    ).rejects.toThrow();
  });

  it("NOT CONFIGURED: throws rather than inventing an answer", async () => {
    const unconfigured = resolveV1RuntimeConfig({});
    await expect(
      runV1Chat({ config: unconfigured, token: null, messages, options }),
    ).rejects.toThrow(/not configured/);
  });
});
