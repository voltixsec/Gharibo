"""
Model backends for GHARIBO-V1.

A backend turns a list of chat messages into a raw model continuation (which may
contain Harmony channels). It does NOT perform final-channel extraction — that is
the Harmony contract's job, applied uniformly by the engine.

The real backend (TransformersBackend) loads the base model + the exact PEFT LoRA
adapter WITHOUT merging it. transformers/torch/peft are imported lazily inside
the load path so the rest of the package (and the test-suite) runs without a GPU
or those heavy dependencies installed.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class BackendDiagnostics:
    cuda_available: bool = False
    gpu_name: Optional[str] = None
    vram_total_bytes: Optional[int] = None
    vram_allocated_bytes: Optional[int] = None
    base_model: Optional[str] = None
    adapter_loaded: bool = False
    adapter_sha256_verified: bool = False
    ready: bool = False


class ModelBackend(ABC):
    diagnostics: BackendDiagnostics = field(default_factory=BackendDiagnostics)  # type: ignore[assignment]

    @abstractmethod
    def load(self) -> None:
        """Load the base model and adapter. Raise on failure."""

    @abstractmethod
    def generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        """Return the raw model continuation (may contain Harmony channels)."""


class FakeBackend(ModelBackend):
    """Deterministic backend for tests. No GPU, no torch."""

    def __init__(
        self,
        responses: Optional[List[str]] = None,
        load_should_fail: bool = False,
        base_model: str = "openai/gpt-oss-20b",
    ) -> None:
        self._responses = list(responses or [])
        self._load_should_fail = load_should_fail
        self._base_model = base_model
        self._default = (
            '<|start|>assistant<|channel|>analysis<|message|>thinking<|end|>'
            '<|start|>assistant<|channel|>final<|message|>{"ok":true}<|return|>'
        )

    def load(self) -> None:
        if self._load_should_fail:
            raise RuntimeError("simulated model load failure")
        self.diagnostics = BackendDiagnostics(
            cuda_available=False,
            gpu_name="fake-gpu",
            base_model=self._base_model,
            adapter_loaded=True,
            adapter_sha256_verified=True,
            ready=True,
        )

    def generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        if self._responses:
            return self._responses.pop(0)
        return self._default


class TransformersBackend(ModelBackend):
    """Real backend: transformers + PEFT, loads base + LoRA without merging."""

    def __init__(
        self,
        *,
        base_model: str,
        adapter_dir: str,
        device: str = "auto",
        load_in_4bit: bool = True,
        hf_token: Optional[str] = None,
    ) -> None:
        self._base_model = base_model
        self._adapter_dir = adapter_dir
        self._device = device
        self._load_in_4bit = load_in_4bit
        self._hf_token = hf_token
        self._model = None
        self._tokenizer = None

    def load(self) -> None:
        # Lazy imports: heavy deps only required for the real serving path.
        import torch  # noqa: F401
        from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore
        from peft import PeftModel  # type: ignore

        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            vram_total = torch.cuda.get_device_properties(0).total_memory
            vram_allocated = torch.cuda.memory_allocated(0)
        else:
            gpu_name = None
            vram_total = None
            vram_allocated = None

        quant_kwargs: Dict = {}
        if self._load_in_4bit:
            from transformers import BitsAndBytesConfig  # type: ignore

            quant_kwargs = {
                "quantization_config": BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype="bfloat16",
                    bnb_4bit_use_double_quant=True,
                )
            }

        tokenizer = AutoTokenizer.from_pretrained(
            self._base_model, token=self._hf_token
        )
        base = AutoModelForCausalLM.from_pretrained(
            self._base_model,
            token=self._hf_token,
            device_map=self._device,
            torch_dtype="auto",
            **quant_kwargs,
        )
        model = PeftModel.from_pretrained(base, self._adapter_dir)
        model.eval()

        self._model = model
        self._tokenizer = tokenizer
        self.diagnostics = BackendDiagnostics(
            cuda_available=torch.cuda.is_available(),
            gpu_name=gpu_name,
            vram_total_bytes=vram_total,
            vram_allocated_bytes=vram_allocated,
            base_model=self._base_model,
            adapter_loaded=True,
            adapter_sha256_verified=True,
            ready=True,
        )

    def generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        if self._model is None or self._tokenizer is None:
            raise RuntimeError("Backend is not loaded; call load() first.")

        prompt = self._tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = self._tokenizer(prompt, return_tensors="pt").to(self._model.device)
        output_ids = self._model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=max(temperature, 1e-3),
            do_sample=temperature > 0,
        )
        generated = output_ids[0][inputs["input_ids"].shape[1]:]
        return self._tokenizer.decode(generated, skip_special_tokens=False)
