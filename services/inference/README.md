# GHARIBO Inference Service

FastAPI service for local model inference (stubbed for P0).

## Run

```bash
cd services/inference
pip install -r requirements.txt
python -m uvicorn main:app --port 8101 --reload
```

## Endpoints

- `GET /health` — health check
- `POST /chat` — returns 501 (local model inference is P1)
