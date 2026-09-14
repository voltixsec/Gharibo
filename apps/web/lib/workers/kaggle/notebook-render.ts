/**
 * Deterministic Kaggle notebook renderer (architecture M2 §9.2).
 *
 * The template `notebook.template.ipynb` contains the sentinel token
 * `__GHARIBO_PACKAGE_JSON__`. The renderer substitutes it with the canonical
 * (sorted-key) snake_case manifest so the notebook is self-contained and offline,
 * then normalises the .ipynb JSON:
 *   - fixed cell order,
 *   - `execution_count: null`, `outputs: []`, stable `id`s,
 *   - 1-space indent, trailing newline.
 *
 * Result: same package → byte-identical notebook. No secrets, no personal paths.
 *
 * Server-only (fs + node:crypto).
 */
import fs from "node:fs";
import path from "node:path";
import type { NotebookArtifact, TrainingPackage } from "@gharibo/shared";
import { canonicalJson, sha256Hex } from "@/lib/training/hash";
import { toManifest } from "@/lib/training/package";

/** The sentinel token embedded in the template. */
export const PACKAGE_SENTINEL = "__GHARIBO_PACKAGE_JSON__";

interface NotebookCell {
  cell_type: string;
  execution_count: number | null;
  id: string;
  metadata: Record<string, unknown>;
  outputs: unknown[];
  source: string | string[];
}

interface NotebookTemplate {
  cells: NotebookCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
}

let cachedTemplate: NotebookTemplate | null = null;

/** Loads and caches the committed template (server-only). */
export function loadNotebookTemplate(): NotebookTemplate {
  if (cachedTemplate) return cachedTemplate;

  const candidates = [
    path.join(process.cwd(), "lib", "workers", "kaggle", "notebook.template.ipynb"),
    path.join(process.cwd(), "apps", "web", "lib", "workers", "kaggle", "notebook.template.ipynb"),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `notebook.template.ipynb not found (looked in: ${candidates.join(", ")})`,
    );
  }
  cachedTemplate = JSON.parse(fs.readFileSync(found, "utf8")) as NotebookTemplate;
  return cachedTemplate;
}

/** Normalises a source string into the canonical Jupyter line array. */
function toLines(source: string): string[] {
  const normalized = source.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return parts.map((line, i) => (i < parts.length - 1 ? line + "\n" : line));
}

/** Renders the deterministic notebook for a package. */
export function renderNotebook(pkg: TrainingPackage): NotebookArtifact {
  const template = loadNotebookTemplate();

  // The notebook reads snake_case keys, so embed the canonical manifest.
  const packageJson = canonicalJson(toManifest(pkg));
  if (packageJson.includes("'''")) {
    throw new Error("Rendered package JSON contains a triple-quote sequence; refusing to render notebook");
  }

  let sentinelSeen = false;
  const cells = template.cells.map((c, i) => {
    const raw = Array.isArray(c.source) ? c.source.join("") : String(c.source);
    let source = raw;
    if (raw.includes(PACKAGE_SENTINEL)) {
      sentinelSeen = true;
      source = raw.split(PACKAGE_SENTINEL).join(packageJson);
    }
    return {
      cell_type: c.cell_type,
      execution_count: null,
      id: c.id || `gharibo-cell-${i}`,
      metadata: {},
      outputs: [] as unknown[],
      source: toLines(source),
    };
  });

  if (!sentinelSeen) {
    throw new Error(`Notebook template is missing the ${PACKAGE_SENTINEL} sentinel`);
  }

  const notebook = {
    cells,
    metadata: template.metadata,
    nbformat: template.nbformat,
    nbformat_minor: template.nbformat_minor,
  };

  const content = JSON.stringify(notebook, null, 1) + "\n";
  return {
    filename: `${pkg.experimentId}.ipynb`,
    content,
    sha256: sha256Hex(content),
  };
}
