"""
Trainer service — FastAPI app with REAL pre-flight checks.
Mounts routers for preflight (GET /preflight) and training (POST /train stubbed for P0).
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import preflight, training

app = FastAPI(
    title="GHARIBO Trainer Service",
    description="ML training pre-flight check + training execution (P1).",
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

app.include_router(preflight.router)
app.include_router(training.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "trainer"}
