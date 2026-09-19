"""
GHARIBO-V1 inference service.

Endpoints:
  GET  /health                 -> loading | ready | unhealthy + identity + diagnostics
  GET  /v1/models              -> OpenAI-compatible model listing
  POST /v1/chat/completions    -> OpenAI-compatible response (final channel only)

The service reuses the canonical Harmony final-channel contract (harmony_final)
and the GHARIBO-V1 runtime identity. It fails closed: an unverified adapter, a
model load failure, or a response with no final channel never yields raw model
text to the client.
"""

import json
import os
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, List, Literal, Optional, Union

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict

from .config import ServingConfig, load_config
from .engine import EngineState, ServingEngine
from . import identity


def identity_context_length() -> int:
    """
    The accepted model's context identity (3072).

    This is a MODEL property and is never reduced by deployment configuration.
    The T4's smaller headroom is expressed as output-token and prompt-budget
    limits, not by shrinking the model's declared context.
    """
    return int(identity.CONTEXT_LENGTH)


class GpuOutOfMemoryError(Exception):
    """A CUDA allocation failure, surfaced as a structured client error."""


def is_cuda_oom(exc: BaseException) -> bool:
    """
    True when an exception is a CUDA out-of-memory failure.

    `torch.cuda.OutOfMemoryError` subclasses `RuntimeError`, so name/code
    inspection is used rather than a bare `isinstance` check (torch may not be
    importable on a CPU-only test host).
    """
    name = type(exc).__name__
    if name == "OutOfMemoryError" and "cuda" in type(exc).__module__.lower():
        return True
    message = str(exc).lower()
    return "cuda out of memory" in message or "cublas" in message and "alloc" in message


# ---------------------------------------------------------------------------
# Deployment safety limits (mirrors apps/web/lib/runtime/deployment-limits.mjs)
# ---------------------------------------------------------------------------

def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


#: Hard ceiling for output tokens on the development GPU. Applied regardless of
#: what the client asks for, so a single request cannot OOM the worker.
MAX_OUTPUT_TOKENS_CEILING = _env_int("GHARIBO_MAX_OUTPUT_TOKENS_CEILING", 512)

#: Applied when the client omits max_tokens.
DEFAULT_MAX_OUTPUT_TOKENS = _env_int("GHARIBO_DEFAULT_MAX_OUTPUT_TOKENS", 256)

#: Reserved prompt headroom inside the model's context window.
RESERVED_PROMPT_TOKENS = _env_int("GHARIBO_RESERVED_PROMPT_TOKENS", 128)

#: Conservative characters-per-token estimate for the preflight budget.
CHARS_PER_TOKEN = 3.2


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    """
    A chat message.

    `content` accepts either a plain string or a list of content parts. Only
    TEXT parts are honoured; this is NOT multimodal support. A request carrying
    image/audio/video parts is rejected explicitly rather than silently ignored,
    because silently dropping an image would misrepresent the model's abilities.
    """

    model_config = ConfigDict(extra="ignore")

    role: Literal["system", "user", "assistant"]
    content: Union[str, List[Any], None] = None


class ChatCompletionRequest(BaseModel):
    """
    OpenAI-compatible request subset.

    Unknown fields are IGNORED rather than rejected: real clients (WorkBuddy,
    Open WebUI, the OpenAI SDK) routinely send fields this service does not use,
    and a 422 for a harmless extra field is a compatibility defect, not safety.
    """

    model_config = ConfigDict(extra="ignore")

    model: Optional[str] = None
    messages: List[ChatMessage]
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    max_completion_tokens: Optional[int] = None
    stream: Optional[bool] = False
    # Compatibility fields. Safe no-op values are tolerated; semantics the
    # runtime cannot truthfully provide (multiple completions, tool calls,
    # structured response formats) are rejected below. Stop sequences are
    # applied after governed final-channel extraction.
    top_p: Optional[float] = None
    n: Optional[int] = None
    stop: Optional[Union[str, List[str]]] = None
    presence_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    user: Optional[str] = None
    seed: Optional[int] = None
    response_format: Optional[dict] = None
    stream_options: Optional[dict] = None
    tools: Optional[List[Any]] = None
    tool_choice: Optional[Any] = None


class UnsupportedContentError(Exception):
    """Raised when a request asks for a modality this model does not serve."""


def normalize_message_content(message: ChatMessage) -> str:
    """
    Flattens a message's content into the text the model is trained on.

    Accepted:
      "hello"
      [{"type": "text", "text": "hello"}, ...]

    Rejected (explicitly, never silently dropped):
      parts of any non-text type (image_url, input_audio, video_url, ...)
    """
    content = message.content

    if content is None:
        return ""

    if isinstance(content, str):
        return content

    if not isinstance(content, list):
        raise UnsupportedContentError(
            f"Unsupported content type for role '{message.role}': "
            f"{type(content).__name__}. Expected a string or a list of text parts."
        )

    parts: List[str] = []
    for part in content:
        if isinstance(part, str):
            parts.append(part)
            continue
        if isinstance(part, dict):
            part_type = part.get("type")
            if part_type in (None, "text", "input_text"):
                text = part.get("text")
                if isinstance(text, str):
                    parts.append(text)
                    continue
            raise UnsupportedContentError(
                f"Unsupported content part type '{part_type}' for role "
                f"'{message.role}'. GHARIBO-V1 serves text only."
            )
        raise UnsupportedContentError(
            f"Unsupported content part for role '{message.role}'."
        )

    return "".join(parts)


def estimate_tokens(text: str) -> int:
    """Conservative token estimate (rounds up). No tokenizer on this host."""
    if not text:
        return 0
    return int(len(text) / CHARS_PER_TOKEN) + 1


def apply_stop_sequences(text: str, stop: Optional[Union[str, List[str]]]) -> str:
    """Apply OpenAI-style stop sequences to an already governed final answer."""
    if not text or stop is None:
        return text
    sequences = [stop] if isinstance(stop, str) else stop
    positions = [
        text.find(seq)
        for seq in sequences
        if isinstance(seq, str) and seq and text.find(seq) >= 0
    ]
    return text if not positions else text[: min(positions)]


def _openai_response(
    model_id: str,
    content: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> dict:
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
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


def _model_listing(model_id: str, context_length: int) -> dict:
    """OpenAI-compatible model listing for this single-model server."""
    return {
        "object": "list",
        "data": [
            {
                "id": model_id,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "gharibo",
                "context_length": context_length,
                # Explicit capability declaration. Text only: no vision, no tools.
                "capabilities": {
                    "text": True,
                    "vision": False,
                    "tools": False,
                    "streaming": True,
                },
            }
        ],
    }




# ---------------------------------------------------------------------------
# Final client-surface guard
# ---------------------------------------------------------------------------

#: A malformed trailing protocol fragment left over after a complete answer.
#:
#: Two shapes are observed in practice, so both are covered:
#:   - a bare ``</assistant>`` / ``</assistant`` (no channel marker), and
#:   - the ``</assistant><|channel|>`` / ``<|channel|>`` variants,
#: including repeats. At least one fragment must be present, so clean text is
#: never touched.
_TRAILING_PROTOCOL_FRAGMENT = re.compile(
    r'(?:\s*</assistant>?|\s*<\|channel\|>)+\s*$'
)

def _client_safe_answer(answer: str) -> str:
    """
    Remove only a malformed trailing assistant/channel protocol fragment.

    This is deliberately narrow: it does not rewrite semantic content and
    does not expose raw Harmony analysis. Any recognised junk is accepted
    only when it occurs at the very end of the already-governed answer.
    """
    value = answer if isinstance(answer, str) else ""

    previous = None
    while value != previous:
        previous = value
        value = _TRAILING_PROTOCOL_FRAGMENT.sub("", value)

    return value.rstrip()


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

    @app.exception_handler(RequestValidationError)
    async def request_validation_error_handler(request: Request, exc: RequestValidationError):
        safe_errors = []

        for error in exc.errors():
            safe_errors.append({
                "loc": list(error.get("loc", [])),
                "type": error.get("type"),
                "msg": error.get("msg"),
            })

        print(
            "GHARIBO_REQUEST_VALIDATION_ERROR:",
            json.dumps(safe_errors, ensure_ascii=False),
            flush=True,
        )

        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "message": "Request validation failed",
                    "type": "request_validation_error",
                    "details": safe_errors,
                }
            },
        )


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
                "base_model_loaded": bool(diag.base_model),
                "adapter_loaded": diag.adapter_loaded,
                "adapter_sha256_verified": diag.adapter_sha256_verified,
                "ready": diag.ready,
            },
            # /health is intentionally unauthenticated so cold-start probes work.
            # Do not expose backend/library/path details through that public
            # surface; full diagnostics belong in server logs.
            "error": "Runtime initialization failed." if report.error else None,
        }

    @app.get("/v1/models")
    def list_models(_=Depends(require_auth)):
        """
        OpenAI-compatible model listing.

        The application's health probe uses this as a fallback when /health is
        unavailable, so its absence would make a healthy runtime look offline.
        """
        return _model_listing(
            engine.config.model_id,
            identity_context_length(),
        )

    @app.post("/v1/chat/completions")
    def chat_completions(req: ChatCompletionRequest, _=Depends(require_auth)):
        if engine.state != EngineState.READY:
            raise HTTPException(
                status_code=503,
                detail=f"Engine not ready (status={engine.state})",
            )

        if not req.messages:
            raise HTTPException(status_code=422, detail="messages must not be empty.")

        # Single-model endpoint: never silently serve GHARIBO-V1 when the
        # caller asked for a different model id.
        if req.model is not None and req.model != engine.config.model_id:
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "message": (
                            f"Model '{req.model}' is not served by this endpoint. "
                            f"Use '{engine.config.model_id}'."
                        ),
                        "type": "model_not_found",
                        "param": "model",
                        "code": "model_not_found",
                    }
                },
            )

        # GHARIBO-V1 currently has no tool-calling runtime. Silently ignoring a
        # non-empty tool declaration would make clients believe a capability
        # exists when it does not.
        if req.tools:
            return JSONResponse(
                status_code=400,
                content={
                    "error": {
                        "message": "GHARIBO-V1 does not support tool calling.",
                        "type": "unsupported_tools",
                    }
                },
            )

        if req.n not in (None, 1):
            return JSONResponse(
                status_code=400,
                content={
                    "error": {
                        "message": "GHARIBO-V1 serves exactly one completion per request.",
                        "type": "unsupported_n",
                    }
                },
            )

        if req.response_format:
            response_type = req.response_format.get("type")
            if response_type not in (None, "text"):
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": {
                            "message": (
                                "GHARIBO-V1 does not guarantee structured response_format "
                                f"'{response_type}'."
                            ),
                            "type": "unsupported_response_format",
                        }
                    },
                )

        # Normalise content parts -> text. Non-text parts are rejected loudly.
        try:
            messages = [
                {"role": m.role, "content": normalize_message_content(m)}
                for m in req.messages
            ]
        except UnsupportedContentError as exc:
            raise HTTPException(
                status_code=415,
                detail={
                    "message": str(exc),
                    "type": "unsupported_content",
                    "supported": ["text"],
                },
            )

        temperature = req.temperature if req.temperature is not None else 0.2

        # ------------------------------------------------------------------
        # Deployment token guard.
        #
        # The model already occupies most of the T4's 16 GB, so an
        # OpenAI-compatible client requesting thousands of output tokens can
        # trigger a very large KV/generation allocation and CUDA OOM. Two
        # independent guards apply:
        #   1. clamp the requested output size into the safe range;
        #   2. reject a prompt that cannot fit the context at all, BEFORE any
        #      GPU allocation happens.
        # ------------------------------------------------------------------
        requested_max_tokens = (
            req.max_tokens
            if req.max_tokens is not None
            else req.max_completion_tokens
        )
        requested_max_tokens = (
            int(requested_max_tokens)
            if requested_max_tokens is not None
            else DEFAULT_MAX_OUTPUT_TOKENS
        )
        max_tokens = max(1, min(requested_max_tokens, MAX_OUTPUT_TOKENS_CEILING))

        context_length = identity_context_length()
        prompt_tokens = sum(
            estimate_tokens(m["content"]) + 4 for m in messages
        )
        prompt_budget = context_length - RESERVED_PROMPT_TOKENS

        if prompt_tokens > prompt_budget:
            raise HTTPException(
                status_code=413,
                detail={
                    "message": (
                        f"Estimated prompt size (~{prompt_tokens} tokens) exceeds the "
                        f"development runtime's prompt budget (~{prompt_budget} tokens of a "
                        f"{context_length}-token context). Shorten the conversation or "
                        f"start a new one."
                    ),
                    "type": "context_too_large",
                    "estimated_prompt_tokens": prompt_tokens,
                    "context_length": context_length,
                },
            )

        if prompt_tokens + max_tokens > context_length:
            affordable = max(1, context_length - prompt_tokens)
            raise HTTPException(
                status_code=413,
                detail={
                    "message": (
                        f"Prompt (~{prompt_tokens} tokens) plus requested output "
                        f"({max_tokens} tokens) exceeds the {context_length}-token "
                        f"context. Reduce max_tokens to ~{affordable} or shorten the prompt."
                    ),
                    "type": "budget_exceeded",
                    "estimated_prompt_tokens": prompt_tokens,
                    "requested_max_tokens": max_tokens,
                    "context_length": context_length,
                },
            )

        # ------------------------------------------------------------
        # OpenAI-compatible SSE streaming.
        #
        # GHARIBO does NOT expose raw generation / analysis tokens.
        # The hidden Harmony `analysis` channel is chain-of-thought and
        # streaming it token-by-token would leak it. We therefore send an
        # immediate empty assistant chunk so clients such as WorkBuddy
        # establish the stream immediately, run the governed inference, and
        # emit ONLY the accepted final answer.
        #
        # This is deliberately NOT token-by-token streaming: correctness of the
        # privacy contract outranks a prettier stream.
        # ------------------------------------------------------------
        if req.stream:
            def event_stream():
                request_id = f"chatcmpl-{uuid.uuid4().hex}"
                created = int(time.time())

                def chunk(delta: dict, finish_reason=None) -> str:
                    payload = {
                        "id": request_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": engine.config.model_id,
                        "choices": [
                            {
                                "index": 0,
                                "delta": delta,
                                "finish_reason": finish_reason,
                            }
                        ],
                    }
                    return "data: " + json.dumps(
                        payload,
                        ensure_ascii=False,
                    ) + "\n\n"

                def error_event(message: str, error_type: str, **extra) -> str:
                    payload = {
                        "error": {"message": message, "type": error_type, **extra}
                    }
                    return "data: " + json.dumps(payload, ensure_ascii=False) + "\n\n"

                # Immediate first byte / OpenAI stream handshake.
                yield chunk({
                    "role": "assistant",
                    "content": "",
                })

                try:
                    result = engine.chat(
                        messages,
                        float(temperature),
                        int(max_tokens),
                    )
                except Exception as exc:  # noqa: BLE001 - classify then report
                    if is_cuda_oom(exc):
                        # Do not retry: the request cannot fit, and retrying an
                        # impossible allocation would only destabilise the worker.
                        yield error_event(
                            (
                                "The development GPU ran out of memory for this request. "
                                f"Reduce max output tokens (currently {max_tokens}) or "
                                "shorten the conversation, then try again."
                            ),
                            "gpu_out_of_memory",
                            max_tokens=max_tokens,
                        )
                    else:
                        yield error_event(str(exc), "runtime_error")
                    yield "data: [DONE]\n\n"
                    return

                if not result["ok"]:
                    # Fail closed. Never expose raw Harmony / analysis.
                    yield error_event(
                        "model returned no final answer "
                        f"({result['reason']})",
                        "model_output_error",
                    )
                    yield "data: [DONE]\n\n"
                    return

                answer = _client_safe_answer(result["answer"] or "")
                answer = apply_stop_sequences(answer, req.stop)

                if answer:
                    yield chunk({"content": answer})

                yield chunk({}, "stop")
                yield "data: [DONE]\n\n"

            return StreamingResponse(
                event_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )

        # ------------------------------------------------------------
        # Non-streaming OpenAI-compatible path
        # ------------------------------------------------------------
        try:
            result = engine.chat(
                messages,
                float(temperature),
                int(max_tokens),
            )
        except Exception as exc:  # noqa: BLE001 - classify then report
            if is_cuda_oom(exc):
                raise HTTPException(
                    status_code=503,
                    detail={
                        "message": (
                            "The development GPU ran out of memory for this request. "
                            f"Reduce max_tokens (currently {max_tokens}) or shorten the prompt."
                        ),
                        "type": "gpu_out_of_memory",
                        "max_tokens": max_tokens,
                    },
                )
            raise HTTPException(
                status_code=503,
                detail={"message": str(exc), "type": "runtime_error"},
            )

        if not result["ok"]:
            return JSONResponse(
                status_code=502,
                content={
                    "error": {
                        "message": (
                            "model returned no final answer "
                            f"({result['reason']})"
                        ),
                        "type": "model_output_error",
                    }
                },
            )

        answer = _client_safe_answer(result["answer"] or "")
        answer = apply_stop_sequences(answer, req.stop)

        return _openai_response(
            engine.config.model_id,
            answer,
            prompt_tokens=prompt_tokens,
            completion_tokens=estimate_tokens(answer),
        )


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
