#!/usr/bin/env bash
# Fixture tests for the startup summary: .claude/hooks/summary.sh (Mac, Linux, Git Bash) and its
# Windows port .claude/hooks/session-start.ps1. Checks the CSV rules (a quote opens a quoted cell only
# at the start of a cell; an unfinished quote or a semicolon header is reported, not misread) and the
# date rules (YYYY-MM-DD, D.M.YYYY day first, slash dates by their own parts, the row's other dates,
# then date_order; otherwise "date unclear"), passed deadlines, "Also:" notes and urgent-first order.
# With --impl ps it also checks that session-start.ps1 prints the same pipeline lines.
# Usage: bash scripts/ci/summary-fixtures.sh [--impl sh|ps]   (PowerShell from $PS_EXE, else pwsh)
# Works in macOS bash 3.2, Linux bash and Git Bash. Nothing in the workspace is changed.
set -u
IMPL="sh"
[ "${1:-}" = "--impl" ] && IMPL="${2:-sh}"
HERE="$(cd "$(dirname "$0")" && pwd -P)"
REPO="$(cd "$HERE/../.." && pwd -P)"
PS=""
if [ "$IMPL" = ps ]; then
  PS="${PS_EXE:-}"
  [ -n "$PS" ] || { command -v pwsh >/dev/null 2>&1 && PS=pwsh; }
  [ -n "$PS" ] || { command -v powershell >/dev/null 2>&1 && PS=powershell; }
  [ -n "$PS" ] || { echo "no PowerShell found (set PS_EXE)" >&2; exit 2; }
fi
PY=""
for c in python3 python; do "$c" -c 'import json' >/dev/null 2>&1 && { PY="$c"; break; }; done
TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
T="$(mktemp -d "$TMPBASE/sumfx.XXXXXX")" || exit 2
trap 'rm -rf "$T"' EXIT
HDR='company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes'
pass=0; fail=0

ws() { # ws <name> <date_order>: a fresh workspace; the tracker comes from stdin
  local d="$T/$1"
  mkdir -p "$d/jobs" "$d/profile" "$d/outbox" "$d/.claude/hooks"
  printf 'SETUP: done 2026-01-01\n<!-- date_order: MDY -->\n- date_order: %s\nsearch_status: active\n' "$2" > "$d/profile/preferences.md"
  cat > "$d/jobs/tracker.csv"
  cp "$REPO/.claude/hooks/session-start.ps1" "$d/.claude/hooks/"
}
run() { # run <name>: the summary text (sh) or the matching lines of the startup text (ps)
  if [ "$IMPL" = ps ]; then
    printf '{}' | "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$T/$1/.claude/hooks/session-start.ps1" 2>&1 \
      | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["hookSpecificOutput"]["additionalContext"])' \
      | grep -v '^Today is [A-Z][a-z]*day, \|^Autonomy:\|^Missing starter\|^Some starter'
  else
    CLAUDE_PROJECT_DIR="$T/$1" bash "$REPO/.claude/hooks/summary.sh" long
  fi
}
has() { # has <case> <text expected in the output>
  if printf '%s\n' "$OUT" | grep -qF -- "$2"; then pass=$((pass + 1)); printf 'PASS  %-34s has "%s"\n' "$1" "$2"
  else fail=$((fail + 1)); printf 'FAIL  %-34s missing "%s"\n%s\n' "$1" "$2" "$(printf '%s\n' "$OUT" | sed 's/^/      | /')"; fi
}
hasnt() {
  if printf '%s\n' "$OUT" | grep -qF -- "$2"; then fail=$((fail + 1)); printf 'FAIL  %-34s should not have "%s"\n%s\n' "$1" "$2" "$(printf '%s\n' "$OUT" | sed 's/^/      | /')"
  else pass=$((pass + 1)); printf 'PASS  %-34s lacks "%s"\n' "$1" "$2"; fi
}

{ printf '\357\273\277%s\n' "$HDR"
  printf 'Acme,Eng,applied,2000-01-03,Follow up,,A,4,X,,,,,,,,,0,acme,He said "hi there\n'
  printf 'Beta,Eng,applied,2000-01-04,Follow up,,A,4,X,,,,,,,,,0,beta,"multi\nline"\n'
  printf 'Dot,Eng,interviewing,5.1.2000,Interview 2000-01-05,,A,4,X,,,,,,,,,0,dot,\n'
  printf 'Amb,Eng,interested,03/04/2000,Decide: apply or skip,,B,3,X,,,,,,,,,0,amb,\n'
  printf 'Row,Eng,interested,02/01/2000,Decide,,B,3,X,25/12/1999,,,,,,,,0,row,\n'
  printf 'Gone,Eng,interested,2099-01-01,Decide,2000-01-01,B,3,X,,,,,,,,,0,gone,\n'
  printf 'Offer,Eng,offer,2099-01-01,Respond to offer,2000-01-02,A,5,X,,,,,,,,,0,offer,\n'
  printf 'Also,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,also,Also: Interview 2000-01-06; more\n'
  printf ',,,,\n'; } | ws main ""
OUT="$(run main)"
has  "stray quote keeps rows" "Beta (Eng): Follow up [due 2000-01-04]"
has  "applied and screening apart" "Pipeline: 3 applied, 1 interviewing, 1 offer(s), 3 to apply"
has  "dotted date is day first" "Dot (Eng): Interview 2000-01-05 [due 2000-01-05]"
has  "ambiguous date is unclear" "Date unclear"
has  "ambiguous date is named" "Amb (Eng): next step 03/04/2000"
hasnt "ambiguous date not alerted" "Amb (Eng): Decide"
has  "row evidence decides order" "Row (Eng): Decide [due 2000-01-02]"
has  "passed application deadline" "Application deadline passed"
hasnt "passed deadline not in due list" "Gone (Eng): Decide"
has  "passed offer deadline marked" "Offer (Eng): answer the offer by 2000-01-02 (passed)"
has  "Also: note counted as due" "Also (Eng): Interview 2000-01-06 [due 2000-01-06]"
first="$(printf '%s\n' "$OUT" | grep -A1 '^Due today' | tail -1)"
case "$first" in *Offer*) pass=$((pass + 1)); echo "PASS  offers come first in the due list" ;;
  *) fail=$((fail + 1)); echo "FAIL  offers come first in the due list (first item: $first)" ;; esac

{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,03/04/2000,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws order DMY
OUT="$(run order)"
has  "date_order DMY from a list item" "Acme (Eng): Follow up [due 2000-04-03]"

printf 'company;role;status;next_action_date\nAcme;Eng;applied;2000-01-01\n' | ws semi ""
OUT="$(run semi)"
has  "semicolon header reported" "saved with semicolons between the columns instead of commas"
hasnt "semicolon tracker not read" "Pipeline:"

{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2000-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,"never closed\nBeta,Eng,applied,2000-01-01,Follow up,,A,4,X,,,,,,,,,0,beta,\n'; } | ws open ""
OUT="$(run open)"
has  "unfinished quote reported" "looks damaged"
hasnt "damaged tracker not read" "Pipeline:"

{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2000-01-01,Send withdrawal note,,A,4,X,,,,,,,,,0,acme,\nBeta,Eng,accepted,,,,A,4,X,,,,,,,,,0,beta,\n'; } | ws closed ""
printf 'SETUP: done 2026-01-01\nsearch_status: closed 2026-01-02\n' > "$T/closed/profile/preferences.md"
printf -- '---\nstatus: draft\n---\nhi\n' > "$T/closed/outbox/2026-01-02-note.md"
OUT="$(run closed)"
has  "closed search still lists withdrawals" "Withdrawal notes still to send: Acme (Eng)."
has  "closed search still counts drafts" "1 draft(s) still waiting in the Outbox."

if [ "$IMPL" = ps ]; then
  for c in main order semi open closed; do
    a="$(CLAUDE_PROJECT_DIR="$T/$c" bash "$REPO/.claude/hooks/summary.sh" long)"; b="$(run "$c")"
    if [ "$a" = "$b" ]; then pass=$((pass + 1)); echo "PASS  $c: session-start.ps1 matches summary.sh"
    else fail=$((fail + 1)); echo "FAIL  $c: session-start.ps1 differs from summary.sh"; diff <(printf '%s\n' "$a") <(printf '%s\n' "$b") | sed 's/^/      | /'; fi
  done
fi
echo
echo "summary fixtures ($IMPL): passed $pass, failed $fail"
[ "$fail" -eq 0 ]
