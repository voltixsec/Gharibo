/** Run through the existing vite-node runtime; stdout contains metadata only. */
import { execFileSync } from "node:child_process";
import { verifyGoldPackagePreview } from "../../apps/web/lib/training/gold-preview";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
console.log(JSON.stringify(verifyGoldPackagePreview({ repoRoot }), null, 2));
