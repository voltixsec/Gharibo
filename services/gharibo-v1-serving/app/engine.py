"""
GHARIBO-V1 serving engine.

Owns the lifecycle: verify adapter -> load backend -> ready. Exposes the health
state and the chat path. The final-channel extraction is applied uniformly here,
so every answer leaving the engine is Harmony-safe.
"""

import os
import tempfile
from dataclasses import dataclass, field
from typing import List, Optional

from . import adapter_verify, identity
from .config import ServingConfig
from .harmony_final import extract_v1_answer
from .model_backend import BackendDiagnostics, ModelBackend, TransformersBackend


class EngineState:
    LOADING = "loading"
    READY = "ready"
    UNHEALTHY = "unhealthy"


@dataclass
class HealthReport:
    status: str
    model_id: str
    base_model_serving: str
    adapter_sha256_verified: Optional[str]
    adapter_type: str
    context: int
    diagnostics: BackendDiagnostics
    error: Optional[str] = None


class ServingEngine:
    def __init__(self, config: ServingConfig, backend: Optional[ModelBackend] = None) -> None:
        self.config = config
        self.state = EngineState.LOADING
        self.error: Optional[str] = None
        self.adapter_sha256: Optional[str] = None
        self.base_model_serving: str = config.base_model_override or (
            identity.DEFAULT_TRAINED_BASE_MODEL
        )
        self._backend = backend
        self._workdir = tempfile.mkdtemp(prefix="gharibo-v1-")
        self.diagnostics = BackendDiagnostics()

    @property
    def backend(self) -> ModelBackend:
        if self._backend is None:
            self._backend = TransformersBackend(
                base_model=self.base_model_serving,
                adapter_dir="",  # set after verification
                device=self.config.device,
                load_in_4bit=self.config.load_in_4bit,
                hf_token=self.config.hf_token,
            )
        return self._backend

    def load(self) -> None:
        """Verify the adapter, resolve the base, and load the backend.

        Any failure transitions the engine to UNHEALTHY; it never serves an
        unverified or partially loaded adapter.
        """
        try:
            loc = adapter_verify.resolve_and_verify(
                adapter_path=self.config.adapter_path,
                adapter_url=self.config.adapter_url,
                expected_sha256=self.config.expected_adapter_sha256,
                adapter_filename=self.config.adapter_filename,
                hf_token=self.config.hf_token,
                workdir=self._workdir,
            )
            self.adapter_sha256 = loc.actual_sha256

            # Resolve the exact base the adapter was trained on (do not re-base).
            trained_base = adapter_verify.read_adapter_base_model(loc.directory)
            if self.config.base_model_override:
                self.base_model_serving = self.config.base_model_override
            elif trained_base:
                self.base_model_serving = trained_base

            if self._backend is None:
                self._backend = TransformersBackend(
                    base_model=self.base_model_serving,
                    adapter_dir=loc.directory,
                    device=self.config.device,
                    load_in_4bit=self.config.load_in_4bit,
                    hf_token=self.config.hf_token,
                )
            else:
                # Test backend: point it at the verified directory.
                self._backend._adapter_dir = loc.directory  # type: ignore[attr-defined]

            self._backend.load()
            self.diagnostics = self._backend.diagnostics
            self.state = EngineState.READY
        except Exception as exc:  # noqa: BLE001 - fail closed on any load error
            self.state = EngineState.UNHEALTHY
            self.error = str(exc)

    def health(self) -> HealthReport:
        return HealthReport(
            status=self.state,
            model_id=self.config.model_id,
            base_model_serving=self.base_model_serving,
            adapter_sha256_verified=self.adapter_sha256,
            adapter_type=identity.accepted_identity(
                self.base_model_serving
            ).adapter_type,
            context=identity.CONTEXT_LENGTH,
            diagnostics=self.diagnostics,
            error=self.error,
        )

    def chat(
        self,
        messages: List[dict],
        temperature: float,
        max_tokens: int,
    ) -> dict:
        if self.state != EngineState.READY:
            raise RuntimeError("Engine is not ready")
        raw = self.backend.generate(messages, temperature, max_tokens)
        return extract_v1_answer({"choices": [{"message": {"content": raw}}]})
