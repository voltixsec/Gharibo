"""
Research schema — entity types for structured-knowledge-building.

The schema is domain-agnostic: works for commercial products, software,
scientific literature, companies, APIs, technical systems, and market intelligence.
"""
from enum import Enum


class EntityType(str, Enum):
    """Entity types in the structured-knowledge schema."""
    CATEGORY = "CATEGORY"
    DOMAIN = "DOMAIN"
    SYSTEM = "SYSTEM"
    MANUFACTURER = "MANUFACTURER"
    BRAND = "BRAND"
    PRODUCT_FAMILY = "PRODUCT_FAMILY"
    PRODUCT_MODEL = "PRODUCT_MODEL"
    ITEM = "ITEM"
    SERVICE = "SERVICE"
    RELATION = "RELATION"
    SOURCE = "SOURCE"
    EVIDENCE = "EVIDENCE"


# The structured-knowledge-building task workflow steps.
# These define the canonical sequence for building a knowledge library.
TASK_STEPS = [
    "discover_taxonomy",
    "discover_manufacturers",
    "discover_brands",
    "discover_product_families",
    "discover_product_models",
    "extract_specs",
    "discover_accessories",
    "check_compatibility",
    "discover_services",
    "attach_evidence",
    "validate",
    "detect_duplicates",
    "generate_records",
]
