# GHARIBO AI LAB — Product Requirements Document

| Field | Value |
|-------|-------|
| **Document Owner** | Product (GHARIBO AI LAB) — 许清楚 (Xu), Product Manager |
| **Type** | PRD |
| **Status** | Approved |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-09-14 |
| **Project Name** | `gharibo_ai_lab` |
| **Milestone** | 1 — Vertical Slice |
| **Programming Language / Stack** | Next.js + TypeScript + Tailwind CSS + shadcn/ui (frontend); Python + FastAPI + PyTorch + Transformers + PEFT + TRL + datasets (ML services); SQLite (switchable to PostgreSQL) |
| **Original Request** | Build GHARIBO AI LAB — the control center for chatting with base models, collecting training data, reviewing/approving examples, building datasets, launching LoRA/QLoRA/SFT experiments, evaluating checkpoints, comparing GHARIBO versions, maintaining a model registry, running Research Gym tasks, and inspecting training history. |

---

## 1. Product Vision

### What GHARIBO AI LAB Is

GHARIBO AI LAB is the professional infrastructure layer for the GHARIBO model family. It is the single control center where a small AI team can:

- **Chat** with any base model through a unified provider abstraction (OpenAI-compatible, Ollama, vLLM, Hugging Face).
- **Collect** high-quality training data from real conversations and research tasks.
- **Review, approve, and curate** examples into structured datasets.
- **Launch** LoRA / QLoRA / SFT fine-tuning experiments on local hardware.
- **Evaluate** checkpoints against benchmarks and compare base model vs. GHARIBO candidate.
- **Maintain** a model registry that gates promotion from experiment → candidate → accepted.
- **Run Research Gym tasks** that teach GHARIBO how to build structured knowledge libraries.
- **Inspect** full training history and experiment lineage.

### Why We Are Building It

The long-term goal is a real AI model family (GHARIBO, GHARIBO-V1, GHARIBO-Code, GHARIBO-Vision, GHARIBO-Image, GHARIBO-Video, GHARIBO-Voice). **We are NOT training a foundation model from scratch in this milestone.** Instead, we are building the professional infrastructure that makes disciplined, reproducible model improvement possible. Without this lab, data collection is ad hoc, training is non-reproducible, evaluation is subjective, and no model can be confidently promoted.

**Headline:** GHARIBO AI LAB
**Subtitle:** Build. Train. Evaluate. Evolve.

### Milestone 1 Scope (Vertical Slice)

A functioning vertical slice that proves the full loop end-to-end:

> App launches → sidebar works → Playground chats via provider abstraction → training examples are saved → Data Factory persists them → a dataset is created → JSONL is exported → Training page exists → environment pre-flight really checks the machine → Model Registry persists records → Evaluation framework has a working minimal implementation → Research Gym has a first functioning task workflow.

Everything beyond this slice is documented for context but prioritized as P1/P2.

---

## 2. Product Goals

| # | Goal | Measurable Success Criteria |
|---|------|-----------------------------|
| G1 | **Closed-loop data-to-train pipeline** | A user can complete the path: chat in Playground → save response as training example → review in Data Factory → approve → build dataset → export JSONL — in under 10 minutes with zero manual file editing. |
| G2 | **Reproducible, transparent experiments** | Every training run and experiment records full configuration (code version, model, dataset version, seed, hyperparameters, metrics) and is inspectable from the UI with one click. |
| G3 | **Hardware-aware training gating** | The Training Center performs a real pre-flight check of the local machine (Python, PyTorch, CUDA, GPU, VRAM, disk, dataset validity, base model availability) and displays READY / NOT READY — never letting a user launch into a guaranteed failure. |

---

## 3. User Personas

### Persona A — Maya, the ML Engineer
- Operates the training loop: configures LoRA/QLoRA/SFT runs, monitors checkpoints, reads metrics.
- Needs: pre-flight checks, reproducible configs, clear run status, checkpoint paths.
- Pain point: launching training that fails 20 minutes in because VRAM was insufficient.

### Persona B — Ravi, the Researcher / Data Curator
- Runs Research Gym tasks, reviews/approves data, tags and scores examples.
- Needs: structured review queue, bulk actions, validation feedback, provenance tracking.
- Pain point: losing track of which sources backed which claims.

### Persona C — Lin, the Team Lead / Founder
- Oversees model promotion, compares base vs. candidate, reads evaluation reports.
- Needs: model registry status gates, evaluation comparison views, experiment lineage.
- Pain point: not knowing whether a "GHARIBO-V1" label is earned or aspirational.

---

## 4. User Stories

### Playground
- US-1.1: As an ML engineer, I want to chat with any configured base model so that I can explore its behavior before collecting data.
- US-1.2: As a data curator, I want to save any assistant response as a training example with one click so that good outputs become training data.
- US-1.3: As a data curator, I want to mark a response [Good] or [Bad] so that quality signals are captured.
- US-1.4: As a data curator, I want to edit a response and approve the edited version so that corrected outputs are what we train on.
- US-1.5: As an engineer, I want to select system prompts, temperature, max tokens, and tool-use toggle so that I control generation behavior.

### Data Factory
- US-2.1: As a curator, I want a pipeline (RAW → NORMALIZED → REVIEW → APPROVED → TRAINING_READY → REJECTED) so that data matures through quality gates.
- US-2.2: As a curator, I want to search, filter, edit, bulk-approve, reject, tag, and score records so that I can process large batches efficiently.
- US-2.3: As an engineer, I want to import and export JSONL so that datasets are portable and standard.
- US-2.4: As a curator, I want validation results (PASS/WARNING/FAIL) on every record so that bad data is never silently discarded.

### Datasets
- US-3.1: As an engineer, I want to assemble approved records into a versioned dataset so that training references a frozen, reproducible set.
- US-3.2: As an engineer, I want to export a dataset to JSONL so that it can be fed to training.

### Research Gym
- US-4.1: As a researcher, I want to run a structured-knowledge-building task (discover taxonomy → manufacturers → brands → product families → models → specs → accessories → compatibility → services → evidence → validate → deduplicate → generate records) so that GHARIBO learns to build knowledge libraries.
- US-4.2: As a researcher, I want every run to preserve sources considered, snippets, candidate entities, generated records, validation failures, duplicates, corrections, and reward/score so that the run is fully auditable.
- US-4.3: As a researcher, I want the task to be generic across commercial products, software, scientific literature, companies, APIs, technical systems, and market intelligence.

### Training Center
- US-5.1: As an ML engineer, I want to configure and launch LoRA/QLoRA/SFT runs with full hyperparameters so that fine-tuning is reproducible.
- US-5.2: As an engineer, I want a pre-flight check that verifies my machine is ready so that I never launch into guaranteed failure.
- US-5.3: As an engineer, I want run statuses (DRAFT, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED) so that I always know the state of training.
- US-5.4: As an engineer, when no compatible GPU is present, I want a clear "ENVIRONMENT NOT READY" message explaining what is missing.

### Evaluations
- US-6.1: As a team lead, I want to benchmark a GHARIBO candidate across categories (Reasoning, Coding, Instruction Following, Structured Output, Research, Source Fidelity, Hallucination Resistance, Data Extraction, Classification, Deduplication, Tool Use) so that I know where it stands.
- US-6.2: As a team lead, I want a base-model vs. candidate comparison so that I can see regressions before promotion.
- US-6.3: As a team lead, I want promotion to be blocked when regressions exceed thresholds so that weak models are never promoted.

### Models (Registry)
- US-7.1: As a team lead, I want to register models with version, base model, training run, dataset version, method, checkpoint/adapter location, eval score, and status so that the registry is the single source of truth.
- US-7.2: As a team lead, I want status gates (EXPERIMENT → CANDIDATE → ACCEPTED → DEPRECATED) so that a model is never called GHARIBO-V1 until explicitly promoted.

### Experiments
- US-8.1: As an engineer, I want every experiment to be reproducible (code version, model, dataset version, config, seed, results, notes) so that any run can be re-run.
- US-8.2: As an engineer, I want an experiment detail page (Configuration, Dataset, Training, Evaluation, Artifacts, Logs) so that I can investigate any run deeply.

### System
- US-9.1: As an engineer, I want to inspect provider status, storage usage, and environment info so that I can diagnose issues.

### Settings
- US-10.1: As a team lead, I want to configure model providers (Provider, Model ID, Base URL, API key reference, Context window, capability flags) so that the platform is never locked to one vendor.

---

## 5. Requirements Pool (Priority)

> **P0 = Must have for the vertical slice.** P1 = Important, next after slice. P2 = Future / extension.

### P0 — Vertical Slice (Must Have Now)

| ID | Requirement | Area |
|----|-------------|------|
| P0-01 | App launches and renders the 10-section sidebar with GHARIBO branding, headline, and subtitle | Shell |
| P0-02 | Light/dark mode, responsive layout, premium minimal design system | Shell |
| P0-03 | Provider abstraction interface implemented (OpenAI-compatible, Ollama, vLLM, HF) with provider/model configuration stored in Settings | Provider/Settings |
| P0-04 | Playground: conversation list, new conversation, model selector, system prompt, temperature, max tokens, streaming-ready chat | Playground |
| P0-05 | Playground: every assistant response has [Add to Dataset] [Good] [Bad] [Edit & Approve] [Compare] actions | Playground |
| P0-06 | Saving a training example persists: prompt, system prompt, response, edited/approved response, model, provider, timestamp, tags, domain, language, quality score, approval state | Playground/Data |
| P0-07 | Data Factory: records flow through RAW → NORMALIZED → REVIEW_REQUIRED → APPROVED → REJECTED → TRAINING_READY with persistence (SQLite) | Data Factory |
| P0-08 | Data Factory: search, filter, edit, bulk approve/reject, tag, score, JSONL import/export | Data Factory |
| P0-09 | Data validation engine: schema validation, required fields, duplicate detection, URL/source presence, field-type validation — reports PASS/WARNING/FAIL, never silently discards | Data Factory |
| P0-10 | Datasets: assemble approved records into a versioned dataset and export to JSONL | Datasets |
| P0-11 | Training Center page exists with run configuration form (method, base model, dataset, epochs, LR, batch size, grad accum, LoRA rank/alpha, target modules, quantization, seed) | Training |
| P0-12 | Training pre-flight check actually inspects the machine: Python, PyTorch, CUDA, GPU name, VRAM, Transformers, PEFT, TRL, disk space, dataset validity, base model availability — shows READY/NOT READY per item | Training |
| P0-13 | If no compatible GPU: display "ENVIRONMENT NOT READY" with explanation of what is missing | Training |
| P0-14 | Training run records persisted with full fields and status (DRAFT, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED) | Training |
| P0-15 | Model Registry persists records: name, version, base model, training run, dataset version, method, checkpoint/adapter location, eval score, status (EXPERIMENT, CANDIDATE, ACCEPTED, DEPRECATED), notes, created date — and blocks "GHARIBO-V1" until promoted | Models |
| P0-16 | Evaluation framework has a working minimal implementation (benchmark categories defined; base vs. candidate comparison scaffolded) | Evaluations |
| P0-17 | Research Gym has a first functioning task workflow (structured-knowledge-building task with the schema steps) and persists a Research Training Record | Research Gym |
| P0-18 | Monorepo structure created: /apps/web, /apps/api, /services/trainer, /services/inference, /services/research, /packages/*, /data/*, /models/*, /docs | Architecture |
| P0-19 | Security baseline: no secrets in source control; API keys stored by reference; filesystem operations protected; no arbitrary shell execution from UI input | Security |

### P1 — Important (Next After Slice)

| ID | Requirement | Area |
|----|-------------|------|
| P1-01 | Actual LoRA/QLoRA/SFT training execution end-to-end (launch, stream logs, produce checkpoint) | Training |
| P1-02 | Tool-use toggle functional in Playground (function calling) | Playground |
| P1-03 | Attachment-ready Playground (upload context files) | Playground |
| P1-04 | Near-duplicate detection (beyond exact duplicate) | Data Factory |
| P1-05 | Invalid-relation detection and taxonomy-violation detection | Data Factory |
| P1-06 | Unsupported-claim detection (beyond placeholder) | Data Factory |
| P1-07 | Full Research Gym validation loop: schema correctness, record precision, duplicate rate, unsupported-claim rate, source coverage, taxonomy accuracy | Research Gym |
| P1-08 | Evaluation: regression-threshold-based promotion blocking fully enforced | Evaluations |
| P1-09 | Experiment detail page: Configuration, Dataset, Training, Evaluation, Artifacts, Logs tabs | Experiments |
| P1-10 | DPO, GRPO, continued-pretraining extension points wired | Training |

### P2 — Future / Extension

| ID | Requirement | Area |
|----|-------------|------|
| P2-01 | Multi-user auth and role-based access | System |
| P2-02 | Distributed training across multiple GPUs/nodes | Training |
| P2-03 | Sandboxed code-execution tools | Research/Security |
| P2-04 | PostgreSQL migration from SQLite | Database |
| P2-05 | Full GHARIBO model family deployment (Vision, Image, Video, Voice) | Roadmap |
| P2-06 | Automated dataset versioning with diffing | Datasets |
| P2-07 | Evaluation leaderboard and historical trend charts | Evaluations |

---

## 6. Feature Specifications

### 6.1 Playground

A ChatGPT-like chat interface.

**Layout:** Left = conversation list + "New Conversation" button. Center = message stream (streaming-ready). Right or top = controls: model selector, system prompt selector, temperature slider, max output tokens, tool-use toggle.

**Per-response actions (on every assistant message):**
- `[Add to Dataset]` — saves the exchange as a training example.
- `[Good]` — records a positive quality signal.
- `[Bad]` — records a negative quality signal.
- `[Edit & Approve]` — opens an inline editor; the approved/edited text becomes the `chosen_output`.
- `[Compare]` — opens a side-by-side comparison view (for comparing model responses).

**Saved training example fields:** prompt, system prompt, response, edited/approved response, model used, provider, timestamp, tags, domain, language, quality score, approval state.

### 6.2 Research Gym

The first "training school" for GHARIBO: teaches the model how to build high-quality structured knowledge libraries.

**Task workflow (structured-knowledge-building):**
Topic/System → discover taxonomy → manufacturers → brands → product families → product models → extract specs → accessories → compatibility → services → attach evidence → validate → detect duplicates → generate structured records.

**Schema (entity types):** `CATEGORY, DOMAIN, SYSTEM, MANUFACTURER, BRAND, PRODUCT_FAMILY, PRODUCT_MODEL, ITEM, SERVICE, RELATION, SOURCE, EVIDENCE`

**Genericity requirement:** The schema and workflow must work for commercial products, software, scientific literature, companies, APIs, technical systems, and market intelligence — not hard-coded to one domain.

**Research Training Record (persisted for every run):** task, instructions, input, sources considered, source snippets, candidate entities, generated records, validation failures, duplicates found, corrections, final approved records, reward/score, model used, duration.

**Hard rule:** Never mark unsupported facts as verified.

### 6.3 Data Factory

The data pipeline and curation workspace.

**Pipeline states:** `RAW → NORMALIZED → REVIEW_REQUIRED → APPROVED → REJECTED` and `APPROVED → TRAINING_READY`.

**Record fields:** id, task_type, domain, language, input, context, expected_output, chosen_output, rejected_output, source, source_url, license, verification_status, quality_score, difficulty, tags, created_at, updated_at.

**UI operations:** search, filter, edit, bulk approve, bulk reject, tag, score, export JSONL, import JSONL.

**Validation engine (validators):** schema validation, required-fields check, duplicate detection, URL/source presence, unsupported-claim detection (placeholder in P0), invalid-relation detection, taxonomy-violation detection, field-type validation, exact duplicate, near duplicate. **Report per record: PASS / WARNING / FAIL. Never silently discard records.**

### 6.4 Datasets

Assemble approved Data Factory records into a versioned, frozen dataset for training reproducibility.

- Create dataset from approved records.
- Version datasets (immutable snapshots).
- Export to JSONL.
- Reference a specific dataset version from a training run.

### 6.5 Training Center

Configure and launch fine-tuning. Methods in Phase 1: **LoRA, QLoRA, SFT**. Extension points for DPO, GRPO, continued pretraining.

**Training Run fields:** run_id, base_model, method, dataset, dataset_version, train examples, validation examples, epochs, learning_rate, batch_size, gradient_accumulation, LoRA rank, LoRA alpha, target modules, quantization, seed, device, status, start/end time, checkpoint path, logs, metrics.

**Statuses:** DRAFT, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED.

**Pre-Flight Check (runs before any launch):** Python, PyTorch, CUDA, GPU name, VRAM, Transformers, PEFT, TRL, disk space, dataset validity, base model availability. Display READY / NOT READY per item. If no compatible GPU → display "ENVIRONMENT NOT READY" with an explanation of what is missing.

### 6.6 Evaluations

Benchmark and compare models.

**Benchmark categories:** Reasoning, Coding, Instruction Following, Structured Output, Research, Source Fidelity, Hallucination Resistance, Data Extraction, Classification, Deduplication, Tool Use.

**Research Gym-specific metrics:** schema correctness, record precision, duplicate rate, unsupported-claim rate, source coverage, taxonomy accuracy.

**Comparison:** BASE MODEL vs. GHARIBO CANDIDATE. **Promotion gating:** prevent promotion if regressions exceed thresholds.

### 6.7 Models (Model Registry)

Single source of truth for every model version.

**Fields:** model name, version, base model, training run, dataset version, training method, checkpoint location, adapter location, evaluation score, status, notes, created date.

**Statuses:** EXPERIMENT, CANDIDATE, ACCEPTED, DEPRECATED.

**Hard rule:** Never call an experiment "GHARIBO-V1" until explicitly promoted via the registry status gate.

### 6.8 Experiments

Reproducibility and lineage.

**Every experiment saves:** code version, model, dataset version, configuration, seed, results, notes.

**Experiment detail page tabs:** Configuration, Dataset, Training, Evaluation, Artifacts, Logs.

### 6.9 System

Operational dashboard: provider status, storage usage, environment info, service health (web, api, trainer, inference, research). Diagnostics for the ML engineer.

### 6.10 Settings

Configuration of model providers and platform preferences.

**Provider configuration fields:** Provider, Model ID, Base URL, API key reference (never the raw key in source), Context window, Supports vision, Supports tools, Supports structured output, Supports reasoning.

Light/dark mode toggle, theme preferences.

---

## 7. Data Models (Key Entities)

### 7.1 Provider Configuration
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| provider | enum | openai_compatible, ollama, vllm, huggingface |
| model_id | string | e.g. "llama-3.1-8b" |
| base_url | string | endpoint |
| api_key_ref | string | reference to secret store; never raw key in source |
| context_window | int | max tokens |
| supports_vision | bool | |
| supports_tools | bool | |
| supports_structured_output | bool | |
| supports_reasoning | bool | |

### 7.2 Conversation / Playground Message
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| conversation_id | string | FK |
| role | enum | system, user, assistant |
| content | text | |
| model_id | string | model used |
| provider_id | string | FK |
| created_at | datetime | |

### 7.3 Training Example (from Playground save)
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| prompt | text | |
| system_prompt | text | |
| response | text | original model response |
| approved_response | text | edited/approved version |
| model_id | string | |
| provider_id | string | |
| timestamp | datetime | |
| tags | string[] | |
| domain | string | |
| language | string | |
| quality_score | float | |
| approval_state | enum | pending, approved, rejected |

### 7.4 Data Factory Record
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| task_type | string | |
| domain | string | |
| language | string | |
| input | text | |
| context | text | |
| expected_output | text | |
| chosen_output | text | |
| rejected_output | text | |
| source | string | |
| source_url | string | |
| license | string | |
| verification_status | enum | RAW, NORMALIZED, REVIEW_REQUIRED, APPROVED, REJECTED, TRAINING_READY |
| quality_score | float | |
| difficulty | string | |
| tags | string[] | |
| created_at | datetime | |
| updated_at | datetime | |

### 7.5 Dataset (Versioned)
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| name | string | |
| version | string | immutable snapshot |
| record_ids | string[] | references to approved Data Factory records |
| record_count | int | |
| created_at | datetime | |

### 7.6 Training Run
| Field | Type | Notes |
|-------|------|-------|
| run_id | string | PK |
| base_model | string | |
| method | enum | lora, qlora, sft |
| dataset_id | string | FK |
| dataset_version | string | |
| train_examples | int | |
| validation_examples | int | |
| epochs | int | |
| learning_rate | float | |
| batch_size | int | |
| gradient_accumulation | int | |
| lora_rank | int | |
| lora_alpha | int | |
| target_modules | string[] | |
| quantization | string | |
| seed | int | |
| device | string | |
| status | enum | DRAFT, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED |
| start_time | datetime | |
| end_time | datetime | |
| checkpoint_path | string | |
| logs | text | |
| metrics | json | |

### 7.7 Model Registry Entry
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| model_name | string | |
| version | string | |
| base_model | string | |
| training_run_id | string | FK |
| dataset_version | string | |
| training_method | string | |
| checkpoint_location | string | |
| adapter_location | string | |
| evaluation_score | json | |
| status | enum | EXPERIMENT, CANDIDATE, ACCEPTED, DEPRECATED |
| notes | text | |
| created_date | datetime | |

### 7.8 Research Training Record
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| task | string | |
| instructions | text | |
| input | text | |
| sources_considered | json[] | |
| source_snippets | json[] | |
| candidate_entities | json[] | |
| generated_records | json[] | |
| validation_failures | json[] | |
| duplicates_found | json[] | |
| corrections | json[] | |
| final_approved_records | json[] | |
| reward_score | float | |
| model_used | string | |
| duration | int | seconds |

### 7.9 Experiment
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| code_version | string | git commit |
| model_id | string | FK to registry |
| dataset_version | string | |
| configuration | json | full config snapshot |
| seed | int | |
| results | json | |
| notes | text | |

### 7.10 Evaluation Result
| Field | Type | Notes |
|-------|------|-------|
| id | string | PK |
| model_id | string | FK |
| benchmark_category | enum | Reasoning, Coding, Instruction Following, Structured Output, Research, Source Fidelity, Hallucination Resistance, Data Extraction, Classification, Deduplication, Tool Use |
| score | float | |
| base_model_score | float | for comparison |
| regressions | json | |
| created_at | datetime | |

---

## 8. Provider Abstraction Specification

The platform must **never** be tightly coupled to one model vendor. A single provider interface abstracts all backends.

### Interface Contract
```
interface ModelProvider {
  id: string
  provider: "openai_compatible" | "ollama" | "vllm" | "huggingface"
  modelId: string
  baseUrl: string
  apiKeyRef: string            // reference to secret store; never raw key in source
  contextWindow: number
  supportsVision: boolean
  supportsTools: boolean
  supportsStructuredOutput: boolean
  supportsReasoning: boolean

  chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk>
}
```

### Supported Backends
| Backend | Transport | Notes |
|---------|-----------|-------|
| OpenAI-compatible API | HTTPS | covers OpenAI, Together, Groq, OpenRouter, any OpenAI-schema endpoint |
| Local Ollama | HTTP localhost | for dev/local models |
| Local vLLM | HTTP localhost | high-throughput local inference |
| Hugging Face / local transformer | in-process | direct model loading |

### Configuration Surface
All provider configuration lives in **Settings** and is persisted (API key by reference only). The Playground model selector reads from the configured providers. Adding a new provider must not require code changes.

---

## 9. Non-Functional Requirements

### 9.1 Performance
- Playground chat must stream first token within 2 seconds of provider response (network-bound; UI must not add latency).
- Data Factory list views must paginate; 10k records must render without jank.
- Training pre-flight check must complete within 10 seconds.

### 9.2 Security
- **No secrets in source control.** API keys stored by reference; raw keys live in a secret store / env only.
- Filesystem operations are protected and scoped to allowed directories (`/data`, `/models`).
- Training commands use **controlled argument structures** — never arbitrary shell execution from UI input.
- Design future code-execution tools around sandboxing (P2).

### 9.3 Design / UX
- Premium, minimal, modern AI product aesthetic. Professional, responsive, light/dark mode.
- No childish graphics, no excessive gradients. Excellent spacing and typography.
- Consistent design system via shadcn/ui + Tailwind.

### 9.4 Reproducibility
- Every training run and experiment records: code version, model, dataset version, config, seed.
- Datasets are immutable versioned snapshots.

### 9.5 Portability
- SQLite initially, switchable to PostgreSQL (connection-string driven).
- Data import/export via standard JSONL.

### 9.6 Development Process (Definition of Done for Milestone 1)
1. Create architecture → 2. Implement vertical slice → 3. Run lint → 4. Run typecheck → 5. Run tests → 6. Run build → 7. Fix failures → 8. Start application → 9. Provide exact commands → 10. Provide final status.

---

## 10. Open Questions

| # | Question | Context / Why It Matters |
|---|----------|---------------------------|
| Q1 | Which concrete base model(s) should the vertical slice target first? | The provider abstraction supports many, but the pre-flight check and first training config need at least one known-good default. |
| Q2 | Is there a preferred OpenAI-compatible endpoint / API key available for initial Playground testing, or do we start with local Ollama only? | Determines whether the slice can demo cloud models out of the box or must bundle a local model. |
| Q3 | What is the first Research Gym domain for the functioning task workflow — commercial products, software, scientific literature, companies, APIs, or market intelligence? | The schema is generic, but the first concrete task needs a real domain to validate against. |
| Q4 | What are the concrete regression thresholds for evaluation-based promotion gating? | We have the mechanism (P0-16 scaffold); the numeric thresholds need founder input. |
| Q5 | Where should the secret store live for API key references (env file, OS keychain, a managed vault)? | Affects the security implementation in P0-19. |
| Q6 | Should the API backend be TypeScript (in /apps/api) or Python FastAPI, given /services/trainer is already Python? | The spec allows either; a decision affects code sharing and the team's language mix. Recommendation: TypeScript for /apps/api (shares types with frontend), Python only for ML services. |
| Q7 | What is the target GPU for the first real training run (VRAM, CUDA version)? | The pre-flight check is hardware-agnostic, but we should validate against the actual target machine. |
| Q8 | For the vertical slice, is a real training execution required, or is the Training Center "launch-ready" (pre-flight + config persisted + status tracked) sufficient with execution in P1? | Recommendation: slice = launch-ready + pre-flight real; execution = P1. Needs confirmation. |

---

## Appendix A — Monorepo Structure

```
gharibo_ai_lab/
├── apps/
│   ├── web/              # Next.js frontend
│   └── api/              # TypeScript backend API (or FastAPI)
├── services/
│   ├── trainer/          # Python/FastAPI - ML training service
│   ├── inference/        # Python - inference service
│   └── research/         # Python - research service
├── packages/
│   ├── ai-core/          # provider abstraction, model interface
│   ├── database/         # schema, migrations, client
│   ├── dataset/          # dataset assembly, JSONL I/O
│   ├── evaluation/       # benchmark framework
│   ├── shared/           # types, utils
│   └── ui/               # shared UI components
├── data/
│   ├── datasets/
│   ├── raw/
│   ├── processed/
│   └── exports/
├── models/
│   ├── adapters/
│   ├── checkpoints/
│   └── registry/
└── docs/
```

## Appendix B — Sidebar Sections (10)

1. Playground
2. Research Gym
3. Data Factory
4. Datasets
5. Training
6. Evaluations
7. Models
8. Experiments
9. System
10. Settings
