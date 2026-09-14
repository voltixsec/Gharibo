"""
Inference service — FastAPI app (stubbed for P0).
Provider abstraction for local models is wired in P1.
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import inference

app = FastAPI(
    title="GHARIBO Inference Service",
    description="Local model inference (stubbed for P0).",
    version="0.1.0",
)

# CORS: never combine a wildcard origin with credentials. The Next.js app reaches
# this service server-side, so only local frontend origins are allowed by default.
# Override with a comma-separated CORS_ALLOWED_ORIGINS env var when deploying.
_allow_origins = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inference.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "inference"}
