"""
Research service — FastAPI app for Research Gym structured-knowledge-building tasks.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import research

app = FastAPI(
    title="GHARIBO Research Service",
    description="Research Gym task runner for structured-knowledge-building.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(research.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "research"}
