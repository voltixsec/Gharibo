"""
Structured-knowledge-building task runner.

This is a minimal deterministic task runner that produces candidate entities/records
from input text. For P0, it produces a structured record scaffold and persists
a Research Training Record with all the steps tracked.

The schema is domain-agnostic — it works for any input domain.
"""
import json
import re
import time
import uuid
from typing import Any, Dict, List, Optional

from core.schema import EntityType, TASK_STEPS


def run_task(task: str, input_text: str, model_used: Optional[str] = None) -> Dict[str, Any]:
    """
    Runs the structured-knowledge-building task.

    This minimal deterministic implementation:
    1. Parses the input text for candidate entities
    2. Builds a taxonomy scaffold
    3. Generates structured records
    4. Runs basic validation
    5. Detects duplicates
    6. Returns the full Research Training Record

    The reward score is computed based on entity coverage and validation success.
    """
    start_time = time.time()

    # Step 1: Parse input for candidate entities
    candidate_entities = _extract_candidate_entities(input_text)

    # Step 2: Build taxonomy scaffold
    taxonomy = _build_taxonomy(candidate_entities)

    # Step 3: Generate structured records
    generated_records = _generate_records(candidate_entities, input_text)

    # Step 4: Validation
    validation_failures = _validate_records(generated_records)

    # Step 5: Duplicate detection
    duplicates_found = _detect_duplicates(generated_records)

    # Step 6: Final approved records (those that passed validation and aren't duplicates)
    duplicate_ids = {d["record_id"] for d in duplicates_found}
    failed_ids = {f["record_id"] for f in validation_failures}
    final_approved = [
        r for r in generated_records
        if r["id"] not in duplicate_ids and r["id"] not in failed_ids
    ]

    # Step 7: Corrections (empty for P0 — no LLM corrections)
    corrections: List[str] = []

    # Compute reward score
    total_records = len(generated_records) if generated_records else 1
    approved_ratio = len(final_approved) / total_records
    entity_coverage = min(len(candidate_entities) / 10, 1.0)  # Cap at 1.0
    reward_score = round((approved_ratio * 0.6 + entity_coverage * 0.4) * 100, 1)

    duration = int(time.time() - start_time)

    return {
        "id": str(uuid.uuid4()),
        "task": task,
        "instructions": _get_instructions(),
        "input": input_text,
        "sources_considered": [],
        "source_snippets": [],
        "candidate_entities": candidate_entities,
        "generated_records": generated_records,
        "validation_failures": validation_failures,
        "duplicates_found": duplicates_found,
        "corrections": corrections,
        "final_approved_records": final_approved,
        "reward_score": reward_score,
        "model_used": model_used,
        "duration": duration,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _get_instructions() -> str:
    """Returns the canonical task instructions."""
    steps_str = " → ".join(TASK_STEPS)
    return (
        f"Structured-knowledge-building task workflow: {steps_str}. "
        "Discover the taxonomy, extract entities, generate structured records, "
        "validate against the schema, detect duplicates, and produce final approved records. "
        "Never mark unsupported facts as verified."
    )


def _extract_candidate_entities(input_text: str) -> List[Dict[str, Any]]:
    """
    Extracts candidate entities from the input text.
    This is a minimal deterministic extraction for P0.
    """
    entities: List[Dict[str, Any]] = []

    # Look for capitalized words as potential entity names
    words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', input_text)
    seen = set()
    for word in words:
        if word.lower() not in seen and len(word) > 2:
            seen.add(word.lower())
            entities.append({
                "type": EntityType.ITEM.value,
                "name": word,
                "attributes": {},
            })

    # Look for patterns like "X: Y" as key-value pairs
    kv_pairs = re.findall(r'(\w+):\s*(.+?)(?:\n|$)', input_text)
    for key, value in kv_pairs:
        entities.append({
            "type": EntityType.RELATION.value,
            "name": f"{key} → {value.strip()}",
            "attributes": {"key": key, "value": value.strip()},
        })

    return entities[:50]  # Cap at 50 for P0


def _build_taxonomy(entities: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Builds a simple taxonomy scaffold from entities."""
    taxonomy: Dict[str, List[str]] = {}
    for entity in entities:
        etype = entity.get("type", "ITEM")
        if etype not in taxonomy:
            taxonomy[etype] = []
        taxonomy[etype].append(entity["name"])
    return taxonomy


def _generate_records(entities: List[Dict[str, Any]], input_text: str) -> List[Dict[str, Any]]:
    """Generates structured records from candidate entities."""
    records: List[Dict[str, Any]] = []
    for i, entity in enumerate(entities):
        record = {
            "id": str(uuid.uuid4()),
            "entityType": entity.get("type", EntityType.ITEM.value),
            "data": {
                "name": entity["name"],
                "source_text": input_text[:200],
                "extracted_at": _timestamp(),
            },
            "sourceIds": [],
            "verified": False,  # Never mark as verified without evidence
        }
        records.append(record)
    return records


def _validate_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Runs basic validation on generated records."""
    failures: List[Dict[str, Any]] = []
    valid_types = {e.value for e in EntityType}

    for record in records:
        # Check entity type is valid
        if record.get("entityType") not in valid_types:
            failures.append({
                "record_id": record["id"],
                "validator": "schema",
                "message": f"Invalid entity type: {record.get('entityType')}",
            })

        # Check name is present
        data = record.get("data", {})
        if not data.get("name"):
            failures.append({
                "record_id": record["id"],
                "validator": "required_fields",
                "message": "Record must have a name",
            })

        # Warn about unverified records (but don't fail)
        if not record.get("verified"):
            # This is expected — records should not be verified without evidence
            pass

    return failures


def _detect_duplicates(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detects duplicate records by name."""
    duplicates: List[Dict[str, Any]] = []
    seen_names: Dict[str, str] = {}

    for record in records:
        name = record.get("data", {}).get("name", "").lower()
        if name in seen_names:
            duplicates.append({
                "record_id": record["id"],
                "duplicate_of": seen_names[name],
                "name": name,
            })
        else:
            seen_names[name] = record["id"]

    return duplicates


def _timestamp() -> str:
    """Returns an ISO 8601 timestamp."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
