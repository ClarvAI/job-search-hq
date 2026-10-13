#!/usr/bin/env bash
# Fixture tests for the startup summary: .claude/hooks/summary.sh (Mac, Linux, Git Bash) and its
# Windows port .claude/hooks/session-start.ps1. Checks the CSV rules (a quote opens a quoted cell only
# at the start of a cell; an unfinished quote or a semicolon header is reported, not misread) and the
# date rules (YYYY-MM-DD, D.M.YYYY day first, slash dates by their own parts, the row's other dates,
# then date_order; otherwise "date unclear"), passed deadlines, "Also:" notes and urgent-first order,
# contact follow-ups due (contacts.csv, the playbook's contact rules) and Gmail drafts left over 2 days.
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

# A BOM in front of a quoted header still reads (the BOM is stripped before the quote opens).
{ printf '\357\273\277'; printf '%s\n' '"company","role","status","next_action_date","next_action"'; printf '%s\n' 'Acme,Eng,applied,2099-01-01,Follow up'; } | ws bomq ""
OUT="$(run bomq)"
has  "BOM before a quoted header still reads" "Pipeline:"
hasnt "BOM quoted header not misread" "does not start with the usual header"

# A date that is not a real calendar day (Feb 31) is not counted as due and does not crash.
{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2026-02-31,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws feb31 ""
OUT="$(run feb31)"
has  "impossible date does not crash" "Pipeline:"
hasnt "impossible date not counted as due" "[due 2026-02-31]"

# Visa clock (dates relative to today so the formula is exercised, not a fixed answer).
dago() { "$PY" -c "import datetime,sys; print((datetime.date.today()-datetime.timedelta(days=int(sys.argv[1]))).isoformat())" "$1"; }
# Blank days-used: no countdown at all (all four numbers are required).
{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws visablank ""
printf 'SETUP: done\nsearch_status: active\nvisa_clock_start: %s\nvisa_days_allowed: 90\nvisa_days_used:\nvisa_type: F-1 OPT\n' "$(dago 10)" > "$T/visablank/profile/preferences.md"
OUT="$(run visablank)"
hasnt "blank days-used gives no visa countdown" "Visa clock"
# A clock start in the future must not add days (90 of 90, never 91).
{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws visafuture ""
printf 'SETUP: done\nsearch_status: active\nvisa_clock_start: %s\nvisa_days_allowed: 90\nvisa_days_used: 0\nvisa_type: F-1 OPT\n' "$(dago -1)" > "$T/visafuture/profile/preferences.md"
OUT="$(run visafuture)"
has  "future clock start does not overcount" "about 90 of 90"
# Visa and benefits clocks keep running after the search is closed.
{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws closedvisa ""
printf 'SETUP: done\nsearch_status: closed %s\nvisa_clock_start: %s\nvisa_days_allowed: 90\nvisa_days_used: 80\nvisa_type: F-1 OPT\n' "$(dago 3)" "$(dago 3)" > "$T/closedvisa/profile/preferences.md"
OUT="$(run closedvisa)"
has  "visa clock still shown after close" "Visa clock"
has  "closed search still congratulates" "search closed"

# Contact follow-ups (contacts.csv, by the playbook rules) and Gmail drafts left more than 2 days: one short line.
CHDR='name,company,title,relationship,how_we_met,last_contact,next_followup,status,touches,job,linkedin,email,notes'
{ printf '%s\n' "$HDR"
  printf 'Acme,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,\n'
  printf 'Beta,Eng,interested,2099-01-01,Decide,,B,3,X,,,,,,,,,0,beta,\n'; } | ws contacts ""
{ printf '\357\273\277%s\n' "$CHDR"
  printf 'Pat Lee,Globex,Recruiter,recruiter,,2000-01-01,2000-01-03,contacted,1,,,,\n'
  printf 'Cold Kim,Initech,PM,cold,,,2000-01-03,cold,0,,,,\n'
  printf 'Capped Roe,Initech,PM,cold,,,2000-01-03,contacted,2,,,,\n'
  printf 'Owned Wu,Acme,Recruiter,recruiter,,,2000-01-03,contacted,1,acme,,,\n'
  printf 'Beta Park,Beta,Manager,alum,,,2000-01-04,to-contact,0,beta,,,"a note, with ""quotes""\nover two lines"\n'
  printf 'Unclear Diaz,Contoso,Lead,alum,,,03/04/2000,contacted,1,,,,\n'
  printf 'Replied Ray,Initech,Lead,alum,,,2000-01-05,replied,3,,,,\n'
  printf 'Future Fox,Initech,Lead,alum,,,2099-01-01,contacted,1,,,,\n'
  printf 'Proven Day,Contoso,Lead,alum,,25/12/1999,02/01/2000,contacted,1,,,,\n'; } > "$T/contacts/contacts.csv.tmp"
mkdir -p "$T/contacts/contacts"; mv "$T/contacts/contacts.csv.tmp" "$T/contacts/contacts/contacts.csv"
printf -- '---\nchannel: email\nto: a@b.example\nsubject: Old\nstatus: in-gmail-drafts\nstatus_at: 2000-01-01 10:00\n---\nhi\n' > "$T/contacts/outbox/2000-01-01-old.md"
printf -- '---\nchannel: email\nto: a@b.example\nsubject: Older\ncreated: 2000-01-01\nstatus: In-Gmail-Drafts\n---\nhi\n' > "$T/contacts/outbox/2000-01-01-older.md"
printf -- '---\nchannel: email\nto: a@b.example\nsubject: New\nstatus: in-gmail-drafts\nstatus_at: %s 09:00\n---\nhi\n' "$("$PY" -c 'import datetime; print((datetime.date.today()-datetime.timedelta(days=1)).isoformat())')" > "$T/contacts/outbox/new.md"
OUT="$(run contacts)"
has  "contact follow-ups counted by the rules" "Also due: 4 contact follow-ups (Pat Lee (Globex), Beta Park (Beta), Replied Ray (Initech) and 1 more); 2 Gmail drafts made more than 2 days ago and not marked sent."
hasnt "cold, capped and job-owned contacts not due" "Cold Kim"
has  "unclear contact date named, not counted" "Unclear Diaz (contact): follow-up 03/04/2000"
{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws contactsemi ""
mkdir -p "$T/contactsemi/contacts"; printf 'name;company;status;next_followup\nPat;Globex;contacted;2000-01-01\n' > "$T/contactsemi/contacts/contacts.csv"
OUT="$(run contactsemi)"
has  "semicolon contacts file reported" "contacts/contacts.csv was saved with semicolons"
hasnt "semicolon contacts not counted" "Also due:"

# The try-it sample workspace (a .sample-workspace marker): the startup note says so first.
SAMPLE_LINE="This is the SAMPLE workspace (made-up data). Don't run setup or save the user's details here; their own folder is separate."
{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws sample ""
: > "$T/sample/.sample-workspace"
if [ "$IMPL" = ps ]; then OUT="$(run sample)"
else cp "$REPO/.claude/hooks/session-start.sh" "$REPO/.claude/hooks/summary.sh" "$T/sample/.claude/hooks/"; OUT="$(cd "$T/sample" && printf '{}' | CLAUDE_PROJECT_DIR="$T/sample" bash .claude/hooks/session-start.sh 2>/dev/null)"; fi
first="$(printf '%s\n' "$OUT" | head -1)"
if [ "$first" = "$SAMPLE_LINE" ]; then pass=$((pass + 1)); echo "PASS  sample workspace named first"
else fail=$((fail + 1)); echo "FAIL  sample workspace named first (first line: $first)"; fi
OUT="$(run contacts)"
hasnt "no sample line in a real workspace" "SAMPLE workspace"

# The setup checklist in the startup note: profile/setup-progress.md, else (blank or missing) a
# setup_progress line an earlier build left in preferences.md.
prog() { # prog <name> <SETUP line> <checklist in setup-progress.md, or - for no file> <old line in preferences.md, or ->
  local d="$T/$1"
  mkdir -p "$d/profile" "$d/.claude/hooks"
  { printf '%s\n' "$2"; [ "$4" = - ] || printf 'setup_progress: %s\n' "$4"; printf 'search_status: active\n'; } > "$d/profile/preferences.md"
  [ "$3" = - ] || printf '# Setup checklist\n\nsetup_progress: %s\n' "$3" > "$d/profile/setup-progress.md"
  cp "$REPO/.claude/hooks/session-start.ps1" "$d/.claude/hooks/"
  if [ "$IMPL" = ps ]; then run "$1"
  else cp "$REPO/.claude/hooks/session-start.sh" "$REPO/.claude/hooks/summary.sh" "$d/.claude/hooks/"; (cd "$d" && printf '{}' | CLAUDE_PROJECT_DIR="$d" bash .claude/hooks/session-start.sh 2>/dev/null); fi
}
OUT="$(prog pnew 'SETUP: not done' 'resume, status' -)"
has  "partway: from the checklist file" "stopped partway (done so far: resume, status)."
OUT="$(prog pold 'SETUP: not done' - 'resume')"
has  "partway: old line, no checklist file" "stopped partway (done so far: resume)."
OUT="$(prog pblank 'SETUP: not done' '' 'resume, status')"
has  "partway: old line, blank checklist" "stopped partway (done so far: resume, status)."
OUT="$(prog pboth 'SETUP: not done' 'resume, status, preferences' 'resume')"
has  "partway: checklist file wins" "stopped partway (done so far: resume, status, preferences)."
OUT="$(prog pnone 'SETUP: not done' '' -)"
has  "not started: blank checklist" "The user has not finished setup."
hasnt "not started: no partway line" "stopped partway"
OUT="$(prog dpart 'SETUP: done 2026-01-01' 'resume, status, preferences, field-pack' -)"
has  "done: sections left, from checklist" "skipped or not reached yet (story, forms, look, first-week)."
OUT="$(prog dall 'SETUP: done 2026-01-01' 'resume, status, preferences, field-pack, story, forms, look, first-week' -)"
hasnt "done: every section listed" "not reached yet"
hasnt "done: not 'not finished'" "not finished setup"
OUT="$(prog dlegacy 'SETUP: done 2026-01-01' '' -)"
hasnt "done before the checklist existed" "not reached yet"
OUT="$(prog doldpart 'SETUP: done 2026-01-01' '' 'resume, status, preferences')"
has  "done: sections left, from old line" "skipped or not reached yet (field-pack, story, forms, look, first-week)."

# Routine results (history/routines.md, written by scheduled runs): the latest line of each routine from
# the last 24 hours, at most 4, oldest first; older lines, malformed lines, a BOM and CRLF don't matter.
ss() { # ss <name>: the full startup text of a workspace (session-start.sh or session-start.ps1)
  if [ "$IMPL" = ps ]; then run "$1"
  else cp "$REPO/.claude/hooks/session-start.sh" "$REPO/.claude/hooks/summary.sh" "$T/$1/.claude/hooks/"; (cd "$T/$1" && printf '{}' | CLAUDE_PROJECT_DIR="$T/$1" bash .claude/hooks/session-start.sh 2>/dev/null); fi
}
hago() { "$PY" -c "import datetime,sys; print((datetime.datetime.now()-datetime.timedelta(minutes=int(sys.argv[1]))).strftime('%Y-%m-%d %H:%M'))" "$1"; }
hm() { hago "$1" | cut -c12-16; }
{ printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws routines ""
mkdir -p "$T/routines/history"
{ printf '\357\273\277# Routine results\r\n\r\n'
  printf -- '- %s \302\267 morning scan \302\267 9 new leads\r\n' "$(hago 2880)"
  printf -- '- %s \302\267 morning scan \302\267 2 new leads\r\n' "$(hago 180)"
  printf -- '- %s \302\267 follow-up drafts \302\267 1 draft in the Outbox\r\n' "$(hago 150)"
  printf -- '- not a date \302\267 inbox check \302\267 ignored\r\n'
  printf -- '- %s \302\267 certification reminder \302\267 certify today\r\n' "$(hago 132)"
  printf -- '- %s \302\267 inbox check \302\267 1 update\r\n' "$(hago 120)"
  printf -- '- %s \302\267 morning scan \302\267 4 new leads (Job Inbox)\r\n' "$(hago 60)"
  printf -- '- %s \302\267 weekly review\r\n' "$(hago 30)"; } > "$T/routines/history/routines.md"
OUT="$(ss routines)"
has  "routine results: latest per routine" "Routine results from the last 24 hours (automatic runs; mention them in one line when the user first writes): certification reminder ($(hm 132)): certify today; inbox check ($(hm 120)): 1 update; morning scan ($(hm 60)): 4 new leads (Job Inbox); weekly review ($(hm 30))."
hasnt "routine results: older run of a routine" "2 new leads"
hasnt "routine results: older than 24 hours" "9 new leads"
hasnt "routine results: at most 4 routines" "follow-up drafts"
hasnt "routine results: malformed line" "ignored"
OUT="$(ss contacts)"
hasnt "no routine line without the file" "Routine results"
printf -- '- %s \302\267 morning scan \302\267 9 new leads\n' "$(hago 2000)" > "$T/routines/history/routines.md"
OUT="$(ss routines)"
hasnt "no routine line when all are old" "Routine results"
if [ "$IMPL" = ps ]; then
  # The same file through both hooks gives the same line.
  { printf -- '- %s \302\267 morning scan \302\267 4 new leads (Job Inbox)\n' "$(hago 60)"; printf -- '- %s \302\267 inbox check\n' "$(hago 20)"; } > "$T/routines/history/routines.md"
  cp "$REPO/.claude/hooks/session-start.sh" "$REPO/.claude/hooks/summary.sh" "$T/routines/.claude/hooks/"
  a="$(cd "$T/routines" && printf '{}' | CLAUDE_PROJECT_DIR="$T/routines" bash .claude/hooks/session-start.sh 2>/dev/null | grep '^Routine results')"
  b="$(run routines | grep '^Routine results')"
  if [ -n "$a" ] && [ "$a" = "$b" ]; then pass=$((pass + 1)); echo "PASS  routines: session-start.ps1 matches session-start.sh"
  else fail=$((fail + 1)); printf 'FAIL  routines: session-start.ps1 differs from session-start.sh\n      | sh: %s\n      | ps: %s\n' "$a" "$b"; fi
fi

if [ "$IMPL" = sh ]; then
  # Status line: reads the folder from Claude Code's JSON on stdin (not the current folder or env).
  sl() { printf '{"workspace":{"current_dir":"/","project_dir":"%s"}}' "$T/$1" | (cd / && env -u CLAUDE_PROJECT_DIR bash "$REPO/.claude/hooks/statusline.sh"); }
  OUT="$(sl main)"
  has  "status line shows the top item" "Job search: next: Offer (Eng): answer the offer by 2000-01-02 (passed)"
  has  "status line counts the rest" "more: /today)"
  { printf '%s\n' "$HDR"; printf 'Acme,Eng,applied,2099-01-01,Follow up,,A,4,X,,,,,,,,,0,acme,\n'; } | ws calm ""
  OUT="$(sl calm)"
  has  "status line, nothing due" "Job search: nothing due today (/today for a plan)"
  OUT="$(sl semi)"
  has  "status line, damaged tracker" "Job search: tracker saved with semicolons"
  mkdir -p "$T/fresh/profile"; printf 'SETUP: not done\n' > "$T/fresh/profile/preferences.md"
  OUT="$(sl fresh)"
  has  "status line before setup" "Job search: not set up yet (type /start)"
fi

if [ "$IMPL" = ps ]; then
  for c in main order semi open closed bomq feb31 visablank visafuture closedvisa contacts contactsemi; do
    a="$(CLAUDE_PROJECT_DIR="$T/$c" bash "$REPO/.claude/hooks/summary.sh" long)"; b="$(run "$c")"
    if [ "$a" = "$b" ]; then pass=$((pass + 1)); echo "PASS  $c: session-start.ps1 matches summary.sh"
    else fail=$((fail + 1)); echo "FAIL  $c: session-start.ps1 differs from summary.sh"; diff <(printf '%s\n' "$a") <(printf '%s\n' "$b") | sed 's/^/      | /'; fi
  done
fi
echo
echo "summary fixtures ($IMPL): passed $pass, failed $fail"
[ "$fail" -eq 0 ]
