/**
 * GET /api/research — list research records.
 * POST /api/research — run a research task (calls research service).
 */
import { NextRequest } from "next/server";
import { researchRepository } from "@/lib/db/repositories";
import { toApiResponse, HttpError } from "@gharibo/shared";
import { config } from "@/lib/config";
import { z } from "zod";

const schema = z.object({
  task: z.string().min(1),
  input: z.string().min(1),
  modelUsed: z.string().optional(),
});

export async function GET() {
  return toApiResponse(() => researchRepository.list());
}

export async function POST(request: NextRequest) {
  return toApiResponse(async () => {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors.map((e) => e.message).join("; "));
    }

    // Call the Python research service
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${config.researchUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: parsed.data.task,
          input: parsed.data.input,
          model_used: parsed.data.modelUsed,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Research service returned ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      throw new HttpError(503, `Research service unavailable: ${msg}`);
    }
  });
}
