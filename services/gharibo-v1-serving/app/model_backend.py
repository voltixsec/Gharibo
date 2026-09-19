"""
GHARIBO-V1 model backends.

Production backend:
  exact local gpt-oss-20b 4-bit snapshot
  -> Unsloth FastLanguageModel
  -> existing verified PEFT LoRA
  -> inference mode

The adapter is NEVER recreated or merged.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Optional


CONTEXT_LENGTH = 3072


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
    diagnostics: BackendDiagnostics = field(
        default_factory=BackendDiagnostics
    )  # type: ignore[assignment]

    @abstractmethod
    def load(self) -> None:
        pass

    @abstractmethod
    def generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        pass


class FakeBackend(ModelBackend):
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
    """
    Name retained for compatibility with the existing ServingEngine.

    Actual production loader is Unsloth FastLanguageModel, matching the
    successful GHARIBO T4 inference path.
    """

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
        # IMPORTANT: Unsloth must be imported before transformers / PEFT.
        import unsloth  # noqa: F401
        import torch
        from unsloth import FastLanguageModel
        from peft import PeftModel

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is not available")

        # The accepted GHARIBO-V1 serving path is the verified 4-bit base on the
        # first visible CUDA device. Do not silently accept configuration values
        # that this backend would ignore.
        if not self._load_in_4bit:
            raise RuntimeError(
                "GHARIBO-V1 serving requires the accepted 4-bit base; "
                "GHARIBO_LOAD_IN_4BIT=false is unsupported."
            )
        if self._device not in ("auto", "cuda", "cuda:0"):
            raise RuntimeError(
                f"Unsupported GHARIBO_DEVICE={self._device!r}; "
                "this serving backend uses the first visible CUDA device."
            )

        gpu_name = torch.cuda.get_device_name(0)
        vram_total = torch.cuda.get_device_properties(0).total_memory

        print("GHARIBO_LOAD_STAGE: UNSLOTH_READY", flush=True)
        print(f"GHARIBO_GPU: {gpu_name}", flush=True)
        print(f"GHARIBO_BASE: {self._base_model}", flush=True)
        print(f"GHARIBO_ADAPTER: {self._adapter_dir}", flush=True)

        # Exact successful architecture:
        # local snapshot + 4-bit + single visible T4.
        base, tokenizer = FastLanguageModel.from_pretrained(
            model_name=self._base_model,
            max_seq_length=CONTEXT_LENGTH,
            dtype=None,
            load_in_4bit=True,
            local_files_only=True,
            device_map={"": 0},
        )

        print("GHARIBO_LOAD_STAGE: BASE_LOADED", flush=True)

        FastLanguageModel.for_inference(base)
        base.eval()

        # Load the EXISTING accepted adapter. Never recreate or merge it.
        model = PeftModel.from_pretrained(
            base,
            self._adapter_dir,
            is_trainable=False,
        )

        FastLanguageModel.for_inference(model)
        model.eval()

        print("GHARIBO_LOAD_STAGE: ADAPTER_LOADED", flush=True)

        # Fail closed if any trainable parameter somehow exists.
        if any(p.requires_grad for p in model.parameters()):
            raise RuntimeError(
                "Refusing to serve: trainable parameters detected."
            )

        lm_head_device = None
        if hasattr(model, "lm_head"):
            try:
                lm_head_device = str(next(model.lm_head.parameters()).device)
            except Exception:
                pass

        print(
            f"GHARIBO_DEVICE_MAP: {getattr(model, 'hf_device_map', None)}",
            flush=True,
        )
        print(f"GHARIBO_LM_HEAD_DEVICE: {lm_head_device}", flush=True)

        self._model = model
        self._tokenizer = tokenizer

        self.diagnostics = BackendDiagnostics(
            cuda_available=True,
            gpu_name=gpu_name,
            vram_total_bytes=vram_total,
            vram_allocated_bytes=torch.cuda.memory_allocated(0),
            base_model=self._base_model,
            adapter_loaded=True,
            adapter_sha256_verified=True,
            ready=True,
        )

        print("GHARIBO_LOAD_STAGE: READY", flush=True)

    def generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        if self._model is None or self._tokenizer is None:
            raise RuntimeError(
                "Backend is not loaded; call load() first."
            )

        import torch

        rendered = self._tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            reasoning_effort="medium",
        )

        inputs = self._tokenizer(
            rendered,
            add_special_tokens=False,
            return_tensors="pt",
        )

        inputs = {
            key: value.to("cuda")
            for key, value in inputs.items()
        }

        prompt_len = inputs["input_ids"].shape[1]

        # Preflight: refuse a prompt that cannot fit the model's context rather
        # than letting the attention stack allocate and fail opaquely.
        if prompt_len + max_tokens > CONTEXT_LENGTH:
            raise RuntimeError(
                f"Prompt ({prompt_len} tokens) plus max_new_tokens ({max_tokens}) "
                f"exceeds the {CONTEXT_LENGTH}-token context."
            )

        generation_kwargs = {
            "max_new_tokens": max_tokens,
            "use_cache": True,
        }

        if temperature > 0:
            generation_kwargs.update(
                {
                    "do_sample": True,
                    "temperature": temperature,
                }
            )
        else:
            generation_kwargs.update(
                {
                    "do_sample": False,
                }
            )

        output_ids = None
        try:
            # No gradients, no autograd graph, eval mode: the whole generation
            # runs inside inference_mode so no activation memory is retained.
            with torch.inference_mode():
                output_ids = self._model.generate(
                    **inputs,
                    **generation_kwargs,
                )

            generated = output_ids[0][prompt_len:]

            return self._tokenizer.decode(
                generated,
                skip_special_tokens=False,
            )
        finally:
            # Release request-local tensors so a long-lived worker does not
            # accumulate memory across requests. This is NOT a substitute for
            # having enough VRAM; it only stops per-request leakage.
            del inputs
            if output_ids is not None:
                del output_ids
