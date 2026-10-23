#!/usr/bin/env bash
# Fixture tests for the share-lessons privacy check: check-anon.sh, or check-anon.ps1 with --impl ps. Both must
# print exactly the expected lines for the same draft and files (names and companies from the tracker,
# contacts and preferences; emails, links, phone numbers, pay and exact dates) and pass a clean draft.
# Usage: bash scripts/ci/check-anon-fixtures.sh [--impl sh|ps]   (PowerShell from $PS_EXE, else pwsh)
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
TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
T="$(mktemp -d "$TMPBASE/anonfx.XXXXXX")" || exit 2
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/jobs" "$T/contacts" "$T/profile" "$T/history" "$T/.claude/skills/share-lessons/scripts"
cp "$REPO/.claude/skills/share-lessons/scripts/"check-anon.* "$T/.claude/skills/share-lessons/scripts/"
printf '\357\273\277company,role,status,location,contact\r\n"Globex, Inc.",Analyst,accepted,"Denver, CO",Pat Lee\r\nInitech,Analyst,rejected,Austin TX,\r\nAcme,Clerk,applied,Remote,\r\nUmbrella Corp,Clerk,applied,Remote,\r\n\"AB Group, LLC\",Clerk,applied,Remote,\r\nThe Hooli Company,Clerk,rejected,Remote,\r\n' > "$T/jobs/tracker.csv"
printf 'name,company,email\nJordan Smith,Northwind,jordan@example.com\n' > "$T/contacts/contacts.csv"
printf 'SETUP: done 2026-01-01\nname: Alex Rivera\n' > "$T/profile/preferences.md"
pass=0; fail=0
run() { # run <draft>: the check's output, then "exit N"
  if [ "$IMPL" = ps ]; then
    (cd "$T" && "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .claude/skills/share-lessons/scripts/check-anon.ps1 "$1" 2>&1; echo "exit $?") | tr -d '\r'
  else
    (cd "$T" && bash .claude/skills/share-lessons/scripts/check-anon.sh "$1" 2>&1; echo "exit $?")
  fi
}
expect() { # expect <case> <draft text> <expected output>
  printf '%s\n' "$2" > "$T/history/lessons-draft.md"
  local got; got="$(run history/lessons-draft.md)"
  if [ "$got" = "$3" ]; then pass=$((pass + 1)); echo "PASS  $1"
  else fail=$((fail + 1)); echo "FAIL  $1"; diff <(printf '%s\n' "$3") <(printf '%s\n' "$got") | sed 's/^/      | /'; fi
}

expect "names, companies, places and patterns" \
"What worked: a referral from Jordan at northwind. Pat was great; Globex hired me near Denver.
I got 85k, about \$92,000. Call +1 (555) 010-2030 or alex@example.com, see https://example.com/x on 2026-10-01.
Acmeville is a nice place. An analyst role at a remote-first company." \
"found: from your files: alex
found: from your files: denver
found: from your files: globex
found: from your files: jordan
found: from your files: northwind
found: from your files: pat
found: email: alex@example.com
found: link: https://example.com/x
found: phone: +1 (555) 010-2030
found: pay: \$92,000.
found: pay: 85k
found: exact date: 2026-10-01
check: 12 found
exit 1"

expect "a clean draft passes" \
"Outcome: got a job
Work and country: data analysis, United States
What made the difference: a referral from a former manager, and applying in the first week." \
"ok: nothing personal found by the automatic check (it can't catch everything: read the draft yourself)
exit 0"

expect "a person's whole name wins over a part, and case doesn't matter" \
"PAT LEE helped. So did alex." \
"found: from your files: alex
found: from your files: pat lee
check: 2 found
exit 1"

expect "a short name keeps its last word when the legal words go" \
"AB Group was great." \
"found: from your files: ab group
check: 1 found
exit 1"

expect "legal words don't hide a company, and euro and pound pay are caught" \
"Umbrella was strict and Hooli was kind. I took €85000 there, or £60k elsewhere." \
"found: from your files: hooli
found: from your files: umbrella
found: pay: £60k
found: pay: €85000
check: 4 found
exit 1"

echo
echo "check-anon fixtures ($IMPL): passed $pass, failed $fail"
[ "$fail" -eq 0 ]
