#!/usr/bin/env node
/**
 * validate-master-state.mjs — integrity validator for the GHARIBO master state.
 *
 * `governance/GHARIBO_MASTER_STATE.json` is the canonical single source of truth. This
 * validator enforces that it stays well-formed, internally consistent, honest about the
 * "training has not started" invariant, free of secrets and private dataset material, and
 * in byte-exact sync with its generated human view (`docs/GHARIBO_MASTER_STATE.md`).
 *
 * The Markdown check imports `renderMasterStateMarkdown` from the generator rather than
 * re-implementing the render, so the two can never diverge.
 *
 * ROBUSTNESS
 * ----------
 * The validator must never exit with a raw stack trace. A malformed document (e.g. a deleted
 * top-level key) is reported as structured `FAIL` lines followed by `RESULT: FAILED`, never as
 * an uncaught exception:
 *   - the required-sections check runs first and records `[sections]` FAILs before anything is
 *     rendered;
 *   - the render/markdown-sync comparison is wrapped so a render throw becomes a `[markdown]` FAIL;
 *   - the whole check sequence is wrapped so any other unexpected throw becomes an `[internal]` FAIL.
 *
 * This script deliberately does NOT call `docs:validate` (no circular scripts). The reverse
 * composition is done in package.json: `docs:validate` runs `validate-docs.mjs` and then this
 * validator.
 *
 * Run: npm run master:validate
 * Exit code 0 = all checks passed; 1 = at least one failure.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAcceptedGoldPreviewState } from '../../apps/web/lib/training/gold-authorization.mjs';
import { renderMasterStateMarkdown } from './generate-master-state.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const p = (...parts) => join(ROOT, ...parts);

const JSON_REL = 'governance/GHARIBO_MASTER_STATE.json';
const MD_REL = 'docs/GHARIBO_MASTER_STATE.md';

const REQUIRED_SECTIONS = [
  'schemaVersion',
  'masterStateVersion',
  'updatedAt',
  'project',
  'currentState',
  'architecture',
  'governance',
  'decisions',
  'roadmap',
  'training',
  'datasets',
  'experiments',
  'models',
  'knowledgeGraph',
  'procurementIntelligence',
  'toolsAndConnectors',
  'securityAndIP',
  'validation',
  'blockers',
  'nextActions',
  'history',
];

const DECISION_STATUSES = ['PROPOSED', 'ACCEPTED', 'SUPERSEDED', 'REJECTED'];
const ROADMAP_STATUSES = [
  'NOT_STARTED',
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETE',
  'DEFERRED',
  'FUTURE',
  'SUPERSEDED',
];
const MODEL_STATUSES = ['NOT_CREATED', 'EXPERIMENT', 'CANDIDATE', 'ACCEPTED', 'DEPRECATED'];
const REFERENCE_PREFIXES = ['docs/', 'scripts/', 'governance/'];

const failures = [];
const checks = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);
const pass = (check, msg) => checks.push(`[${check}] ${msg}`);
const failedUnder = (check) => failures.some((f) => f.startsWith(`[${check}]`));

function walk(dir, filter) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

/** True when a repo-relative reference path is expected to exist and does. */
function refExists(rel) {
  if (typeof rel !== 'string') return false;
  if (!REFERENCE_PREFIXES.some((prefix) => rel.startsWith(prefix))) return true;
  return existsSync(p(rel));
}

/** Collects every string value in a nested structure. */
function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectStrings(item, out);
  return out;
}

/** Collects every object key in a nested structure. */
function collectKeys(value, out = []) {
  if (Array.isArray(value)) for (const item of value) collectKeys(item, out);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      collectKeys(item, out);
    }
  }
  return out;
}

function firstDifferenceLine(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  const max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) if (la[i] !== lb[i]) return i;
  return -1;
}

function main() {
  // -------------------------------------------------------------- 1. JSON validity
  let rawText = null;
  let state = null;
  if (!existsSync(p(JSON_REL))) {
    fail('json', `${JSON_REL} not found`);
  } else {
    rawText = readFileSync(p(JSON_REL), 'utf8');
    try {
      state = JSON.parse(rawText);
      pass('json', `${JSON_REL} parses as JSON`);
    } catch (error) {
      fail('json', `parse error: ${error.message}`);
    }
  }

  if (!state) {
    report();
    return;
  }

  try {
    runChecks(state, rawText);
  } catch (error) {
    fail('internal', `unexpected error while validating: ${error.message}`);
  }

  report();
}

function runChecks(state, rawText) {
  // -------------------------------------------------------------- 2. schema/version presence
  for (const field of ['schemaVersion', 'masterStateVersion', 'updatedAt']) {
    if (state[field] === undefined || state[field] === null || state[field] === '') {
      fail('schema', `${field} is missing`);
    }
  }
  if (typeof state.masterStateVersion === 'string' && !/^\d+\.\d+\.\d+$/.test(state.masterStateVersion)) {
    fail('schema', `masterStateVersion "${state.masterStateVersion}" is not semver (X.Y.Z)`);
  }
  if (typeof state.updatedAt === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(state.updatedAt)) {
    fail('schema', `updatedAt "${state.updatedAt}" is not YYYY-MM-DD`);
  }
  if (!failedUnder('schema')) {
    pass('schema', `schemaVersion=${state.schemaVersion}, masterStateVersion=${state.masterStateVersion}, updatedAt=${state.updatedAt}`);
  }

  // -------------------------------------------------------------- 3. required sections
  {
    const keys = Object.keys(state);
    const missing = REQUIRED_SECTIONS.filter((k) => !keys.includes(k));
    const unknown = keys.filter((k) => !REQUIRED_SECTIONS.includes(k));
    const inOrder =
      keys.length === REQUIRED_SECTIONS.length && keys.every((k, i) => k === REQUIRED_SECTIONS[i]);
    if (missing.length) fail('sections', `missing top-level key(s): ${missing.join(', ')}`);
    if (unknown.length) fail('sections', `unknown top-level key(s): ${unknown.join(', ')}`);
    if (!inOrder) fail('sections', 'top-level keys are not in the required order');
    if (!failedUnder('sections')) pass('sections', `${keys.length} top-level keys present, in order, no unknowns`);
  }

  const decisions = Array.isArray(state.decisions) ? state.decisions : [];
  const decisionById = new Map(decisions.map((d) => [d.id, d]));
  const datasetKeys = Object.keys(state.datasets || {});
  const experimentKeys = Object.keys(state.experiments || {});
  const baseModelIds = (state.models?.baseModelCandidates || []).map((m) => m.id);
  const derivedModelIds = (state.models?.derivedModels || []).map((m) => m.id);

  // -------------------------------------------------------------- 4. decision id integrity
  {
    const requiredFields = ['id', 'date', 'title', 'status', 'decision', 'rationale', 'scope', 'references', 'supersedes', 'supersededBy', 'architectureChanging'];
    for (const d of decisions) {
      const absent = requiredFields.filter((f) => !(f in d));
      if (absent.length) fail('decision-ids', `${d.id || '(no id)'}: missing field(s) ${absent.join(', ')}`);
    }
    const ids = decisions.map((d) => d.id);
    const badFormat = ids.filter((id) => !/^DEC-\d{4}$/.test(id));
    if (badFormat.length) fail('decision-ids', `bad id format: ${badFormat.join(', ')}`);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (dupes.length) fail('decision-ids', `duplicate id(s): ${dupes.join(', ')}`);
    for (let i = 0; i < ids.length; i++) {
      const expected = `DEC-${String(i + 1).padStart(4, '0')}`;
      if (ids[i] !== expected) {
        fail('decision-ids', `not sequential: expected ${expected}, found ${ids[i]}`);
        break;
      }
    }
    if (!failedUnder('decision-ids')) pass('decision-ids', `${ids.length} decision id(s), DEC-0001..${ids[ids.length - 1]}, unique and gapless`);
  }

  // -------------------------------------------------------------- 5. decision statuses
  {
    for (const d of decisions) {
      if (!DECISION_STATUSES.includes(d.status)) fail('decision-status', `${d.id}: invalid status "${d.status}"`);
      if (d.status === 'SUPERSEDED' && (d.supersededBy === null || d.supersededBy === undefined)) {
        fail('decision-status', `${d.id}: SUPERSEDED decision has no supersededBy`);
      }
    }
    if (!failedUnder('decision-status')) pass('decision-status', 'all decision statuses valid; every SUPERSEDED decision carries a supersededBy');
  }

  // -------------------------------------------------------------- 6. roadmap statuses
  {
    const stages = Array.isArray(state.roadmap?.stages) ? state.roadmap.stages : [];
    for (const s of stages) {
      if (!ROADMAP_STATUSES.includes(s.status)) fail('roadmap', `${s.id}: invalid status "${s.status}"`);
    }
    const ids = stages.map((s) => s.id);
    if (ids.length !== new Set(ids).size) fail('roadmap', 'roadmap stage ids are not unique');
    if (!failedUnder('roadmap')) pass('roadmap', `${stages.length} stage(s); statuses valid; ids unique`);
  }

  // -------------------------------------------------------------- 7. experiment references
  {
    for (const [key, e] of Object.entries(state.experiments || {})) {
      if (!datasetKeys.includes(e.datasetVersion)) fail('experiment-refs', `${key}: datasetVersion "${e.datasetVersion}" does not resolve`);
      if (!baseModelIds.includes(e.baseModel)) fail('experiment-refs', `${key}: baseModel "${e.baseModel}" does not resolve`);
      if (!derivedModelIds.includes(e.promotionTarget)) fail('experiment-refs', `${key}: promotionTarget "${e.promotionTarget}" does not resolve`);
      for (const r of e.references || []) {
        if (!refExists(r)) fail('experiment-refs', `${key}: reference "${r}" does not exist`);
      }
    }
    if (!failedUnder('experiment-refs')) pass('experiment-refs', `${experimentKeys.length} experiment(s) resolve dataset, base model, promotion target and references`);
  }

  // -------------------------------------------------------------- 8. model references
  {
    for (const m of state.models?.baseModelCandidates || []) {
      for (const dm of m.derivedModels || []) {
        if (!experimentKeys.includes(dm)) fail('model-refs', `${m.id}: derivedModels entry "${dm}" does not resolve to an experiment`);
      }
    }
    if (derivedModelIds.length !== new Set(derivedModelIds).size) fail('model-refs', 'derived model ids are not unique');
    for (const m of state.models?.derivedModels || []) {
      if (!MODEL_STATUSES.includes(m.status)) fail('model-refs', `${m.id}: invalid status "${m.status}"`);
    }
    if (!failedUnder('model-refs')) pass('model-refs', 'base-model links, unique derived ids and derived statuses all valid');
  }

  // -------------------------------------------------------------- 9. dataset references
  {
    for (const [key, d] of Object.entries(state.datasets || {})) {
      if (key !== d.id) fail('dataset-refs', `key "${key}" does not equal entry id "${d.id}"`);
      const counts = d.split?.counts || {};
      const sum = (counts.train || 0) + (counts.validation || 0) + (counts.test || 0);
      if (sum !== d.exampleCount) fail('dataset-refs', `${key}: exampleCount ${d.exampleCount} != split sum ${sum}`);
      if (!refExists(d.split?.generator)) fail('dataset-refs', `${key}: split generator "${d.split?.generator}" does not exist`);
    }
    if (!failedUnder('dataset-refs')) pass('dataset-refs', `${datasetKeys.length} dataset(s); keys match ids; example counts match split sums; generators exist`);
  }

  // -------------------------------------------------------------- 10. current-state consistency
  {
    const cs = state.currentState;
    const t = state.training;
    if (cs.trainingStatus !== t.status) fail('consistency', `currentState.trainingStatus "${cs.trainingStatus}" != training.status "${t.status}"`);
    if (cs.trainingHasStarted !== t.hasStarted) fail('consistency', `currentState.trainingHasStarted ${cs.trainingHasStarted} != training.hasStarted ${t.hasStarted}`);
    if (cs.currentMilestone !== state.project.currentMilestone) fail('consistency', `currentState.currentMilestone "${cs.currentMilestone}" != project.currentMilestone "${state.project.currentMilestone}"`);
    const ds = state.datasets?.[cs.dataset.id];
    if (!ds) {
      fail('consistency', `currentState.dataset.id "${cs.dataset.id}" is not a datasets key`);
    } else {
      if (cs.dataset.exampleCount !== ds.exampleCount) fail('consistency', `currentState.dataset.exampleCount ${cs.dataset.exampleCount} != datasets ${ds.exampleCount}`);
      const pairs = [
        ['split.train', cs.dataset.split.train, ds.split.counts.train],
        ['split.validation', cs.dataset.split.validation, ds.split.counts.validation],
        ['split.test', cs.dataset.split.test, ds.split.counts.test],
        ['audit.cohortSize', cs.dataset.audit.cohortSize, ds.audit.cohortSize],
        ['audit.pass', cs.dataset.audit.pass, ds.audit.pass],
        ['audit.needsReview', cs.dataset.audit.needsReview, ds.audit.needsReview],
        ['audit.fail', cs.dataset.audit.fail, ds.audit.fail],
        ['audit.auditedTestCount', cs.dataset.audit.auditedTestCount, ds.audit.auditedTestCount],
      ];
      for (const [label, a, b] of pairs) {
        if (a !== b) fail('consistency', `currentState.dataset.${label} ${a} != datasets ${b}`);
      }
    }
    const adrFiles = walk(p('docs', 'adr'), (f) => /ADR-\d{4}-.*\.md$/.test(f));
    if (state.architecture.decisionRecordCount !== adrFiles.length) {
      fail('consistency', `architecture.decisionRecordCount ${state.architecture.decisionRecordCount} != ${adrFiles.length} ADR file(s) on disk`);
    }
    if (!failedUnder('consistency')) pass('consistency', 'currentState matches project/training/datasets and the ADR count matches disk');
  }

  // -------------------------------------------------------------- 11. TRAINING HAS NOT STARTED
  {
    const t = state.training;
    if (t.hasStarted !== false) fail('training-invariant', 'training.hasStarted must be false');
    if (t.status !== 'NOT_STARTED') fail('training-invariant', 'training.status must be "NOT_STARTED"');
    if (t.weightsDownloaded !== false) fail('training-invariant', 'training.weightsDownloaded must be false');
    if (t.adaptersProduced !== 0) fail('training-invariant', 'training.adaptersProduced must be 0');
    if (t.checkpointsProduced !== 0) fail('training-invariant', 'training.checkpointsProduced must be 0');
    if (t.evaluationResults !== 0) fail('training-invariant', 'training.evaluationResults must be 0');
    for (const [key, e] of Object.entries(state.experiments || {})) {
      if (e.trainingRunId !== null) fail('training-invariant', `${key}: trainingRunId must be null`);
      if (e.packageId !== null) fail('training-invariant', `${key}: packageId must be null`);
      if (e.evaluationStatus !== 'NOT_RUN') fail('training-invariant', `${key}: evaluationStatus must be "NOT_RUN"`);
    }
    for (const m of state.models?.derivedModels || []) {
      if (['NOT_CREATED', 'EXPERIMENT'].includes(m.status) && m.produced === true) {
        fail('training-invariant', `${m.id}: derived model with status ${m.status} is claimed as produced`);
      }
    }
    if (!failedUnder('training-invariant')) pass('training-invariant', 'training has not started: no run, no package, no evaluation, no weights, no artifacts');
  }

  // -------------------------------------------------------------- 12. generated markdown sync
  {
    const mdPath = p(MD_REL);
    if (!existsSync(mdPath)) {
      fail('markdown', `${MD_REL} not found — run: npm run master:generate`);
    } else {
      const onDisk = readFileSync(mdPath, 'utf8');
      let rendered = null;
      try {
        rendered = renderMasterStateMarkdown(state);
      } catch (error) {
        fail('markdown', `could not render the human view for comparison: ${error.message} — run: npm run master:generate`);
      }
      if (rendered !== null) {
        if (onDisk === rendered) {
          pass('markdown', `${MD_REL} is byte-identical to the renderer output`);
        } else {
          const line = firstDifferenceLine(onDisk, rendered);
          fail('markdown', `${MD_REL} is out of sync (first difference at line ${line + 1}) — run: npm run master:generate`);
        }
      }
    }
  }

  // -------------------------------------------------------------- 13. secrets scan
  {
    const SECRET_PATTERNS = [
      [/\bsk-[A-Za-z0-9_-]{16,}\b/, 'sk- token'],
      [/\bhf_[A-Za-z0-9]{16,}\b/, 'hf_ token'],
      [/\bghp_[A-Za-z0-9]{16,}\b/, 'ghp_ token'],
      [/\bgithub_pat_[A-Za-z0-9_]{16,}\b/, 'github_pat token'],
      [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
      [/"password"\s*:\s*"[^"]+"/, 'literal password value'],
      [/"apiKey"\s*:\s*"[^"]+"/, 'literal apiKey value'],
      [/"api_key"\s*:\s*"[^"]+"/, 'literal api_key value'],
      [/"secret"\s*:\s*"[^"]+"/, 'literal secret value'],
      [/Authorization:\s*Bearer\s+\S+/i, 'Authorization: Bearer token'],
    ];
    const targets = [['JSON', rawText]];
    if (existsSync(p(MD_REL))) targets.push(['markdown', readFileSync(p(MD_REL), 'utf8')]);
    for (const [label, text] of targets) {
      for (const [pattern, name] of SECRET_PATTERNS) {
        if (pattern.test(text)) fail('secrets', `${label} contains a credential-shaped value (${name})`);
      }
    }
    if (!failedUnder('secrets')) pass('secrets', 'no credential-shaped values found in the JSON or the generated view');
  }

  // -------------------------------------------------------------- 14. no raw/private dataset exposure
  {
    const DATA_PREFIXES = ['data/raw/', 'data/processed/', 'data/datasets/', 'data/exports/'];
    for (const prefix of DATA_PREFIXES) {
      if (rawText.includes(prefix)) fail('privacy', `master state references "${prefix}" as if it were included`);
    }
    const CONTENT_KEYS = ['examples', 'payload', 'records'];
    const keys = new Set(collectKeys(state));
    for (const key of CONTENT_KEYS) {
      if (keys.has(key)) fail('privacy', `master state contains a "${key}" content array/field`);
    }
    for (const value of collectStrings(state)) {
      if (value.length > 256 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        fail('privacy', `master state contains a long encoded blob (${value.length} chars) that is not a declared hash`);
      }
    }
    if (!failedUnder('privacy')) pass('privacy', 'no raw/private dataset paths, no content arrays, no undeclared long blobs');
  }

  // -------------------------------------------------------------- 15. no machine-specific paths
  {
    const MACHINE_PATTERNS = [
      [/C:\\/, 'C:\\ path'],
      [/[A-Za-z]:\\/, 'Windows drive path'],
      [/\/Users\//, '/Users/ path'],
      [/\/home\//, '/home/ path'],
      [/[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+/, 'backslash-separated path'],
      [/\.workbuddy-ai/, '.workbuddy-ai reference'],
    ];
    const targets = [['JSON', rawText]];
    if (existsSync(p(MD_REL))) targets.push(['markdown', readFileSync(p(MD_REL), 'utf8')]);
    for (const [label, text] of targets) {
      for (const [pattern, name] of MACHINE_PATTERNS) {
        if (pattern.test(text)) fail('machine-paths', `${label} contains a machine-specific ${name}`);
      }
    }
    if (!failedUnder('machine-paths')) pass('machine-paths', 'no machine-specific or drive paths in the JSON or the generated view');
  }

  // -------------------------------------------------------------- 16. architecture-changing ADR links
  {
    for (const d of decisions) {
      if (d.status !== 'ACCEPTED' || d.architectureChanging !== true) continue;
      const adrs = (d.references || []).filter((r) => /^docs\/adr\/ADR-\d{4}-.*\.md$/.test(r));
      if (adrs.length === 0) {
        fail('adr-link', `${d.id}: architecture-changing ACCEPTED decision has no ADR reference`);
        continue;
      }
      for (const adr of adrs) {
        if (!existsSync(p(adr))) fail('adr-link', `${d.id}: ADR reference "${adr}" does not exist`);
      }
    }
    if (!failedUnder('adr-link')) pass('adr-link', 'every architecture-changing ACCEPTED decision references an existing ADR');
  }

  // -------------------------------------------------------------- 17. supersession integrity
  {
    for (const d of decisions) {
      if (d.supersedes !== null && d.supersedes !== undefined) {
        const other = decisionById.get(d.supersedes);
        if (!other) fail('supersession', `${d.id}: supersedes "${d.supersedes}" which does not exist`);
        else {
          if (other.supersededBy !== d.id) fail('supersession', `${d.id} supersedes ${other.id}, but ${other.id}.supersededBy is ${other.supersededBy}`);
          if (other.status !== 'SUPERSEDED') fail('supersession', `${other.id} is superseded, but its status is ${other.status}`);
        }
      }
      if (d.supersededBy !== null && d.supersededBy !== undefined) {
        const other = decisionById.get(d.supersededBy);
        if (!other) fail('supersession', `${d.id}: supersededBy "${d.supersededBy}" does not exist`);
        else if (other.supersedes !== d.id) fail('supersession', `${d.id}.supersededBy=${other.id}, but ${other.id}.supersedes is ${other.supersedes}`);
      }
    }
    if (!failedUnder('supersession')) pass('supersession', 'supersedes / supersededBy relationships are reciprocal and consistent');
  }

  // Check the transition even if preview metadata has been removed.
  if (state.training?.authorization !== undefined || state.training?.packagePreview ||
      state.experiments?.['GHARIBO-exp-001']?.trainingAuthorized === true) {
    if (!isAcceptedGoldPreviewState(state)) {
      fail('gold-preview', 'requires exact legacy preauthorization or valid non-executed DEC-0025 binding');
    }
  }

  // Preview metadata is evidence only; it must never issue/authorize an experiment.
  if (state.training?.packagePreview) {
    const preview = state.training.packagePreview;
    const experiment = state.experiments?.['GHARIBO-exp-001'];
    const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    if (preview.status !== 'PREVIEW_ONLY' || preview.persisted !== false ||
        preview.trainingAuthorized !== false || preview.testUsage !== 'HASH_INTEGRITY_ONLY' ||
        preview.declaredMinimumRecordsPerSplit !== null || !hash(preview.recipeHash) ||
        preview.qualificationHash !== state.training.qualification?.qualificationHash ||
        preview.engineFreeze !== state.training.engine?.freezeLabel ||
        experiment?.packageId !== null || experiment?.trainingRunId !== null ||
        state.training.hasStarted !== false) {
      fail('gold-preview', 'preview must preserve accepted provenance and remain unissued and non-executable');
    }

    const evidence = preview.evidence;
    if (!evidence || !hash(evidence.packageId) || !hash(evidence.sourceFilesHash) ||
        !hash(evidence.manifestSha256) || !hash(evidence.bundleSha256) || !hash(evidence.checksumsSha256) ||
        !/^[0-9a-f]{40}$/.test(evidence.gitCommitSha ?? '') ||
        typeof evidence.workingTreeDirty !== 'boolean' || evidence.independentBuilds !== 2 ||
        evidence.byteForByteIdentical !== true) {
      fail('gold-preview', 'preview must record two-build byte-identical evidence with an explicit Git context');
    }
    if (!failedUnder('gold-preview')) pass('gold-preview', 'preview evidence is bound to provenance without issuance or authorization');
  }

  // -------------------------------------------------------------- 18. reference path existence
  {
    const checkRefs = (group, id, refs) => {
      for (const r of refs || []) {
        if (typeof r === 'string' && REFERENCE_PREFIXES.some((prefix) => r.startsWith(prefix)) && !existsSync(p(r))) {
          fail('references', `${group}[${id}]: "${r}" does not exist on disk`);
        }
      }
    };
    for (const d of decisions) checkRefs('decisions', d.id, d.references);
    for (const [key, e] of Object.entries(state.experiments || {})) checkRefs('experiments', key, e.references);
    for (const b of state.blockers || []) checkRefs('blockers', b.id, b.references);
    for (const a of state.nextActions || []) checkRefs('nextActions', a.id, a.references);
    if (!failedUnder('references')) pass('references', 'every docs/ scripts/ governance/ reference resolves to a real file');
  }
}

function report() {
  const line = '─'.repeat(64);
  console.log(line);
  console.log('GHARIBO AI LAB — master state validation');
  console.log(line);
  for (const c of checks) console.log(`  PASS  ${c}`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(line);
  if (failures.length) {
    console.log(`RESULT: FAILED — ${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log('RESULT: PASSED — master state is consistent.');
}

main();
