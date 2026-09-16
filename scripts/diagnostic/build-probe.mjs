import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EVAL_PINS, buildNotebook } from '../eval/build-eval-kernel.mjs';

const dir = 'scripts/diagnostic';
const pins = Object.fromEntries([
  'baseModel', 'baseModelRevision', 'loaderModelId', 'maxSeqLength', 'engineFreeze',
  'engineDependencies', 'frozenNoDeps', 'supportNoDeps', 'preservedCandidates', 'skipWhenPreserved',
].map(key => [key, EVAL_PINS[key]]));
// Read code definitions only, never evaluation records or prepared evaluation bundles.
const cells = buildNotebook().cells;
const installCells = cells.filter(c => String(c.source).startsWith('# --- dependencies:'));
assert.equal(installCells.length, 1);
const install = installCells[0].source;
const template = readFileSync(`${dir}/probe.py`, 'utf8');
const source = `PINS = __import__('json').loads(${JSON.stringify(JSON.stringify(pins))})\n` +
  template.replace('    __GOVERNED_INSTALL__', () => install.split('\n').map(s => `    ${s}`).join('\n'));
assert(!/\.generate\s*\(|for_inference\s*\(|\.forward\s*\(|apply_chat_template|prompts\.jsonl|gold\.jsonl|trainer\.train|PeftModel/.test(source));
assert(!/testSplitHash|testRecordCount|candidateAdapter/.test(source));
const notebook = JSON.stringify({cells: [{cell_type: 'code', metadata: {},
  execution_count: null, outputs: [], source}], metadata: {kernelspec: {
    display_name: 'Python 3', language: 'python', name: 'python3'}}, nbformat: 4, nbformat_minor: 5}, null, 2) + '\n';
const metadata = JSON.stringify({id: 'vokaigharibo/gharibo-diagnostic-dec0037',
  title: 'gharibo diagnostic dec0037', code_file: 'diagnostic.ipynb', language: 'python',
  kernel_type: 'notebook', is_private: true, enable_gpu: true, enable_internet: true,
  machine_shape: 'NvidiaTeslaT4', dataset_sources: [], competition_sources: [],
  kernel_sources: [], model_sources: []}, null, 2) + '\n';
for (const [name, contents] of [['diagnostic.ipynb', notebook], ['kernel-metadata.json', metadata]]) {
  const path = `${dir}/${name}`;
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), contents, path);
  else writeFileSync(path, contents);
}
if (process.argv.includes('--prepare')) {
  const launch = 'apps/web/data/diagnostic-dec0037/kernel';
  mkdirSync(launch, {recursive: true});
  writeFileSync(`${launch}/diagnostic.ipynb`, notebook);
  writeFileSync(`${launch}/kernel-metadata.json`, metadata);
}
console.log('DIAGNOSTIC_STATIC_PASS', createHash('sha256').update(notebook).digest('hex'));
