"""
GHARIBO-V1 inference service.

Endpoints:
  GET  /health                 -> loading | ready | unhealthy + identity + diagnostics
  POST /v1/chat/completions    -> OpenAI-compatible response (final channel only)

The service reuses the canonical Harmony final-channel contract (harmony_final)
and the GHARIBO-V1 runtime identity. It fails closed: an unverified adapter, a
model load failure, or a response with no final channel never yields raw model
text to the client.
"""

import os
import threading
import time
import uuid
from contextlib import asynccontextmanager
from typing import List, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .config import ServingConfig, load_config
from .engine import EngineState, ServingEngine


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage]
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False


def _openai_response(model_id: str, content: str) -> dict:
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model_id,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


# ---------------------------------------------------------------------------
# App factory (testable)
# ---------------------------------------------------------------------------

def create_app(
    engine: Optional[ServingEngine] = None,
    config: Optional[ServingConfig] = None,
) -> FastAPI:
    if config is None:
        config = engine.config if engine is not None else load_config()

    if engine is None:
        engine = ServingEngine(config)

    # Kick off the (blocking) load in a background thread so /health can report
    # "loading" until the model is actually ready.
    if engine.state == EngineState.LOADING:
        threading.Thread(target=engine.load, daemon=True).start()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield

    app = FastAPI(title="GHARIBO-V1 Inference", version="1.0.0", lifespan=lifespan)
    app.state.engine = engine
    app.state.config = config

    def get_engine() -> ServingEngine:
        return app.state.engine

    def require_auth(request: Request):
        cfg: ServingConfig = app.state.config
        if not cfg.requires_auth:
            return
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer ") or header[7:] != cfg.api_key:
            raise HTTPException(status_code=401, detail="Unauthorized")

    @app.get("/health")
    def health():
        report = engine.health()
        diag = report.diagnostics
        return {
            "status": report.status,
            "model_id": report.model_id,
            "base_model": report.base_model_serving,
            "adapter": {
                "type": report.adapter_type,
                "sha256_verified": report.adapter_sha256_verified,
            },
            "context": report.context,
            "secrets_present": False,
            "diagnostics": {
                "cuda_available": diag.cuda_available,
                "gpu_name": diag.gpu_name,
                "vram_total_bytes": diag.vram_total_bytes,
                "vram_allocated_bytes": diag.vram_allocated_bytes,
                "base_model_loaded": diag.base_model,
                "adapter_loaded": diag.adapter_loaded,
                "adapter_sha256_verified": diag.adapter_sha256_verified,
                "ready": diag.ready,
            },
            "error": report.error,
        }

    @app.post("/v1/chat/completions")
    def chat_completions(req: ChatCompletionRequest, _=Depends(require_auth)):
        if engine.state != EngineState.READY:
            raise HTTPException(
                status_code=503,
                detail=f"Engine not ready (status={engine.state})",
            )

        if req.stream:
            raise HTTPException(
                status_code=400,
                detail="stream=true is not supported; use stream=false.",
            )

        if not req.messages:
            raise HTTPException(status_code=422, detail="messages must not be empty.")

        messages = [m.model_dump() for m in req.messages]
        temperature = req.temperature if req.temperature is not None else 0.2
        max_tokens = req.max_tokens if req.max_tokens is not None else 3072

        try:
            result = engine.chat(messages, float(temperature), int(max_tokens))
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

        if not result["ok"]:
            # Fail closed: never surface raw model text (which may contain the
            # analysis channel). Report the structured reason instead.
            return JSONResponse(
                status_code=502,
                content={
                    "error": {
                        "message": f"model returned no final answer ({result['reason']})",
                        "type": "model_output_error",
                    }
                },
            )

        return _openai_response(engine.config.model_id, result["answer"])

    return app


# ---------------------------------------------------------------------------
# Uvicorn entrypoint (production)
# ---------------------------------------------------------------------------

def build_app() -> FastAPI:
    return create_app()


if __name__ == "__main__":
    import uvicorn

    cfg = load_config()
    uvicorn.run(build_app(), host="0.0.0.0", port=cfg.port)
