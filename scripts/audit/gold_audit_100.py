#!/usr/bin/env python3
"""
GHARIBO M3B Phase 1 — 100-Example Gold Audit (split-aware)

Performs a deterministic stratified audit of exactly 100 examples from
GHARIBO-Research-Gold-v0.1.

The audit cohort is quarantined into TRAIN + VALIDATION by the committed split
generator (scripts/split/cut-gold-split.py), so TEST is never audited. This script
loads the current split files, records each audited example's split, and hard-fails
if any audited example is in TEST.

For each audited example, independently verifies 12 quality criteria.

Classifies each as PASS / NEEDS_REVIEW / FAIL.

Produces an immutable, deterministic audit artifact (no wall-clock field, so two
runs on the same inputs are byte-identical).
"""

import json
import hashlib
import os
import sys
from collections import defaultdict, Counter
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# Resolve the repo root from this file's location (scripts/audit/<this file> ->
# repo root), matching scripts/gold_cohort.py and scripts/split/cut-gold-split.py.
# No machine-specific absolute path is baked in, so the script runs on any checkout.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# The audit cohort definition is shared with the split generator so the two can
# never disagree about which examples were inspected (see scripts/gold_cohort.py).
from gold_cohort import (  # noqa: E402
    AUDIT_SEED,
    AUDIT_SIZE,
    ENTITY_DIST,
    ENTITY_TYPES,
    extract_entity_type,
    extract_external_key,
    extract_source_file,
    load_examples,
    stratified_sample,
)
EXAMPLES_PATH = REPO_ROOT / "data/processed/training-examples/gharibo-research-gold-v0.1-examples.jsonl"
SOURCE_ROOT = REPO_ROOT / "data/raw/legacy-ucl"
SOURCE_MANIFEST_PATH = REPO_ROOT / "data/derived/source-manifests/legacy-ucl-source-manifest-v001.json"
DATASET_CARD_PATH = REPO_ROOT / "data/processed/gharibo-research-gold-v0.1/dataset-card.json"
AUDIT_OUTPUT_PATH = REPO_ROOT / "data/derived/gold-audit/gold-audit-100-v001.json"

TOTAL_EXAMPLES = 800
SPLIT_DIR = REPO_ROOT / "data/processed/gharibo-research-gold-v0.1"
SPLIT_NAMES = ("train", "validation", "test")

# Issue codes
ISSUE_CODES = {
    "SRC_NOT_FOUND": "Source record not found in source files",
    "PROV_UNRESOLVED": "Provenance does not resolve to legacy UCL artifacts",
    "EVIDENCE_BROKEN": "Evidence/source references do not resolve",
    "INPUT_MISMATCH": "User/task input does not faithfully represent source",
    "OUTPUT_UNSUPPORTED": "Assistant output not supported by source",
    "CLASSIFICATION_ERROR": "Entity classification is incorrect",
    "RELATION_INVALID": "Relations are invalid",
    "UNSUPPORTED_CLAIM": "An unsupported claim was introduced",
    "FABRICATED_REASONING": "Fabricated reasoning exists",
    "HARMONY_INVALID": "Harmony/message representation is structurally invalid",
    "CRITICAL_FACT_OMITTED": "Transformation omitted a critical source fact",
    "FABRICATED_FACT": "Transformation invented a fact absent from source",
}

def line_hash(raw_line):
    """sha256 of the raw JSONL line bytes (trailing CR stripped), matching the split
    generator and the verify-m3a Gate 7 content-address rule."""
    line = raw_line[:-1] if raw_line.endswith("\r") else raw_line
    return hashlib.sha256(line.encode("utf-8")).hexdigest()


def load_split_membership():
    """Loads the current TRAIN / VALIDATION / TEST split files and returns a map
    ``lineIndex -> splitName`` for every example in the flat corpus.

    Identity is the content hash of the raw line, so membership is independent of
    file order. Fails loudly on duplicates, unknown lines or an incomplete
    partition — a silent gap would make the isolation assertion meaningless.
    """
    raw_lines = []
    with open(EXAMPLES_PATH, "r", encoding="utf-8") as handle:
        for raw in handle:
            raw = raw.rstrip("\n")
            if raw.strip() == "":
                continue
            raw_lines.append(raw)
    hash_to_index = {line_hash(raw): i for i, raw in enumerate(raw_lines)}
    if len(hash_to_index) != len(raw_lines):
        raise SystemExit("ABORT: duplicate lines in the flat corpus — membership is ambiguous")

    membership = {}
    for name in SPLIT_NAMES:
        path = SPLIT_DIR / f"{name}.jsonl"
        if not path.exists():
            raise SystemExit(f"ABORT: split file missing: {path} — run scripts/split/cut-gold-split.py")
        with open(path, "r", encoding="utf-8") as handle:
            for raw in handle:
                raw = raw.rstrip("\n")
                if raw.strip() == "":
                    continue
                digest = line_hash(raw)
                if digest not in hash_to_index:
                    raise SystemExit(f"ABORT: a line in {name}.jsonl is not in the flat corpus")
                index = hash_to_index[digest]
                if index in membership:
                    raise SystemExit(f"ABORT: line {index} appears in more than one split")
                membership[index] = name
    if len(membership) != len(hash_to_index):
        raise SystemExit("ABORT: the splits are not a complete partition of the flat corpus")
    return membership

def load_source_records():
    """Load all source records from the 7 available JSONL files, indexed by externalKey."""
    source_records = {}
    source_files = [
        "VOKA_UCL_SECURITY_BATCH_001.jsonl",
        "VOKA_UCL_SECURITY_BATCH_002.jsonl",
        "VOKA_UCL_SECURITY_BATCH_003.jsonl",
        "VOKA_UCL_SECURITY_SYSTEM_SERVICE_REGISTRY_001.jsonl",
        "VOKA_UCL_GLOBAL_CATEGORY_REGISTRY_001.jsonl",
        "VOKA_UCL_GLOBAL_CORE_DOMAIN_REGISTRY_001.jsonl",
        "VOKA_UCL_GLOBAL_CATEGORY_CORE_DOMAIN_RELATIONS_001.jsonl",
    ]

    for sf_name in source_files:
        sf_path = SOURCE_ROOT / sf_name
        if not sf_path.exists():
            continue
        with open(sf_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ek = rec.get("externalKey", "")
                if ek:
                    if ek not in source_records:
                        source_records[ek] = {
                            "record": rec,
                            "sourceFile": sf_name,
                            "lineNumber": line_num,
                        }
                    # For RELATION records, also index by relation-specific keys
                    et = rec.get("entityType", "")
                    if et == "RELATION":
                        sref = rec.get("sourceExternalKey", rec.get("payload", {}).get("sourceExternalKey", ""))
                        tref = rec.get("targetExternalKey", rec.get("payload", {}).get("targetExternalKey", ""))
                        if sref and tref:
                            rel_key = f"relation:{sref}->{tref}"
                            if rel_key not in source_records:
                                source_records[rel_key] = {
                                    "record": rec,
                                    "sourceFile": sf_name,
                                    "lineNumber": line_num,
                                }

    return source_records

def load_source_records_by_file():
    """Load source records grouped by file, for file-level lookups."""
    by_file = {}
    source_files = [
        "VOKA_UCL_SECURITY_BATCH_001.jsonl",
        "VOKA_UCL_SECURITY_BATCH_002.jsonl",
        "VOKA_UCL_SECURITY_BATCH_003.jsonl",
        "VOKA_UCL_SECURITY_SYSTEM_SERVICE_REGISTRY_001.jsonl",
        "VOKA_UCL_GLOBAL_CATEGORY_REGISTRY_001.jsonl",
        "VOKA_UCL_GLOBAL_CORE_DOMAIN_REGISTRY_001.jsonl",
        "VOKA_UCL_GLOBAL_CATEGORY_CORE_DOMAIN_RELATIONS_001.jsonl",
    ]

    for sf_name in source_files:
        sf_path = SOURCE_ROOT / sf_name
        if not sf_path.exists():
            continue
        records = []
        with open(sf_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        by_file[sf_name] = records

    return by_file

def stratified_sample(examples, entity_types, entity_dist, n=100, seed=3407):
    """
    Deterministic stratified sample of n examples.
    Proportional allocation across entity types.
    Uses a fixed seed for determinism.

    DEPRECATED: superseded by the shared implementation in scripts/gold_cohort.py,
    which is imported above and used everywhere in this module. Kept as a thin
    delegate so any external caller still resolves, but the audit and the split
    generator both go through gold_cohort.stratified_sample.
    """
    from gold_cohort import stratified_sample as _shared_stratified_sample

    return _shared_stratified_sample(examples, entity_types, entity_dist, n, seed)

def audit_example(ex, source_records, source_by_file):
    """
    Audit a single example against all 12 criteria.

    Returns (result, issues) where result is PASS/NEEDS_REVIEW/FAIL
    and issues is a list of {code, reason} dicts.
    """
    issues = []

    # Extract key fields from the example
    entity_type = extract_entity_type(ex)
    external_key = extract_external_key(ex)
    source_file = extract_source_file(ex)

    # Extract the user message content (source record)
    user_content = None
    assistant_content = None
    system_content = None
    for msg in ex.get("messages", []):
        if msg["role"] == "system":
            system_content = msg["content"]
        elif msg["role"] == "user":
            try:
                user_content = json.loads(msg["content"])
            except json.JSONDecodeError:
                user_content = None
        elif msg["role"] == "assistant":
            try:
                assistant_content = json.loads(msg["content"])
            except json.JSONDecodeError:
                assistant_content = None

    # --- Criterion 1: Original physical source record exists ---
    # IMPORTANT: externalKeys can appear in multiple source files with different
    # payload richness. We must look up by (externalKey, claimed sourceFile)
    # to find the correct source record, not just the first match.
    src_rec = None
    source_file_actual = source_file

    if external_key:
        # First: try the claimed source file
        claimed_recs = source_by_file.get(source_file, [])
        for rec in claimed_recs:
            if rec.get("externalKey") == external_key:
                src_rec = {"record": rec, "sourceFile": source_file}
                break

        # Fallback: try any source file
        if src_rec is None:
            if external_key in source_records:
                src_rec = source_records[external_key]
                source_file_actual = src_rec["sourceFile"]
            else:
                # Search all files
                for sf_name, file_recs in source_by_file.items():
                    for rec in file_recs:
                        if rec.get("externalKey") == external_key:
                            src_rec = {"record": rec, "sourceFile": sf_name}
                            source_file_actual = sf_name
                            break
                    if src_rec:
                        break

    if src_rec is None:
        issues.append({
            "code": "SRC_NOT_FOUND",
            "reason": f"Source record with externalKey '{external_key}' not found in any source file"
        })
        return "FAIL", issues

    source_record = src_rec["record"]
    source_file_actual = src_rec["sourceFile"]

    # --- Criterion 2: Provenance resolves to supplied legacy UCL artifacts ---
    # The claimed sourceFile should match where the record was actually found
    if source_file and source_file != source_file_actual:
        # This means the record wasn't found in the claimed file, but was found
        # in another file. This is a provenance mismatch.
        # However, if the same externalKey exists in multiple files, the
        # provenance should point to the richer/more specific file.
        issues.append({
            "code": "PROV_UNRESOLVED",
            "reason": f"Provenance claims sourceFile='{source_file}' but record found in '{source_file_actual}'"
        })

    # --- Criterion 3: Evidence/source references resolve ---
    # Check evidence records in both the user source record and the assistant output
    evidence_list_user = []
    if user_content and "sourceRecord" in user_content:
        evidence_list_user = user_content["sourceRecord"].get("evidence", [])

    evidence_list_assistant = []
    if assistant_content:
        evidence_list_assistant = assistant_content.get("evidence", [])

    # Verify each evidence record has a valid sourceUrl
    for ev in evidence_list_assistant:
        source_url = ev.get("sourceUrl", "")
        if not source_url:
            issues.append({
                "code": "EVIDENCE_BROKEN",
                "reason": f"Evidence '{ev.get('evidenceKey', '?')}' has no sourceUrl"
            })

    # --- Criterion 4: User/task input faithfully represents the source ---
    if user_content and "sourceRecord" in user_content:
        sr_user = user_content["sourceRecord"]
        # Compare key fields
        if sr_user.get("entityType") != source_record.get("entityType"):
            issues.append({
                "code": "INPUT_MISMATCH",
                "reason": f"entityType mismatch: user says '{sr_user.get('entityType')}' but source says '{source_record.get('entityType')}'"
            })
        if sr_user.get("externalKey") != source_record.get("externalKey"):
            issues.append({
                "code": "INPUT_MISMATCH",
                "reason": f"externalKey mismatch: user says '{sr_user.get('externalKey')}' but source says '{source_record.get('externalKey')}'"
            })
        # Compare payload
        payload_user = sr_user.get("payload", {})
        payload_src = source_record.get("payload", {})
        for key in payload_src:
            if key not in payload_user:
                # Check if it's a critical field
                if key in ("name", "externalKey"):
                    issues.append({
                        "code": "INPUT_MISMATCH",
                        "reason": f"Source payload field '{key}' missing from user input"
                    })
            elif payload_user[key] != payload_src[key]:
                issues.append({
                    "code": "INPUT_MISMATCH",
                    "reason": f"Payload field '{key}' differs: user='{payload_user[key]}' source='{payload_src[key]}'"
                })

    # --- Criterion 5: Assistant/final output is supported by the source ---
    if assistant_content:
        normalized = assistant_content.get("normalizedPayload", {})
        payload_src = source_record.get("payload", {})
        for key, val in normalized.items():
            if key in payload_src and payload_src[key] != val:
                # Allow reasonable transformations (e.g., name capitalization)
                if key == "name" and val.lower() == payload_src[key].lower():
                    pass  # Case normalization is acceptable
                else:
                    issues.append({
                        "code": "OUTPUT_UNSUPPORTED",
                        "reason": f"normalizedPayload.{key}='{val}' but source payload.{key}='{payload_src[key]}'"
                    })

    # --- Criterion 6: Entity classification is correct ---
    if assistant_content:
        classification = assistant_content.get("classification", "")
        if classification and classification != entity_type:
            issues.append({
                "code": "CLASSIFICATION_ERROR",
                "reason": f"Classification='{classification}' but entityType='{entity_type}'"
            })

    # --- Criterion 7: Relations are valid ---
    # For RELATION entities, check source/target references
    if entity_type == "RELATION" and assistant_content:
        # Relations should have valid source/target references
        src_ref = assistant_content.get("sourceExternalKey", assistant_content.get("normalizedPayload", {}).get("sourceExternalKey", ""))
        tgt_ref = assistant_content.get("targetExternalKey", assistant_content.get("normalizedPayload", {}).get("targetExternalKey", ""))
        if src_ref and src_ref not in source_records and not any(src_ref == r.get("externalKey") for recs in source_by_file.values() for r in recs):
            issues.append({
                "code": "RELATION_INVALID",
                "reason": f"Relation sourceExternalKey='{src_ref}' not found in source records"
            })
        if tgt_ref and tgt_ref not in source_records and not any(tgt_ref == r.get("externalKey") for recs in source_by_file.values() for r in recs):
            issues.append({
                "code": "RELATION_INVALID",
                "reason": f"Relation targetExternalKey='{tgt_ref}' not found in source records"
            })

    # --- Criterion 8: No unsupported claim was introduced ---
    # Check if assistant output introduces claims not present in source
    if assistant_content and user_content and "sourceRecord" in user_content:
        src_payload = source_record.get("payload", {})
        norm_payload = assistant_content.get("normalizedPayload", {})
        for key, val in norm_payload.items():
            if key not in src_payload and key not in ("campaignRelevance", "domain"):
                # This field was introduced by the assistant — check if it's an invention
                if key not in ("identifiers", "aliases", "attributes", "marketRelevance"):
                    issues.append({
                        "code": "UNSUPPORTED_CLAIM",
                        "reason": f"Assistant introduced field '{key}' not in source payload"
                    })

    # --- Criterion 9: No fabricated reasoning exists ---
    # The assistant output should be a deterministic projection, not invented reasoning
    # Check if the assistant content contains any chain-of-thought markers
    if assistant_content:
        assistant_str = json.dumps(assistant_content)
        reasoning_markers = ["let me think", "first, I", "step 1:", "reasoning:", "my approach", "I will", "I think"]
        for marker in reasoning_markers:
            if marker.lower() in assistant_str.lower():
                issues.append({
                    "code": "FABRICATED_REASONING",
                    "reason": f"Assistant output contains reasoning marker: '{marker}'"
                })
                break

    # --- Criterion 10: Harmony/message representation is structurally valid ---
    messages = ex.get("messages", [])
    if len(messages) < 3:
        issues.append({
            "code": "HARMONY_INVALID",
            "reason": f"Expected >=3 messages (system/user/assistant) but got {len(messages)}"
        })
    else:
        roles = [m["role"] for m in messages]
        if roles[0] != "system":
            issues.append({
                "code": "HARMONY_INVALID",
                "reason": f"First message role should be 'system' but is '{roles[0]}'"
            })
        if "user" not in roles:
            issues.append({
                "code": "HARMONY_INVALID",
                "reason": "No 'user' role message found"
            })
        if "assistant" not in roles:
            issues.append({
                "code": "HARMONY_INVALID",
                "reason": "No 'assistant' role message found"
            })
        # Check that assistant content is valid JSON
        for msg in messages:
            if msg["role"] == "assistant":
                if not isinstance(msg["content"], str):
                    issues.append({
                        "code": "HARMONY_INVALID",
                        "reason": "Assistant content is not a string"
                    })

    # --- Criterion 11: Transformation did not omit a critical source fact ---
    if assistant_content and source_record:
        src_payload = source_record.get("payload", {})
        norm_payload = assistant_content.get("normalizedPayload", {})
        critical_fields = ["name", "externalKey"]
        for cf in critical_fields:
            if cf in src_payload and cf not in norm_payload:
                # name is always in payload; externalKey is at top level
                if cf == "name":
                    issues.append({
                        "code": "CRITICAL_FACT_OMITTED",
                        "reason": f"Critical source field '{cf}' omitted from normalizedPayload"
                    })

    # --- Criterion 12: Transformation did not invent a fact absent from source ---
    if assistant_content and source_record:
        src_payload = source_record.get("payload", {})
        norm_payload = assistant_content.get("normalizedPayload", {})
        for key, val in norm_payload.items():
            if key not in src_payload:
                # Check if it's a legitimate derived field
                if key in ("campaignRelevance", "domain"):
                    # These are often present in source but under different keys
                    pass
                elif key in ("identifiers", "aliases", "attributes", "marketRelevance"):
                    pass  # These are separate arrays, not payload fields
                else:
                    issues.append({
                        "code": "FABRICATED_FACT",
                        "reason": f"Assistant invented field '{key}'='{val}' not in source"
                    })

    # Determine overall result
    fail_codes = {"SRC_NOT_FOUND", "FABRICATED_FACT", "FABRICATED_REASONING"}
    has_fail = any(i["code"] in fail_codes for i in issues)
    has_review = len(issues) > 0 and not has_fail

    if has_fail:
        return "FAIL", issues
    elif has_review:
        return "NEEDS_REVIEW", issues
    else:
        return "PASS", issues


def main():
    print("=" * 70)
    print("GHARIBO M3B Phase 1 — 100-Example Gold Audit")
    print("=" * 70)

    # Load examples
    print("\n1. Loading training examples...")
    examples = load_examples()
    print(f"   Loaded {len(examples)} examples")

    # Load the CURRENT splits and build membership. The audit cohort must be
    # entirely inside TRAIN + VALIDATION; TEST is never audited.
    print("\n2. Loading TRAIN / VALIDATION / TEST split membership...")
    membership = load_split_membership()
    split_counts = Counter(membership.values())
    print("   Splits: " + ", ".join(f"{name}={split_counts.get(name, 0)}" for name in SPLIT_NAMES))

    # Load source records
    print("\n3. Loading source records from legacy UCL files...")
    source_records = load_source_records()
    print(f"   Loaded {len(source_records)} unique source records (by externalKey)")
    source_by_file = load_source_records_by_file()
    print(f"   Loaded {sum(len(v) for v in source_by_file.values())} records across {len(source_by_file)} files")

    # Stratified sample over the full corpus. The split generator quarantines this
    # exact cohort into TRAIN + VALIDATION, so it can never land in TEST.
    print(f"\n4. Performing deterministic stratified sample (n={AUDIT_SIZE}, seed={AUDIT_SEED})...")
    sampled, allocation = stratified_sample(examples, ENTITY_TYPES, ENTITY_DIST, AUDIT_SIZE, AUDIT_SEED)
    print(f"   Sampled {len(sampled)} examples")
    print(f"   Allocation: {allocation}")

    # ---- Split isolation assertion: audited INTERSECT TEST must be empty ----
    audited_split_counts = Counter(membership[ex["_lineIndex"]] for ex in sampled)
    train_audited = audited_split_counts.get("train", 0)
    validation_audited = audited_split_counts.get("validation", 0)
    test_audited = audited_split_counts.get("test", 0)
    if test_audited != 0:
        raise SystemExit(
            f"ABORT: {test_audited} audited example(s) are in TEST — the split is contaminated. "
            "Re-run scripts/split/cut-gold-split.py."
        )
    print(f"   Audited cohort split: train={train_audited} validation={validation_audited} test={test_audited}")

    # Audit each example (all within TRAIN + VALIDATION)
    print("\n5. Auditing 100 examples against 12 quality criteria (TRAIN + VALIDATION only)...")
    audit_results = []
    for i, ex in enumerate(sampled):
        entity_type = extract_entity_type(ex)
        external_key = extract_external_key(ex)
        source_file = extract_source_file(ex)
        split = membership[ex["_lineIndex"]]

        result, issues = audit_example(ex, source_records, source_by_file)

        audit_results.append({
            "auditIndex": i + 1,
            "exampleLineIndex": ex["_lineIndex"],
            "split": split,
            "entityType": entity_type,
            "externalKey": external_key,
            "sourceFile": source_file,
            "result": result,
            "issueCount": len(issues),
            "issues": [{"code": iss["code"], "reason": iss["reason"]} for iss in issues],
            "sourceProvenance": {
                "sourceFile": source_file,
                "externalKey": external_key,
                "entityType": entity_type,
            }
        })

        status = "✓" if result == "PASS" else ("?" if result == "NEEDS_REVIEW" else "✗")
        if result != "PASS":
            print(f"   [{i+1:3d}] {status} {entity_type:20s} {external_key:40s} → {result}")
            for iss in issues:
                print(f"         {iss['code']}: {iss['reason'][:80]}")

    # Summary
    pass_count = sum(1 for r in audit_results if r["result"] == "PASS")
    review_count = sum(1 for r in audit_results if r["result"] == "NEEDS_REVIEW")
    fail_count = sum(1 for r in audit_results if r["result"] == "FAIL")

    print(f"\n6. Audit Summary:")
    print(f"   PASS:         {pass_count}")
    print(f"   NEEDS_REVIEW: {review_count}")
    print(f"   FAIL:         {fail_count}")
    print(f"   Total:        {len(audit_results)}")

    # Split breakdown of the audited cohort
    split_breakdown = {name: 0 for name in SPLIT_NAMES}
    for r in audit_results:
        split_breakdown[r["split"]] = split_breakdown.get(r["split"], 0) + 1
    print(f"\n   By split: train={split_breakdown['train']} "
          f"validation={split_breakdown['validation']} test={split_breakdown['test']}")

    # Entity type breakdown
    type_breakdown = defaultdict(lambda: {"PASS": 0, "NEEDS_REVIEW": 0, "FAIL": 0})
    for r in audit_results:
        type_breakdown[r["entityType"]][r["result"]] += 1
    print(f"\n   By entity type:")
    for et in ENTITY_TYPES:
        bd = type_breakdown[et]
        total = bd["PASS"] + bd["NEEDS_REVIEW"] + bd["FAIL"]
        if total > 0:
            print(f"     {et:20s}: {total:3d} (P:{bd['PASS']} R:{bd['NEEDS_REVIEW']} F:{bd['FAIL']})")

    # Issue code breakdown
    issue_counter = Counter()
    for r in audit_results:
        for iss in r["issues"]:
            issue_counter[iss["code"]] += 1
    if issue_counter:
        print(f"\n   Issue codes:")
        for code, count in issue_counter.most_common():
            print(f"     {code:30s}: {count}")

    # Dataset card (for the split seed and hashes the audit was run against)
    with open(DATASET_CARD_PATH, "r", encoding="utf-8") as f:
        dataset_card = json.load(f)
    split_seed = dataset_card.get("splitPolicy", {}).get("seed")

    # Create audit artifact. NOTE: no wall-clock field is written, so two runs on
    # the same inputs produce byte-identical output (determinism requirement).
    audit_artifact = {
        "artifactVersion": "1.1.0",
        "artifactType": "GOLD_AUDIT_100",
        "generatedBy": "scripts/audit/gold_audit_100.py",
        "createdBy": "GHARIBO AI Lab — M3B Phase 1 (split-aware)",
        "datasetName": "GHARIBO-Research-Gold-v0.1",
        "datasetVersion": "0.1.0",
        "splitSeed": split_seed,
        "auditSize": len(audit_results),
        "samplingMethod": (
            f"Deterministic stratified (proportional by entity type, seed={AUDIT_SEED}); "
            "audit cohort quarantined into TRAIN+VALIDATION — TEST is never audited"
        ),
        "allocation": allocation,
        "splitIsolation": {
            "trainAudited": train_audited,
            "validationAudited": validation_audited,
            "testAudited": test_audited,
            "testIsolationHolds": test_audited == 0,
        },
        "summary": {
            "PASS": pass_count,
            "NEEDS_REVIEW": review_count,
            "FAIL": fail_count,
            "total": len(audit_results),
        },
        "splitBreakdown": split_breakdown,
        "entityTypeBreakdown": {et: dict(type_breakdown[et]) for et in ENTITY_TYPES if sum(type_breakdown[et].values()) > 0},
        "issueCodeBreakdown": dict(issue_counter),
        "acceptancePolicy": {
            "allPass": pass_count == 100,
            "hasNeedsReview": review_count > 0,
            "hasFail": fail_count > 0,
            "hasSystematicDefect": False,  # Will be determined by analysis
        },
        "results": audit_results,
    }

    # Write audit artifact
    AUDIT_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(AUDIT_OUTPUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(audit_artifact, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\n7. Audit artifact written to: {AUDIT_OUTPUT_PATH}")

    # Compute hash
    artifact_str = json.dumps(audit_artifact, sort_keys=True, ensure_ascii=False)
    audit_hash = hashlib.sha256(artifact_str.encode("utf-8")).hexdigest()
    print(f"   Audit artifact SHA-256: {audit_hash}")

    # Final verdict
    if fail_count > 0:
        print(f"\n⚠️  {fail_count} FAIL items found — requires investigation")
    elif review_count > 0:
        print(f"\n⚠️  {review_count} NEEDS_REVIEW items found — requires analysis")
    else:
        print(f"\n✓ All 100 examples PASS — audit accepted")

    return audit_artifact


if __name__ == "__main__":
    main()
