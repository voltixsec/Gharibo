#!/usr/bin/env node
/**
 * Historical evaluation record immutability gate.
 *
 * DEC-0034..DEC-0040 describe artifacts that existed at those historical
 * checkpoints. Their original generators referenced the then-live evaluation
 * notebook/bundle, so those generators are not valid drift checks after a new
 * authorized attempt legitimately changes the live notebook.
 *
 * This gate therefore protects the historical evidence itself:
 *   - exact committed Git blob
 *   - exact working-tree blob after Git clean filters
 *   - expected decisionId
 *
 * It NEVER regenerates a historical record from today's live kernel.
 */

import fs from "node:fs";
import { execFileSync } from "node:child_process";

const EXPECTED = [
  {
    "decisionId": "DEC-0034",
    "path": "governance/DEC-0034-evaluation-benchmark-launch.json",
    "blob": "e2ddf7dd7b59ec57927720d0b4c453afade2f3ab"
  },
  {
    "decisionId": "DEC-0035",
    "path": "governance/DEC-0035-evaluation-kernel-relaunch.json",
    "blob": "664aa2b9bb21d732de49da40b66c31d15dcccdb8"
  },
  {
    "decisionId": "DEC-0036",
    "path": "governance/DEC-0036-evaluation-escalation.json",
    "blob": "d742b5ed76bccbe812ef5876d89f95b9426043ab"
  },
  {
    "decisionId": "DEC-0038",
    "path": "governance/DEC-0038-evaluation-attempt-4-authorization.json",
    "blob": "462f42ee060921d76daa4fd3b884397a84505cf7"
  },
  {
    "decisionId": "DEC-0039",
    "path": "governance/DEC-0039-evaluation-attempt-4-launch.json",
    "blob": "cbbf11f65fcf6a76be4e2511777278c92a1726be"
  },
  {
    "decisionId": "DEC-0040",
    "path": "governance/DEC-0040-evaluation-attempt-4-failure.json",
    "blob": "3f97ce95568cd9b3dbdf9cbd67e510d387cddf86"
  }
];

let failures = 0;

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8"
  }).trim();
}

for (const item of EXPECTED) {
  if (!fs.existsSync(item.path)) {
    console.error(`FAIL  missing ${item.path}`);
    failures++;
    continue;
  }

  const committedBlob = git([
    "rev-parse",
    `HEAD:${item.path}`
  ]);

  const workingBlob = git([
    "hash-object",
    `--path=${item.path}`,
    item.path
  ]);

  let record = null;

  try {
    record = JSON.parse(
      fs.readFileSync(item.path, "utf8")
    );
  } catch (error) {
    console.error(
      `FAIL  invalid JSON ${item.path}: ${error.message}`
    );
    failures++;
    continue;
  }

  const ok =
    committedBlob === item.blob &&
    workingBlob === item.blob &&
    record.decisionId === item.decisionId;

  if (!ok) {
    console.error(`FAIL  ${item.decisionId} historical evidence drift`);
    console.error(`      path     : ${item.path}`);
    console.error(`      expected : ${item.blob}`);
    console.error(`      committed: ${committedBlob}`);
    console.error(`      working  : ${workingBlob}`);
    console.error(`      record id: ${record.decisionId}`);
    failures++;
  } else {
    console.log(
      `PASS  ${item.decisionId} immutable historical record (${item.blob.slice(0, 12)}…)`
    );
  }
}

if (failures) {
  console.error("");
  console.error(
    `HISTORICAL EVALUATION RECORDS: FAILED (${failures})`
  );
  process.exit(1);
}

console.log("");
console.log(
  `HISTORICAL EVALUATION RECORDS: PASSED (${EXPECTED.length}/${EXPECTED.length})`
);
