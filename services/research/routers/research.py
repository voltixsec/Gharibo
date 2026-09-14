"""
Research router — POST /run accepts task+input → returns ResearchRecord.
GET /records/{id} — not implemented (records are stored in SQLite by Next.js).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core.task import run_task

router = APIRouter()


class RunRequest(BaseModel):
    """Research task run request."""
    task: str
    input: str
    model_used: Optional[str] = None


@router.post("/run")
async def run(request: RunRequest):
    """
    Runs a structured-knowledge-building task and returns the Research Record.
    The record is returned to the Next.js API which persists it in SQLite.
    """
    result = run_task(
        task=request.task,
        input_text=request.input,
        model_used=request.model_used,
    )
    return result


@router.get("/records/{record_id}")
async def get_record(record_id: str):
    """Records are persisted by Next.js in SQLite — this endpoint is a passthrough."""
    raise HTTPException(
        status_code=501,
        detail="Research records are stored in SQLite by the Next.js API. Use GET /api/research/[id] instead.",
    )
