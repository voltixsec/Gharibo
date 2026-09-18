# GHARIBO-V1 inference service - single-GPU deployment image.
#
# Built on the official PyTorch CUDA runtime so torch + CUDA are pre-aligned.
# The service loads the 4-bit base (unsloth/gpt-oss-20b-unsloth-bnb-4bit) plus
# the exact GHARIBO-V1 PEFT LoRA adapter WITHOUT merging it.
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HUB_OFFLINE=0

WORKDIR /app

# Install Python deps first (better layer caching).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the service source.
COPY app ./app

# Ensure no adapter binaries / secrets / gold can be baked in.
ENV GHARIBO_ADAPTER_PATH=/app/adapter \
    GHARIBO_ADAPTER_SHA256="" \
    PORT=8000

EXPOSE 8000

# The adapter must be mounted at /app/adapter (or fetched via GHARIBO_ADAPTER_URL)
# at runtime; it is never part of the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["sh", "-c", "uvicorn app.main:build_app --host 0.0.0.0 --port ${PORT:-8000}"]
