#!/usr/bin/env bash
# Runs every CI check that this computer can run, and says which ones it skipped.
# Usage: bash scripts/ci/run-all.sh      (set PS_EXE to a PowerShell to include the PowerShell checks)
# Exits 1 if any check that ran failed.
set -u
HERE="$(cd "$(dirname "$0")" && pwd -P)"
PS="${PS_EXE:-}"
[ -n "$PS" ] || { command -v pwsh >/dev/null 2>&1 && PS=pwsh; }
[ -n "$PS" ] || { command -v powershell >/dev/null 2>&1 && PS=powershell; }
PY=""
for c in python3 python; do "$c" -c 'import sys; sys.exit(sys.version_info < (3, 8))' >/dev/null 2>&1 && { PY="$c"; break; }; done
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
  step "theme engine fixtures (tokens, layouts, custom region)" bash "$HERE/theme-fixtures.sh"
else
  echo; echo "######## blank-pages theme check and theme fixtures skipped (no node)"
fi
step "guard fixtures (bash)" bash "$HERE/guard-fixtures.sh" --impl sh
step "my-data smoke (bash)" bash "$HERE/mydata-smoke.sh" --impl sh
step "startup summary (bash)" bash "$HERE/summary-fixtures.sh" --impl sh
step "health check fixtures (bash)" bash "$HERE/health-fixtures.sh" --impl sh
step "share-lessons privacy check (bash)" bash "$HERE/check-anon-fixtures.sh" --impl sh
step "routines pre-check (bash)" bash "$HERE/precheck-fixtures.sh" --impl sh
step "Manual-mode notice hook" bash "$HERE/mode-notice-fixtures.sh"
if [ -n "$PY" ]; then
  step "e2e: fresh clone and first run (bash)" "$PY" "$HERE/e2e-fresh.py" --impl sh
  step "e2e: /update install, check, rollback, refusals (bash)" "$PY" "$HERE/e2e-update.py" --impl sh
  step "e2e: /my-data export, reset, restore (bash)" "$PY" "$HERE/e2e-mydata.py" --impl sh
  step "e2e: sample workspace (bash)" "$PY" "$HERE/e2e-sample.py" --impl sh
  step "e2e: PDF scripts' limits and locked-down print (bash)" "$PY" "$HERE/e2e-pdf.py" --impl sh
  if command -v node >/dev/null 2>&1; then
    step "e2e: theme, then git pull stays clean" "$PY" "$HERE/e2e-theme-git.py"
    step "published dashboard data and Claude Dashboard page" "$PY" "$HERE/check-dashboard-type.py"
  else
    echo; echo "######## e2e theme + git pull skipped (no node)"
  fi
else
  echo; echo "######## end-to-end tests skipped (no python 3.8+)"
fi
if [ -n "$PS" ]; then
  export PS_EXE="$PS"
  step "guard fixtures (PowerShell)" bash "$HERE/guard-fixtures.sh" --impl ps
  step "guard parity" bash "$HERE/guard-parity.sh"
  step "PowerShell parse" "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$HERE/parse-powershell.ps1"
  step "my-data smoke (PowerShell)" bash "$HERE/mydata-smoke.sh" --impl ps
  step "startup summary (PowerShell)" bash "$HERE/summary-fixtures.sh" --impl ps
  step "health check fixtures (PowerShell)" bash "$HERE/health-fixtures.sh" --impl ps
  step "share-lessons privacy check (PowerShell)" bash "$HERE/check-anon-fixtures.sh" --impl ps
  step "routines pre-check (PowerShell)" bash "$HERE/precheck-fixtures.sh" --impl ps
  if [ -n "$PY" ]; then
    step "e2e: fresh clone and first run (PowerShell)" "$PY" "$HERE/e2e-fresh.py" --impl ps
    step "e2e: /update (PowerShell)" "$PY" "$HERE/e2e-update.py" --impl ps
    step "e2e: /my-data (PowerShell)" "$PY" "$HERE/e2e-mydata.py" --impl ps
    step "e2e: sample workspace (PowerShell)" "$PY" "$HERE/e2e-sample.py" --impl ps
    step "e2e: PDF script limits and locked-down print (PowerShell)" "$PY" "$HERE/e2e-pdf.py" --impl ps
  fi
else
  echo; echo "######## PowerShell checks skipped (no pwsh or powershell; set PS_EXE)"
fi
step "stalled-routine rules agree (scripts and Routines board)" bash "$HERE/routine-status-parity.sh"
step "mods" bash "$HERE/check-mods.sh"
echo
if [ -n "$failed" ]; then echo "FAILED:$failed"; exit 1; fi
echo "all $ran checks passed"
