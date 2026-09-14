"""
Training router — POST /train returns 501 Not Implemented (P0).
Training execution is P1-01. For P0, runs are persisted as DRAFT only.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TrainRequest(BaseModel):
    """Training launch request (not implemented in P0)."""
    run_id: str
    base_model: str
    method: str = "lora"
    dataset_path: str | None = None


@router.post("/train")
async def train(request: TrainRequest):
    """Training execution is P1. Returns 501 for P0."""
    raise HTTPException(
        status_code=501,
        detail="Training execution is not implemented in P0 (Milestone 1). Runs are persisted as DRAFT. Execution is P1-01.",
    )


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    """Run status check — not implemented in P0."""
    raise HTTPException(
        status_code=501,
        detail="Run status endpoint not implemented in P0.",
    )
