#!/usr/bin/env bash
# Scheduled routines: decide before any real work whether this run should skip, so a skipped run costs a few
# hundred tokens instead of a whole skill. Prints "GO" or "SKIP: <reason>"; on a skip it also appends the run's
# line to history/routines.md (the routines skill's log), so the assistant only stops. Rules (scheduled-mode.md,
# "Before anything"): setup not done, the sample workspace, a closed search, a paused search (the newest
# "YYYY-MM-DD: search paused until YYYY-MM-DD." line naming a later date, with no "search resumed" line after
# it); the certification reminder keeps running on a paused or closed search while benefits_cert_day: is set,
# and skips when it isn't set or (for a plain weekday) when today isn't that day; the weekly review skips when
# interviews/weekly-<date>.md from the last 6 days exists; and a routine that changes the spreadsheets skips while
# one is open in Excel (a ~$ lock file in jobs/ or contacts/), so it can't overwrite the user's edits.
# precheck.ps1 does the same on Windows.
# Usage: bash .claude/skills/routines/scripts/precheck.sh "<routine name>"     (e.g. "morning scan")
set -u
NAME="${1:-}"
[ -n "$NAME" ] || { echo "error: no routine name (usage: precheck.sh \"morning scan\")"; exit 2; }
cd "$(dirname "$0")/../../../.." 2>/dev/null || { echo "GO"; exit 0; }
TODAY="$(date +%Y-%m-%d)"
NOW="$(date '+%Y-%m-%d %H:%M')"
P=profile/preferences.md
key="$(printf '%s' "$NAME" | tr 'A-Z' 'a-z')"
isCert=""; [ "$key" = "certification reminder" ] && isCert=1
pref() { [ -f "$P" ] && sed -n "s/^[[:space:]]*-\{0,1\}[[:space:]]*$1:[[:space:]]*//p" "$P" | tr -d '\r' | head -1 | sed 's/[[:space:]]*<!--.*$//; s/[[:space:]]*$//'; }
cert="$(pref benefits_cert_day)"

skip() {
  mkdir -p history 2>/dev/null
  if [ ! -f history/routines.md ]; then printf '# Routine results\n\n' > history/routines.md 2>/dev/null; fi
  printf -- '- %s · %s · skipped: %s\n' "$NOW" "$NAME" "$1" >> history/routines.md 2>/dev/null
  echo "SKIP: $1"
  exit 0
}

if [ ! -f "$P" ] || grep -q '^SETUP: not done' "$P" 2>/dev/null; then skip "setup not done"; fi
[ -f .sample-workspace ] && skip "sample workspace"
closed=""; grep -qE '^search_status:[[:space:]]*closed' "$P" 2>/dev/null && closed=1
# The newest pause line, and whether a "search resumed" line comes after it.
paused="$(tr -d '\r' < "$P" | awk -v today="$TODAY" '
  /^[- ]*[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]: search paused until [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/ {
    s = $0; sub(/^.*search paused until /, "", s); until = substr(s, 1, 10); resumed = 0; next }
  /^[- ]*[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]: search resumed/ { resumed = 1 }
  END { if (until != "" && until > today && !resumed) print until }')"
if [ -n "$isCert" ]; then
  [ -n "$cert" ] || skip "no certification day set; this routine can be deleted"
  # A plain weekday ("Tuesday"): skip on the other days. Anything else ("every other Tuesday from ...") is
  # left to the routine itself.
  wd="$(printf '%s' "$cert" | tr 'A-Z' 'a-z')"
  case "$wd" in monday|tuesday|wednesday|thursday|friday|saturday|sunday)
    [ "$wd" = "$(LC_ALL=C date +%A | tr 'A-Z' 'a-z')" ] || skip "not certification day" ;;
  esac
  echo "GO"; exit 0
fi
[ -n "$closed" ] && skip "search closed"
[ -n "$paused" ] && skip "search paused"
if [ "$key" != "weekly review" ]; then
  for f in jobs/'~$'* contacts/'~$'*; do [ -e "$f" ] && skip "a spreadsheet is open in Excel"; done
fi
if [ "$key" = "weekly review" ]; then
  for f in interviews/weekly-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md; do
    [ -f "$f" ] || continue
    d="${f#interviews/weekly-}"; d="${d%.md}"
    # Within the last 6 days: compare as day numbers (the same formula as routine-status.sh).
    if awk -v a="$d" -v b="$TODAY" 'function dn(s, y, m, dd) { y = substr(s, 1, 4) + 0; m = substr(s, 6, 2) + 0; dd = substr(s, 9, 2) + 0; if (m <= 2) { y--; m += 12 }; return 365 * y + int(y / 4) - int(y / 100) + int(y / 400) + int((153 * (m - 3) + 2) / 5) + dd }
         BEGIN { x = dn(b) - dn(a); exit !(x >= 0 && x <= 6) }'; then skip "already done this week"; fi
  done
fi
echo "GO"
