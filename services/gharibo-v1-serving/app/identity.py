"""
GHARIBO-V1 accepted model identity.

This is the single authoritative source for the model identity that the service
exposes. It is grounded in:

  - data/derived/exp002/production-integrity.json (verdict PASS)
  - governance/DEC-0059-v1-promotion.json

The adapter is a PEFT LoRA over gpt-oss-20b. The concrete base it was trained
and validated on is the unsloth 4-bit variant; loading the adapter on any other
base would silently change model identity, which is forbidden (see README /
rule 4). Therefore the DEFAULT base for serving IS the adapter's own trained
base, read from adapter_config.json unless GHARIBO_BASE_MODEL overrides it.
"""

from dataclasses import dataclass

# The served model identity (what clients ask for and what /health reports).
ACCEPTED_MODEL_ID = "GHARIBO-V1"

# Published identity (governed). The concrete serving base may differ (4-bit)
# because that is the only base on which these exact adapter weights are valid.
ACCEPTED_BASE_MODEL_PUBLISHED = "openai/gpt-oss-20b"

# The base the adapter was trained on. Used as the default serving base so the
# exact accepted adapter is loaded without merging or re-basing.
DEFAULT_TRAINED_BASE_MODEL = "unsloth/gpt-oss-20b-unsloth-bnb-4bit"

# Exact, immutable adapter identity (no weights are ever copied or altered).
ACCEPTED_ADAPTER_SHA256 = "5d192d843af72298f5080f4ebe9fd77e3b47fa6c1abf46064706d091b80f7c22"

ADAPTER_FILENAME = "adapter_model.safetensors"

# LoRA config carried by the accepted adapter (peft 0.20.0, r16 / alpha16).
ADAPTER_PEFT_TYPE = "LORA"
ADAPTER_LORA_R = 16
ADAPTER_LORA_ALPHA = 16

# Governed inference contract.
CONTEXT_LENGTH = 3072
DEFAULT_TEMPERATURE = 0.2
DEFAULT_MAX_TOKENS = 3072

# The only Harmony channel that may become an application answer.
FINAL_CHANNEL = "final"


@dataclass(frozen=True)
class ModelIdentity:
    model_id: str
    base_model_published: str
    base_model_serving: str
    adapter_sha256: str
    adapter_type: str
    context: int


def accepted_identity(base_model_serving: str) -> ModelIdentity:
    return ModelIdentity(
        model_id=ACCEPTED_MODEL_ID,
        base_model_published=ACCEPTED_BASE_MODEL_PUBLISHED,
        base_model_serving=base_model_serving,
        adapter_sha256=ACCEPTED_ADAPTER_SHA256,
        adapter_type="LoRA adapter over gpt-oss-20b (NOT merged)",
        context=CONTEXT_LENGTH,
    )
