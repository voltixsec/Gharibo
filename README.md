# GHARIBO AI LAB

**Build. Train. Evaluate. Evolve.**

Professional AI laboratory infrastructure for the GHARIBO model family.

## Quickstart

### Prerequisites

- Node.js 22+ and npm 10+
- Python 3.12+ (for ML services)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local with your API keys
```

### 3. Run Database Migrations

Migrations run automatically on first server start. The SQLite database is created at `data/gharibo.db`.

### 4. Start the Web App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Start Python Services (optional, for pre-flight check)

```bash
# Install Python deps
cd services/trainer && pip install -r requirements.txt && cd ../..
cd services/inference && pip install -r requirements.txt && cd ../..
cd services/research && pip install -r requirements.txt && cd ../..

# Start all services
npm run dev:services
```

Or start individually:
- Trainer: `cd services/trainer && python -m uvicorn main:app --port 8100 --reload`
- Inference: `cd services/inference && python -m uvicorn main:app --port 8101 --reload`
- Research: `cd services/research && python -m uvicorn main:app --port 8102 --reload`

## Architecture

```
gharibo/
├── apps/web/           # Next.js 14 (App Router) — frontend + API
├── packages/shared/    # Shared TypeScript types
├── services/
│   ├── trainer/        # FastAPI — ML pre-flight check (REAL torch/CUDA inspection)
│   ├── inference/      # FastAPI — inference service (stub for P0)
│   └── research/       # FastAPI — Research Gym task runner
├── data/               # SQLite DB, datasets, exports
├── models/             # Model artifacts (adapters, checkpoints, registry)
└── docs/               # PRD + Architecture documents
```

## Key Features (Milestone 1 — Vertical Slice)

- **Playground**: Chat with any base model (OpenAI-compatible, Ollama, vLLM, HuggingFace)
- **Research Gym**: Structured-knowledge-building task workflow
- **Data Factory**: Data pipeline with validation, bulk actions, JSONL I/O
- **Datasets**: Versioned dataset assembly + JSONL export
- **Training**: Full hyperparameter config + REAL environment pre-flight check
- **Evaluations**: Benchmark framework scaffold
- **Models**: Registry with status gates (EXPERIMENT → CANDIDATE → ACCEPTED)
- **Experiments**: Reproducible experiment lineage
- **System**: Operational diagnostics dashboard
- **Settings**: Provider configuration (API keys by reference only)

## Troubleshooting

### better-sqlite3 native bindings missing on Windows/Node 22

If you see `Could not locate the bindings file`, rebuild native modules:

```bash
npm rebuild better-sqlite3
```

This resolves the missing `.node` binary for Node.js 22 (ABI v127). If it still fails, install build tools:

```bash
npm install --global windows-build-tools
```

If it still fails, fallback to `@libsql/client`:
1. `npm install @libsql/client` in apps/web
2. Replace `better-sqlite3` imports with `@libsql/client`
3. The SQL is compatible

### Python pre-flight returns NOT_READY

This is expected on machines without a GPU. The pre-flight check correctly detects:
- No CUDA → `torch.cuda.is_available()` returns `False`
- No GPU → GPU name/VRAM items show NOT_READY
- Training execution is P1; the pre-flight is REAL but training launch returns 501

## Security

- API keys are stored as **references** (env var names) in the database, never raw values
- `.env*` files are gitignored
- No arbitrary shell execution from UI input
- Filesystem operations scoped to `data/` and `models/` directories
