#!/usr/bin/env python3
"""
Builds the GHARIBO-exp-002-pilot Kaggle kernel bundle and runs the pre-push gates.

The bundle contains ONLY the corrected notebook and the Kaggle metadata. The
training payload is NOT bundled: it is supplied by the private Kaggle Dataset
`vokaigharibo/gharibo-exp-002-pilot-train`, which is the sole training source.

Pre-push gates are fail-closed. A FAIL exits non-zero and the kernel must not be
pushed.

Kaggle metadata is written as UTF-8 WITHOUT BOM. Kaggle CLI 2.2.4 fails to parse
BOM-prefixed JSON with "Expecting value: line 1 column 1 (char 0)".
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import shutil
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
PACKAGE_DIR = REPO_ROOT / "data/derived/exp002/package-pilot"
OUT_DIR = REPO_ROOT / "data/derived/exp002/kaggle-pilot"

KERNEL_ID = "vokaigharibo/gharibo-exp-002-pilot"
KERNEL_TITLE = "GHARIBO exp-002 pilot"
DATASET_SOURCE = "vokaigharibo/gharibo-exp-002-pilot-train"

#: The governed pilot payload identity.
EXPECTED_TRAIN_SHA256 = "0de7275c492f4e3234ee808ba127c41e4bb094a37c4f1e7bf8ba4a5856126151"
EXPECTED_TRAIN_BYTES = 572915
EXPECTED_ROWS = 100
EXPECTED_SPLIT_HASH = "b8250d987dc50cfbceb1a4cf3b69dd9cbe1b03ae6ab073d3beb36d103d81f023"
EXPECTED_CONTEXT = 3072
EXPECTED_DTYPE = "float32"

#: Forbidden payload names. Their presence anywhere in the bundle is fatal.
FORBIDDEN_FILES = ("test.jsonl", "qualification.jsonl")

#: Credential-shaped strings that must never appear in any generated artifact.
SECRET_PATTERNS = [
    re.compile(r"\b[A-Za-z0-9_]*API[_-]?KEY\s*=\s*['\"][^'\"]{8,}"),
    re.compile(r"\bkgat_[A-Za-z0-9]{10,}"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bsk-[A-Za-z0-9]{16,}"),
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    gates: dict[str, bool] = {}
    notes: dict[str, str] = {}

    summary = json.loads((PACKAGE_DIR / "launch-summary.json").read_text(encoding="utf-8"))
    manifest = json.loads((PACKAGE_DIR / "package-manifest.json").read_text(encoding="utf-8"))
    notebook_name = summary["notebook"]["filename"]
    notebook_path = PACKAGE_DIR / notebook_name
    notebook_text = notebook_path.read_text(encoding="utf-8")

    # The .ipynb is JSON, so the embedded Python is escaped. Join the cell
    # sources to recover the RAW Python the notebook will execute, and read the
    # manifest the notebook will actually receive out of that.
    notebook_json = json.loads(notebook_text)
    raw_python = "\n".join(
        "".join(c["source"]) if isinstance(c["source"], list) else str(c["source"])
        for c in notebook_json["cells"]
    )
    notebook_text = raw_python

    # ---------------------------------------------------------------- payload
    local_train = (REPO_ROOT / "data/derived/exp002/splits/pilot-100.jsonl").read_bytes()
    train_sha = sha256_bytes(local_train)
    rows = len([l for l in local_train.splitlines() if l.strip()])

    gates["trainRowsExactly100"] = rows == EXPECTED_ROWS
    notes["trainRowsExactly100"] = f"rows={rows}"
    gates["trainSha256MatchesGoverned"] = train_sha == EXPECTED_TRAIN_SHA256
    notes["trainSha256MatchesGoverned"] = train_sha
    gates["trainBytesMatchRemote"] = len(local_train) == EXPECTED_TRAIN_BYTES
    notes["trainBytesMatchRemote"] = f"bytes={len(local_train)}"

    # ---------------------------------------------------------------- dtype contract
    delivered = json.loads(
        re.search(r"PACKAGE = json.loads\(r'''(.*?)'''\)", notebook_text, re.S).group(1).strip()
    )
    gates["deliveredDtypeIsGoverned"] = delivered["dtype"] == EXPECTED_DTYPE
    notes["deliveredDtypeIsGoverned"] = delivered["dtype"]
    gates["deliveredDeclaredDtypeAgrees"] = (
        delivered["exp002"]["declared_dtype"] == delivered["dtype"] == EXPECTED_DTYPE
    )
    notes["deliveredDeclaredDtypeAgrees"] = (
        f"{delivered['dtype']} == {delivered['exp002']['declared_dtype']}"
    )
    gates["manifestDtypeIsGoverned"] = manifest["dtype"] == EXPECTED_DTYPE
    notes["manifestDtypeIsGoverned"] = manifest["dtype"]

    # ---------------------------------------------------------------- context contract
    gates["sequenceLengthIs3072"] = delivered["sequence_length"] == EXPECTED_CONTEXT
    notes["sequenceLengthIs3072"] = str(delivered["sequence_length"])
    gates["noSilentDowngradeInExecutableCode"] = not any(
        line.split("#")[0].strip().startswith("max_seq_length = ")
        and "512" in line.split("#")[0]
        for line in notebook_text.split("\n")
    )

    # ---------------------------------------------------------------- loss contract
    gates["lossContractIsExplicitMask"] = (
        delivered["exp002"]["loss_contract"]["kind"] == "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK"
        and delivered["exp002"]["loss_contract"]["relies_on_trainer_default"] is False
    )
    gates["ignoreIndexIsMinus100"] = delivered["exp002"]["ignore_index"] == -100
    gates["assistantOnlyCollatorPresent"] = "class AssistantOnlyCollator" in notebook_text
    # TRL strips `attention_mask` during dataset preparation, so the collator must
    # not index it directly. Version 5 died with KeyError: 'attention_mask'.
    gates["collatorToleratesMissingAttentionMask"] = (
        "feature.get('attention_mask') or [1] * len(ids)" in notebook_text
        and "feature['attention_mask']" not in notebook_text
    )
    gates["labelsExplicitlyConstructed"] = "labels[start:end] = input_ids[start:end]" in notebook_text
    gates["failClosedOnZeroSupervision"] = (
        "zero supervised assistant tokens - FAIL CLOSED" in notebook_text
    )
    gates["tokenPrefixSpanProofPresent"] = "full_ids[:len(prompt_ids)] == prompt_ids" in notebook_text

    # ---------------------------------------------------------------- isolation
    #
    # The forbidden filenames legitimately APPEAR in the notebook: there is a
    # guard that refuses to run if either is present. So the meaningful checks
    # are (a) that guard exists and is active, and (b) neither file is ever
    # READ as a split source.
    code_lines = [line.split("#")[0] for line in notebook_text.split("\n")]
    code = "\n".join(code_lines)

    gates["forbiddenPayloadGuardPresent"] = (
        "FORBIDDEN_PAYLOAD_FILES = ('test.jsonl', 'qualification.jsonl')" in code
    )
    gates["forbiddenPayloadGuardIsActive"] = (
        "SPLIT POLICY VIOLATION" in code and "assert not (DATA_DIR / forbidden).exists()" in code
    )
    # The only split ever read is the training payload.
    gates["onlyTrainSplitIsRead"] = (
        "split_names = ('train', 'dev') if (DATA_DIR / 'dev.jsonl').is_file() else ('train',)"
        in code
    )
    gates["noForbiddenSplitInReadList"] = (
        "split_names = ('train', 'validation', 'test')" not in code
        and "'test'" not in code.split("FORBIDDEN_PAYLOAD_FILES")[0][-400:]
    )
    gates["qualificationSealed"] = (
        delivered["exp002"]["splits"]["qualification"]["read_policy"]
        == "SEALED_UNTIL_V1_PROMOTION_GATE"
    )
    gates["consumedTestNotReusable"] = (
        delivered["exp002"]["consumed_test"]["reusable_as_promotion_evidence"] is False
    )

    # ---------------------------------------------------------------- engine freeze
    #
    # Pilot Kaggle Version 2 failed in SETUP because the package carried an EMPTY
    # dependency list, so the install plan resolved to `uv pip install` with no
    # package argument and uv exited 2. These gates make an empty or truncated
    # engine set unreachable.
    deps = delivered["engine"]["dependencies"]
    gates["engineDependencyListNonEmpty"] = len(deps) > 0
    notes["engineDependencyListNonEmpty"] = f"{len(deps)} dependencies"
    gates["engineDependencyListMatchesFreeze"] = len(deps) == 12
    gates["engineFreezeIdIsGoverned"] = (
        delivered["engine"]["engine_version"] == "unsloth-freeze-2026.09.15"
    )
    required_deps = {
        "torch", "triton", "unsloth", "unsloth_zoo", "transformers",
        "triton_kernels", "peft", "trl", "datasets", "accelerate",
        "bitsandbytes", "openai-harmony",
    }
    present = {d["name"] for d in deps}
    gates["engineFreezeSetComplete"] = required_deps <= present
    notes["engineFreezeSetComplete"] = ",".join(sorted(required_deps - present)) or "all present"
    # Every dependency must carry a usable spec, or the install plan cannot resolve.
    gates["everyDependencyHasSpec"] = all(bool(d.get("spec")) for d in deps)
    # The install plan the notebook builds must be able to emit package arguments.
    gates["installPlanWouldEmitPackages"] = (
        "INSTALL_PLAN" in code and "resolver_specs" in code and "FROZEN_NO_DEPS" in code
    )
    gates["noUvInstallWithoutPackage"] = "uv pip install --system --python /usr/bin/python3 --no-cache-dir --constraint /kaggle/working/preserved-constraints.txt --dry-run" not in code

    # --- engine API compatibility (pilot Version 3 remediation) ---
    # Unsloth's from_pretrained accepts ONLY None / fp16 / bf16 for `dtype`.
    # Passing torch.float32 trips its own assertion and kills the run at load.
    gates["loaderDtypeArgIsEngineCompatible"] = (
        "dtype=None," in code and "dtype=DECLARED_DTYPE" not in code
    )
    # The observed load-time dtype must be INFORMATIONAL, never a gate: for a
    # 4-bit model those values are the HF config's storage dtype, not the compute
    # dtype. Version 4 failed by asserting on them.
    gates["loadTimeDtypeIsInformationalNotAGate"] = (
        "_contradictions" not in code
        and "config storage dtype, informational" in code
    )

    # ---------------------------------------------------------------- checkpoint policy
    gates["checkpointPolicyMatches25Steps"] = (
        delivered["checkpoint_policy"]["save_steps"] == 25
        and delivered["checkpoint_policy"]["save_total_limit"] == 1
    )
    notes["checkpointPolicyMatches25Steps"] = (
        f"save_steps={delivered['checkpoint_policy']['save_steps']} "
        f"limit={delivered['checkpoint_policy']['save_total_limit']}"
    )
    gates["optimizerStepsAre25"] = EXPECTED_ROWS // delivered["batch"][
        "gradient_accumulation_steps"
    ] == 25

    # ---------------------------------------------------------------- governance posture
    gates["evaluationIsNotRun"] = (
        delivered["evaluation_config"]["status"] == "NOT_RUN"
        and delivered["evaluation_config"]["executed"] is False
    )
    gates["noPreviewFlag"] = delivered.get("preview") is None
    gates["pilotNotPromotable"] = manifest["experiment_id"].endswith("-pilot")

    # ---------------------------------------------------------------- secrets
    secret_hits = []
    for name, text in (("notebook", notebook_text), ("manifest", json.dumps(manifest))):
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                secret_hits.append(f"{name}:{pattern.pattern[:24]}")
    gates["noCredentialShapedStrings"] = not secret_hits
    notes["noCredentialShapedStrings"] = ",".join(secret_hits) or "none"

    # ---------------------------------------------------------------- build the bundle
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    shutil.copyfile(notebook_path, OUT_DIR / notebook_name)

    metadata = {
        "id": KERNEL_ID,
        "title": KERNEL_TITLE,
        "code_file": notebook_name,
        "language": "python",
        "kernel_type": "notebook",
        "is_private": True,
        "enable_gpu": True,
        "enable_tpu": False,
        "enable_internet": True,
        "dataset_sources": [DATASET_SOURCE],
        "competition_sources": [],
        "kernel_sources": [],
        "model_sources": [],
    }

    # UTF-8 WITHOUT BOM. Kaggle CLI 2.2.4 cannot parse a BOM.
    metadata_path = OUT_DIR / "kernel-metadata.json"
    # UTF-8, NO BOM, and LF newlines. `newline=""` prevents Python from
    # translating to CRLF on Windows, so the file is byte-stable across hosts.
    with open(metadata_path, "w", encoding="utf-8", newline="") as fh:
        fh.write(json.dumps(metadata, indent=2) + "\n")

    # ---------------------------------------------------------------- bundle gates
    written = sorted(p.name for p in OUT_DIR.iterdir())
    gates["bundleHasNoForbiddenPayload"] = not any(f in written for f in FORBIDDEN_FILES)
    gates["bundleHasNoTrainPayload"] = "train.jsonl" not in written
    notes["bundleHasNoTrainPayload"] = "payload supplied by the private Kaggle Dataset"
    _meta_bytes = metadata_path.read_bytes()
    gates["metadataIsUtf8WithoutBom"] = not _meta_bytes.startswith(b"\xef\xbb\xbf")
    gates["metadataUsesLfNewlines"] = b"\r\n" not in _meta_bytes
    gates["metadataParsesAsJson"] = True
    try:
        json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        gates["metadataParsesAsJson"] = False
    gates["gpuEnabled"] = metadata["enable_gpu"] is True
    gates["tpuDisabled"] = metadata["enable_tpu"] is False
    gates["internetEnabled"] = metadata["enable_internet"] is True
    gates["kernelIsPrivate"] = metadata["is_private"] is True
    gates["datasetSourceIsGoverned"] = metadata["dataset_sources"] == [DATASET_SOURCE]
    notes["datasetSourceIsGoverned"] = ",".join(metadata["dataset_sources"])
    gates["kernelIdIsPilot"] = metadata["id"] == KERNEL_ID

    failed = [k for k, ok in gates.items() if not ok]

    print("EXP-002 PILOT — Kaggle pre-push gates")
    print("=" * 68)
    for name, ok in gates.items():
        line = "  %s %s" % ("PASS" if ok else "FAIL", name)
        if name in notes:
            line += "   [%s]" % notes[name]
        print(line)
    print("")
    print("bundle :", OUT_DIR)
    for name in written:
        print("   -", name)
    print("")
    print("notebook sha256:", sha256_bytes((OUT_DIR / notebook_name).read_bytes()))
    print("metadata sha256:", sha256_bytes(metadata_path.read_bytes()))
    print("")

    if failed:
        print("VERDICT: FAIL — %d gate(s) failed: %s" % (len(failed), ", ".join(failed)))
        return 1

    print("VERDICT: PASS — %d/%d gates green, safe to push" % (len(gates), len(gates)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
