import os
import json
import modal

APP_NAME = "gharibo-v1-base-build"

BASE_REPO = "unsloth/gpt-oss-20b-unsloth-bnb-4bit"
BASE_REVISION = "093fba6992ef5a7152481afec0bdfca1ac486998"
BASE_DIR = "/opt/gharibo/base"

REQUIRED_FILES = [
    "config.json",
    "generation_config.json",
    "model.safetensors.index.json",
    "model-00001-of-00004.safetensors",
    "model-00002-of-00004.safetensors",
    "model-00003-of-00004.safetensors",
    "model-00004-of-00004.safetensors",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "chat_template.jinja",
]


def download_exact_base():
    from huggingface_hub import HfApi, snapshot_download

    print("VERIFYING REMOTE REVISION...")
    info = HfApi().model_info(BASE_REPO, revision=BASE_REVISION)

    if info.sha != BASE_REVISION:
        raise RuntimeError(
            f"Revision mismatch: expected {BASE_REVISION}, got {info.sha}"
        )

    print("REMOTE REVISION VERIFIED:", info.sha)

    os.makedirs(BASE_DIR, exist_ok=True)

    path = snapshot_download(
        repo_id=BASE_REPO,
        revision=BASE_REVISION,
        local_dir=BASE_DIR,
    )

    print("SNAPSHOT DOWNLOADED:", path)

    missing = [
        name for name in REQUIRED_FILES
        if not os.path.isfile(os.path.join(BASE_DIR, name))
    ]

    if missing:
        raise RuntimeError(f"Missing required files: {missing}")

    total = 0
    for root, _, files in os.walk(BASE_DIR):
        for name in files:
            total += os.path.getsize(os.path.join(root, name))

    marker = {
        "repo": BASE_REPO,
        "revision": BASE_REVISION,
        "bytes": total,
        "required_files_ok": True,
    }

    with open(
        os.path.join(BASE_DIR, "GHARIBO_BASE_IDENTITY.json"),
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(marker, f, indent=2)

    print("BASE_FILES_VERIFIED")
    print("BASE_BYTES:", total)


image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("huggingface-hub==0.36.2")
    .env({
        "HF_HUB_DISABLE_XET": "1",
    })
    .run_function(
        download_exact_base,
        cpu=2.0,
        memory=4096,
        timeout=3600,
    )
)

app = modal.App(APP_NAME)


@app.function(
    image=image,
    cpu=0.125,
    memory=512,
    timeout=60,
)
def verify_base():
    marker_path = os.path.join(
        BASE_DIR,
        "GHARIBO_BASE_IDENTITY.json",
    )

    with open(marker_path, "r", encoding="utf-8") as f:
        marker = json.load(f)

    missing = [
        name for name in REQUIRED_FILES
        if not os.path.isfile(os.path.join(BASE_DIR, name))
    ]

    return {
        "revision": marker["revision"],
        "bytes": marker["bytes"],
        "required_files_ok": not missing,
        "missing": missing,
    }


@app.local_entrypoint()
def main():
    print(verify_base.remote())
