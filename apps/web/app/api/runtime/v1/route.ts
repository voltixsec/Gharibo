/**
 * GET /api/runtime/v1 — the GHARIBO V1 runtime descriptor.
 *
 * Reports the runtime's REAL health (a live probe), its identity, and its
 * client-safe configuration. It never reports ONLINE because configuration
 * merely exists, never labels a self-hosted development endpoint as production
 * hosting, and never returns secret material.
 *
 * Server-side only: the credential is resolved here and used only to make the
 * probe request. It is never echoed.
 */
import { NextResponse } from "next/server";
import {
  describeV1Runtime,
  resolveRuntimeToken,
  resolveV1RuntimeConfig,
} from "@/lib/runtime/gharibo-v1.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = resolveV1RuntimeConfig(process.env);
    const token = resolveRuntimeToken(config, process.env);
    const descriptor = await describeV1Runtime(config, { token });

    return NextResponse.json({ data: descriptor });
  } catch (error) {
    // A configuration error (for example a literal credential in the reference
    // slot) is reported as a plain failure, never as a ready runtime.
    return NextResponse.json(
      {
        data: {
          modelId: "GHARIBO-V1",
          hostingLabel: "NO_RUNTIME",
          isProduction: false,
          health: {
            state: "ERROR",
            ok: false,
            detail: error instanceof Error ? error.message : "Runtime configuration error",
            checkedAt: new Date().toISOString(),
          },
        },
      },
      { status: 200 },
    );
  }
}
