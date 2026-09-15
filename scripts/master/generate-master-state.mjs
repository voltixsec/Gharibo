#!/usr/bin/env node
/**
 * generate-master-state.mjs — deterministic generator for the GHARIBO master state.
 *
 * WHY A GENERATOR
 * ---------------
 * `governance/GHARIBO_MASTER_STATE.json` is the canonical, machine-readable single source
 * of truth for the project. `docs/GHARIBO_MASTER_STATE.md` is only its human view. If the
 * Markdown were hand-maintained it would silently drift from the JSON; because it is
 * rendered from the JSON it cannot. The paired validator imports `renderMasterStateMarkdown`
 * from this module and byte-compares the result against the file on disk, so the two can
 * never disagree.
 *
 * DETERMINISM
 * -----------
 * The renderer is a pure function of the JSON: no clock, no randomness, no locale, no
 * environment lookups. Every array is sorted before it is rendered (decisions by id, and so
 * on), so ordering cannot drift. Output is LF-only with a single trailing newline, so the
 * same JSON always renders byte-identical Markdown.
 *
 * Usage:
 *   node scripts/master/generate-master-state.mjs           # write docs/GHARIBO_MASTER_STATE.md
 *   node scripts/master/generate-master-state.mjs --check   # exit 1 if the file is stale
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_PATH = join(ROOT, 'governance', 'GHARIBO_MASTER_STATE.json');
const MD_PATH = join(ROOT, 'docs', 'GHARIBO_MASTER_STATE.md');

/** Renders any scalar/array/object/null as a single Markdown table cell. */
function cell(value) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length ? value.map(cell).join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => `${key}=${cell(item)}`);
    return entries.length ? entries.join(', ') : '—';
  }
  return String(value).replace(/\|/g, '\\|');
}

/** Builds a Markdown table from a header row and an array of row arrays. */
function table(headers, rows) {
  const lines = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) lines.push(`| ${row.map(cell).join(' | ')} |`);
  return lines;
}

/**
 * Renders the recorded validation results as a readable table.
 * Rows are rendered in the array's own order (no sorting, no clock) so the output is a
 * deterministic function of the JSON. `Verified at` is always shown; `Environment limitation`
 * is shown only when at least one result declares it.
 */
function renderResults(results) {
  if (!results || results.length === 0) return ['- —'];
  const hasEnv = results.some(
    (r) => r && Object.prototype.hasOwnProperty.call(r, 'environmentLimitation'),
  );
  const headers = ['Gate', 'Command', 'Status', 'Exit code', 'Evidence', 'Verified at'];
  if (hasEnv) headers.push('Environment limitation');
  const rows = results.map((r) => {
    const row = [r.gate, r.command, r.status, r.exitCode, r.evidence, r.verifiedAt];
    if (hasEnv) {
      row.push(
        Object.prototype.hasOwnProperty.call(r, 'environmentLimitation')
          ? r.environmentLimitation
          : null,
      );
    }
    return row;
  });
  return table(headers, rows);
}

/** Builds a two-column key/value table from an array of [key, value] pairs. */
function kv(pairs) {
  return table(['Field', 'Value'], pairs);
}

/** Builds a bullet list; returns a single '—' line when empty. */
function bullets(items) {
  if (!items || items.length === 0) return ['- —'];
  return items.map((item) => `- ${cell(item)}`);
}

/** Sorts by a string id field, ascending and stable. */
function byId(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

/** Sorts roadmap stages by their numeric suffix so STAGE-2 follows STAGE-1. */
function byStage(a, b) {
  const n = (s) => Number(String(s.id).replace(/[^0-9]/g, '')) || 0;
  return n(a) - n(b) || String(a.id).localeCompare(String(b.id));
}

/** Renders the whole master-state Markdown document from the canonical JSON. */
export function renderMasterStateMarkdown(state) {
  const out = [];
  const push = (...lines) => out.push(...lines);

  // --- Header + governed metadata (walked by docs:validate; the five fields are mandatory) ---
  push('# GHARIBO Master State', '');
  push('| Field | Value |');
  push('|-------|-------|');
  push('| **Document Owner** | Architecture (GHARIBO AI LAB) |');
  push('| **Type** | Governance |');
  push('| **Status** | Living |');
  push(`| **Version** | ${state.masterStateVersion} |`);
  push(`| **Last Updated** | ${state.updatedAt} |`);
  push('');
  push(
    '> **GENERATED FILE — DO NOT EDIT BY HAND.** This document is deterministically generated',
  );
  push(
    '> from [`governance/GHARIBO_MASTER_STATE.json`](../governance/GHARIBO_MASTER_STATE.json) by',
  );
  push(
    '> `scripts/master/generate-master-state.mjs`. The JSON is the single source of truth; this file',
  );
  push(
    '> is a read-only human view. Regenerate it with `npm run master:generate` and verify it with',
  );
  push('> `npm run master:validate`.', '');
  push('---', '');

  // --- Current State ---
  const cs = state.currentState;
  push('## Current State', '');
  push(
    ...kv([
      ['Training status', cs.trainingStatus],
      ['Training invariant', cs.trainingInvariant],
      ['Current milestone', `${cs.currentMilestone} (${cs.milestoneStatus})`],
      ['Blocker summary', cs.blockerSummary],
      ['Dataset', cs.dataset.id],
      ['Example count', cs.dataset.exampleCount],
      ['Split seed', cs.dataset.splitSeed],
      ['Split (train / validation / test)', `${cs.dataset.split.train} / ${cs.dataset.split.validation} / ${cs.dataset.split.test}`],
      ['Audit cohort (size / pass / needs review / fail / TEST audited)',
        `${cs.dataset.audit.cohortSize} / ${cs.dataset.audit.pass} / ${cs.dataset.audit.needsReview} / ${cs.dataset.audit.fail} / ${cs.dataset.audit.auditedTestCount}`],
    ]),
  );
  push('');

  // --- Architecture ---
  const arch = state.architecture;
  push('## Architecture', '');
  push(
    ...kv([
      ['Frozen baseline', `${arch.frozenBaseline.document} v${arch.frozenBaseline.version} (${arch.frozenBaseline.status})`],
      ['Frozen baseline extends', arch.frozenBaseline.extends],
      ['Decision records', arch.decisionRecords],
      ['Decision record count', arch.decisionRecordCount],
      ['Verified facts block', arch.factsBlock],
      ['Backend', arch.backend],
      ['Persistence', arch.persistence],
      ['Monorepo', arch.monorepo],
      ['Python services', arch.pythonServices],
      ['Master state artifact', arch.masterStateArtifact],
    ]),
  );
  push('');

  // --- Training ---
  const tr = state.training;
  push('## Training', '');
  push(
    ...kv([
      ['Status', tr.status],
      ['Has started', tr.hasStarted],
      ['Invariant', tr.invariant],
      ['Engine', `${tr.engine.name} (${tr.engine.id}) — ${tr.engine.note}`],
      ['Method', tr.method],
      ['Quantization', tr.quantization],
      ['Base model candidate', tr.baseModelCandidate],
      ['Worker', `${tr.worker.id} — ${tr.worker.provider} (interface: ${tr.worker.interface})`],
      ['Worker note', tr.worker.note],
      ['Compute policy', tr.computePolicy],
      ['Prohibited providers', tr.prohibitedProviders],
      ['Artifact policy — external', tr.artifactPolicy.external],
      ['Artifact policy — fallback', tr.artifactPolicy.fallback],
      ['Artifact policy — GitHub', tr.artifactPolicy.github],
      ['Weights downloaded', tr.weightsDownloaded],
      ['Adapters produced', tr.adaptersProduced],
      ['Checkpoints produced', tr.checkpointsProduced],
      ['Evaluation results', tr.evaluationResults],
      ['Environment qualification', tr.qualification?.status ?? 'UNRECORDED'],
      ['Qualification hash', tr.qualification?.qualificationHash ?? null],
      ['Package preview', tr.packagePreview?.status ?? 'NOT_PREPARED'],
      ['Authorization status', tr.authorization?.status ?? 'NOT_AUTHORIZED'],
      ['Authorization decision', tr.authorization?.decisionId ?? null],
      ['Authorized code snapshot', tr.authorization?.authorizedCodeSnapshot ?? null],
      ['Authorized preview package ID', tr.authorization?.authorizedPreviewPackageId ?? null],
      ['Issuance status', tr.issuance?.status ?? 'NOT_ISSUED'],
      ['Issued package ID', tr.issuance?.packageId ?? null],
      ['Issued run ID', tr.issuance?.runId ?? null],
      ['Issued run status', tr.issuance?.runStatus ?? null],
      ['Issuance receipt hash', tr.issuance?.receiptHash ?? null],
      ['Execution authorized', tr.issuance?.executionAuthorized ?? false],
      ['Authorized recipe hash', tr.authorization?.recipeHash ?? null],
      ['Authorization execution started', tr.authorization?.executionStarted ?? false],
      ['Candidate recipe hash', tr.packagePreview?.recipeHash ?? null],
      ['Historical preview evidence package ID', tr.packagePreview?.evidence?.packageId ?? null],
      ['Historical preview evidence Git commit', tr.packagePreview?.evidence?.gitCommitSha ?? null],
      ['Preview evidence working tree dirty', tr.packagePreview?.evidence?.workingTreeDirty ?? null],
      ['Preview evidence byte-identical builds', tr.packagePreview?.evidence?.independentBuilds ?? null],
      ['Qualification accepted by CTO', tr.qualification?.ctoAccepted ?? false],
      ['Engine freeze',
        tr.engine.freezeLabel
          ? `${tr.engine.freezeLabel} (${tr.engine.freezeApplied ? 'applied' : 'not applied'})`
          : 'UNFROZEN'],
      ['Executed harness content address',
        tr.qualification?.executedHarnessContentAddress ?? null],
      ['Post-freeze harness content address',
        tr.qualification?.postFreezeHarnessContentAddress ?? null],
      ['Experiment authorized',
        tr.qualification?.experimentAuthorized ?? false],
    ]),
  );
  push('');

  // --- Datasets ---
  push('## Datasets', '');
  for (const key of Object.keys(state.datasets).sort()) {
    const d = state.datasets[key];
    push(`### ${d.id}`, '');
    push(
      ...kv([
        ['Status', d.status],
        ['Format', d.format],
        ['Example count', d.exampleCount],
        ['Content frozen', d.contentFrozen],
        ['Split seed', d.split.seed],
        ['Split generator', d.split.generator],
        ['Cohort definition', d.split.cohortDefinition],
        ['Split counts', `train ${d.split.counts.train} / validation ${d.split.counts.validation} / test ${d.split.counts.test}`],
        ['Audit cohort size', d.audit.cohortSize],
        ['Audit pass / needs review / fail', `${d.audit.pass} / ${d.audit.needsReview} / ${d.audit.fail}`],
        ['Audit TEST count', d.audit.auditedTestCount],
        ['Audit artifact', d.audit.artifact],
        ['Audit split-aware', d.audit.splitAware],
        ['Audit deterministic', d.audit.deterministic],
        ['Hash algorithm', d.hashes.algorithm],
        ['Line hash convention', d.hashes.lineHashConvention],
        ['Dataset hash', d.hashes.datasetHash],
      ]),
    );
    push('');
    push('Notes:');
    push(...bullets(d.notes));
    push('');
  }

  // --- Experiments ---
  push('## Experiments', '');
  push(
    ...table(
      ['ID', 'Status', 'Base model', 'Dataset', 'Method', 'Engine', 'Worker', 'Training run', 'Package', 'Evaluation', 'Readiness', 'Engine deps (resolved/total)', 'Promotion target', 'Promotable'],
      Object.keys(state.experiments)
        .sort()
        .map((k) => state.experiments[k])
        .map((e) => [
          e.id,
          e.status,
          e.baseModel,
          e.datasetVersion,
          e.method,
          e.engine,
          e.worker,
          e.trainingRunId,
          e.packageId,
          `${e.evaluationStatus}${e.evaluationScore === null ? '' : ` (${e.evaluationScore})`}`,
          e.readinessStatus,
          `${e.resolvedEngineDependencies}/${e.engineDependencyCount}`,
          e.promotionTarget,
          e.promotable,
        ]),
    ),
  );
  push('');
  for (const key of Object.keys(state.experiments).sort()) {
    const e = state.experiments[key];
    push(`- **${e.id} promotion blocked:** ${e.promotionBlockedReason}`);
    push(`- **${e.id} references:** ${e.references.map(cell).join(', ')}`);
  }
  push('');

  // --- Models ---
  const models = state.models;
  push('## Models', '');
  push('**Base model candidates**', '');
  push(
    ...table(
      ['ID', 'Role', 'Status', 'Derived models', 'Note'],
      [...models.baseModelCandidates].sort(byId).map((m) => [m.id, m.role, m.status, m.derivedModels, m.note]),
    ),
  );
  push('');
  push('**Derived models**', '');
  push(
    ...table(
      ['ID', 'Status', 'Note'],
      [...models.derivedModels].sort(byId).map((m) => [m.id, m.status, m.note]),
    ),
  );
  push('');

  // --- Approved Roadmap ---
  const roadmap = state.roadmap;
  push('## Approved Roadmap', '');
  push(`**Status: ${roadmap.status}.** ${roadmap.note}`, '');
  push(
    ...table(
      ['ID', 'Name', 'Status', 'Method', 'Dataset', 'Purpose', 'Depends on'],
      [...roadmap.stages].sort(byStage).map((s) => [
        s.id,
        s.name,
        s.status,
        s.method,
        s.dataset,
        s.purpose,
        s.dependsOn,
      ]),
    ),
  );
  push('');

  // --- Knowledge Graph ---
  const kg = state.knowledgeGraph;
  push('## Knowledge Graph', '');
  push(
    ...kv([
      ['Status', kg.status],
      ['ADR', kg.adr],
      ['Name', kg.name],
      ['Is a product catalog', kg.isProductCatalog],
      ['Supported subject types', kg.supportedSubjectTypes],
      ['Concepts', kg.concepts],
      ['Organization durable identity', kg.organizationModel.durableIdentity],
      ['Organization note', kg.organizationModel.note],
      ['Organization roles', kg.organizationModel.roles],
      ['Multiple roles allowed', kg.organizationModel.multiRoleAllowed],
      ['Relation types', kg.relationTypes],
      ['Relation targets', kg.relationTargets],
      ['Relation attributes', kg.relationAttributes],
      ['Evidence first-class', kg.evidenceFirstClass],
      ['Relatively stable knowledge', kg.stableKnowledge],
      ['Time-sensitive commercial data', kg.timeSensitiveCommercialData],
      ['Time-sensitive policy', kg.timeSensitivePolicy],
      ['Generation lifecycle', kg.generationLifecycle],
      ['Generated is never Gold', kg.generatedIsNeverGold],
      ['Self-improvement flywheel', kg.selfImprovementFlywheel],
      ['Self-training guardrail', kg.selfTrainingGuardrail],
    ]),
  );
  push('');

  // --- Procurement Intelligence ---
  const pi = state.procurementIntelligence;
  push('## Procurement Intelligence', '');
  push(
    ...kv([
      ['Status', pi.status],
      ['ADR', pi.adr],
      ['Authorization claim policy', pi.authorizationClaimPolicy],
    ]),
  );
  push('');
  push('**Supported questions**', '');
  push(...bullets(pi.supportedQuestions));
  push('');
  push('**Relation patterns**', '');
  push(
    ...table(
      ['From', 'Relation', 'To'],
      pi.relationPatterns.map((r) => [r.from, r.relation, r.to]),
    ),
  );
  push('');
  push('**Private internal intelligence**', '');
  push(
    ...kv([
      ['Visibility', pi.privateInternalIntelligence.visibility],
      ['Separated from public evidence', pi.privateInternalIntelligence.separatedFromPublicEvidence],
      ['Never public', pi.privateInternalIntelligence.neverPublic],
      ['Dimensions', pi.privateInternalIntelligence.dimensions],
    ]),
  );
  push('');

  // --- VOKA Integration ---
  const voka = pi.vokaIntegration;
  push('## VOKA Integration', '');
  push(
    ...kv([
      ['Boundary', voka.boundary],
      ['ADR', voka.adr],
      ['Status', voka.status],
      ['Statement', voka.statement],
    ]),
  );
  push('');
  push('**Procurement flow**', '');
  push(...pi.procurementFlow.map((step, i) => `${i + 1}. ${cell(step)}`));
  push('');
  push('**Who to ask — the two questions**', '');
  push(
    ...table(
      ['Question', 'Basis'],
      [
        [pi.askPolicy.publicQuestion, pi.askPolicy.publicBasis],
        [pi.askPolicy.privateQuestion, pi.askPolicy.privateBasis],
      ],
    ),
  );
  push('');
  push(pi.askPolicy.statement);
  push('');

  // --- Tools / Connectors ---
  const tc = state.toolsAndConnectors;
  push('## Tools / Connectors', '');
  push(
    ...kv([
      ['Status', tc.status],
      ['Policy', tc.policy],
    ]),
  );
  push('');
  push(
    ...table(
      ['ID', 'Purpose', 'Status'],
      [...tc.connectors].sort(byId).map((c) => [c.id, c.purpose, c.status]),
    ),
  );
  push('');

  // --- Security / IP ---
  const sec = state.securityAndIP;
  push('## Security / IP', '');
  push(
    ...kv([
      ['Policy', sec.policy],
      ['Public repository', sec.publicRepository],
      ['Repository rule', sec.repositoryRule],
      ['Master state rule', sec.masterStateRule],
    ]),
  );
  push('');
  push('**Must remain private**', '');
  push(...bullets(sec.mustRemainPrivate));
  push('');

  // --- Key Decisions ---
  push('## Key Decisions', '');
  push(
    ...table(
      ['ID', 'Date', 'Title', 'Status', 'ADR'],
      [...state.decisions].sort(byId).map((d) => {
        const adr = d.references.find((r) => /^docs\/adr\/ADR-\d{4}-.*\.md$/.test(r));
        return [d.id, d.date, d.title, d.status, adr ? `\`${adr}\`` : '—'];
      }),
    ),
  );
  push('');

  // --- Validation ---
  const v = state.validation;
  push('## Validation', '');
  push(
    ...table(
      ['ID', 'Command', 'Asserts'],
      [...v.commands].sort(byId).map((c) => [c.id, `\`${c.command}\``, c.asserts]),
    ),
  );
  push('');
  push(`**Required before commit:** ${v.requiredBeforeCommit.map((c) => `\`${c}\``).join(', ')}`, '');
  push(
    ...kv([
      ['Last verified checkpoint', v.lastVerifiedCheckpoint],
      ['Last verified at', v.lastVerifiedAt],
      ['Note', v.note],
    ]),
  );
  push('');
  push('**Recorded results**', '');
  push(...renderResults(v.results));
  push('');

  // --- Blockers ---
  push('## Blockers', '');
  push(
    ...table(
      ['ID', 'Status', 'Title', 'Detail', 'Blocks', 'References'],
      [...state.blockers].sort(byId).map((b) => [b.id, b.status, b.title, b.detail, b.blocks, b.references]),
    ),
  );
  push('');

  // --- Next Actions ---
  push('## Next Actions', '');
  push(
    ...table(
      ['ID', 'Priority', 'Action', 'Requires', 'References'],
      [...state.nextActions].sort(byId).map((a) => [a.id, a.priority, a.action, a.requires, a.references]),
    ),
  );
  push('');

  // --- History ---
  push('## History', '');
  push(
    ...table(
      ['Revision', 'Date', 'Summary', 'Commit', 'Commit status'],
      [...state.history].map((h) => [h.revision, h.date, h.summary, h.commit, h.commitStatus]),
    ),
  );
  push('');
  for (const h of [...state.history]) {
    push(`**${h.revision} — changes**`);
    push(...bullets(h.changes));
    push(`- ${h.commitNote}`);
    push(`- Training executed: ${cell(h.trainingExecuted)}`);
    push('');
  }

  return out.join('\n').replace(/\n+$/, '') + '\n';
}

/** Reads and parses the canonical JSON. */
export function readMasterState() {
  return JSON.parse(readFileSync(JSON_PATH, 'utf8'));
}

/** Returns the 0-based line index of the first difference between two strings, or -1. */
function firstDifferenceLine(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  const max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) {
    if (la[i] !== lb[i]) return i;
  }
  return -1;
}

function main() {
  const check = process.argv.includes('--check');
  const state = readMasterState();
  const content = renderMasterStateMarkdown(state);
  const existing = existsSync(MD_PATH) ? readFileSync(MD_PATH, 'utf8') : null;

  if (check) {
    if (existing === content) {
      console.log(`master state view is up to date (${content.split('\n').length - 1} lines)`);
      return;
    }
    console.error('master state view is STALE — run: npm run master:generate');
    if (existing !== null) {
      const line = firstDifferenceLine(existing, content);
      console.error(`  first difference at line ${line + 1}`);
    } else {
      console.error('  docs/GHARIBO_MASTER_STATE.md does not exist');
    }
    process.exit(1);
  }

  if (existing === content) {
    console.log(`unchanged: docs/GHARIBO_MASTER_STATE.md (${content.split('\n').length - 1} lines)`);
    return;
  }
  writeFileSync(MD_PATH, content, 'utf8');
  console.log('wrote docs/GHARIBO_MASTER_STATE.md');
  console.log(`  lines        : ${content.split('\n').length - 1}`);
  console.log(`  version      : ${state.masterStateVersion}`);
  console.log(`  updatedAt    : ${state.updatedAt}`);
  console.log(`  decisions    : ${state.decisions.length}`);
  console.log(`  roadmap      : ${state.roadmap.stages.length} stage(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
