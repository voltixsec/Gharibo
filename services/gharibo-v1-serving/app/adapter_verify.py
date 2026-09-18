"""
Adapter SHA256 verification and optional download.

The adapter is verified BEFORE any model is loaded. A mismatch or a missing
adapter file is a hard fail: the service must not serve an unverified adapter.
This is the "fail closed if the adapter cannot be verified" requirement.
"""

import hashlib
import os
import shutil
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


class AdapterVerificationError(Exception):
    """Raised when the adapter cannot be located or its hash does not match."""


@dataclass
class AdapterLocation:
    directory: str
    safetensors: str
    actual_sha256: str
    expected_sha256: str
    matched: bool


def sha256_of_file(path: str, chunk_size: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(chunk_size), b""):
            h.update(block)
    return h.hexdigest()


def _download_file(url: str, dest: str, token: Optional[str]) -> None:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as fh:  # noqa: S310
        shutil.copyfileobj(resp, fh)


def resolve_and_verify(
    *,
    adapter_path: Optional[str],
    adapter_url: Optional[str],
    expected_sha256: str,
    adapter_filename: str,
    hf_token: Optional[str],
    workdir: str,
) -> AdapterLocation:
    """Locate the adapter, optionally download it, and verify its SHA256.

    Returns an AdapterLocation. Raises AdapterVerificationError on any failure.
    Never silently accepts an adapter whose hash differs from ``expected_sha256``.
    """
    directory: str
    safetensors: str

    if adapter_url:
        directory = os.path.join(workdir, "adapter")
        safetensors = os.path.join(directory, adapter_filename)
        if not (os.path.exists(safetensors) and sha256_of_file(safetensors) == expected_sha256):
            _download_file(
                f"{adapter_url.rstrip('/')}/{adapter_filename}",
                safetensors,
                hf_token,
            )
    elif adapter_path:
        candidate_file = (
            adapter_path
            if os.path.isfile(adapter_path)
            else os.path.join(adapter_path, adapter_filename)
        )
        if not os.path.isfile(candidate_file):
            raise AdapterVerificationError(
                f"Adapter file not found: {candidate_file}"
            )
        directory = os.path.dirname(candidate_file)
        safetensors = candidate_file
    else:
        raise AdapterVerificationError("No adapter source provided.")

    actual = sha256_of_file(safetensors)
    matched = actual == expected_sha256
    if not matched:
        raise AdapterVerificationError(
            f"Adapter SHA256 mismatch: expected {expected_sha256}, got {actual}. "
            "Refusing to serve an unverified adapter."
        )

    return AdapterLocation(
        directory=directory,
        safetensors=safetensors,
        actual_sha256=actual,
        expected_sha256=expected_sha256,
        matched=True,
    )


def read_adapter_base_model(adapter_dir: str) -> Optional[str]:
    """Read the base model the adapter was trained on (so we never re-base it)."""
    config_path = os.path.join(adapter_dir, "adapter_config.json")
    if not os.path.isfile(config_path):
        return None
    try:
        import json

        with open(config_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data.get("base_model_name_or_path")
    except Exception:
        return None
