#!/usr/bin/env bash
# Final validation with CORRECT exit-code capture.
#
# The previous version piped each command into `tail` and then read `$?`, which
# reports tail's status — always 0. That masked a real typecheck failure. Each
# command now runs unpiped and its own status is recorded.
set -u

cd /c/Dev/GHARIBO
export PATH="/c/Program Files/nodejs:$PATH"
VENV="/c/Users/dell/.workbuddy-ai/binaries/python/envs/gharibo-serving-test/Scripts/python.exe"
# Portable output root: overridable, defaults to the OS temp dir so running this
# never writes into the repository.
B="${VERIFY_OUT:-/tmp/gharibo-verification}"
mkdir -p "$B"
OUT="$B/final-validate.log"
: > "$OUT"

declare -a NAMES=() STATUS=()
step() {
  local name="$1"; shift
  echo "===================================================================" >> "$OUT"
  echo "### $name" >> "$OUT"
  "$@" >> "$OUT" 2>&1
  local rc=$?
  NAMES+=("$name"); STATUS+=("$rc")
  echo ">>> $name exit=$rc" >> "$OUT"
}

step "typecheck" npm run typecheck
step "test" npm test
step "docs:validate" npm run docs:validate
step "verify:m2 --check" npm run verify:m2 -- --check
# NOTE: the production build is deliberately NOT run here.
#
# `next build` replaces the .next directory. If a `next start` server is
# serving from it at the time, the rebuild deletes chunks the running server
# still references (observed: "Cannot find module ./vendor-chunks/sonner.js"),
# which produces bogus 500s in every later browser check. Build separately and
# restart the server before running the browser suites.
step "serving pytest" "$VENV" -m pytest services/gharibo-v1-serving/tests -q
step "python syntax" "$VENV" -m py_compile services/gharibo-v1-serving/app/main.py services/gharibo-v1-serving/app/model_backend.py
step "git diff --check" git diff --check

echo "" >> "$OUT"
echo "===================== SUMMARY ====================="
local_fail=0
for i in "${!NAMES[@]}"; do
  printf '%-24s %s\n' "${NAMES[$i]}" "${STATUS[$i]}"
  [ "${STATUS[$i]}" -ne 0 ] && local_fail=1
done

echo "--- key evidence ---"
grep -E "Tests +[0-9]+ passed|RESULT: PASSED|metrics computed successfully|Compiled successfully|passed,|error TS" "$OUT" | head -20

echo ""
if [ "$local_fail" -eq 0 ]; then
  echo "ALL VALIDATIONS PASSED"
else
  echo "SOME VALIDATIONS FAILED"
fi
