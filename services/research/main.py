"""
Research service — FastAPI app for Research Gym structured-knowledge-building tasks.
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import research

app = FastAPI(
    title="GHARIBO Research Service",
    description="Research Gym task runner for structured-knowledge-building.",
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

app.include_router(research.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "research"}
