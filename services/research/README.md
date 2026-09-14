# GHARIBO Research Service

FastAPI service for Research Gym structured-knowledge-building tasks.

## Run

```bash
cd services/research
pip install -r requirements.txt
python -m uvicorn main:app --port 8102 --reload
```

## Endpoints

- `GET /health` — health check
- `POST /run` — runs a structured-knowledge-building task, returns Research Record
- `GET /records/{id}` — passthrough (records stored in SQLite by Next.js)

## Task Workflow

The structured-knowledge-building task follows these steps:

```
discover_taxonomy → discover_manufacturers → discover_brands →
discover_product_families → discover_product_models → extract_specs →
discover_accessories → check_compatibility → discover_services →
attach_evidence → validate → detect_duplicates → generate_records
```

## Entity Types

`CATEGORY, DOMAIN, SYSTEM, MANUFACTURER, BRAND, PRODUCT_FAMILY, PRODUCT_MODEL, ITEM, SERVICE, RELATION, SOURCE, EVIDENCE`

The schema is domain-agnostic — works for commercial products, software, scientific literature, companies, APIs, technical systems, and market intelligence.
