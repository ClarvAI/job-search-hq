#!/usr/bin/env bash
# The three copies of the stalled-routine rules agree: routine-status.sh (startup note and /health on Mac,
# Linux, Git Bash), routine-status.ps1 (Windows; with PowerShell from $PS_EXE, else pwsh, when present) and the
# Routines board's hooks/status.ts (run by Node, which strips its types). Each prints one line per routine for
# the same logs. Works on temp copies; nothing in the workspace changes.
# Usage: bash scripts/ci/routine-status-parity.sh      Exits 1 on any difference.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
PY=""
for c in python3 python; do "$c" -c 'import json' >/dev/null 2>&1 && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "python 3 is needed" >&2; exit 2; }
if ! command -v node >/dev/null 2>&1; then echo "note  node isn't installed; skipped"; [ -n "${CI:-}" ] && exit 1; exit 0; fi
PS="${PS_EXE:-}"
[ -n "$PS" ] || { command -v pwsh >/dev/null 2>&1 && PS=pwsh; }
TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
T="$(mktemp -d "$TMPBASE/rsparity.XXXXXX")" || exit 2
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/.claude/skills/routines/scripts" "$T/history"
cp "$REPO/.claude/skills/routines/scripts/"routine-status.* "$T/.claude/skills/routines/scripts/"
TS="$REPO/.claude/skills/routines-board/hooks/status.ts"
command -v cygpath >/dev/null 2>&1 && TS="/$(cygpath -m "$TS")"  # file:///C:/... on Windows
TODAY="$(date +%Y-%m-%d)"
dago() { "$PY" -c "import datetime,sys; print((datetime.date.today() - datetime.timedelta(days=int(sys.argv[1]))).isoformat())" "$1"; }
D='\302\267'
pass=0; fail=0

check() { # check <case>: the log in $T/history/routines.md through every version
  local a b c
  a="$(bash "$T/.claude/skills/routines/scripts/routine-status.sh")"
  b="$(node --no-warnings --experimental-strip-types --input-type=module -e "
    import { readFileSync } from 'node:fs'
    import { routineStatus, statusLine } from 'file://$TS'
    const text = readFileSync(process.argv[1], 'utf8')
    for (const r of routineStatus(text, process.argv[2])) console.log(statusLine(r))" "$T/history/routines.md" "$TODAY")"
  if [ "$a" = "$b" ]; then pass=$((pass + 1)); echo "PASS  $1: status.ts matches routine-status.sh"
  else fail=$((fail + 1)); printf 'FAIL  %s: status.ts differs\n' "$1"; diff <(printf '%s\n' "$a") <(printf '%s\n' "$b") | sed 's/^/      | /'; fi
  if [ -n "$PS" ]; then
    c="$("$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$T/.claude/skills/routines/scripts/routine-status.ps1" | tr -d '\r')"
    if [ "$a" = "$c" ]; then pass=$((pass + 1)); echo "PASS  $1: routine-status.ps1 matches routine-status.sh"
    else fail=$((fail + 1)); printf 'FAIL  %s: routine-status.ps1 differs\n' "$1"; diff <(printf '%s\n' "$a") <(printf '%s\n' "$c") | sed 's/^/      | /'; fi
  fi
}

{ printf '\357\273\277# Routine results\r\n\r\n'
  printf -- "- %s 08:00 $D morning scan $D set up (weekdays 8:00)\r\n" "$(dago 9)"
  printf -- "- %s 08:00 $D morning scan $D 3 new leads\r\n" "$(dago 6)"
  printf -- "- %s 07:30 $D inbox check $D changed (weekly, Monday 7:30)\n" "$(dago 8)"
  printf -- "- %s 07:30 $D inbox check $D 1 update\n" "$(dago 5)"
  printf -- "- %s 08:30 $D posting watch $D set up (fortnightly, Monday 8:30)\n" "$(dago 20)"
  printf -- "- %s 16:00 $D weekly review $D paused\n" "$(dago 20)"
  printf -- "- %s 16:00 $D weekly review $D changed (weekly)\n" "$(dago 12)"
  printf -- "- %s 16:00 $D weekly review $D 1 late run\n" "$(dago 11)"
  printf -- "- %s 09:00 $D follow-up drafts $D 2 drafts\n" "$(dago 30)"
  printf -- "- %s 09:00 $D follow-up drafts $D resumed\n" "$(dago 6)"
  printf -- "- %s 09:00 $D Lebenslauf-Check $D set up (weekdays 9:00)\n" "$(dago 9)"
  printf -- "- %s 09:00 $D lebenslauf-check $D ok\n" "$(dago 5)"
  printf -- "- %s 09:00 $D \303\234bersicht $D set up (weekly)\n" "$(dago 20)"
  printf -- "- %s 09:00 $D \303\274bersicht $D ok\n" "$(dago 1)"
  printf -- "- %s 09:00 $D old one $D done\n" "$(dago 60)"
  printf -- "- %s 09:00 $D only paused $D paused\n" "$(dago 3)"
  printf -- "- %s 09:05 $D routines $D offered\n" "$(dago 0)"
  printf -- "- 2026-02-30 09:00 $D certification reminder $D set up (weekly)\n"
  printf -- "- not a date $D x $D y\n"; } > "$T/history/routines.md"
check "mixed log"
for n in 2 3 4 5 9 10 16 17 45 46; do printf -- "- %s 09:00 $D daily $n $D set up (daily)\n- %s 09:00 $D wd $n $D set up (weekdays)\n- %s 09:00 $D wk $n $D x\n- %s 09:00 $D fn $n $D set up (fortnightly)\n" "$(dago $n)" "$(dago $n)" "$(dago $n)" "$(dago $n)"; done > "$T/history/routines.md"
check "limits"
printf '' > "$T/history/routines.md"
check "empty log"
echo
echo "routine-status parity: passed $pass, failed $fail"
[ "$fail" -eq 0 ]
