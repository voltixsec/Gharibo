import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Message } from "@gharibo/shared";
import { runAgentTurn } from "@/lib/agent/runtime";
import {
  resolveRuntimeToken,
  resolveV1RuntimeConfig,
  runV1Chat,
} from "@/lib/runtime/gharibo-v1.mjs";

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(30_000),
  })).min(1).max(40),
  systemPrompt: z.string().max(20_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(2048).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "MALFORMED_REQUEST", message: "Request body is not valid JSON." } }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: parsed.error.issues.map((issue) => issue.message).join("; ") } }, { status: 400 });
  }

  const config = resolveV1RuntimeConfig(process.env);
  if (!config.configured) {
    return NextResponse.json({ error: { code: "RUNTIME_NOT_CONFIGURED", message: `Missing ${config.missing.join(" and ")}.` } }, { status: 503 });
  }
  const token = resolveRuntimeToken(config, process.env);

  try {
    const result = await runAgentTurn({
      messages: parsed.data.messages as Message[],
      systemPrompt: parsed.data.systemPrompt,
      temperature: parsed.data.temperature ?? 0.2,
      maxTokens: parsed.data.maxTokens ?? 1024,
      modelCall: async (modelRequest) => {
        const extracted = await runV1Chat({
          config,
          token,
          messages: modelRequest.messages,
          options: {
            systemPrompt: modelRequest.systemPrompt,
            temperature: modelRequest.temperature ?? 0.2,
            maxTokens: modelRequest.maxTokens ?? 1024,
          },
        });
        if (!extracted.ok || !extracted.answer) {
          throw new Error(extracted.reason || "NO_FINAL_ANSWER");
        }
        return extracted.answer;
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({
      error: {
        code: "AGENT_PREVIEW_FAILED",
        message: error instanceof Error ? error.message : "Agent preview failed.",
      },
    }, { status: 502 });
  }
}
