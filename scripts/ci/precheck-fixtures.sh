#!/usr/bin/env bash
# Fixture tests for the scheduled routines' pre-check: precheck.sh, or precheck.ps1 with --impl ps. Same answers
# and the same log line for setup not done, the sample workspace, a closed or paused (and resumed) search, the
# certification reminder's exceptions, and a weekly review already done.
# Usage: bash scripts/ci/precheck-fixtures.sh [--impl sh|ps]   (PowerShell from $PS_EXE, else pwsh)
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
[ -n "$PY" ] || { echo "python 3 is needed" >&2; exit 2; }
TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
T="$(mktemp -d "$TMPBASE/precheck.XXXXXX")" || exit 2
trap 'rm -rf "$T"' EXIT
dago() { "$PY" -c "import datetime,sys; print((datetime.date.today() - datetime.timedelta(days=int(sys.argv[1]))).isoformat())" "$1"; }
weekday() { "$PY" -c "import datetime,sys; print((datetime.date.today() + datetime.timedelta(days=int(sys.argv[1]))).strftime('%A'))" "$1"; }
pass=0; fail=0

ws() { # ws <name> <preferences text>: a fresh workspace
  rm -rf "${T:?}/${1:?}"; mkdir -p "$T/$1/profile" "$T/$1/interviews" "$T/$1/.claude/skills/routines/scripts"
  cp "$REPO/.claude/skills/routines/scripts/"precheck.* "$T/$1/.claude/skills/routines/scripts/"
  printf '%s\n' "$2" > "$T/$1/profile/preferences.md"
}
run() { # run <name> <routine>
  if [ "$IMPL" = ps ]; then "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$T/$1/.claude/skills/routines/scripts/precheck.ps1" -Routine "$2" 2>&1 | tr -d '\r'
  else bash "$T/$1/.claude/skills/routines/scripts/precheck.sh" "$2" 2>&1; fi
}
expect() { # expect <case> <name> <routine> <expected>
  local got; got="$(run "$2" "$3")"
  if [ "$got" = "$4" ]; then pass=$((pass + 1)); echo "PASS  $1"
  else fail=$((fail + 1)); printf 'FAIL  %s\n      | want: %s\n      | got:  %s\n' "$1" "$4" "$got"; fi
}
logged() { # logged <case> <name> <text expected in the last log line>
  local last; last="$(tail -1 "$T/$2/history/routines.md" 2>/dev/null | tr -d '\r')"
  case "$last" in *"$3"*) pass=$((pass + 1)); echo "PASS  $1" ;; *) fail=$((fail + 1)); printf 'FAIL  %s\n      | last line: %s\n' "$1" "$last" ;; esac
}

ws fresh 'SETUP: not done'
expect "setup not done skips" fresh "morning scan" "SKIP: setup not done"
logged "a skip is logged with the routine's name" fresh "$(printf '\302\267') morning scan $(printf '\302\267') skipped: setup not done"
head -1 "$T/fresh/history/routines.md" | grep -qx '# Routine results' && { pass=$((pass + 1)); echo "PASS  a new log starts with its heading"; } || { fail=$((fail + 1)); echo "FAIL  a new log starts with its heading"; }

ws active "SETUP: done 2026-01-01
search_status: active"
expect "an active search goes" active "morning scan" "GO"
[ ! -f "$T/active/history/routines.md" ] && { pass=$((pass + 1)); echo "PASS  a run that goes logs nothing"; } || { fail=$((fail + 1)); echo "FAIL  a run that goes logs nothing"; }
mkdir -p "$T/active/jobs"; : > "$T/active/jobs/~\$tracker.csv"
expect "a spreadsheet open in Excel skips a routine that edits it" active "follow-up drafts" "SKIP: a spreadsheet is open in Excel"
expect "the weekly review still runs (it only reads them)" active "weekly review" "GO"
rm -f "$T/active/jobs/~\$tracker.csv"
: > "$T/active/.sample-workspace"
expect "the sample workspace skips" active "inbox check" "SKIP: sample workspace"

ws closed "SETUP: done 2026-01-01
search_status: closed $(dago 3)
- benefits_cert_day: $(weekday 0)"
expect "a closed search skips" closed "follow-up drafts" "SKIP: search closed"
expect "the certification reminder runs on a closed search, on its day" closed "certification reminder" "GO"

ws paused "SETUP: done 2026-01-01
search_status: active
- benefits_cert_day: $(weekday 1)
## Notes from conversations
- $(dago 10): search paused until $(dago -5)."
expect "a paused search skips" paused "posting watch" "SKIP: search paused"
expect "not the certification day skips" paused "certification reminder" "SKIP: not certification day"
printf -- '- %s: search resumed.\n' "$(dago 1)" >> "$T/paused/profile/preferences.md"
expect "a resumed search goes" paused "morning scan" "GO"

ws ended "SETUP: done 2026-01-01
- $(dago 30): search paused until $(dago 2)."
expect "a pause that ended goes" ended "inbox check" "GO"
expect "no certification day: the reminder can be deleted" ended "certification reminder" "SKIP: no certification day set; this routine can be deleted"

ws review "SETUP: done 2026-01-01"
: > "$T/review/interviews/weekly-$(dago 3).md"
expect "a weekly review done 3 days ago skips" review "weekly review" "SKIP: already done this week"
rm -f "$T/review/interviews/"*.md; : > "$T/review/interviews/weekly-$(dago 8).md"
expect "one done 8 days ago goes" review "weekly review" "GO"

echo
echo "precheck fixtures ($IMPL): passed $pass, failed $fail"
[ "$fail" -eq 0 ]
