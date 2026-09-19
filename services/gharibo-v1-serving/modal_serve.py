import modal

APP_NAME = "gharibo-v1"

BASE_IMAGE_ID = "im-w54l5gkvsyio4XVKsgieyp"

ADAPTER_SHA256 = (
    "5d192d843af72298f5080f4ebe9fd77e3b47fa6c1abf46064706d091b80f7c22"
)

assets = modal.Volume.from_name("gharibo-v1-assets")
api_secret = modal.Secret.from_name("gharibo-v1-api")

# Reuse the already-verified 12.55 GB exact base snapshot.
runtime_image = (
    modal.Image.from_id(BASE_IMAGE_ID)
    .uv_pip_install(
        "fastapi==0.115.0",
        "uvicorn[standard]==0.30.6",
        "pydantic==2.9.2",
        "torch==2.10.0",
        "triton==3.6.0",
        "transformers==4.56.2",
        "peft==0.20.0",
        "accelerate==1.15.0",
        "bitsandbytes==0.50.2",
        "unsloth==2026.9.4",
        "unsloth_zoo==2026.9.3",
    )
    .env(
        {
            "GHARIBO_MODEL_ID": "GHARIBO-V1",
            "GHARIBO_ADAPTER_PATH": "/assets/adapter",
            "GHARIBO_ADAPTER_SHA256": ADAPTER_SHA256,
            "GHARIBO_BASE_MODEL": "/opt/gharibo/base",
            "GHARIBO_DEVICE": "auto",
            "GHARIBO_LOAD_IN_4BIT": "true",
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "TOKENIZERS_PARALLELISM": "false",
        }
    )
    .add_local_dir(
        "services/gharibo-v1-serving/app",
        remote_path="/root/app",
        copy=False,
    )
)

app = modal.App(APP_NAME)


@app.function(
    image=runtime_image,
    gpu="T4",
    cpu=4.0,
    memory=32768,
    volumes={
        "/assets": assets.with_mount_options(read_only=True),
    },
    secrets=[api_secret],
    min_containers=0,
    max_containers=1,
    scaledown_window=60,
    timeout=600,
    startup_timeout=900,
)
@modal.asgi_app()
def api():
    from app.config import load_config
    from app.engine import EngineState, ServingEngine
    from app.main import create_app

    config = load_config()
    engine = ServingEngine(config)

    # Synchronous cold-start load:
    # the endpoint does not claim ready before the verified model is loaded.
    engine.load()

    # create_app already exposes the authenticated OpenAI-compatible
    # /v1/models route. Do not register a second unauthenticated duplicate here.
    return create_app(engine=engine, config=config)


