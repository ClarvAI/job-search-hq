#!/usr/bin/env bash
# Runs every CI check that this computer can run, and says which ones it skipped.
# Usage: bash scripts/ci/run-all.sh      (set PS_EXE to a PowerShell to include the PowerShell checks)
# Exits 1 if any check that ran failed.
set -u
HERE="$(cd "$(dirname "$0")" && pwd -P)"
PS="${PS_EXE:-}"
[ -n "$PS" ] || { command -v pwsh >/dev/null 2>&1 && PS=pwsh; }
[ -n "$PS" ] || { command -v powershell >/dev/null 2>&1 && PS=powershell; }
failed=""; ran=0
step() { # step <label> <command...>
  local label="$1"; shift
  echo; echo "######## $label"
  ran=$((ran + 1))
  "$@" || failed="$failed
  - $label"
}
step "shell scripts" bash "$HERE/lint-shell.sh"
step "JSON" bash "$HERE/check-json.sh"
step "node --check" bash "$HERE/check-node.sh"
step "skill parity + blank files" bash "$HERE/check-parity.sh"
step "product manifest up to date" bash "$HERE/../build-manifest.sh" --check
if command -v node >/dev/null 2>&1; then
  step "blank pages on the Default theme" node "$HERE/../../.claude/skills/page-design/scripts/apply-theme.mjs" --check-blank
else
  echo; echo "######## blank-pages theme check skipped (no node)"
fi
step "guard fixtures (bash)" bash "$HERE/guard-fixtures.sh" --impl sh
step "my-data smoke (bash)" bash "$HERE/mydata-smoke.sh" --impl sh
if [ -n "$PS" ]; then
  export PS_EXE="$PS"
  step "guard fixtures (PowerShell)" bash "$HERE/guard-fixtures.sh" --impl ps
  step "guard parity" bash "$HERE/guard-parity.sh"
  step "PowerShell parse" "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$HERE/parse-powershell.ps1"
  step "my-data smoke (PowerShell)" bash "$HERE/mydata-smoke.sh" --impl ps
else
  echo; echo "######## PowerShell checks skipped (no pwsh or powershell; set PS_EXE)"
fi
step "mods" bash "$HERE/check-mods.sh"
echo
if [ -n "$failed" ]; then echo "FAILED:$failed"; exit 1; fi
echo "all $ran checks passed"
