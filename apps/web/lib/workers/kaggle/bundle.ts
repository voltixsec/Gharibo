/**
 * Bundle layout (architecture M2 §3.3).
 *
 *   gharibo-<experiment_id>-<packageId[0:12]>/
 *   ├── manifest.json                 # canonical, byte-stable
 *   ├── README.md                     # operator instructions
 *   ├── CHECKSUMS.sha256              # manifest-of-hashes (§5.3)
 *   ├── dataset/
 *   │   ├── dataset.json              # DatasetRef (redundant, self-describing)
 *   │   ├── train.jsonl               # canonical lines
 *   │   ├── validation.jsonl
 *   │   └── test.jsonl
 *   └── notebook/
 *       └── <experiment_id>.ipynb
 */
import type { BundleFile, TrainingPackage } from "@gharibo/shared";
import { artifactRollup, sha256Hex } from "@/lib/training/hash";
import { serializeManifest } from "@/lib/training/package";
import { renderNotebook } from "./notebook-render";
import { instructions, renderReadme } from "./instructions";

/** The bundle root directory name. */
export function bundleRoot(pkg: TrainingPackage): string {
  return `gharibo-${pkg.experimentId}-${pkg.packageId.slice(0, 12)}`;
}

function file(relativePath: string, content: string): BundleFile {
  return { relativePath, content, sha256: sha256Hex(content) };
}

function jsonl(lines: string[]): string {
  if (lines.length === 0) return "";
  return lines.join("\n") + "\n";
}

/**
 * Builds the CHECKSUMS.sha256 file: one `sha256  path` line per file (excluding
 * CHECKSUMS.sha256 itself) plus a final rollup line.
 */
export function buildChecksumsFile(files: BundleFile[]): string {
  const rollup = artifactRollup(files.map((f) => ({ relativePath: f.relativePath, sha256: f.sha256 })));
  const lines = files
    .slice()
    .sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0))
    .map((f) => `${f.sha256}  ${f.relativePath}`);
  lines.push(`# rollup  ${rollup}`);
  return lines.join("\n") + "\n";
}

/**
 * Builds the bundle file set. `contents` supplies the canonical JSONL lines for
 * each split (a package carries hashes, not records).
 */
export function buildBundle(
  pkg: TrainingPackage,
  contents?: { train: string[]; validation: string[]; test: string[] },
): BundleFile[] {
  const root = bundleRoot(pkg);
  const splitContents = contents ?? { train: [], validation: [], test: [] };
  const notebook = renderNotebook(pkg);
  const instr = instructions(pkg);

  const files: BundleFile[] = [
    file(`${root}/manifest.json`, serializeManifest(pkg)),
    file(`${root}/README.md`, renderReadme(pkg, instr)),
    file(`${root}/dataset/dataset.json`, JSON.stringify(pkg.dataset, null, 1) + "\n"),
    file(`${root}/dataset/train.jsonl`, jsonl(splitContents.train)),
    file(`${root}/dataset/validation.jsonl`, jsonl(splitContents.validation)),
    file(`${root}/dataset/test.jsonl`, jsonl(splitContents.test)),
    file(`${root}/notebook/${notebook.filename}`, notebook.content),
  ];

  // CHECKSUMS.sha256 is computed over the files above (it cannot hash itself).
  files.push(file(`${root}/CHECKSUMS.sha256`, buildChecksumsFile(files)));
  return files;
}
