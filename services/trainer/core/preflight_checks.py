"""
REAL pre-flight checks for ML training readiness.

These checks actually import torch, check CUDA availability, GPU name/VRAM,
transformers/peft/trl, disk space, dataset validity, and base model availability.
On a machine without a GPU, overall_ready will be False — this is expected behavior.
"""
import importlib
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class PreflightItem:
    """A single pre-flight check result."""
    check: str
    status: str  # "READY", "NOT_READY", "UNKNOWN"
    detail: str


@dataclass
class PreflightResult:
    """Full pre-flight check result."""
    overall_ready: bool
    items: List[PreflightItem] = field(default_factory=list)
    checked_at: str = ""


def _check_python() -> PreflightItem:
    """Checks Python version."""
    version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    if sys.version_info >= (3, 10):
        return PreflightItem(check="python", status="READY", detail=f"Python {version}")
    return PreflightItem(check="python", status="NOT_READY", detail=f"Python {version} — requires 3.10+")


def _check_torch() -> PreflightItem:
    """Checks if torch is importable and reports version."""
    try:
        import torch
        version = torch.__version__
        return PreflightItem(check="torch", status="READY", detail=f"PyTorch {version}")
    except ImportError:
        return PreflightItem(check="torch", status="NOT_READY", detail="PyTorch not installed")
    except Exception as e:
        return PreflightItem(check="torch", status="NOT_READY", detail=f"PyTorch import error: {e}")


def _check_cuda() -> PreflightItem:
    """Checks CUDA availability via torch.cuda."""
    try:
        import torch
        if hasattr(torch, "cuda") and torch.cuda.is_available():
            cuda_version = torch.version.cuda or "unknown"
            return PreflightItem(check="cuda", status="READY", detail=f"CUDA available (version {cuda_version})")
        return PreflightItem(check="cuda", status="NOT_READY", detail="CUDA not available — torch.cuda.is_available() is False")
    except ImportError:
        return PreflightItem(check="cuda", status="NOT_READY", detail="Cannot check CUDA — torch not installed")
    except Exception as e:
        return PreflightItem(check="cuda", status="NOT_READY", detail=f"CUDA check error: {e}")


def _check_gpu() -> PreflightItem:
    """Checks GPU device count and name via torch.cuda."""
    try:
        import torch
        if not hasattr(torch, "cuda") or not torch.cuda.is_available():
            return PreflightItem(check="gpu", status="NOT_READY", detail="No GPU detected — CUDA not available")

        device_count = torch.cuda.device_count()
        if device_count == 0:
            return PreflightItem(check="gpu", status="NOT_READY", detail="No GPU devices found")

        gpu_names = [torch.cuda.get_device_name(i) for i in range(device_count)]
        return PreflightItem(check="gpu", status="READY", detail=f"{device_count} GPU(s): {', '.join(gpu_names)}")
    except ImportError:
        return PreflightItem(check="gpu", status="NOT_READY", detail="Cannot check GPU — torch not installed")
    except Exception as e:
        return PreflightItem(check="gpu", status="NOT_READY", detail=f"GPU check error: {e}")


def _check_vram() -> PreflightItem:
    """Checks GPU VRAM via torch.cuda.mem_get_info."""
    try:
        import torch
        if not hasattr(torch, "cuda") or not torch.cuda.is_available():
            return PreflightItem(check="vram", status="NOT_READY", detail="Cannot check VRAM — no CUDA device")

        # Get memory info for device 0
        if hasattr(torch.cuda, "mem_get_info"):
            free, total = torch.cuda.mem_get_info(0)
            free_gb = free / (1024**3)
            total_gb = total / (1024**3)
            if free_gb >= 4.0:
                return PreflightItem(check="vram", status="READY", detail=f"{free_gb:.1f} GB free / {total_gb:.1f} GB total")
            return PreflightItem(check="vram", status="NOT_READY", detail=f"Only {free_gb:.1f} GB free / {total_gb:.1f} GB total — need >= 4 GB")
        return PreflightItem(check="vram", status="UNKNOWN", detail="mem_get_info not available in this torch version")
    except ImportError:
        return PreflightItem(check="vram", status="NOT_READY", detail="Cannot check VRAM — torch not installed")
    except Exception as e:
        return PreflightItem(check="vram", status="NOT_READY", detail=f"VRAM check error: {e}")


def _check_package(name: str, display_name: str) -> PreflightItem:
    """Checks if a Python package is importable."""
    try:
        mod = importlib.import_module(name)
        version = getattr(mod, "__version__", "unknown")
        return PreflightItem(check=name, status="READY", detail=f"{display_name} {version}")
    except ImportError:
        return PreflightItem(check=name, status="NOT_READY", detail=f"{display_name} not installed")
    except Exception as e:
        return PreflightItem(check=name, status="NOT_READY", detail=f"{display_name} error: {e}")


def _check_disk() -> PreflightItem:
    """Checks available disk space via psutil."""
    try:
        import psutil
        usage = psutil.disk_usage(os.getcwd())
        free_gb = usage.free / (1024**3)
        if free_gb >= 10.0:
            return PreflightItem(check="disk", status="READY", detail=f"{free_gb:.1f} GB free disk space")
        return PreflightItem(check="disk", status="NOT_READY", detail=f"Only {free_gb:.1f} GB free — need >= 10 GB")
    except ImportError:
        return PreflightItem(check="disk", status="NOT_READY", detail="psutil not installed")
    except Exception as e:
        return PreflightItem(check="disk", status="NOT_READY", detail=f"Disk check error: {e}")


def _check_dataset(dataset_path: Optional[str] = None) -> PreflightItem:
    """Checks dataset validity — file exists and is parseable JSONL."""
    if not dataset_path:
        return PreflightItem(check="dataset", status="UNKNOWN", detail="No dataset specified")

    if not os.path.exists(dataset_path):
        return PreflightItem(check="dataset", status="NOT_READY", detail=f"Dataset file not found: {dataset_path}")

    try:
        import json
        with open(dataset_path, "r", encoding="utf-8") as f:
            line_count = 0
            for line in f:
                line = line.strip()
                if line:
                    json.loads(line)  # Verify JSON parseable
                    line_count += 1
        return PreflightItem(check="dataset", status="READY", detail=f"Valid JSONL with {line_count} records")
    except json.JSONDecodeError as e:
        return PreflightItem(check="dataset", status="NOT_READY", detail=f"Invalid JSONL: {e}")
    except Exception as e:
        return PreflightItem(check="dataset", status="NOT_READY", detail=f"Dataset check error: {e}")


def _check_base_model(base_model: Optional[str] = None) -> PreflightItem:
    """Checks base model availability — local path exists or HF Hub reachable."""
    if not base_model:
        return PreflightItem(check="base_model", status="UNKNOWN", detail="No base model specified")

    # If it looks like a local path
    if os.path.exists(base_model):
        return PreflightItem(check="base_model", status="READY", detail=f"Local model found at {base_model}")

    # Otherwise check HuggingFace Hub reachability
    try:
        import requests
        url = f"https://huggingface.co/api/models/{base_model}"
        resp = requests.head(url, timeout=5, allow_redirects=True)
        if resp.status_code == 200:
            return PreflightItem(check="base_model", status="READY", detail=f"Model '{base_model}' available on HuggingFace Hub")
        return PreflightItem(check="base_model", status="NOT_READY", detail=f"Model '{base_model}' not found on HuggingFace Hub (HTTP {resp.status_code})")
    except ImportError:
        return PreflightItem(check="base_model", status="UNKNOWN", detail="requests not installed — cannot verify model availability")
    except Exception as e:
        return PreflightItem(check="base_model", status="NOT_READY", detail=f"Model check error: {e}")


def run_preflight(
    base_model: Optional[str] = None,
    dataset_path: Optional[str] = None,
) -> PreflightResult:
    """
    Runs ALL pre-flight checks and returns the combined result.
    overall_ready is True only if all items are READY or UNKNOWN.
    """
    from datetime import datetime, timezone

    items: List[PreflightItem] = [
        _check_python(),
        _check_torch(),
        _check_cuda(),
        _check_gpu(),
        _check_vram(),
        _check_package("transformers", "Transformers"),
        _check_package("peft", "PEFT"),
        _check_package("trl", "TRL"),
        _check_disk(),
        _check_dataset(dataset_path),
        _check_base_model(base_model),
    ]

    # overall_ready: all items must be READY or UNKNOWN (not NOT_READY)
    overall_ready = all(item.status != "NOT_READY" for item in items)

    return PreflightResult(
        overall_ready=overall_ready,
        items=items,
        checked_at=datetime.now(timezone.utc).isoformat(),
    )
