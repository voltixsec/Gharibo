# ADR-0003: One provider abstraction with four interchangeable backends

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Architecture (GHARIBO AI LAB) |
| **Supersedes** | — |
| **Superseded by** | — |
| **Architecture Version** | 1.0.0 |

## Context

The Playground must let an operator chat with *any* model, so that the lab can generate
training data from strong base models before a GHARIBO model exists. In practice those
models are reached in several incompatible ways:

- hosted APIs that speak the OpenAI `/v1/chat/completions` shape (OpenAI, Together, Groq, …),
- a local **Ollama** daemon,
- a local **vLLM** OpenAI-compatible server,
- the **HuggingFace** inference API.

If the Playground code knew about each of these directly, every new backend would ripple
through the UI, the conversation persistence layer, and the data-factory capture path.

## Decision

We will define a **single `ModelProvider` interface** in `apps/web/lib/providers/index.ts`
exposing `chat(messages, options): AsyncIterable<ChatChunk>`, and implement it once per
backend (`openai-compatible.ts`, `ollama.ts`, `vllm.ts`, `huggingface.ts`). Callers resolve
a concrete implementation through a factory (`getProvider`) using provider configuration
loaded from the database at runtime. **No backend is hard-coded** and streaming is the
common denominator of the interface.

## Consequences

### Positive
- The Playground, the "Add to Dataset" capture path, and any future evaluator depend only on
  the interface, so adding a backend is a new file plus a config row — no caller changes.
- Streaming-first means the UI can render tokens as they arrive for every backend, including
  Ollama and vLLM.
- Provider configuration lives in the DB, so operators add a model through Settings rather
  than editing code — a prerequisite for the data-factory workflow.
- Testing can substitute a fake provider without network access.

### Negative / Trade-offs
- The interface is the lowest common denominator. Backend-specific features (tool calling
  nuances, logprobs, structured output, embeddings) do not fit cleanly and will need explicit
  optional extensions or separate interfaces.
- Streaming as the only shape makes simple non-streaming callers slightly more awkward.
- Error semantics differ across backends and must be normalised by each implementation,
  which is easy to get subtly wrong.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Call each SDK directly from the Playground | Leaks backend details into UI and persistence code; every new backend is a cross-cutting change |
| Adopt a third-party multi-provider gateway (e.g. LiteLLM) as the only path | Adds a runtime dependency and an extra hop; local Ollama/vLLM would still need a bespoke path |
| OpenAI-compatible only, and require Ollama/vLLM to expose the OpenAI shape | Ollama's native API and HuggingFace would be second-class; loses the ability to surface backend-specific metadata |

## References

- `docs/PRD.md` — P0-04 (provider abstraction), P0-05 (Playground)
- `docs/ARCHITECTURE.md` §1.2 (Provider Abstraction)
- `apps/web/lib/providers/index.ts` and the four backend modules
