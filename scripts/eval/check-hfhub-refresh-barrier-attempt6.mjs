#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  render,
  notebookSha256,
} from "./build-eval-kernel-attempt6.mjs";

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(detail ? `${name}: ${detail}` : name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const nb = JSON.parse(render());

const cells = nb.cells ?? [];

const codeCells = cells
  .map((cell, index) => ({
    index,
    type: cell.cell_type,
    source: Array.isArray(cell.source)
      ? cell.source.join("")
      : String(cell.source ?? ""),
  }))
  .filter((cell) => cell.type === "code");

function findUnique(marker) {
  const found = codeCells.filter((cell) =>
    cell.source.includes(marker)
  );

  if (found.length !== 1) {
    throw new Error(
      `expected exactly one cell containing ${JSON.stringify(marker)}, found ${found.length}`
    );
  }

  return found[0];
}

const install = findUnique("print('install complete')");
const snapshot = findUnique("SNAPSHOT_DIR = snapshot_download(");

check(
  "snapshot phase occurs after governed package installation",
  snapshot.index > install.index,
  `install cell=${install.index}, snapshot cell=${snapshot.index}`,
);

const preInstallSources = codeCells
  .filter((cell) => cell.index < install.index)
  .map((cell) => cell.source)
  .join("\n");

const directPreInstallHubImport =
  /^(?:from|import)\s+huggingface_hub\b/m.test(
    preInstallSources,
  );

check(
  "regression fixture reproduces the risky pre-install hub import condition",
  directPreInstallHubImport,
  "without this condition the original Attempt #5 skew mechanism is not represented",
);

const purgePos =
  snapshot.source.indexOf(
    "del sys.modules[_name]"
  );

const invalidatePos =
  snapshot.source.indexOf(
    "_importlib.invalidate_caches()"
  );

const coherentImportPos =
  snapshot.source.indexOf(
    "import huggingface_hub as _hfhub"
  );

const snapshotImportPos =
  snapshot.source.indexOf(
    "from huggingface_hub import snapshot_download"
  );

const snapshotCallPos =
  snapshot.source.indexOf(
    "SNAPSHOT_DIR = snapshot_download("
  );

check(
  "post-install barrier purges previously loaded huggingface_hub modules",
  snapshot.source.includes(
    "name == 'huggingface_hub' or name.startswith('huggingface_hub.')"
  ) &&
  purgePos >= 0,
);

check(
  "import caches are invalidated after purge",
  invalidatePos > purgePos,
);

check(
  "huggingface_hub is re-imported only after purge/cache invalidation",
  coherentImportPos > invalidatePos &&
  snapshotImportPos > coherentImportPos,
);

check(
  "snapshot_download executes only after the coherent post-install import",
  snapshotCallPos > snapshotImportPos,
);

check(
  "module version is checked against installed distribution version",
  snapshot.source.includes(
    "_hf_metadata.version('huggingface-hub')"
  ) &&
  snapshot.source.includes(
    "assert _hfhub.__version__ == _hf_dist_version"
  ),
);

check(
  "runtime emits an explicit refresh success marker",
  snapshot.source.includes(
    "HF_HUB_POST_INSTALL_REFRESH_PASS"
  ),
);

/*
 * Compile every generated Python code cell.
 * This catches quoting/indentation/source-generation mistakes
 * without executing installs, downloading models, or touching TEST.
 */
const pySources = codeCells.map((cell) => cell.source);

const compiler = spawnSync(
  "python",
  [
    "-c",
    [
      "import json,sys",
      "cells=json.load(sys.stdin)",
      "for i,src in enumerate(cells):",
      "    compile(src, f'generated-cell-{i}', 'exec')",
      "print('PYTHON_GENERATED_CELLS_COMPILE_PASS')",
    ].join("\n"),
  ],
  {
    input: JSON.stringify(pySources),
    encoding: "utf8",
  },
);

check(
  "all prospective generated Python cells compile",
  compiler.status === 0,
  compiler.stderr || compiler.stdout,
);

if (compiler.stdout?.trim()) {
  console.log(compiler.stdout.trim());
}

console.log("");
console.log(
  `PROSPECTIVE_REPAIRED_NOTEBOOK_SHA256=${notebookSha256()}`
);

if (failures.length) {
  console.log("");
  console.log(
    `HFHUB REFRESH REGRESSION: FAILED — ${failures.length} check(s)`
  );

  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }

  process.exit(1);
}

console.log("");
console.log(
  `HFHUB REFRESH REGRESSION: PASSED — ${passed} check(s)`
);
console.log("KAGGLE_PUSH_EXECUTED=NO");
console.log("TEST_INFERENCE_EXECUTED=NO");