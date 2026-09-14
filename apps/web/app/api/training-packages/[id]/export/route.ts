/**
 * GET /api/training-packages/[id]/export — download the package bundle as a ZIP.
 * Fails loudly (400) if the dataset version is not TRAINING_READY or hashes mismatch.
 */
import { NextRequest } from "next/server";
import { trainingPackagesRepository } from "@/lib/db/repositories";
import { assembleBundleForPackage } from "@/lib/training/export";
import { bundleRoot } from "@/lib/workers/kaggle/bundle";
import { HttpError } from "@gharibo/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const row = trainingPackagesRepository.get(params.id);
  if (!row) {
    return new Response("Training package not found", { status: 404 });
  }

  try {
    const { pkg, zip } = assembleBundleForPackage(row);
    const filename = `${bundleRoot(pkg)}.zip`;
    return new Response(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zip.length),
      },
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return new Response(e.message, { status: e.code });
    }
    const msg = e instanceof Error ? e.message : "Export failed";
    return new Response(msg, { status: 500 });
  }
}
