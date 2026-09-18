# GHARIBO-V1 Persistent Inference Service

A dedicated, deployable GPU inference service for **GHARIBO-V1** — a PEFT **LoRA**
adapter over **gpt-oss-20b** (NOT a merged model). It exposes an
OpenAI-compatible API and preserves the canonical **Harmony final-channel**
contract used everywhere in GHARIBO.

> **Status: NOT YET LIVE.** This is shippable code. It has not answered a real
> request from a persistent GPU endpoint yet. Do not claim the service is live
> until a real GPU endpoint has successfully answered a real request. See
> [Deployment](#deployment).

## Identity (grounded in `DEC-0059` + `production-integrity.json`)

| Field | Value |
|---|---|
| Model id | `GHARIBO-V1` |
| Base | `openai/gpt-oss-20b` |
| Concrete serving base | `unsloth/gpt-oss-20b-unsloth-bnb-4bit` (the base the adapter was trained on) |
| Adapter type | LoRA / PEFT (`peft 0.20.0`, r16 / alpha16), **not merged** |
| Adapter SHA256 | `5d192d843af72298f5080f4ebe9fd77e3b47fa6c1abf46064706d091b80f7c22` |
| Context | 3072 |
| Final channel | `final` only; `analysis` is chain-of-thought and is never surfaced |

The adapter is loaded on the **exact base it was trained on**. Merging it onto a
different base (e.g. a full-precision `openai/gpt-oss-20b`) would silently change
model identity and is **forbidden**. The service therefore serves base **+ LoRA
without merging**.

## Endpoints

### `GET /health`
Returns the truthful runtime state:

- `status`: `loading` → `ready`, or `unhealthy` on any verification/load failure.
- `model_id`, `base_model`, `adapter.type`, `context`.
- `adapter.sha256_verified` — the verified adapter hash (a hash, not a secret).
- `diagnostics`: `cuda_available`, `gpu_name`, `vram_total_bytes`,
  `vram_allocated_bytes`, `base_model_loaded`, `adapter_loaded`,
  `adapter_sha256_verified`, `ready`.
- `secrets_present: false` always. **No credentials ever leave this endpoint.**

### `POST /v1/chat/completions`
OpenAI-compatible (subset):

```json
{
  "model": "GHARIBO-V1",
  "messages": [{"role": "user", "content": "..."}],
  "temperature": 0.2,
  "max_tokens": 3072,
  "stream": false
}
```

- `model` is accepted (ignored for routing; the served identity is fixed).
- The model's continuation may contain Harmony channels; only the **final**
  channel is returned as `choices[0].message.content`. `analysis` is never
  returned.
- `stream=true` is **rejected** (HTTP 400) — not supported in this release.
- No final channel → HTTP **502** with `error.type: model_output_error`
  (fail-closed; never returns raw model text).
- If `GHARIBO_API_KEY` is set, the request must carry `Authorization: Bearer <key>`
  (HTTP 401 otherwise). `/health` is never gated.

## Configuration (environment only)

| Variable | Purpose |
|---|---|
| `GHARIBO_MODEL_ID` | Served identity (default `GHARIBO-V1`). |
| `GHARIBO_ADAPTER_PATH` | Local dir/file of the LoRA adapter (preferred). |
| `GHARIBO_ADAPTER_URL` | Remote adapter (downloaded + verified before load). |
| `GHARIBO_ADAPTER_SHA256` | Expected adapter hash; default = accepted identity. |
| `GHARIBO_BASE_MODEL` | Override serving base. **Unset = adapter's trained base** (do not re-base). |
| `GHARIBO_API_KEY` | If set, enforces Bearer auth on `/v1/chat/completions`. |
| `GHARIBO_DEVICE` | torch device map (default `auto`). |
| `GHARIBO_LOAD_IN_4BIT` | `true` (default) serves the 4-bit base; `false` needs a large GPU. |
| `PORT` | HTTP port (default 8000). |
| `HF_TOKEN` | Only if a gated base must be fetched. |

## Harmony contract reuse

`app/harmony_final.py` is a **faithful Python port** of
`apps/web/lib/runtime/harmony-final.mjs` — the same deterministic authority the
Next.js app and Node harness use. `tests/test_harmony_final.py` pins the port to
the identical fixtures, so the answer the service extracts equals the answer the
application already accepts.

## GPU / VRAM requirement

The exact, identity-preserving configuration serves the **4-bit** base +
LoRA:

- gpt-oss-20b @ 4-bit NF4 ≈ **11–12 GB** weights
- LoRA adapter ≈ negligible
- activations + KV cache for context 3072 (batch 1) ≈ **3–6 GB**

**Minimum: a single GPU with ≥ 24 GB VRAM** (e.g. A10G, L4, RTX 4090, RTX 3090 24 GB).
Comfortable headroom; batch size = 1.

**Recommended: 40–80 GB** (A100/H100) for throughput and small batching.

> A full-precision base (`GHARIBO_LOAD_IN_4BIT=false`) needs **≥ 48 GB** and is
> NOT the accepted configuration — it re-bases the adapter. Do not use it to
> claim GHARIBO-V1 identity.

## Engine choice

**transformers + peft** with a 4-bit `BitsAndBytesConfig` base is the simplest
stable path for gpt-oss-20b + a PEFT LoRA and is what this service uses. vLLM
with LoRA was considered but adds version-coupling complexity for no functional
gain at this scale. (No engine-comparison loop was entered.)

## Tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

Covers: health-before-ready, health-ready, unauthorized, malformed, adapter-hash
mismatch, model-load failure, normal OpenAI response contract, and missing-final-
channel fail-closed — plus Harmony parity. **No GPU or torch required** (the real
backend is imported lazily).

## Deployment

### Docker (single GPU)

```bash
docker build -t gharibo-v1-serving .
docker run --gpus all -p 8000:8000 \
  -e GHARIBO_ADAPTER_PATH=/app/adapter \
  -e GHARIBO_ADAPTER_SHA256=5d192d843af72298f5080f4ebe9fd77e3b47fa6c1abf46064706d091b80f7c22 \
  -e GHARIBO_API_KEY=<strong-secret> \
  -v /path/to/verified-adapter:/app/adapter \
  gharibo-v1-serving
```

### Bare metal

```bash
pip install -r requirements.txt
uvicorn app.main:build_app --host 0.0.0.0 --port 8000
```

After the container/host is up, confirm with a real request:

```bash
curl http://localhost:8000/health        # expect status: ready
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer <strong-secret>" \
  -H "Content-Type: application/json" \
  -d '{"model":"GHARIBO-V1","messages":[{"role":"user","content":"hello"}],"max_tokens":256}'
```

Only after a persistent endpoint has answered a real request from this exact
image may the service be declared live.
