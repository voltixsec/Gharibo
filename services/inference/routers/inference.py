"""
Inference router — POST /chat stubbed (501 for P0).
Provider abstraction for local models wired in P1.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = 2048


@router.post("/chat")
async def chat(request: ChatRequest):
    """Inference is stubbed for P0 — provider abstraction for local models in P1."""
    raise HTTPException(
        status_code=501,
        detail="Inference service is stubbed for P0. Local model inference via provider abstraction is P1.",
    )
