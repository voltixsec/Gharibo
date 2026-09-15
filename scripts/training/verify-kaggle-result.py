#!/usr/bin/env python3
"""Verify the downloaded GHARIBO-exp-001 Kaggle result directory.

Design notes
------------
* Never uses the process console encoding to decode paths / bytes: all file
  reads are binary and all report writes go through an explicit UTF-8 handle.
* Verification is strictly read-only: the result tree is never mutated.
* Exit code 0 == every file listed in CHECKSUMS.sha256 that is present on disk
  hashes correctly; missing files are reported but do not fail the run, because
  the Kaggle output downloader is allowed to stop early on non-result files.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

RESULT_DIR = Path(__file__).resolve().parents[2] / "apps/web/data/kaggle-results/GHARIBO-exp-001"

# Files that must never be treated as model artifacts (Unsloth compile cache).
NON_RESULT_PREFIXES = ("unsloth_compiled_cache/",)

PRIMARY_ARTIFACTS = [
    "adapter/adapter_model.safetensors",
    "outputs/checkpoint-150/adapter_model.safetensors",
    "outputs/checkpoint-160/adapter_model.safetensors",
    "outputs/final/adapter_model.safetensors",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_safetensors_header(path: Path) -> dict:
    """Parse only the JSON header of a safetensors file (no tensor data read)."""
    with path.open("rb") as fh:
        n = int.from_bytes(fh.read(8), "little")
        if n <= 0 or n > 100_000_000:
            raise ValueError(f"implausible safetensors header length: {n}")
        raw = fh.read(n)
    return json.loads(raw.decode("utf-8"))


def main() -> int:
    if not RESULT_DIR.is_dir():
        print(f"RESULT_DIR_MISSING {RESULT_DIR}")
        return 2

    checksum_file = RESULT_DIR / "CHECKSUMS.sha256"
    entries: list[tuple[str, str]] = []
    rollup_declared: str | None = None
    with checksum_file.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            if line.startswith("#"):
                parts = line.split()
                if len(parts) >= 3 and parts[1] == "rollup":
                    rollup_declared = parts[2]
                continue
            digest, _, rel = line.partition("  ")
            if not rel:
                digest, rel = line.split(None, 1)
            entries.append((digest.strip(), rel.strip()))

    verified = 0
    mismatched: list[str] = []
    missing: list[str] = []
    missing_non_result: list[str] = []

    for digest, rel in entries:
        target = RESULT_DIR / rel
        if not target.is_file():
            if rel.startswith(NON_RESULT_PREFIXES):
                missing_non_result.append(rel)
            else:
                missing.append(rel)
            continue
        actual = sha256_file(target)
        if actual == digest:
            verified += 1
        else:
            mismatched.append(f"{rel}: declared={digest} actual={actual}")

    # Recompute the rollup exactly the way `apps/web/lib/training/hash.ts`
    # (`artifactRollup`) and `bundle.ts` define it: sha256 over the sorted
    # "<relative path>\t<sha256>" lines joined with "\n". The manifest covers
    # every declared entry, including any file Kaggle does not serve locally.
    material = sorted(f"{r}\t{d}" for d, r in entries)
    rollup_excluding_missing = hashlib.sha256("\n".join(material).encode("utf-8")).hexdigest()

    print("=== CHECKSUMS.sha256 ===")
    print(f"entries_total           {len(entries)}")
    print(f"verified_ok             {verified}")
    print(f"mismatched              {len(mismatched)}")
    print(f"missing_result_files    {len(missing)}")
    for rel in missing:
        print(f"  MISSING_RESULT_FILE   {rel}")
    print(f"missing_non_result      {len(missing_non_result)} (unsloth compile cache, not model artifacts)")
    for m in mismatched:
        print(f"  MISMATCH              {m}")
    print(f"rollup_declared         {rollup_declared}")
    print(f"rollup_recomputed_all   {rollup_excluding_missing}")
    print(f"rollup_match            {rollup_declared == rollup_excluding_missing}")

    print()
    print("=== PRIMARY ARTIFACT SHA-256 ===")
    for rel in PRIMARY_ARTIFACTS:
        target = RESULT_DIR / rel
        if not target.is_file():
            print(f"{rel}\tMISSING")
            continue
        print(f"{sha256_file(target)}\t{target.stat().st_size}\t{rel}")

    print()
    print("=== SAFETENSORS HEADERS ===")
    for rel in PRIMARY_ARTIFACTS:
        target = RESULT_DIR / rel
        if not target.is_file():
            continue
        try:
            header = read_safetensors_header(target)
        except Exception as exc:  # noqa: BLE001 - report, never crash the audit
            print(f"{rel}\tHEADER_UNREADABLE\t{exc}")
            continue
        meta = header.get("__metadata__", {})
        tensors = {k: v for k, v in header.items() if k != "__metadata__"}
        dtypes = sorted({v.get("dtype") for v in tensors.values()})
        total = sum(
            1
            for v in tensors.values()
            for _ in [0]
        )
        n_tensors = len(tensors)
        print(
            f"{rel}\ttensors={n_tensors}\tdtypes={','.join(str(d) for d in dtypes)}\tmeta={json.dumps(meta, sort_keys=True)}"
        )
        del total

    return 0 if not mismatched and not missing else 1


if __name__ == "__main__":
    sys.exit(main())
