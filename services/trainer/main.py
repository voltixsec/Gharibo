"""
Trainer service — FastAPI app with REAL pre-flight checks.
Mounts routers for preflight (GET /preflight) and training (POST /train stubbed for P0).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import preflight, training

app = FastAPI(
    title="GHARIBO Trainer Service",
    description="ML training pre-flight check + training execution (P1).",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(preflight.router)
app.include_router(training.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "trainer"}
