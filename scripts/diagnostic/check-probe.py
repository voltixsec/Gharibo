"""Offline safety/compilation checks. Reads source and governance only."""
import ast
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
directory = root / 'scripts/diagnostic'
notebook = directory / 'diagnostic.ipynb'
source = json.loads(notebook.read_text(encoding='utf-8'))['cells'][0]['source']
tree = ast.parse(source)
for item in ast.walk(tree):
    if isinstance(item, ast.Call):
        name = ast.unparse(item.func)
        assert not name.endswith(('.generate', '.forward', '.train', '.fit', '.apply_chat_template')), name
        assert name not in ('model', 'tokenizer'), name
metadata = json.loads((directory / 'kernel-metadata.json').read_text())
for key in ('dataset_sources', 'competition_sources', 'kernel_sources', 'model_sources'):
    assert metadata[key] == [], key
assert metadata['is_private'] is True
record = json.loads((root / 'governance/DEC-0037-diagnostic-authorization.json').read_text())
assert record['notebookSha256'] == hashlib.sha256(notebook.read_bytes()).hexdigest()
assert record['maximumKernelPushes'] == 1
assert record['evaluationAttempt4Authorized'] is False
assert record['testDataAccessAuthorized'] is False
assert record['inferenceAuthorized'] is False
state = json.loads((root / 'governance/GHARIBO_MASTER_STATE.json').read_text())
assert state['training']['status'] == 'COMPLETED'
assert state['experiments']['GHARIBO-exp-001']['evaluationStatus'] == 'NOT_RUN'
assert state['training']['evaluationAuthorization']['furtherAttemptAuthorized'] is False
assert state['training']['evaluationAuthorization']['harnessRepairLoopHalted'] is True
for marker in ('DIAGNOSTIC_INSTALL_PASS', 'DIAGNOSTIC_TOKENIZER_PASS',
               'DIAGNOSTIC_MODEL_LOAD_PASS', 'DIAGNOSTIC_BASE_REVISION_VERIFIED',
               'NO_TEST_ACCESSED', 'NO_INFERENCE_EXECUTED', 'DIAGNOSTIC_COMPLETE'):
    assert marker in source, marker
print('DIAGNOSTIC_OFFLINE_SAFETY_PASS')
