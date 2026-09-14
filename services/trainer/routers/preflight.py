"""
Preflight router — GET /preflight returns real environment check results.
"""
from fastapi import APIRouter, Query
from core.preflight_checks import run_preflight

router = APIRouter()


@router.get("/preflight")
async def preflight(
    base_model: str = Query(None, alias="base_model"),
    dataset_id: str = Query(None, alias="dataset_id"),
):
    """Runs the real pre-flight check and returns results."""
    result = run_preflight(base_model=base_model)
    return {
        "overall_ready": result.overall_ready,
        "items": [
            {"check": item.check, "status": item.status, "detail": item.detail}
            for item in result.items
        ],
        "checked_at": result.checked_at,
    }
