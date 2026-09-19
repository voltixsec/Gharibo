"""
GHARIBO-V1 serving integration tests (no GPU, no torch).

These exercise the full service contract using a deterministic FakeBackend and
FastAPI's TestClient:
  - health before ready / ready / unhealthy
  - identity reporting with no secrets
  - adapter hash mismatch and model load failure
  - authorization (missing / present / wrong key)
  - malformed and non-JSON requests
  - normal OpenAI-compatible response contract (final channel only)
  - missing final channel fails closed
  - SSE streaming: handshake, final-channel-only content, fail-closed, OOM
  - deployment token safety: default, clamping, oversized prompt rejection
  - structured CUDA OOM reporting (streaming and non-streaming)
  - OpenAI compatibility: /v1/models, text content parts, unsupported content,
    harmless extra fields, real usage estimates

The real TransformersBackend is never imported here, so the suite runs in any
environment. The real backend path is covered structurally by import and by the
Docker image.
"""

import os
import sys
import tempfile
import hashlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import ServingConfig  # noqa: E402
from app.engine import EngineState, ServingEngine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.model_backend import FakeBackend  # noqa: E402
from app.identity import ACCEPTED_ADAPTER_SHA256  # noqa: E402
from app.adapter_verify import sha256_of_file  # noqa: E402

ACCEPTED_SHA = ACCEPTED_ADAPTER_SHA256
FAKE_BASE = "openai/gpt-oss-20b"

REAL_ADAPTER_DIR = Path(
    "C:/Dev/GHARIBO/data/derived/exp002/production-recovered/adapter"
)


def _dummy_adapter_dir() -> tuple[str, str]:
    d = tempfile.mkdtemp(prefix="gharibo-v1-dummy-")
    p = Path(d) / "adapter_model.safetensors"
    p.write_bytes(b"placeholder adapter not the real weights")
    return d, sha256_of_file(str(p))


def make_config(adapter_path=None, api_key=None, expected_sha=ACCEPTED_SHA):
    return ServingConfig(
        model_id="GHARIBO-V1",
        adapter_path=adapter_path,
        adapter_url=None,
        expected_adapter_sha256=expected_sha,
        base_model_override=None,
        api_key=api_key,
        device="auto",
        load_in_4bit=True,
        port=8000,
        hf_token=None,
    )


def make_ready_app(
    responses=None,
    api_key=None,
    load_should_fail=False,
    adapter_path=None,
    expected_sha=ACCEPTED_SHA,
):
    if adapter_path is None:
        adapter_path, expected_sha = _dummy_adapter_dir()
    backend = FakeBackend(
        responses=responses, load_should_fail=load_should_fail, base_model=FAKE_BASE
    )
    engine = ServingEngine(
        make_config(adapter_path=adapter_path, api_key=api_key, expected_sha=expected_sha),
        backend=backend,
    )
    engine.load()
    app = create_app(engine=engine)
    return TestClient(app), engine

NORMAL_HARMONY = (
    "<|start|>assistant<|channel|>analysis<|message|>thinking<|end|>"
    "<|start|>assistant<|channel|>final<|message|>"
    '{"records":[{"name":"ACME"}]}'
    "<|return|>"
)
ANALYSIS_ONLY_HARMONY = (
    "<|start|>assistant<|channel|>analysis<|message|>leaked thought<|end|>"
)


# ---------------------------------------------------------------- health

def test_health_before_ready_is_loading():
    backend = FakeBackend()
    engine = ServingEngine(make_config(), backend=backend)
    assert engine.state == EngineState.LOADING
    report = engine.health()
    assert report.status == "loading"
    assert report.error is None


def test_health_ready_reports_identity_and_no_secrets():
    client, engine = make_ready_app(responses=[NORMAL_HARMONY])
    assert engine.state == EngineState.READY
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert body["model_id"] == "GHARIBO-V1"
    assert body["secrets_present"] is False
    # The adapter was verified by SHA256 before load (a hash, not a secret).
    assert body["adapter"]["sha256_verified"]
    assert "GHARIBO_V" not in str(body)  # no secret-shaped strings


def test_real_adapter_sha256_verifies_when_artifact_present():
    # Only meaningful when the verified production artifact is on disk.
    if not (REAL_ADAPTER_DIR / "adapter_model.safetensors").is_file():
        import pytest

        pytest.skip("real adapter artifact not present on disk")
    client, engine = make_ready_app(
        responses=[NORMAL_HARMONY],
        adapter_path=str(REAL_ADAPTER_DIR),
        expected_sha=ACCEPTED_SHA,
    )
    assert engine.state == EngineState.READY
    assert engine.adapter_sha256 == ACCEPTED_SHA
    assert client.get("/health").json()["adapter"]["sha256_verified"] == ACCEPTED_SHA


# ---------------------------------------------------------------- auth

def test_unauthorized_request_without_key():
    client, _ = make_ready_app(api_key="secret-key")
    res = client.post(
        "/v1/chat/completions",
        json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 401


def test_authorized_request_with_key():
    client, _ = make_ready_app(api_key="secret-key", responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer secret-key"},
        json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 200


# ---------------------------------------------------------------- malformed

def test_malformed_request_missing_messages():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post("/v1/chat/completions", json={"model": "GHARIBO-V1"})
    assert res.status_code == 422


def test_malformed_request_non_json():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        content=b"{not valid json",
        headers={"Content-Type": "application/json"},
    )
    assert res.status_code in (422, 400)


# ---------------------------------------------------------------- adapter hash mismatch

def test_adapter_hash_mismatch_is_unhealthy():
    with tempfile.TemporaryDirectory() as d:
        bad = Path(d) / "adapter_model.safetensors"
        bad.write_bytes(b"this is not the real adapter")
        engine = ServingEngine(make_config(adapter_path=str(d)), backend=FakeBackend())
        engine.load()  # verification fails before backend load
        assert engine.state == EngineState.UNHEALTHY
        assert "SHA256" in (engine.error or "")
        # No final answer can ever be produced from an unverified adapter.
        app = create_app(engine=engine)
        client = TestClient(app)
        assert client.get("/health").json()["status"] == "unhealthy"
        res = client.post(
            "/v1/chat/completions",
            json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
        )
        assert res.status_code == 503


# ---------------------------------------------------------------- model load failure

def test_model_load_failure_is_unhealthy():
    d, sha = _dummy_adapter_dir()
    engine = ServingEngine(
        make_config(adapter_path=d, expected_sha=sha),
        backend=FakeBackend(load_should_fail=True),
    )
    engine.load()
    assert engine.state == EngineState.UNHEALTHY
    assert engine.error is not None
    app = create_app(engine=engine)
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "unhealthy"
    res = client.post(
        "/v1/chat/completions",
        json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 503


# ---------------------------------------------------------------- normal contract

def test_normal_openai_compatible_response_contract():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "extract the entity"}],
            "temperature": 0.2,
            "max_tokens": 3072,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["object"] == "chat.completion"
    choice = body["choices"][0]
    assert choice["message"]["role"] == "assistant"
    # Final channel only - the analysis channel must never appear.
    assert choice["message"]["content"] == '{"records":[{"name":"ACME"}]}'
    assert "thinking" not in choice["message"]["content"]


# ---------------------------------------------------------------- missing final channel

def test_missing_final_channel_fails_closed():
    client, _ = make_ready_app(responses=[ANALYSIS_ONLY_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
    )
    # Fail closed: 502, no raw model text (analysis is never surfaced).
    assert res.status_code == 502
    assert "model_output_error" in res.json()["error"]["type"]
    assert "leaked thought" not in res.text


# ---------------------------------------------------------------- streaming
#
# The service deliberately does NOT stream raw generation tokens: the hidden
# Harmony `analysis` channel is chain-of-thought and streaming it would leak it.
# It sends an OpenAI-compatible SSE handshake immediately, then emits only the
# validated final answer. These tests pin that contract.

def _sse_payloads(res) -> list[dict]:
    """Parses an SSE response body into its JSON payloads (ignoring [DONE])."""
    import json as _json

    payloads = []
    for line in res.text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        data = line[len("data:"):].strip()
        if data == "[DONE]":
            payloads.append({"__done__": True})
            continue
        payloads.append(_json.loads(data))
    return payloads


def test_stream_true_returns_openai_sse_with_final_answer_only():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")

    payloads = _sse_payloads(res)
    assert payloads[-1] == {"__done__": True}

    content = "".join(
        p["choices"][0]["delta"].get("content", "")
        for p in payloads
        if "choices" in p
    )
    assert content == '{"records":[{"name":"ACME"}]}'
    # The handshake must arrive before generation completes.
    assert payloads[0]["choices"][0]["delta"].get("role") == "assistant"


def test_stream_never_leaks_analysis_channel():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert res.status_code == 200
    assert "thinking" not in res.text
    assert "analysis" not in res.text
    assert "<|channel|>" not in res.text


def test_stream_fails_closed_without_final_channel():
    client, _ = make_ready_app(responses=[ANALYSIS_ONLY_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert res.status_code == 200  # the stream itself was established
    assert "leaked thought" not in res.text
    payloads = _sse_payloads(res)
    errors = [p for p in payloads if "error" in p]
    assert errors, "expected an error event when no final channel is present"
    assert errors[0]["error"]["type"] == "model_output_error"


# ---------------------------------------------------------------- token safety


class _RecordingBackend(FakeBackend):
    """FakeBackend that records the max_tokens it was asked to generate."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.seen_max_tokens = []

    def generate(self, messages, temperature, max_tokens):
        self.seen_max_tokens.append(max_tokens)
        return super().generate(messages, temperature, max_tokens)


def _ready_app_with_backend(backend):
    adapter_path, expected_sha = _dummy_adapter_dir()
    engine = ServingEngine(
        make_config(adapter_path=adapter_path, expected_sha=expected_sha),
        backend=backend,
    )
    engine.load()
    return TestClient(create_app(engine=engine)), engine


def test_unknown_model_id_is_rejected_before_generation():
    backend = _RecordingBackend(responses=[NORMAL_HARMONY])
    client, _ = _ready_app_with_backend(backend)
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "not-gharibo",
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    assert res.status_code == 404
    assert res.json()["error"]["type"] == "model_not_found"
    assert backend.seen_max_tokens == []


def test_nonempty_tools_are_rejected_truthfully():
    backend = _RecordingBackend(responses=[NORMAL_HARMONY])
    client, _ = _ready_app_with_backend(backend)
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "tools": [
                {
                    "type": "function",
                    "function": {"name": "lookup", "parameters": {"type": "object"}},
                }
            ],
        },
    )
    assert res.status_code == 400
    assert res.json()["error"]["type"] == "unsupported_tools"
    assert backend.seen_max_tokens == []


def test_multiple_completions_are_rejected_instead_of_silently_ignored():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "n": 2,
        },
    )
    assert res.status_code == 400
    assert res.json()["error"]["type"] == "unsupported_n"


def test_structured_response_format_is_rejected_when_not_guaranteed():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "response_format": {"type": "json_object"},
        },
    )
    assert res.status_code == 400
    assert res.json()["error"]["type"] == "unsupported_response_format"


def test_unsupported_message_role_is_rejected_at_validation():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "tool", "content": "fake tool result"}],
        },
    )
    assert res.status_code == 422
    assert res.json()["error"]["type"] == "request_validation_error"


def test_max_tokens_is_clamped_to_deployment_ceiling():
    backend = _RecordingBackend(responses=[NORMAL_HARMONY])
    client, _ = _ready_app_with_backend(backend)

    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 4096,
        },
    )
    assert res.status_code == 200
    # A client asking for 4096 must NOT be able to OOM the development GPU.
    from app.main import MAX_OUTPUT_TOKENS_CEILING

    assert backend.seen_max_tokens == [MAX_OUTPUT_TOKENS_CEILING]


def test_default_max_tokens_is_the_safe_default():
    backend = _RecordingBackend(responses=[NORMAL_HARMONY])
    client, _ = _ready_app_with_backend(backend)

    res = client.post(
        "/v1/chat/completions",
        json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 200
    from app.main import DEFAULT_MAX_OUTPUT_TOKENS

    assert backend.seen_max_tokens == [DEFAULT_MAX_OUTPUT_TOKENS]


def test_oversized_prompt_is_rejected_before_generation():
    backend = _RecordingBackend(responses=[NORMAL_HARMONY])
    client, _ = _ready_app_with_backend(backend)

    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "x" * 20000}],
        },
    )
    assert res.status_code == 413
    assert res.json()["detail"]["type"] == "context_too_large"
    # Critically: the GPU was never asked to generate.
    assert backend.seen_max_tokens == []


def test_output_budget_exceeding_context_is_rejected():
    backend = _RecordingBackend(responses=[NORMAL_HARMONY])
    client, _ = _ready_app_with_backend(backend)

    # A prompt close to the whole window cannot also afford any output.
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "y" * 9300}],
            "max_tokens": 512,
        },
    )
    assert res.status_code == 413
    assert res.json()["detail"]["type"] in ("budget_exceeded", "context_too_large")
    assert backend.seen_max_tokens == []


# ---------------------------------------------------------------- OOM handling


class _OomBackend(FakeBackend):
    def generate(self, messages, temperature, max_tokens):
        # Shaped exactly like torch.cuda.OutOfMemoryError (a RuntimeError).
        raise RuntimeError(
            "CUDA out of memory. Tried to allocate 11.00 GiB "
            "(GPU 0; 14.56 GiB total capacity)"
        )


def test_cuda_oom_is_reported_as_a_structured_error():
    client, _ = _ready_app_with_backend(_OomBackend())
    res = client.post(
        "/v1/chat/completions",
        json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert detail["type"] == "gpu_out_of_memory"
    assert "max_tokens" in detail


def test_cuda_oom_in_stream_is_reported_as_a_structured_error():
    client, _ = _ready_app_with_backend(_OomBackend())
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert res.status_code == 200
    payloads = _sse_payloads(res)
    errors = [p for p in payloads if "error" in p]
    assert errors and errors[0]["error"]["type"] == "gpu_out_of_memory"


# ---------------------------------------------------------------- OpenAI compatibility


def test_models_endpoint_lists_the_served_model():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.get("/v1/models")
    assert res.status_code == 200
    body = res.json()
    assert body["object"] == "list"
    entry = body["data"][0]
    assert entry["id"] == "GHARIBO-V1"
    # Capability declaration must be truthful: text only.
    assert entry["capabilities"]["text"] is True
    assert entry["capabilities"]["vision"] is False
    assert entry["capabilities"]["tools"] is False


def test_text_content_parts_are_normalised():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "hello "},
                        {"type": "text", "text": "world"},
                    ],
                }
            ],
        },
    )
    assert res.status_code == 200


def test_image_content_is_rejected_as_unsupported_not_silently_dropped():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "what is this"},
                        {
                            "type": "image_url",
                            "image_url": {"url": "https://example.com/x.png"},
                        },
                    ],
                }
            ],
        },
    )
    # Accepting the request while dropping the image would misrepresent the
    # model's abilities, so this must fail loudly.
    assert res.status_code == 415
    assert res.json()["detail"]["type"] == "unsupported_content"


def test_harmless_extra_openai_fields_are_ignored():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            # Real clients send these; rejecting them would be a compatibility bug.
            "top_p": 0.9,
            "frequency_penalty": 0.0,
            "presence_penalty": 0.0,
            "n": 1,
            "user": "workbuddy",
            "seed": 42,
            "stop": ["\n\n"],
            "stream_options": {"include_usage": True},
        },
    )
    assert res.status_code == 200


def test_usage_reports_real_estimates_not_zeros():
    client, _ = make_ready_app(responses=[NORMAL_HARMONY])
    res = client.post(
        "/v1/chat/completions",
        json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 200
    usage = res.json()["usage"]
    assert usage["prompt_tokens"] > 0
    assert usage["completion_tokens"] > 0
    assert usage["total_tokens"] == usage["prompt_tokens"] + usage["completion_tokens"]


def test_stop_sequences_are_honoured_after_final_channel_extraction():
    harmony = (
        "<|start|>assistant<|channel|>final<|message|>"
        "alpha STOP beta<|return|>"
    )
    client, _ = make_ready_app(responses=[harmony])
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "stop": [" STOP"],
        },
    )
    assert res.status_code == 200
    assert res.json()["choices"][0]["message"]["content"] == "alpha"


# ---------------------------------------------------------------- protocol tail
#
# The model occasionally emits a malformed trailing protocol fragment after a
# complete final answer. `_client_safe_answer` removes ONLY that trailing junk:
# it never rewrites semantic content, and it can never expose hidden-channel
# text (that is the extractor's job, and it fails closed).

from app.main import _client_safe_answer  # noqa: E402


def test_client_safe_answer_removes_a_trailing_channel_marker():
    assert _client_safe_answer('{"ok":true}<|channel|>') == '{"ok":true}'


def test_client_safe_answer_removes_a_trailing_assistant_channel_fragment():
    assert _client_safe_answer("answer</assistant><|channel|>") == "answer"


def test_client_safe_answer_removes_repeated_trailing_fragments():
    assert _client_safe_answer("answer<|channel|><|channel|>") == "answer"


def test_client_safe_answer_leaves_clean_text_untouched():
    for text in ["{\"records\":[]}", "Line one\nLine two", "a plain sentence."]:
        assert _client_safe_answer(text) == text


def test_client_safe_answer_never_rewrites_mid_string_content():
    # Only a TRAILING fragment is protocol junk. A marker in the middle of real
    # content is content, and must survive verbatim.
    text = "before<|channel|>after"
    assert _client_safe_answer(text) == text


def test_client_safe_answer_handles_empty_and_non_string_input():
    assert _client_safe_answer("") == ""
    assert _client_safe_answer(None) == ""
    assert _client_safe_answer(123) == ""
    assert _client_safe_answer({}) == ""


def test_client_safe_answer_is_idempotent():
    once = _client_safe_answer("answer<|channel|>")
    assert _client_safe_answer(once) == once


def test_client_safe_answer_rstrips_trailing_whitespace():
    assert _client_safe_answer("answer\n\n  ") == "answer"


def test_protocol_tail_is_cleaned_on_the_non_streaming_path():
    # A final channel whose content carries a malformed trailing fragment.
    client, _ = make_ready_app(
        responses=["<|start|>assistant<|channel|>final<|message|>hello<|channel|>"]
    )
    res = client.post(
        "/v1/chat/completions",
        json={"model": "GHARIBO-V1", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 200
    assert res.json()["choices"][0]["message"]["content"] == "hello"


def test_protocol_tail_is_cleaned_on_the_streaming_path():
    client, _ = make_ready_app(
        responses=["<|start|>assistant<|channel|>final<|message|>hello<|channel|>"]
    )
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "GHARIBO-V1",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert res.status_code == 200
    assert "<|channel|>" not in res.text
    payloads = _sse_payloads(res)
    content = "".join(
        p["choices"][0]["delta"].get("content", "")
        for p in payloads
        if "choices" in p
    )
    assert content == "hello"



def test_client_safe_answer_removes_a_bare_trailing_assistant_close():
    # Observed in a live smoke run: the model ended a clean answer with
    # "</assistant>" and no channel marker. The original regex required
    # "<|channel|>" and therefore left the fragment visible to the user.
    assert _client_safe_answer("42\n\n</assistant>") == "42"


def test_client_safe_answer_removes_an_unterminated_assistant_close():
    assert _client_safe_answer("42\n\n</assistant") == "42"


def test_client_safe_answer_removes_mixed_trailing_fragments():
    assert _client_safe_answer("answer</assistant></assistant>") == "answer"
    assert _client_safe_answer("answer<|channel|></assistant>") == "answer"


def test_client_safe_answer_still_preserves_inline_assistant_text():
    # A non-trailing occurrence is content, not protocol junk.
    text = "Use the </assistant> tag to close the turn."
    assert _client_safe_answer(text) == text


# ---------------------------------------------------------------- prompt contract
#
# What the model is actually TOLD, rendered from the accepted tokenizer's chat
# template with the same arguments `TransformersBackend.generate` passes.
#
# This exists because the served prompt is not the same thing as the request the
# application sends: the template injects a system message of its own. Asserting
# on the RENDERED text is the only way to know what the model sees.

# Resolved relative to this file (repo root is three levels up) so the tests are
# not tied to one machine. Override with CHAT_TEMPLATE=/path/to/chat_template.jinja
# if the snapshot lives elsewhere; the tests skip (not fail) when it is absent.
TEMPLATE_PATH = Path(
    os.environ.get(
        "CHAT_TEMPLATE",
        Path(__file__).resolve().parents[3] / "models" / "weights" / "exp002-tokenizer-unsloth" / "chat_template.jinja",
    )
)


def _render_prompt(messages=None, **overrides):
    """Renders the accepted chat template exactly as the backend does."""
    pytest = __import__("pytest")
    if not TEMPLATE_PATH.is_file():
        pytest.skip("accepted tokenizer chat template not present on disk")

    # Imported lazily so a missing jinja2 skips these tests instead of breaking
    # collection of the whole module.
    from datetime import datetime, timezone

    from jinja2.sandbox import ImmutableSandboxedEnvironment

    env = ImmutableSandboxedEnvironment(trim_blocks=True, lstrip_blocks=True)
    template = env.from_string(TEMPLATE_PATH.read_text(encoding="utf-8"))

    kwargs = {
        "messages": messages or [{"role": "user", "content": "Hello"}],
        "add_generation_prompt": True,
        "reasoning_effort": "medium",
        "strftime_now": lambda fmt: datetime.now(timezone.utc).strftime(fmt),
    }
    kwargs.update(overrides)
    return template.render(**kwargs)


def test_prompt_declares_no_tools_to_the_model():
    # The application never sends tool declarations, and the template only
    # renders built-in tools when `builtin_tools` is explicitly supplied. This
    # is the guarantee behind the product's "text only, no tools" claim.
    rendered = _render_prompt()
    assert "# Tools" not in rendered
    assert "namespace browser" not in rendered
    assert "namespace python" not in rendered
    assert "builtin_tools" not in rendered


def test_prompt_requests_the_governed_final_channel():
    rendered = _render_prompt()
    assert "# Valid channels: analysis, commentary, final." in rendered
    assert "<|start|>assistant" in rendered


def test_prompt_puts_a_user_system_message_where_the_template_expects_it():
    rendered = _render_prompt(
        messages=[
            {"role": "system", "content": "You are GHARIBO."},
            {"role": "user", "content": "hi"},
        ]
    )
    assert "You are GHARIBO." in rendered


def test_prompt_identity_is_a_known_deferred_defect():
    """DOCUMENTS A KNOWN DEFECT - deliberately not fixed here.

    The accepted tokenizer's chat template injects a DEFAULT model identity of
    "You are ChatGPT, a large language model trained by OpenAI." because the
    backend does not pass `model_identity`. That false identity carries strong
    capability priors, and a live smoke run showed the model answering
    "I can run shell commands and read images, but I cannot browse the web."

    Changing it would alter the served prompt contract (and therefore model
    behaviour and comparability with prior runs), so it is DEFERRED to the owner
    rather than changed silently. The one-line fix is to pass
    `model_identity="..."` in `TransformersBackend.generate`.

    If this test starts failing, the identity has changed - update this test and
    the report together.
    """
    rendered = _render_prompt()
    assert "ChatGPT" in rendered
