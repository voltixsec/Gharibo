"""Render the accepted tokenizer's chat template exactly as the serving code does.

Proves what system message the model actually receives. This is evidence, not a
change: the template is rendered read-only with the same arguments
`TransformersBackend.generate` passes (no `tools`, no `builtin_tools`).
"""
import io
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone

from jinja2 import Environment
from jinja2.sandbox import ImmutableSandboxedEnvironment

# Resolved relative to this file so the script is not tied to one machine; override
# with CHAT_TEMPLATE=/path/to/chat_template.jinja if the snapshot moves.
_REPO = Path(__file__).resolve().parents[2]
TEMPLATE = os.environ.get(
    "CHAT_TEMPLATE",
    str(_REPO / "models" / "weights" / "exp002-tokenizer-unsloth" / "chat_template.jinja"),
)

env = ImmutableSandboxedEnvironment(trim_blocks=True, lstrip_blocks=True)
template = env.from_string(io.open(TEMPLATE, encoding="utf-8").read())


def strftime_now(fmt):
    return datetime.now(timezone.utc).strftime(fmt)


# Exactly what app/model_backend.py passes. Nothing else.
rendered = template.render(
    messages=[{"role": "user", "content": "Hello"}],
    add_generation_prompt=True,
    reasoning_effort="medium",
    strftime_now=strftime_now,
)

print("=" * 78)
print("RENDERED PROMPT (first 1200 chars)")
print("=" * 78)
print(rendered[:1200])
print("=" * 78)

system = rendered.split("<|end|>")[0]

checks = [
    ("declares a '# Tools' section", "# Tools" in rendered),
    ("declares a browser tool namespace", "namespace browser" in rendered),
    ("declares a python tool namespace", "namespace python" in rendered),
    ("mentions 'builtin_tools' in the output", "builtin_tools" in rendered),
    ("claims a ChatGPT / OpenAI identity", "ChatGPT" in rendered or "OpenAI" in rendered),
    ("mentions images/vision", re.search(r"\b(image|vision|picture)s?\b", rendered, re.I) is not None),
]

print("FINDINGS")
for label, hit in checks:
    print(f"  {'YES' if hit else 'no ':>3}  {label}")

print()
print("System message sent to the model:")
print("-" * 78)
print(system.replace("<|start|>system<|message|>", "").strip()[:700])
print("-" * 78)
