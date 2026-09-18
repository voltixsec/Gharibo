"""
Environment-only configuration for the GHARIBO-V1 serving service.

Every value comes from the environment. NO secrets, model weights, adapter
binaries, gold, or credentials are ever embedded in code or committed.

Env vars (all optional except a source for the adapter):
  GHARIBO_MODEL_ID        Served model identity (default GHARIBO-V1)
  GHARIBO_ADAPTER_PATH    Local directory or file containing the LoRA adapter
  GHARIBO_ADAPTER_URL     Remote adapter (downloaded + verified before load)
  GHARIBO_ADAPTER_SHA256  Expected adapter sha256 (defaults to the accepted one)
  GHARIBO_BASE_MODEL      Override the serving base (default: adapter's trained base)
  GHARIBO_API_KEY         If set, requests must carry Bearer <key> (OpenAI-style)
  GHARIBO_DEVICE          torch device (default "auto")
  GHARIBO_LOAD_IN_4BIT    "true"/"false" - serve the 4-bit base (default "true")
  PORT                    HTTP port (default 8000)
  HF_TOKEN                HuggingFace token, only if required to fetch the base
"""

import os
from dataclasses import dataclass, field
from typing import Optional

from .identity import (
    ACCEPTED_ADAPTER_SHA256,
    ACCEPTED_MODEL_ID,
    ADAPTER_FILENAME,
    DEFAULT_TRAINED_BASE_MODEL,
    DEFAULT_MAX_TOKENS,
    DEFAULT_TEMPERATURE,
)


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    val = os.environ.get(name)
    if val is None or val.strip() == "":
        return default
    return val.strip()


@dataclass(frozen=True)
class ServingConfig:
    model_id: str
    adapter_path: Optional[str]
    adapter_url: Optional[str]
    expected_adapter_sha256: str
    base_model_override: Optional[str]
    api_key: Optional[str]
    device: str
    load_in_4bit: bool
    port: int
    hf_token: Optional[str]
    adapter_filename: str = ADAPTER_FILENAME

    @property
    def requires_auth(self) -> bool:
        return bool(self.api_key)

    def adapter_source(self) -> str:
        return self.adapter_url or self.adapter_path or ""


def load_config() -> ServingConfig:
    if not (_env("GHARIBO_ADAPTER_PATH") or _env("GHARIBO_ADAPTER_URL")):
        raise RuntimeError(
            "No adapter source configured: set GHARIBO_ADAPTER_PATH or GHARIBO_ADAPTER_URL."
        )

    port_raw = _env("PORT", "8000")
    try:
        port = int(port_raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        port = 8000

    return ServingConfig(
        model_id=_env("GHARIBO_MODEL_ID", ACCEPTED_MODEL_ID),  # type: ignore[arg-type]
        adapter_path=_env("GHARIBO_ADAPTER_PATH"),
        adapter_url=_env("GHARIBO_ADAPTER_URL"),
        expected_adapter_sha256=_env(
            "GHARIBO_ADAPTER_SHA256", ACCEPTED_ADAPTER_SHA256
        ),  # type: ignore[arg-type]
        base_model_override=_env("GHARIBO_BASE_MODEL"),
        api_key=_env("GHARIBO_API_KEY"),
        device=_env("GHARIBO_DEVICE", "auto"),  # type: ignore[arg-type]
        load_in_4bit=(_env("GHARIBO_LOAD_IN_4BIT", "true").lower() == "true"),
        port=port,
        hf_token=_env("HF_TOKEN"),
    )
