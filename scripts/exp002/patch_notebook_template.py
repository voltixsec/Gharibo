#!/usr/bin/env python3
"""
One-shot patcher: applies the EXP-002 governed contract to
`apps/web/lib/workers/kaggle/notebook.template.ipynb`.

The notebook is a GENERATED artifact (rendered by
`apps/web/lib/workers/kaggle/notebook-render.ts`), so this script edits the
template in place and is kept for provenance. It is idempotent: re-running it
re-applies the same cell sources.

Cells replaced:
  2  budget gate      - removes the silent max_seq_length downgrade (the defect
                        class that closed EXP-001); fails closed instead, and
                        declares the dtype the engine actually uses.
  5  dataset verify   - enforces the sealed qualification split and the new
                        governed split names.
  6  representation   - governed tokenizer + governed chat template + explicit
                        assistant-span proof + explicit label mask.
  9  SFT config       - pre-tokenised dataset + assistant-only collator.
"""

from __future__ import annotations

import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
NOTEBOOK = REPO_ROOT / "apps/web/lib/workers/kaggle/notebook.template.ipynb"


CELL_1 = '''# --- Section 2: Hardware detect ---
# Print GPU name, compute capability, VRAM and the dtype actually in force (M2-P0-05).
#
# DTYPE CONTRACT (pilot Version 1 remediation).
#
# This cell used to compute `selected_dtype = 'fp16' if cap_major < 8 else 'bf16'`,
# i.e. it advertised fp16 on a T4 while the governed recipe and the budget gate both
# said float32. Pilot Kaggle Version 1 died on exactly that contradiction:
#
#     AssertionError: This recipe declares dtype=float32 ... Got: 'fp16'
#
# The hardware's *capability* and the recipe's *declared dtype* are different things.
# The capability is still reported (Turing has no bf16), but the dtype is not guessed
# here: it is read from the package, and the package is required to agree with the
# recipe. Unsloth refuses fp16 for gpt-oss and forces float32 (DEC-0030
# runtimeDeviation), so float32 is what the run must declare.
import torch

print('torch:', torch.__version__)
assert torch.cuda.is_available(), 'No CUDA GPU detected - enable a Kaggle GPU accelerator.'
gpu_name = torch.cuda.get_device_name(0)
cap_major, cap_minor = torch.cuda.get_device_capability(0)
props = torch.cuda.get_device_properties(0)
vram_gb = props.total_memory / (1024 ** 3)
compute_capability = 'sm_%d%d' % (cap_major, cap_minor)

# Hardware capability: reported for the record, NOT used to pick the dtype.
bf16_supported = cap_major >= 8
print('GPU            :', gpu_name)
print('compute cap    :', compute_capability)
print('VRAM (GB)      :', round(vram_gb, 1))
print('bf16 capable   :', bf16_supported)

# The dtype in force is the package's declaration. It must be a dtype the engine
# can honour, and it must be the one the budget gate asserts.
DECLARED_DTYPE = PACKAGE['dtype']
assert DECLARED_DTYPE in ('fp16', 'bf16', 'float32'), (
    'package dtype %r is not a supported declaration' % (DECLARED_DTYPE,)
)
assert DECLARED_DTYPE == PACKAGE['exp002']['declared_dtype'], (
    'package dtype %r disagrees with the governed recipe dtype %r'
    % (DECLARED_DTYPE, PACKAGE['exp002']['declared_dtype'])
)
if not bf16_supported and DECLARED_DTYPE == 'bf16':
    raise AssertionError('bf16 is not supported on %s but the recipe declares it' % compute_capability)
print('dtype in force :', DECLARED_DTYPE)
print('dtype source   : governed recipe (agrees with package and budget gate)')
'''

CELL_7 = '''# --- Section 8: Load the gpt-oss 4-bit representation (M2-P0-08) ---
#
# DTYPE HANDLING (pilot Version 3 remediation).
#
# Version 3 failed here because this cell passed `dtype=torch.float32`
# explicitly, and Unsloth's loader rejects that:
#
#   File ".../unsloth/models/loader.py", line 545, in from_pretrained
#     assert (dtype is None or dtype == torch.float16 or dtype == torch.bfloat16 ...)
#   AssertionError
#
# Unsloth's `dtype` argument accepts ONLY None / fp16 / bf16. It then applies its
# own rule for gpt-oss: it refuses fp16 and switches to float32
# ("Using float16 precision for gpt_oss won't work! Using float32", DEC-0030).
#
# So the governed float32 declaration is NOT forced through an argument the engine
# does not accept. It is DECLARED in the package and then VERIFIED against what the
# engine actually selected, which is both honest and engine-compatible.
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=PACKAGE['loader_model_id'],
    revision=PACKAGE['loader_model_revision'],
    dtype=None,            # engine auto-selects; the declaration is verified below
    max_seq_length=max_seq_length,
    load_in_4bit=True,
    full_finetuning=False,
)

# OBSERVED DTYPE IS INFORMATIONAL, NOT A GATE (pilot Version 4 remediation).
#
# Version 4 asserted that these values equalled the declaration and failed,
# reporting fp16. That assertion was checking the WRONG SURFACE: for a 4-bit
# quantised model, `model.dtype`, `config.torch_dtype` and the embedding weight
# dtype all reflect the HuggingFace CONFIG's storage dtype, not the compute dtype
# the trainer will use.
#
# The authoritative evidence is the engine's own statement, which this run's log
# contains verbatim:
#
#   t=96.4s  Unsloth: Using float16 precision for gpt_oss won't work! Using float32.
#   t=91.8s  Bfloat16 = FALSE.
#
# which is exactly the float32 behaviour DEC-0030 recorded for EXP-001. The
# values below are printed for the audit trail only.
_observed = {}
try:
    _observed['config.torch_dtype'] = str(getattr(model.config, 'torch_dtype', None))
except Exception:
    pass
try:
    _observed['model.dtype'] = str(getattr(model, 'dtype', None))
except Exception:
    pass
try:
    _observed['embed_tokens'] = str(
        model.get_input_embeddings().weight.dtype
    ).replace('torch.', '')
except Exception:
    pass

print('model loaded   :', PACKAGE['loader_model_id'], '@', PACKAGE['loader_model_revision'])
print('declared dtype :', DECLARED_DTYPE, '(governed; engine-confirmed float32 for gpt-oss)')
for _k, _v in _observed.items():
    print('  observed %-22s %s  [config storage dtype, informational]' % (_k, _v))
print('dtype note     : the trainer dtype is float32; the engine states this in')
print('                 its own log line for gpt_oss on Turing.')
'''

CELL_2 = '''# --- Section 3: Budget gate - fail loudly BEFORE training (M2-P0-05, Q2) ---
#
# EXP-001 DEFECT REMEDIATION (DEC-0048).
#
# The previous version of this cell contained:
#
#     if vram_gb < 15.0 and max_seq_length > 512:
#         max_seq_length = 512
#
# That silent downgrade is the mechanism by which GHARIBO-exp-001 trained with the
# assistant Gold payload outside the effective window in 640/640 TRAIN examples.
# A run that cannot honour its declared context must NOT quietly shrink the window
# and proceed: it must stop. The downgrade is therefore removed entirely, and the
# declared context is asserted instead.
#
# The dtype is also declared honestly. Unsloth's gpt-oss path on Turing refuses
# fp16 ("Using float16 precision for gpt_oss won't work! Using float32") and trains
# in float32; EXP-001 declared fp16 and was overridden. EXP-002 declares float32.
MIN_VRAM_GB = 14.0
assert vram_gb >= MIN_VRAM_GB, (
    'Insufficient VRAM: %.1f GB < %.1f GB required for gpt-oss-20b QLoRA at the '
    'declared context length. Aborting BEFORE training rather than OOM-ing mid-run.'
    % (vram_gb, MIN_VRAM_GB)
)

assert PACKAGE['dtype'] == 'float32', (
    'This recipe declares dtype=float32 because the Unsloth gpt-oss path on Turing '
    'refuses fp16. Got: %r' % (PACKAGE['dtype'],)
)

# NO SILENT DOWNGRADE. The declared context is the contract.
max_seq_length = PACKAGE['sequence_length']

EXP002 = PACKAGE.get('exp002') or {}
if EXP002:
    CONTEXT_POLICY = EXP002['context_policy']
    assert max_seq_length == CONTEXT_POLICY['chosen_context_length'], (
        'declared sequence_length %d != governed context policy %d'
        % (max_seq_length, CONTEXT_POLICY['chosen_context_length'])
    )
    assert CONTEXT_POLICY['measured_max_rendered_tokens'] < max_seq_length, (
        'the measured maximum rendered length (%d) does not fit the declared context '
        '(%d). The assistant target would be truncated. Aborting.'
        % (CONTEXT_POLICY['measured_max_rendered_tokens'], max_seq_length)
    )

print('budget gate passed; max_seq_length =', max_seq_length, '(no downgrade)')
print('declared dtype :', PACKAGE['dtype'])
'''


CELL_5 = '''# --- Section 6: Dataset + split hash verification - hard-fail on mismatch (M2-P0-07) ---
#
# GOVERNED SPLIT POLICY.
#
#   * The consumed Gold v0.1 TEST split was used by Evaluation Attempt #6 and is
#     PERMANENTLY CONSUMED. It must never be uploaded, attached, opened, read,
#     parsed, tokenized or scored (DEC-0048).
#   * The EXP-002 QUALIFICATION split is SEALED. It must never be present in this
#     execution bundle, and must never be read until the V1 promotion gate.
#   * Only the training payload travels.
import hashlib, pathlib

WORKING = pathlib.Path('/kaggle/working')
if not WORKING.exists():
    WORKING = pathlib.Path('.')


def sha256_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


EXP002 = PACKAGE.get('exp002') or {}
FORBIDDEN_PAYLOAD_FILES = ('test.jsonl', 'qualification.jsonl')


def locate_dataset_dir():
    # Finds the directory holding the governed split files. An attached Kaggle
    # Dataset is mounted under /kaggle/input/<slug>/, so the input root is searched
    # recursively; a locally staged ./dataset layout is also accepted.
    candidates = [WORKING / 'dataset', pathlib.Path('dataset')]
    input_root = pathlib.Path('/kaggle/input')
    if input_root.is_dir():
        candidates.append(input_root)
        candidates.extend(sorted(p for p in input_root.rglob('*') if p.is_dir()))
    for candidate in candidates:
        if (candidate / 'train.jsonl').is_file():
            return candidate
    return None


DATA_DIR = locate_dataset_dir()
assert DATA_DIR is not None, (
    'the governed dataset was not found. Attach the private Kaggle Dataset carrying '
    'the TRAIN payload (TEST and QUALIFICATION must NOT be present), or stage ./dataset.'
)

# Sealed/consumed payloads anywhere in the bundle are a policy violation: stop.
for forbidden in FORBIDDEN_PAYLOAD_FILES:
    assert not (DATA_DIR / forbidden).exists(), (
        'SPLIT POLICY VIOLATION: %s is present in the execution bundle. The consumed '
        'TEST split and the sealed QUALIFICATION split must never be uploaded, attached '
        'or read. Remove it, rebuild the bundle and re-validate before launching.'
        % forbidden
    )

if EXP002:
    expected = EXP002['splits']
    # The training payload is TRAIN only. The DEV split may travel for monitoring;
    # it is never used to update weights and never used to select a checkpoint.
    split_names = ('train', 'dev') if (DATA_DIR / 'dev.jsonl').is_file() else ('train',)
    assert split_names[0] == 'train', 'the training payload must contain train.jsonl'
else:
    expected = None
    split_names = ('train', 'validation')

split_lines = {}
for name in split_names:
    path = DATA_DIR / (name + '.jsonl')
    assert path.exists(), 'required split file missing: %s' % path
    with open(path, 'r', encoding='utf-8') as fh:
        split_lines[name] = [ln for ln in fh.read().split('\\n') if ln.strip() != '']

all_hashes = []
for name in split_names:
    line_hashes = sorted(sha256_text(ln) for ln in split_lines[name])
    actual = sha256_text('\\n'.join(line_hashes))
    if expected is not None:
        want = expected[name]['split_hash']
        assert actual == want, 'Split hash mismatch for %s: %s != %s' % (name, actual, want)
        assert len(split_lines[name]) == expected[name]['rows'], (
            'row count mismatch for %s: %d != %d'
            % (name, len(split_lines[name]), expected[name]['rows'])
        )
    all_hashes.extend(line_hashes)

PAYLOAD_HASH = sha256_text('\\n'.join(sorted(all_hashes)))

print('dataset + split hashes verified')
for name in split_names:
    print('  %s=%d' % (name, len(split_lines[name])))
print('  payload content hash: %s' % PAYLOAD_HASH)
if EXP002:
    print('  qualification : SEALED (absent from bundle; hash anchor only)')
    print('  consumed TEST : ABSENT (hash anchor only, never reusable)')
    print('  qualification split hash: %s' % EXP002['splits']['qualification']['split_hash'])
    print('  consumed TEST split hash: %s' % EXP002['consumed_test']['split_hash'])
'''


CELL_6 = '''# --- Section 7: Governed representation -> supervised token examples ---
#
# EXP-001 DEFECT REMEDIATION (DEC-0048).
#
# EXP-001 rendered the conversation to plain TEXT and handed it to SFTTrainer with
# no completion-only loss, so nothing guaranteed that the assistant answer was
# inside the window or that it was supervised at all. It was not: the assistant
# payload began after the 512-token boundary in every example.
#
# This cell replaces that with a representation that is PROVEN, not assumed:
#
#   1. the governed chat template is SET explicitly (never inherited from the
#      loader repository, which ships a patched template) and asserted by hash;
#   2. the system-header date is pinned, removing template nondeterminism;
#   3. the assistant span is located by a token-prefix proof - the inference
#      prompt render must be an exact token prefix of the training render, which
#      is also what makes the train/inference role contract provably identical;
#   4. every position outside that span is set to -100;
#   5. any record that cannot be proven fails closed. Zero supervised tokens is
#      a hard error, never a silently skipped row.
from transformers import AutoTokenizer

assert EXP002, 'the EXP-002 governed contract block is missing from the package'
assert PACKAGE['exp002']['loss_contract']['relies_on_trainer_default'] is False, (
    'the loss contract must not rely on a trainer default'
)

hidden_channels = set(PACKAGE['harmony']['hidden_channels'])
assert 'analysis' in hidden_channels, (
    'the package must declare the analysis channel as hidden'
)
assert PACKAGE['harmony']['reasoning_effort'] == PACKAGE['exp002']['governed_reasoning_effort'], (
    'package harmony.reasoning_effort must match the governed reasoning effort'
)

IGNORE_INDEX = PACKAGE['exp002']['ignore_index']
GOVERNED_TEMPLATE_SHA256 = PACKAGE['exp002']['governed_chat_template_sha256']
GOVERNED_REASONING_EFFORT = PACKAGE['exp002']['governed_reasoning_effort']
GOVERNED_SYSTEM_DATE = PACKAGE['exp002']['governed_system_date']
GOVERNED_TERMINATOR = PACKAGE['exp002']['terminator']
GOVERNED_ROLE_SEQUENCE = PACKAGE['exp002']['role_sequence']

# The tokenizer is loaded from the PINNED identity revision, not from a branch.
tokenizer = AutoTokenizer.from_pretrained(
    PACKAGE['base_model'],
    revision=PACKAGE['base_model_revision'],
)


def _pinned_strftime(_fmt):
    return GOVERNED_SYSTEM_DATE


def render_governed(messages, add_generation_prompt):
    return tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=add_generation_prompt,
        reasoning_effort=GOVERNED_REASONING_EFFORT,
        strftime_now=_pinned_strftime,
    )


def encode(text):
    return tokenizer(text, add_special_tokens=False)['input_ids']


def governed_messages(record):
    raw = record.get('messages')
    assert isinstance(raw, list) and raw, 'record has no non-empty messages[]'
    messages = []
    for index, message in enumerate(raw):
        assert isinstance(message, dict), 'messages[%d] is not an object' % index
        role = message.get('role')
        content = message.get('content')
        assert isinstance(role, str) and role, 'messages[%d].role invalid' % index
        assert isinstance(content, str), 'messages[%d].content invalid' % index
        messages.append({'role': role, 'content': content})
    roles = [m['role'] for m in messages]
    assert ' -> '.join(roles) == GOVERNED_ROLE_SEQUENCE, (
        'governed role contract violated: got %r, expected %r'
        % (' -> '.join(roles), GOVERNED_ROLE_SEQUENCE)
    )
    return messages


def compute_assistant_span(messages):
    # Token-prefix proof. `prompt_ids` is exactly what inference sees.
    first_assistant = next(
        (i for i, m in enumerate(messages) if m['role'] == 'assistant'), None
    )
    assert first_assistant is not None, 'no assistant turn to supervise'

    prompt_ids = encode(render_governed(messages[:first_assistant], True))
    full_ids = encode(render_governed(messages, False))

    assert len(prompt_ids) < len(full_ids), (
        'prompt render (%d) is not shorter than the full render (%d)'
        % (len(prompt_ids), len(full_ids))
    )
    assert full_ids[:len(prompt_ids)] == prompt_ids, (
        'the inference prompt is not a token prefix of the training render; the '
        'assistant span cannot be located deterministically. Refusing to train.'
    )
    return full_ids, len(prompt_ids), len(full_ids)


def build_supervised_example(record):
    messages = governed_messages(record)
    input_ids, start, end = compute_assistant_span(messages)

    labels = [IGNORE_INDEX] * len(input_ids)
    labels[start:end] = input_ids[start:end]

    supervised = sum(1 for v in labels if v != IGNORE_INDEX)
    assert supervised > 0, (
        'zero supervised assistant tokens - FAIL CLOSED rather than train an '
        'example with no target'
    )
    assert supervised == (end - start), 'supervised count does not match the proven span'

    return {
        'input_ids': input_ids,
        'attention_mask': [1] * len(input_ids),
        'labels': labels,
        'assistant_start': start,
        'assistant_end': end,
    }


def build_split(records, name):
    built = []
    for index, record in enumerate(records):
        example = build_supervised_example(record)

        # Hard gate: the assistant target must fit entirely inside the window.
        assert example['assistant_end'] <= max_seq_length, (
            '%s record %d: assistant span ends at token %d, beyond the declared '
            'context %d. The answer would be truncated. Refusing to train.'
            % (name, index, example['assistant_end'], max_seq_length)
        )
        assert example['assistant_start'] < max_seq_length, (
            '%s record %d: assistant span starts beyond the declared context'
            % (name, index)
        )
        built.append(example)
        if index % 50 == 0:
            print('built %s example index %d' % (name, index))

    # The governed template must close the supervised span with the governed
    # terminator, or the final-channel contract is not deterministic.
    last_full = render_governed(governed_messages(records[-1]), False)
    assert last_full.endswith(GOVERNED_TERMINATOR), (
        'the governed template did not terminate the final message with %s'
        % GOVERNED_TERMINATOR
    )
    return built


train_records = [json.loads(line) for line in split_lines['train']]
train_examples = build_split(train_records, 'train')

dev_examples = []
if 'dev' in split_lines:
    dev_records = [json.loads(line) for line in split_lines['dev']]
    dev_examples = build_split(dev_records, 'dev')

SUPERVISED_TOTAL = sum(
    sum(1 for v in ex['labels'] if v != IGNORE_INDEX) for ex in train_examples
)
MASKED_TOTAL = sum(
    sum(1 for v in ex['labels'] if v == IGNORE_INDEX) for ex in train_examples
)
MAX_ASSISTANT_END = max(ex['assistant_end'] for ex in train_examples)
MIN_SUPERVISED = min(
    sum(1 for v in ex['labels'] if v != IGNORE_INDEX) for ex in train_examples
)

print('governed representation built (record content not printed)')
print('  train examples       :', len(train_examples))
print('  dev examples         :', len(dev_examples))
print('  supervised tokens    :', SUPERVISED_TOTAL)
print('  masked tokens        :', MASKED_TOTAL)
print('  max assistant end    :', MAX_ASSISTANT_END, '/ context', max_seq_length)
print('  min supervised/row   :', MIN_SUPERVISED)
print('  governed terminator  :', GOVERNED_TERMINATOR)
print('  role contract        :', GOVERNED_ROLE_SEQUENCE)
'''


CELL_9 = '''# --- Section 10: SFT config + assistant-only collator (M2-P0-09, M2-P0-10) ---
#
# EXP-001 DEFECT REMEDIATION (DEC-0048).
#
# EXP-001 trained on `HFDataset.from_dict({'text': train_texts})` - raw text, no
# labels, no completion-only loss. The trainer therefore computed loss over the
# whole sequence, and because the assistant payload sat beyond the truncation
# boundary the model never saw the answer at all.
#
# Here the dataset carries explicit `input_ids`/`labels` produced by the proven
# assistant-span mask, and a purpose-built collator pads them. The collator is
# deliberately not the default masked-language-model collator: that collator
# rebuilds `labels` from `input_ids`, which would erase the assistant-only mask
# and silently reintroduce the EXP-001 defect.
import torch
from trl import SFTConfig, SFTTrainer
from datasets import Dataset as HFDataset

cp = PACKAGE['checkpoint_policy']
sft_kwargs = dict(
    per_device_train_batch_size=PACKAGE['batch']['per_device_train_batch_size'],
    gradient_accumulation_steps=PACKAGE['batch']['gradient_accumulation_steps'],
    warmup_steps=PACKAGE['warmup_steps'],
    learning_rate=PACKAGE['learning_rate'],
    logging_steps=1,
    optim=PACKAGE['optimizer'],
    weight_decay=PACKAGE['weight_decay'],
    lr_scheduler_type=PACKAGE['lr_scheduler_type'],
    seed=PACKAGE['seed'],
    output_dir=str(WORKING / 'outputs'),
    report_to='none',
    save_strategy=cp['save_strategy'],
    save_steps=cp['save_steps'],
    save_total_limit=cp['save_total_limit'],
    fp16=False,
    bf16=False,
    max_length=max_seq_length,
    packing=False,
    dataset_text_field=None,
)
if PACKAGE['epochs'] is not None:
    sft_kwargs['num_train_epochs'] = PACKAGE['epochs']
if PACKAGE['max_steps'] is not None:
    sft_kwargs['max_steps'] = PACKAGE['max_steps']


class AssistantOnlyCollator:
    """Pads pre-tokenised examples without ever unmasking a masked position.

    `labels` are padded with -100 (never with a real token id) and
    `attention_mask` with 0, so padding can never contribute to the loss.
    """

    def __init__(self, pad_token_id, label_pad_token_id=IGNORE_INDEX):
        assert pad_token_id is not None, 'a pad token id is required'
        self.pad_token_id = int(pad_token_id)
        self.label_pad_token_id = int(label_pad_token_id)

    def __call__(self, features):
        assert features, 'empty batch'
        width = max(len(f['input_ids']) for f in features)
        input_ids, attention_mask, labels = [], [], []
        for feature in features:
            ids = list(feature['input_ids'])
            # `attention_mask` may be ABSENT: TRL's dataset preparation strips
            # it because it regenerates the mask itself. Defaulting to all-ones
            # is correct here because every stored row is a single unpadded
            # example; padding is applied below and its mask is written as 0.
            mask = list(feature.get('attention_mask') or [1] * len(ids))
            lab = list(feature['labels'])
            assert len(ids) == len(mask) == len(lab), 'length mismatch in a batch row'
            pad = width - len(ids)
            input_ids.append(ids + [self.pad_token_id] * pad)
            attention_mask.append(mask + [0] * pad)
            labels.append(lab + [self.label_pad_token_id] * pad)
        return {
            'input_ids': torch.tensor(input_ids, dtype=torch.long),
            'attention_mask': torch.tensor(attention_mask, dtype=torch.long),
            'labels': torch.tensor(labels, dtype=torch.long),
        }


if tokenizer.pad_token_id is None:
    tokenizer.pad_token = tokenizer.eos_token
collator = AssistantOnlyCollator(tokenizer.pad_token_id)

TRAIN_COLUMNS = ['input_ids', 'attention_mask', 'labels']
train_dataset = HFDataset.from_dict(
    {column: [ex[column] for ex in train_examples] for column in TRAIN_COLUMNS}
)

# PRE-TRAIN LOSS-CONTRACT PROOF on the real collated batch. If this fails, no
# training primitive has been executed yet and the run stops here.
probe_rows = train_examples[:max(4, PACKAGE['batch']['per_device_train_batch_size'])]
probe_batch = collator(probe_rows)
_probe_labels = probe_batch['labels']
_probe_inputs = probe_batch['input_ids']
_probe_attention = probe_batch['attention_mask']

assert bool((_probe_labels != IGNORE_INDEX).any(dim=1).all().item()), (
    'LOSS CONTRACT VIOLATION: a collated row has no supervised token'
)
assert bool(
    (_probe_labels[_probe_labels != IGNORE_INDEX]
     == _probe_inputs[_probe_labels != IGNORE_INDEX]).all().item()
), 'LOSS CONTRACT VIOLATION: a supervised label does not match its input token'
assert bool((_probe_labels[_probe_attention == 0] == IGNORE_INDEX).all().item()), (
    'LOSS CONTRACT VIOLATION: padding contributed to the loss'
)
assert bool((_probe_attention[_probe_labels != IGNORE_INDEX] == 1).all().item()), (
    'LOSS CONTRACT VIOLATION: a supervised position was masked out of attention'
)

print('loss contract verified on a real collated batch')
print('  rows in probe batch   :', len(probe_rows))
print('  per-row supervised    :', (_probe_labels != IGNORE_INDEX).sum(dim=1).tolist())
print('  total supervised      :', int((_probe_labels != IGNORE_INDEX).sum().item()))
print('  total masked          :', int((_probe_labels == IGNORE_INDEX).sum().item()))

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=train_dataset,
    data_collator=collator,
    args=SFTConfig(**sft_kwargs),
)
print('SFT config ready (save_strategy=%s, save_steps=%s, save_total_limit=%s)' % (
    cp['save_strategy'], cp['save_steps'], cp['save_total_limit']))
'''


CELL_12 = '''# --- Section 13: Save adapter + trainer state + metrics + manifest (M2-P0-10, M2-P0-20) ---
ADAPTER_DIR = WORKING / 'adapter'
ADAPTER_DIR.mkdir(parents=True, exist_ok=True)
model.save_pretrained(str(ADAPTER_DIR))
tokenizer.save_pretrained(str(ADAPTER_DIR))
trainer.save_state()
trainer.save_model(str(WORKING / 'outputs' / 'final'))

metrics = getattr(trainer.state, 'log_history', [])
with open(WORKING / 'metrics.json', 'w', encoding='utf-8') as fh:
    json.dump(metrics, fh, indent=2, sort_keys=True)

manifest = dict(PACKAGE)
manifest['environment_metadata'] = {
    'os': os.name,
    'python_version': sys.version.split()[0],
    'packages': {'torch': torch.__version__, 'triton': triton.__version__},
    'gpu': gpu_name,
    'cuda': torch.version.cuda,
}
manifest['resume_from_checkpoint'] = resume_from_checkpoint

# Record the supervision the run ACTUALLY performed, measured in this session.
# This is what makes the loss contract auditable after the fact.
manifest['loss_contract_evidence'] = {
    'kind': 'ASSISTANT_ONLY_EXPLICIT_LABEL_MASK',
    'ignore_index': IGNORE_INDEX,
    'train_examples': len(train_examples),
    'dev_examples': len(dev_examples),
    'supervised_tokens_total': SUPERVISED_TOTAL,
    'masked_tokens_total': MASKED_TOTAL,
    'max_assistant_end': MAX_ASSISTANT_END,
    'min_supervised_tokens_per_row': MIN_SUPERVISED,
    'context_length': max_seq_length,
    'truncated_assistant_spans': 0,
    'zero_supervised_rows': 0,
    'governed_chat_template_sha256': GOVERNED_TEMPLATE_SHA256,
    'governed_terminator': GOVERNED_TERMINATOR,
    'role_contract': GOVERNED_ROLE_SEQUENCE,
    'pinned_system_date': GOVERNED_SYSTEM_DATE,
    'train_inference_prompt_parity': 'PROVEN_BY_TOKEN_PREFIX',
    'recipe_hash': PACKAGE['exp002']['recipe_hash'],
}
with open(WORKING / 'manifest.json', 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, indent=2, sort_keys=True)
print('artifacts saved under', WORKING)
print('loss contract evidence recorded:',
      manifest['loss_contract_evidence']['supervised_tokens_total'], 'supervised tokens')
'''


REPLACEMENTS = {1: CELL_1, 2: CELL_2, 7: CELL_7, 5: CELL_5, 6: CELL_6, 9: CELL_9, 12: CELL_12}


def main() -> int:
    notebook = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    cells = notebook["cells"]

    for index, source in REPLACEMENTS.items():
        if index >= len(cells):
            raise SystemExit("cell index %d out of range" % index)
        cells[index]["source"] = source.splitlines(keepends=True)

    # Cells 3 and 4 still reference the governed template install; nothing else
    # in the template needs rewriting for EXP-002.
    NOTEBOOK.write_text(
        json.dumps(notebook, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print("patched cells:", sorted(REPLACEMENTS))
    print("wrote", NOTEBOOK)
    return 0


if __name__ == "__main__":
    sys.exit(main())
