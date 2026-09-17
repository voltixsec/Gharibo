"""
GHARIBO EXP-002 governed supervised-fine-tuning contract.

This module is the single source of truth for how a governed Gold record becomes
a supervised training example. It exists because GHARIBO-exp-001 was closed as
non-promotable (DEC-0048): its 512-token window placed the assistant Gold payload
outside the effective training window in 640/640 TRAIN and 80/80 VALIDATION
examples, and it trained on raw text with no completion-only loss at all.

Four things are pinned here, and all four are asserted rather than assumed:

1. ROLE CONTRACT — the governed conversation is `system -> user -> assistant`,
   exactly as the frozen Gold v0.1 dataset declares it. (For the gpt-oss chat
   template a leading `system` and a leading `developer` message render to
   byte-identical text, so preserving the dataset's own role keeps the contract
   faithful without changing the rendered representation.)

2. CHAT TEMPLATE — the governed template is the identity base model's own
   template, pinned by sha256. It is SET explicitly on the tokenizer instead of
   inherited from the loader repository, because the loader repository ships a
   patched template that ends the final assistant message with `<|end|>` where
   the identity template ends it with `<|return|>`. `<|return|>` is the
   unambiguous end-of-final-message marker, so it is the one that makes the
   final-channel contract deterministic.

3. DETERMINISM — the template injects a "Current date:" line into the system
   header via `strftime_now`. That is overridden with a pinned constant so the
   rendered representation is reproducible across training and inference.

4. LOSS CONTRACT — assistant-only supervision is implemented as an explicit,
   deterministic label mask (every non-assistant position is set to -100), not
   as a version-dependent trainer default. The mask is derived from a
   token-prefix proof, so a record whose geometry cannot be proven is rejected
   rather than silently trained.

Nothing in this module reads the consumed TEST split.
"""

from __future__ import annotations

import hashlib
from typing import Any, Sequence

# ---------------------------------------------------------------------------
# Governed constants
# ---------------------------------------------------------------------------

#: sha256 of `apps/web/lib/workers/kaggle/governed-chat-template.jinja`, which is
#: byte-identical to `chat_template.jinja` at `openai/gpt-oss-20b`
#: revision 6cee5e81ee83917806bbde320786a8fb61efebee.
GOVERNED_CHAT_TEMPLATE_SHA256 = (
    "a4c9919cbbd4acdd51ccffe22da049264b1b73e59055fa58811a99efbd7c8146"
)

#: The identity base model whose template is governed.
GOVERNED_TEMPLATE_SOURCE = {
    "repoId": "openai/gpt-oss-20b",
    "revision": "6cee5e81ee83917806bbde320786a8fb61efebee",
    "file": "chat_template.jinja",
}

#: Reasoning effort written into the template's system header.
GOVERNED_REASONING_EFFORT = "medium"

#: Pinned value for the template's `strftime_now`, removing date nondeterminism.
GOVERNED_SYSTEM_DATE = "2026-09-15"

#: The canonical role sequence the governed dataset declares.
GOVERNED_ROLE_SEQUENCE = "system -> user -> assistant"

#: The canonical Harmony channel the supervised answer must occupy.
GOVERNED_FINAL_CHANNEL = "final"

#: The unambiguous end-of-final-message marker the identity template emits.
GOVERNED_TERMINATOR = "<|return|>"

#: Token id substituted for every position that must not contribute to loss.
IGNORE_INDEX = -100


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Governed template application
# ---------------------------------------------------------------------------

class GovernedTemplateError(RuntimeError):
    """Raised when the governed representation cannot be proven."""


def install_governed_template(tokenizer, template_text: str) -> str:
    """Sets the governed chat template on `tokenizer` and verifies its hash.

    The loader repository (unsloth's 4-bit build) ships a patched template.
    Assigning the governed template explicitly means the trained representation
    cannot drift with a third-party repository. Fail-closed on hash mismatch.
    """
    actual = sha256_text(template_text)
    if actual != GOVERNED_CHAT_TEMPLATE_SHA256:
        raise GovernedTemplateError(
            "governed chat template sha256 mismatch: expected %s, got %s"
            % (GOVERNED_CHAT_TEMPLATE_SHA256, actual)
        )
    tokenizer.chat_template = template_text
    if sha256_text(tokenizer.chat_template) != GOVERNED_CHAT_TEMPLATE_SHA256:
        raise GovernedTemplateError("tokenizer did not retain the governed template")
    return actual


def _strftime_now(_fmt: str) -> str:
    """Pinned replacement for the template's nondeterministic `strftime_now`."""
    return GOVERNED_SYSTEM_DATE


def render_governed(
    tokenizer,
    messages: Sequence[dict],
    add_generation_prompt: bool,
) -> str:
    """Renders `messages` under the fully pinned governed contract."""
    return tokenizer.apply_chat_template(
        list(messages),
        tokenize=False,
        add_generation_prompt=add_generation_prompt,
        reasoning_effort=GOVERNED_REASONING_EFFORT,
        strftime_now=_strftime_now,
    )


def encode(tokenizer, text: str) -> list[int]:
    return tokenizer(text, add_special_tokens=False)["input_ids"]


# ---------------------------------------------------------------------------
# Role contract
# ---------------------------------------------------------------------------

def governed_messages(record: dict) -> list[dict]:
    """Extracts the governed message list from a Gold record, fail-closed.

    Enforces the governed shape: a single leading `system` turn, then a `user`
    turn, then exactly one `assistant` turn. Content is never mutated.
    """
    raw = record.get("messages")
    if not isinstance(raw, list) or not raw:
        raise GovernedTemplateError("record has no non-empty messages[]")

    messages: list[dict] = []
    for index, message in enumerate(raw):
        if not isinstance(message, dict):
            raise GovernedTemplateError("messages[%d] is not an object" % index)
        role = message.get("role")
        content = message.get("content")
        if not isinstance(role, str) or not role:
            raise GovernedTemplateError("messages[%d].role invalid" % index)
        if not isinstance(content, str):
            raise GovernedTemplateError("messages[%d].content invalid" % index)
        out: dict[str, Any] = {"role": role, "content": content}
        if message.get("channel"):
            out["channel"] = message["channel"]
        messages.append(out)

    roles = [m["role"] for m in messages]
    if roles != ["system", "user", "assistant"]:
        raise GovernedTemplateError(
            "governed role contract violated: got %r, expected %r"
            % (" -> ".join(roles), GOVERNED_ROLE_SEQUENCE)
        )
    return messages


# ---------------------------------------------------------------------------
# Assistant span + label mask
# ---------------------------------------------------------------------------

def compute_assistant_span(tokenizer, messages: Sequence[dict]) -> dict[str, Any]:
    """Derives the supervised assistant span from a token-prefix proof.

    The span is `[len(prompt_ids), len(full_ids))` where `prompt_ids` is the
    render of the non-assistant prefix with a generation prompt appended (exactly
    what inference sees) and `full_ids` is the render of the whole conversation.

    The span is only accepted when `prompt_ids` is a genuine prefix of
    `full_ids`. Any other outcome is a hard failure: it means the assistant
    target cannot be located, which is precisely the EXP-001 defect class.
    """
    first_assistant = next(
        (i for i, m in enumerate(messages) if m["role"] == "assistant"), None
    )
    if first_assistant is None:
        raise GovernedTemplateError("no assistant turn to supervise")

    prompt_ids = encode(
        tokenizer, render_governed(tokenizer, messages[:first_assistant], True)
    )
    full_ids = encode(tokenizer, render_governed(tokenizer, messages, False))

    if len(prompt_ids) >= len(full_ids):
        raise GovernedTemplateError(
            "prompt render (%d) is not shorter than full render (%d)"
            % (len(prompt_ids), len(full_ids))
        )
    if full_ids[: len(prompt_ids)] != prompt_ids:
        raise GovernedTemplateError(
            "prompt is not a token prefix of the full render; the assistant span "
            "cannot be located deterministically"
        )

    start, end = len(prompt_ids), len(full_ids)
    return {
        "inputIds": full_ids,
        "assistantStart": start,
        "assistantEnd": end,
        "promptTokens": start,
        "supervisedTokens": end - start,
    }


def build_supervised_example(tokenizer, record: dict) -> dict[str, Any]:
    """Builds one fully masked training example from a governed Gold record.

    Returns `input_ids`, `attention_mask` and `labels`, where `labels` is the
    token id everywhere inside the assistant span and `-100` everywhere else.
    """
    messages = governed_messages(record)
    span = compute_assistant_span(tokenizer, messages)

    input_ids = span["inputIds"]
    start, end = span["assistantStart"], span["assistantEnd"]

    labels = [IGNORE_INDEX] * len(input_ids)
    labels[start:end] = input_ids[start:end]

    supervised = sum(1 for value in labels if value != IGNORE_INDEX)
    if supervised == 0:
        raise GovernedTemplateError(
            "zero supervised assistant tokens — refusing to emit a training row"
        )
    if supervised != span["supervisedTokens"]:
        raise GovernedTemplateError(
            "supervised token count %d does not match the proven span %d"
            % (supervised, span["supervisedTokens"])
        )

    return {
        "input_ids": input_ids,
        "attention_mask": [1] * len(input_ids),
        "labels": labels,
        "assistant_start": start,
        "assistant_end": end,
        "supervised_tokens": supervised,
        "rendered_tokens": len(input_ids),
    }


def verify_example_mask(example: dict[str, Any]) -> dict[str, Any]:
    """Independently re-checks a built example against the loss contract."""
    input_ids = example["input_ids"]
    labels = example["labels"]
    start = example["assistant_start"]
    end = example["assistant_end"]

    checks = {
        "lengthsAgree": len(input_ids) == len(labels),
        "promptMasked": all(v == IGNORE_INDEX for v in labels[:start]),
        "assistantSupervised": all(
            labels[i] == input_ids[i] for i in range(start, end)
        ),
        "assistantNonEmpty": end > start,
        "supervisedTokensPositive": sum(
            1 for v in labels if v != IGNORE_INDEX
        ) > 0,
        "tailSupervised": labels[-1] != IGNORE_INDEX,
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "supervisedTokens": sum(1 for v in labels if v != IGNORE_INDEX),
        "maskedTokens": sum(1 for v in labels if v == IGNORE_INDEX),
    }


# ---------------------------------------------------------------------------
# Collator
# ---------------------------------------------------------------------------

class AssistantOnlyCollator:
    """Pads pre-tokenised examples without ever unmasking a masked position.

    Deliberately NOT `DataCollatorForLanguageModeling`: that collator rebuilds
    `labels` from `input_ids`, which would erase the assistant-only mask. This
    collator pads `input_ids` with the pad token, pads `attention_mask` with 0,
    and pads `labels` with -100 — so padding can never contribute to loss.
    """

    def __init__(self, pad_token_id: int, label_pad_token_id: int = IGNORE_INDEX):
        if pad_token_id is None:
            raise GovernedTemplateError("a pad token id is required")
        self.pad_token_id = int(pad_token_id)
        self.label_pad_token_id = int(label_pad_token_id)

    def __call__(self, features: Sequence[dict]) -> dict[str, Any]:
        import torch

        if not features:
            raise GovernedTemplateError("empty batch")

        width = max(len(f["input_ids"]) for f in features)
        input_ids, attention_mask, labels = [], [], []

        for feature in features:
            ids = list(feature["input_ids"])
            mask = list(feature.get("attention_mask", [1] * len(ids)))
            lab = list(feature["labels"])

            if not (len(ids) == len(mask) == len(lab)):
                raise GovernedTemplateError(
                    "input_ids/attention_mask/labels length mismatch in a batch row"
                )

            pad = width - len(ids)
            input_ids.append(ids + [self.pad_token_id] * pad)
            attention_mask.append(mask + [0] * pad)
            labels.append(lab + [self.label_pad_token_id] * pad)

        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_mask, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }


# ---------------------------------------------------------------------------
# Batch-level loss contract proof
# ---------------------------------------------------------------------------

def assert_batch_loss_contract(
    batch: dict[str, Any],
    rows: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    """Proves, on a real collated batch, that the loss contract holds.

    Checks the batch tensor itself, not the pre-collation examples:
      - every masked position is still -100 after padding,
      - every supervised position matches its input id,
      - every row still has at least one supervised token,
      - no padding position contributes to loss.
    """
    labels = batch["labels"]
    input_ids = batch["input_ids"]
    attention_mask = batch["attention_mask"]

    checks = {
        "labelsAre2d": labels.dim() == 2,
        "batchRowsMatch": int(labels.shape[0]) == len(rows),
        "shapesAgree": tuple(labels.shape) == tuple(input_ids.shape) == tuple(
            attention_mask.shape
        ),
        "everyRowHasSupervision": bool(
            (labels != IGNORE_INDEX).any(dim=1).all().item()
        ),
        "supervisedMatchInput": bool(
            (labels[labels != IGNORE_INDEX] == input_ids[labels != IGNORE_INDEX])
            .all()
            .item()
        ),
        "paddingMasked": bool(
            (labels[attention_mask == 0] == IGNORE_INDEX).all().item()
        ),
        "paddingNotSupervised": bool(
            (attention_mask[labels != IGNORE_INDEX] == 1).all().item()
        ),
    }

    per_row_supervised = (labels != IGNORE_INDEX).sum(dim=1).tolist()
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "perRowSupervised": per_row_supervised,
        "totalSupervised": int((labels != IGNORE_INDEX).sum().item()),
        "totalMasked": int((labels == IGNORE_INDEX).sum().item()),
    }
