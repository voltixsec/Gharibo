# GHARIBO Trainer Service

FastAPI service for ML training pre-flight checks.

## Run

```bash
cd services/trainer
pip install -r requirements.txt
python -m uvicorn main:app --port 8100 --reload
```

## Endpoints

- `GET /health` — health check
- `GET /preflight` — runs REAL pre-flight checks (Python, PyTorch, CUDA, GPU, VRAM, transformers, peft, trl, disk, dataset, base model)
- `POST /train` — returns 501 (training execution is P1)

## Pre-Flight Checks

The pre-flight check is **real** — it imports `torch` and checks:
1. Python version (>= 3.10)
2. PyTorch installed and version
3. CUDA availability via `torch.cuda.is_available()`
4. GPU device count and name via `torch.cuda.device_count()` / `get_device_name()`
5. VRAM via `torch.cuda.mem_get_info()`
6. Transformers installed
7. PEFT installed
8. TRL installed
9. Disk space via `psutil`
10. Dataset validity (file exists + JSONL parseable)
11. Base model availability (local path or HuggingFace Hub)

On a machine without a GPU, `overall_ready` will be `False` — this is the expected correct behavior.
