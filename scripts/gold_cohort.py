#!/usr/bin/env python3
"""Shared deterministic audit-cohort definition for GHARIBO-Research-Gold-v0.1.

The 100-example gold audit (scripts/audit/gold_audit_100.py) and the audit-aware
split generator (scripts/split/cut-gold-split.py) BOTH import this module. That is
deliberate: the split generator must quarantine exactly the examples the audit
inspects, and the audit must inspect exactly the examples the generator
quarantined. Keeping the cohort definition in one place makes the two scripts
structurally incapable of drifting apart.

The cohort is a pure function of:
  - the flat 800-example corpus
    (data/processed/training-examples/gharibo-research-gold-v0.1-examples.jsonl),
  - the entity-type distribution declared by the dataset card,
  - the fixed audit seed (3407).

Same inputs -> same 100 example line indices, on any machine.
"""

from __future__ import annotations

import json
import random
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_PATH = (
    REPO_ROOT / "data/processed/training-examples/gharibo-research-gold-v0.1-examples.jsonl"
)

# Entity types and their counts, taken from the dataset card (11 sampled types).
ENTITY_TYPES = [
    "RELATION",
    "PRODUCT_FAMILY",
    "DOMAIN",
    "PRODUCT_MODEL",
    "SYSTEM",
    "SERVICE",
    "CATEGORY",
    "ITEM",
    "BRAND",
    "MANUFACTURER",
    "MARKET_RELEVANCE",
]

ENTITY_DIST = {
    "RELATION": 222,
    "PRODUCT_FAMILY": 177,
    "DOMAIN": 100,
    "PRODUCT_MODEL": 100,
    "SYSTEM": 70,
    "SERVICE": 48,
    "CATEGORY": 47,
    "ITEM": 13,
    "BRAND": 12,
    "MANUFACTURER": 10,
    "MARKET_RELEVANCE": 1,
}

AUDIT_SEED = 3407
AUDIT_SIZE = 100


def load_examples():
    """Loads the flat 800-example corpus, tagging each example with its line index.

    The line index is the 0-based position in the file and is stable because the
    file is immutable (verified by the dataset hash).
    """
    examples = []
    with open(EXAMPLES_PATH, "r", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            line = line.strip()
            if not line:
                continue
            example = json.loads(line)
            example["_lineIndex"] = index
            examples.append(example)
    return examples


def extract_entity_type(example):
    """Extracts the entity type from a training example (user message first)."""
    for message in example.get("messages", []):
        if message["role"] == "user":
            try:
                content = json.loads(message["content"])
                return content.get("sourceRecord", {}).get("entityType", "UNKNOWN")
            except (json.JSONDecodeError, KeyError):
                pass
    for message in example.get("messages", []):
        if message["role"] == "assistant":
            try:
                content = json.loads(message["content"])
                return content.get("entityType", content.get("classification", "UNKNOWN"))
            except (json.JSONDecodeError, KeyError):
                pass
    return "UNKNOWN"


def extract_external_key(example):
    """Extracts the source record's externalKey from a training example."""
    for message in example.get("messages", []):
        if message["role"] == "user":
            try:
                content = json.loads(message["content"])
                return content.get("sourceRecord", {}).get("externalKey", "")
            except (json.JSONDecodeError, KeyError):
                pass
    return ""


def extract_source_file(example):
    """Extracts provenance.sourceFile from the assistant output."""
    for message in example.get("messages", []):
        if message["role"] == "assistant":
            try:
                content = json.loads(message["content"])
                return content.get("provenance", {}).get("sourceFile", "")
            except (json.JSONDecodeError, KeyError):
                pass
    return ""


def stratified_sample(
    examples,
    entity_types=None,
    entity_dist=None,
    n=AUDIT_SIZE,
    seed=AUDIT_SEED,
):
    """Deterministic proportional stratified sample of ``n`` examples.

    Returns ``(sampled, allocation)``. The algorithm is byte-for-byte the M3B
    Phase-1 algorithm so the audited cohort is reproducible.
    """
    entity_types = ENTITY_TYPES if entity_types is None else entity_types
    entity_dist = ENTITY_DIST if entity_dist is None else entity_dist

    by_type = defaultdict(list)
    for example in examples:
        by_type[extract_entity_type(example)].append(example)

    total = sum(entity_dist.values())
    allocation = {}
    remaining = n
    for entity_type in entity_types:
        count = entity_dist.get(entity_type, 0)
        if count == 0:
            allocation[entity_type] = 0
            continue
        alloc = max(1, round(n * count / total)) if count >= 1 else 0
        alloc = min(alloc, len(by_type.get(entity_type, [])))
        allocation[entity_type] = alloc
        remaining -= alloc

    if remaining > 0:
        for entity_type in sorted(entity_types, key=lambda x: len(by_type.get(x, [])), reverse=True):
            if remaining <= 0:
                break
            available = len(by_type.get(entity_type, [])) - allocation[entity_type]
            if available > 0:
                add = min(remaining, available)
                allocation[entity_type] += add
                remaining -= add
    elif remaining < 0:
        for entity_type in sorted(entity_types, key=lambda x: allocation.get(x, 0), reverse=True):
            if remaining >= 0:
                break
            if allocation.get(entity_type, 0) > 1:
                allocation[entity_type] -= 1
                remaining += 1

    rng = random.Random(seed)
    sampled = []
    for entity_type in entity_types:
        pool = by_type.get(entity_type, [])
        n_take = allocation.get(entity_type, 0)
        if n_take > 0 and pool:
            pool_sorted = sorted(pool, key=lambda x: x["_lineIndex"])
            indices = sorted(rng.sample(range(len(pool_sorted)), min(n_take, len(pool_sorted))))
            for index in indices:
                sampled.append(pool_sorted[index])

    return sampled, allocation


def audited_line_indices(seed=AUDIT_SEED, n=AUDIT_SIZE):
    """Returns the sorted list of flat-corpus line indices in the audit cohort."""
    examples = load_examples()
    sampled, _ = stratified_sample(examples, ENTITY_TYPES, ENTITY_DIST, n, seed)
    return sorted(example["_lineIndex"] for example in sampled)
