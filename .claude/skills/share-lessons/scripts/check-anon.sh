#!/usr/bin/env bash
# Read-only privacy check for a lessons-learned draft before the user posts it publicly (share-lessons skill).
# Flags, in this order:
#   1. any company, person, email or place from the user's own files: jobs/tracker.csv (company, contact,
#      location), contacts/contacts.csv (name, company, email), profile/preferences.md (name:), as a whole
#      value or (for people) a single name of 3+ letters, matched as a whole word, ignoring case;
#   2. email addresses, phone numbers, links, pay figures, and exact dates.
# Prints "found: <what>: <text>" lines (lowercase, sorted, each once), then "ok: ..." or "check: N found";
# exits 1 when anything is found. It can't catch everything (a school, a project name, a manager described in
# words): the assistant and the user still read the draft. check-anon.ps1 does the same on Windows.
# Usage (from the workspace folder): bash .claude/skills/share-lessons/scripts/check-anon.sh <draft file>
set -u
DRAFT="${1:-}"
[ -n "$DRAFT" ] && [ -f "$DRAFT" ] || { echo "error: no draft file (usage: check-anon.sh <draft file>)"; exit 2; }
cd "$(dirname "$0")/../../../.." 2>/dev/null || exit 2
case "$DRAFT" in /*) ;; *) DRAFT="$OLDPWD/$DRAFT" ;; esac
T="$(mktemp "${TMPDIR:-/tmp}/anon.XXXXXX")" || exit 2
trap 'rm -f "$T" "$T.terms" "$T.text"' EXIT

# csvcol <file> <column>...: the values of those columns, one per line (quotes, commas inside quotes, a BOM
# and CRLF handled). (No awk array named RT, RS, FS, ...: GNU awk's built-ins RT and the like are fatal as array names.)
csvcol() {
  local f="$1"; shift
  [ -f "$f" ] || return 0
  LC_ALL=C awk -v want="$*" -v bom="$(printf '\357\273\277')" '
    function split_row(s,   i, c, q, cell, n) {
      n = 0; cell = ""; q = 0
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (q) { if (c == "\"") { if (substr(s, i + 1, 1) == "\"") { cell = cell "\""; i++ } else q = 0 } else cell = cell c }
        else if (c == "\"" && cell == "") q = 1
        else if (c == ",") { CELL[++n] = cell; cell = "" }
        else cell = cell c
      }
      CELL[++n] = cell; return n
    }
    { sub(/\r$/, ""); if (NR == 1 && index($0, bom) == 1) $0 = substr($0, length(bom) + 1) }
    NR == 1 { n = split_row($0); for (i = 1; i <= n; i++) COL[tolower(CELL[i])] = i; nw = split(want, W, " "); next }
    { split_row($0); for (j = 1; j <= nw; j++) if (W[j] in COL) { v = CELL[COL[W[j]]]; gsub(/^[ \t]+|[ \t]+$/, "", v); if (v != "") print v } }
  ' "$f"
}

{
  csvcol jobs/tracker.csv company location
  csvcol contacts/contacts.csv company email
  # A company like "Globex, Inc.": its name on its own too.
  { csvcol jobs/tracker.csv company; csvcol contacts/contacts.csv company; } | sed 's/,.*$//'
  # People: the whole name and each part of it.
  { csvcol jobs/tracker.csv contact; csvcol contacts/contacts.csv name
    [ -f profile/preferences.md ] && sed -n 's/^name:[[:space:]]*//p' profile/preferences.md | tr -d '\r' | head -1
  } | while IFS= read -r p; do printf '%s\n' "$p"; printf '%s\n' "$p" | tr ',;/' '\n\n\n' | tr ' ' '\n'; done
  # A place like "Austin TX": the city on its own too.
  csvcol jobs/tracker.csv location | tr ',' '\n' | sed 's/^[[:space:]]*//; s/[[:space:]][A-Z][A-Z]$//'
} | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | awk 'length($0) >= 3' | grep -v '^[0-9]*$' \
  | grep -viwE 'remote|hybrid|onsite|on-site|inc|llc|ltd|corp|the|and|team|lead|n/a|none|unknown' | LC_ALL=C sort -u > "$T.terms"

tr -d '\r' < "$DRAFT" > "$T.text"
: > "$T"
if [ -s "$T.terms" ]; then
  LC_ALL=C grep -oiwF -f "$T.terms" "$T.text" 2>/dev/null | tr '[:upper:]' '[:lower:]' | LC_ALL=C sort -u | sed 's/^/found: from your files: /' >> "$T"
fi
pat() { # pat <label> <extended regex>
  LC_ALL=C grep -oE -- "$2" "$T.text" 2>/dev/null | tr '[:upper:]' '[:lower:]' | LC_ALL=C sort -u | sed "s|^|found: $1: |" >> "$T"
}
pat "email" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
pat "link" '(https?://|www\.)[^[:space:])]+'
pat "phone" '\+?\(?[0-9]{1,4}\)?[ .-][0-9 ().-]{6,}[0-9]|\b[0-9]{10,}\b'
pat "pay" '[$€£¥][[:space:]]?[0-9][0-9,.]*[kKmM]?|[0-9]+([.,][0-9]+)?[[:space:]]?[kK]\b|\b[0-9]{2,3},[0-9]{3}\b'
pat "exact date" '\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b|\b[0-9]{1,2}[/.][0-9]{1,2}[/.][0-9]{2,4}\b'

n="$(grep -c . "$T")"
cat "$T"
if [ "$n" -eq 0 ]; then echo "ok: nothing personal found by the automatic check (it can't catch everything: read the draft yourself)"; exit 0; fi
echo "check: $n found"
exit 1
