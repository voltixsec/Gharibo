"""
Inference service — FastAPI app (stubbed for P0).
Provider abstraction for local models is wired in P1.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import inference

app = FastAPI(
    title="GHARIBO Inference Service",
    description="Local model inference (stubbed for P0).",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inference.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "inference"}
