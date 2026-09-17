#!/usr/bin/env python3
"""
EXP-002 token-window measurement (TRAIN + VALIDATION only).

Purpose
-------
DEC-0048 closed GHARIBO-exp-001 as non-promotable: the 512-token SFT window
excluded the assistant Gold payload from 640/640 TRAIN and 80/80 VALIDATION
examples. This script measures, from TRAIN and VALIDATION ONLY, the real token
geometry of the governed Gold dataset under an explicitly declared role
contract, so the EXP-002 context length can be chosen from evidence instead of
assumption.

Hard rules enforced here
------------------------
1. TEST is never opened. The split files are read by explicit name and the
   script asserts that no path it opens resolves to `test.jsonl`.
2. Every number is measured, never estimated or rounded up.
3. The assistant span is located by a *token-prefix* proof, not by string
   search: the prompt render (`add_generation_prompt=True` over the
   non-assistant prefix) must be an exact token prefix of the full render.
   A record whose prefix property fails is reported as a render failure and
   counted, never silently skipped.
4. Output is deterministic: same inputs -> byte-identical JSON.

Usage
-----
    python scripts/exp002/measure_token_window.py \
        --dataset-dir data/processed/gharibo-research-gold-v0.1 \
        --tokenizer openai/gpt-oss-20b \
        --role-contract governed-system \
        --out data/derived/exp002/token-window.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import sys
from typing import Any

FORBIDDEN_SPLIT = "test.jsonl"

# Context lengths that are candidates for the EXP-002 effective window. The
# smallest one that fully contains every assistant span is the chosen length;
# the larger ones are reported so the choice is auditable.
CANDIDATE_CONTEXTS = (1024, 1536, 2048, 2560, 3072, 3584, 4096)

ROLE_CONTRACTS = {
    # Preserve the governed Gold v0.1 representation verbatim.
    "governed-system": None,
    # The representation the accepted qualification harness and the evaluation
    # kernel already use: the standing instruction becomes a `developer` turn.
    "developer": {"system": "developer"},
}

# Representations of the user payload. The governed record carries a
# `processSteps` array inside the user JSON that restates, almost verbatim, the
# PROCESS list already present in the standing instruction (system turn). It is
# a constant-size, task-preserving duplication, so it is measured separately
# rather than assumed to be free.
REPRESENTATIONS = ("verbatim", "strip-process-steps")


# ---------------------------------------------------------------------------
# governed split loading
# ---------------------------------------------------------------------------

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def split_hash(lines: list[bytes]) -> str:
    """The governed split-hash convention: sha256 of sorted per-line hashes."""
    per_line = sorted(sha256_bytes(line.rstrip(b"\n")) for line in lines if line.strip())
    return sha256_bytes("\n".join(per_line).encode("utf-8"))


def load_split(dataset_dir: pathlib.Path, name: str) -> tuple[list[dict], dict[str, Any]]:
    """Loads one governed split by explicit filename. Refuses to open TEST."""
    path = (dataset_dir / f"{name}.jsonl").resolve()

    if path.name == FORBIDDEN_SPLIT:
        raise RuntimeError(
            "REFUSING to open the consumed TEST split (%s). EXP-002 measurement "
            "policy permits TRAIN and VALIDATION only." % path
        )

    raw = path.read_bytes()
    lines = raw.splitlines()

    records = []
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        record = json.loads(line)
        if not isinstance(record.get("messages"), list) or not record["messages"]:
            raise RuntimeError("%s line %d: missing non-empty messages[]" % (name, index))
        records.append(record)

    meta = {
        "file": f"{name}.jsonl",
        "rows": len(records),
        "splitHash": split_hash(lines),
        "fileSha256": sha256_bytes(raw),
        "fileBytes": len(raw),
    }
    return records, meta


# ---------------------------------------------------------------------------
# role contract
# ---------------------------------------------------------------------------

def project_messages(
    messages: list[dict],
    role_contract: str,
    representation: str,
) -> list[dict]:
    """Projects governed Gold messages onto the declared canonical contract.

    Only `role` is ever remapped, and only the redundant top-level
    `processSteps` key may be dropped. Every other byte of `content` passes
    through unchanged, so the governed dataset content is never mutated.
    """
    mapping = ROLE_CONTRACTS[role_contract]

    projected = []
    for index, message in enumerate(messages):
        role = message.get("role")
        content = message.get("content")
        if not isinstance(role, str) or not role:
            raise RuntimeError("messages[%d].role must be a non-empty string" % index)
        if not isinstance(content, str):
            raise RuntimeError("messages[%d].content must be a string" % index)

        out_role = mapping.get(role, role) if mapping else role

        if representation == "strip-process-steps" and role == "user":
            content = _strip_process_steps(content)

        out: dict[str, Any] = {"role": out_role, "content": content}
        # Harmony channel is preserved when the governed record declares one.
        if message.get("channel"):
            out["channel"] = message["channel"]
        projected.append(out)

    return projected


def _strip_process_steps(content: str) -> str:
    """Removes the redundant top-level `processSteps` key from a user payload.

    Returns the content unchanged when it is not a JSON object carrying a
    `processSteps` key, so a non-conforming record can never be silently
    mangled.
    """
    try:
        payload = json.loads(content)
    except (ValueError, TypeError):
        return content
    if not isinstance(payload, dict) or "processSteps" not in payload:
        return content
    payload.pop("processSteps")
    return json.dumps(payload, ensure_ascii=False, indent=2)


def role_sequence(messages: list[dict]) -> list[str]:
    seq = []
    for message in messages:
        if message.get("channel"):
            seq.append("%s/%s" % (message["role"], message["channel"]))
        else:
            seq.append(message["role"])
    return seq


# ---------------------------------------------------------------------------
# rendering + boundary proof
# ---------------------------------------------------------------------------

def render(tokenizer, messages: list[dict], generation_prompt: bool, governed: dict) -> str:
    return tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=generation_prompt,
        reasoning_effort=governed["reasoningEffort"],
        strftime_now=governed["strftimeNow"],
    )


def encode(tokenizer, text: str) -> list[int]:
    return tokenizer(text, add_special_tokens=False)["input_ids"]


def assistant_span(tokenizer, messages: list[dict], governed: dict) -> dict[str, Any]:
    """Locates the supervised assistant span by a token-prefix proof.

    `prompt`  = render of every message before the first assistant turn, with a
                generation prompt appended (this is what inference sees).
    `full`    = render of the whole conversation.

    The assistant span is `[len(prompt_tokens), len(full_tokens))` and is only
    accepted when `prompt_tokens` is a genuine token prefix of `full_tokens`.
    """
    first_assistant = next(
        (i for i, m in enumerate(messages) if m["role"] == "assistant"),
        None,
    )
    if first_assistant is None:
        return {"ok": False, "reason": "NO_ASSISTANT_TURN"}

    prefix_messages = messages[:first_assistant]
    prompt_text = render(tokenizer, prefix_messages, True, governed)
    full_text = render(tokenizer, messages, False, governed)

    prompt_tokens = encode(tokenizer, prompt_text)
    full_tokens = encode(tokenizer, full_text)

    if len(prompt_tokens) >= len(full_tokens):
        return {
            "ok": False,
            "reason": "PROMPT_NOT_SHORTER_THAN_FULL",
            "promptTokens": len(prompt_tokens),
            "fullTokens": len(full_tokens),
        }

    if full_tokens[: len(prompt_tokens)] != prompt_tokens:
        return {
            "ok": False,
            "reason": "PREFIX_TOKEN_PROPERTY_VIOLATED",
            "promptTokens": len(prompt_tokens),
            "fullTokens": len(full_tokens),
        }

    # The assistant answer text itself, rendered without the surrounding
    # template scaffolding, is the payload we intend to supervise.
    assistant_messages = messages[first_assistant:]
    content_tokens = sum(
        len(encode(tokenizer, m["content"])) for m in assistant_messages
    )

    return {
        "ok": True,
        "promptTokens": len(prompt_tokens),
        "fullTokens": len(full_tokens),
        "assistantStart": len(prompt_tokens),
        "assistantEnd": len(full_tokens),
        "supervisedTokens": len(full_tokens) - len(prompt_tokens),
        "assistantContentTokens": content_tokens,
    }


# ---------------------------------------------------------------------------
# statistics
# ---------------------------------------------------------------------------

def summarise(values: list[int]) -> dict[str, Any]:
    if not values:
        return {"count": 0}
    ordered = sorted(values)

    def pct(p: float) -> int:
        if len(ordered) == 1:
            return ordered[0]
        index = int(round((len(ordered) - 1) * p))
        return ordered[index]

    return {
        "count": len(ordered),
        "min": ordered[0],
        "max": ordered[-1],
        "mean": round(sum(ordered) / len(ordered), 4),
        "p50": pct(0.50),
        "p90": pct(0.90),
        "p95": pct(0.95),
        "p99": pct(0.99),
    }


def measure_split(
    tokenizer,
    records: list[dict],
    role_contract: str,
    representation: str,
    governed: dict,
    contexts: tuple[int, ...],
) -> dict[str, Any]:
    totals: list[int] = []
    starts: list[int] = []
    ends: list[int] = []
    supervised: list[int] = []
    contents: list[int] = []
    system_tokens: list[int] = []
    user_tokens: list[int] = []
    assistant_tokens: list[int] = []
    process_steps_tokens: list[int] = []

    render_failures: list[dict[str, Any]] = []
    sequences: dict[str, int] = {}
    visibility = {str(c): {"full": 0, "partial": 0, "zero": 0} for c in contexts}

    for index, record in enumerate(records):
        messages = project_messages(record["messages"], role_contract, representation)

        seq_key = " -> ".join(role_sequence(messages))
        sequences[seq_key] = sequences.get(seq_key, 0) + 1

        span = assistant_span(tokenizer, messages, governed)
        if not span["ok"]:
            render_failures.append({"index": index, "reason": span["reason"]})
            continue

        totals.append(span["fullTokens"])
        starts.append(span["assistantStart"])
        ends.append(span["assistantEnd"])
        supervised.append(span["supervisedTokens"])
        contents.append(span["assistantContentTokens"])

        for message in messages:
            n = len(encode(tokenizer, message["content"]))
            if message["role"] in ("system", "developer"):
                system_tokens.append(n)
            elif message["role"] == "user":
                user_tokens.append(n)
            elif message["role"] == "assistant":
                assistant_tokens.append(n)

        # How much of the user payload is the redundant `processSteps`
        # restatement of the system prompt's PROCESS list? Measured, not guessed.
        for message in messages:
            if message["role"] != "user":
                continue
            try:
                payload = json.loads(message["content"])
            except (ValueError, TypeError):
                continue
            steps = payload.get("processSteps")
            if isinstance(steps, list) and steps:
                baseline = len(encode(tokenizer, message["content"]))
                reduced = dict(payload)
                reduced.pop("processSteps", None)
                after = len(encode(tokenizer, json.dumps(reduced, ensure_ascii=False, indent=2)))
                process_steps_tokens.append(baseline - after)

        # Visibility of the assistant span under each candidate context length.
        start, end = span["assistantStart"], span["assistantEnd"]
        for context in contexts:
            bucket = visibility[str(context)]
            if start >= context:
                bucket["zero"] += 1
            elif end <= context:
                bucket["full"] += 1
            else:
                bucket["partial"] += 1

    return {
        "rows": len(records),
        "renderFailures": len(render_failures),
        "renderFailureDetail": render_failures[:10],
        "roleSequences": sequences,
        "renderedTokens": summarise(totals),
        "assistantStart": summarise(starts),
        "assistantEnd": summarise(ends),
        "supervisedTokens": summarise(supervised),
        "assistantContentTokens": summarise(contents),
        "promptOverheadTokens": summarise(system_tokens),
        "userPayloadTokens": summarise(user_tokens),
        "assistantMessageTokens": summarise(assistant_tokens),
        "redundantProcessStepsTokens": summarise(process_steps_tokens),
        "assistantVisibilityByContext": visibility,
    }


def choose_context(contexts: tuple[int, ...], per_split: dict[str, Any]) -> dict[str, Any]:
    """Smallest candidate context under which every assistant span is fully visible."""
    chosen = None
    for context in contexts:
        if all(
            split["assistantVisibilityByContext"][str(context)]["zero"] == 0
            and split["assistantVisibilityByContext"][str(context)]["partial"] == 0
            for split in per_split.values()
        ):
            chosen = context
            break
    return {
        "chosenContextLength": chosen,
        "rule": "smallest candidate context with zero partial and zero zero-visibility assistant spans across TRAIN and VALIDATION",
    }


# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--tokenizer", required=True)
    parser.add_argument("--role-contract", required=True, choices=sorted(ROLE_CONTRACTS))
    parser.add_argument(
        "--representation", required=True, choices=sorted(REPRESENTATIONS)
    )
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--splits",
        default="train,validation",
        help="Comma-separated split names to measure. `test` is always refused.",
    )
    parser.add_argument("--tokenizer-revision", default=None)
    parser.add_argument(
        "--governed-chat-template",
        required=True,
        help="Path to the governed chat template; its sha256 is asserted and recorded.",
    )
    parser.add_argument(
        "--governed-chat-template-sha256",
        required=True,
        help="Expected sha256 of the governed chat template. Fail-closed on mismatch.",
    )
    parser.add_argument("--reasoning-effort", default="medium")
    parser.add_argument(
        "--pin-date",
        required=True,
        help="Pinned value for the template's strftime_now, so the injected system "
        "header date is deterministic across training and inference.",
    )
    args = parser.parse_args()

    dataset_dir = pathlib.Path(args.dataset_dir)
    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    split_names = [s.strip() for s in args.splits.split(",") if s.strip()]
    if not split_names:
        raise SystemExit("no splits selected")
    if any(s == "test" for s in split_names):
        raise SystemExit("REFUSING: the consumed TEST split may not be measured for EXP-002.")

    print("EXP-002 token-window measurement")
    print("tokenizer     :", args.tokenizer)
    print("role contract :", args.role_contract)
    print("representation:", args.representation)
    print("splits        :", ", ".join(split_names), "  (TEST is NOT opened)")

    from transformers import AutoTokenizer
    import transformers
    import tokenizers

    template_path = pathlib.Path(args.governed_chat_template)
    template_text = template_path.read_text(encoding="utf-8")
    template_sha = sha256_bytes(template_text.encode("utf-8"))
    if template_sha != args.governed_chat_template_sha256:
        raise SystemExit(
            "FAIL CLOSED: governed chat template sha256 mismatch.\n"
            "  expected %s\n  actual   %s\n  file     %s"
            % (args.governed_chat_template_sha256, template_sha, template_path)
        )

    tokenizer = AutoTokenizer.from_pretrained(
        args.tokenizer, revision=args.tokenizer_revision
    )

    # The loader repository may ship a patched template (unsloth's build does).
    # The governed template is therefore SET explicitly rather than inherited,
    # so the trained representation cannot drift with a third-party repo.
    tokenizer.chat_template = template_text

    governed = {
        "reasoningEffort": args.reasoning_effort,
        "strftimeNow": (lambda _fmt, _d=args.pin_date: _d),
        "pinDate": args.pin_date,
    }

    # Proof that the pinned date actually reaches the rendered system header and
    # that the governed template is the one in force.
    probe = tokenizer.apply_chat_template(
        [{"role": "user", "content": "probe"}],
        tokenize=False,
        add_generation_prompt=True,
        reasoning_effort=args.reasoning_effort,
        strftime_now=governed["strftimeNow"],
    )
    if ("Current date: " + args.pin_date) not in probe:
        raise SystemExit("FAIL CLOSED: pinned date did not reach the system header.")

    tokenizer_identity = {
        "requestedId": args.tokenizer,
        "revision": args.tokenizer_revision,
        "resolvedNameOrPath": str(tokenizer.name_or_path),
        "class": type(tokenizer).__name__,
        "vocabSize": int(tokenizer.vocab_size),
        "modelMaxLength": int(getattr(tokenizer, "model_max_length", 0) or 0),
        "governedChatTemplateSha256": template_sha,
        "governedChatTemplatePath": template_path.as_posix(),
        "governedChatTemplateBytes": len(template_text.encode("utf-8")),
        "reasoningEffort": args.reasoning_effort,
        "pinnedSystemDate": args.pin_date,
        "transformersVersion": transformers.__version__,
        "tokenizersVersion": tokenizers.__version__,
    }

    split_names = [s.strip() for s in args.splits.split(",") if s.strip()]
    if not split_names:
        raise SystemExit("no splits selected")
    if any(s == "test" for s in split_names):
        raise SystemExit("REFUSING: the consumed TEST split may not be measured for EXP-002.")

    per_split: dict[str, Any] = {}
    split_meta: dict[str, Any] = {}

    for name in split_names:
        records, meta = load_split(dataset_dir, name)
        split_meta[name] = meta
        print("loaded %-10s rows=%d splitHash=%s" % (name, meta["rows"], meta["splitHash"][:16]))
        per_split[name] = measure_split(
            tokenizer,
            records,
            args.role_contract,
            args.representation,
            governed,
            CANDIDATE_CONTEXTS,
        )

    decision = choose_context(CANDIDATE_CONTEXTS, per_split)

    artifact = {
        "artifactKind": "GHARIBO_EXP002_TOKEN_WINDOW_MEASUREMENT",
        "schemaVersion": "1.0.0",
        "roleContract": args.role_contract,
        "roleContractProjection": ROLE_CONTRACTS[args.role_contract] or "verbatim",
        "representation": args.representation,
        "testAccessed": False,
        "testPolicy": "TRAIN and VALIDATION only; test.jsonl is never opened by this script.",
        "tokenizer": tokenizer_identity,
        "candidateContexts": list(CANDIDATE_CONTEXTS),
        "splits": split_meta,
        "measurements": per_split,
        "contextDecision": decision,
    }

    # Deterministic serialisation: sorted keys, LF, trailing newline.
    text = json.dumps(artifact, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    out_path.write_text(text, encoding="utf-8")

    print("")
    print("=== decision ===")
    print("chosen context length:", decision["chosenContextLength"])
    for name in split_names:
        m = per_split[name]
        print(
            "%-10s rendered max=%d  assistantStart max=%d  assistantEnd max=%d  supervised min=%d"
            % (
                name,
                m["renderedTokens"]["max"],
                m["assistantStart"]["max"],
                m["assistantEnd"]["max"],
                m["supervisedTokens"]["min"],
            )
        )
    print("wrote", out_path)
    print("artifact sha256:", sha256_bytes(text.encode("utf-8")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
