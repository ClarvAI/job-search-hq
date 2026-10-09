#!/usr/bin/env bash
# Prints the job-search summary used by the session-start hook and status line.
# Usage: summary.sh [short|long]. Plain bash + awk so it runs on macOS, Linux, and Git Bash on Windows.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
MODE="${1:-short}"
TODAY="$(date +%Y-%m-%d)"
SOON="$(date -v+3d +%Y-%m-%d 2>/dev/null || date -d "+3 days" +%Y-%m-%d 2>/dev/null)"

BOM="$(printf '\357\273\277')"
# One awk pass over every draft (fast with hundreds of files). Counts files with front matter whose status is blank or draft, like the Outbox panel.
DRAFTS="$(awk -v bom="$BOM" '
  function done_file() { if (valid && (st == "" || st == "draft")) n++ }
  FNR == 1 { if (NR > 1) done_file(); valid = 0; h = 0; st = ""; if (index($0, bom) == 1) $0 = substr($0, length(bom) + 1) }
  { sub(/\r$/, "") }
  FNR == 1 { if ($0 ~ /^---/) { h = 1; next } else nextfile }
  h == 1 && /^---/ { valid = 1; done_file(); valid = 0; nextfile }
  h == 1 && /^status:/ { v = $0; sub(/^status:[ \t]*/, "", v); sub(/[ \t#].*$/, "", v); st = tolower(v) }
  END { print n + 0 }' outbox/[!_]*.md 2>/dev/null)"
[ -n "$DRAFTS" ] || DRAFTS=0

if grep -q '^search_status: closed' profile/preferences.md 2>/dev/null; then echo "search closed. Congratulations!"; exit 0; fi
if { [ ! -f profile/preferences.md ] || grep -q '^SETUP: not done' profile/preferences.md 2>/dev/null; } && [ "$MODE" = "short" ]; then echo "not set up yet (type /start)"; exit 0; fi
[ -f jobs/tracker.csv ] || { echo "no tracker"; exit 0; }
LC_ALL=C tr '\r' '\n' < jobs/tracker.csv | LC_ALL=C awk -v today="$TODAY" -v soon="$SOON" -v mode="$MODE" -v drafts="$DRAFTS" -v bom="$BOM" '
# Excel may save dates with slashes, in the order set by the region of the computer. Only an order that can
# be told apart (one part over 12, or both parts the same) is read; 03/04/2026 sets amb and is skipped.
function iso(d,   p, a, b, y) {
  amb = 0; gsub(/^[ \t]+|[ \t]+$/, "", d)
  if (split(d, p, "/") != 3 || p[1] !~ /^[0-9][0-9]?$/ || p[2] !~ /^[0-9][0-9]?$/ || p[3] !~ /^[0-9][0-9]([0-9][0-9])?$/) return d
  a = p[1] + 0; b = p[2] + 0; y = (length(p[3]) == 2 ? 2000 + p[3] : p[3])
  if (a < 1 || b < 1 || a > 31 || b > 31) return d
  if (a <= 12 && (b > 12 || a == b)) return sprintf("%04d-%02d-%02d", y, a, b)   # month/day
  if (b <= 12 && a > 12) return sprintf("%04d-%02d-%02d", y, b, a)               # day/month
  if (a <= 12 && b <= 12) amb = 1
  return d
}
function addDue(text) { due++; if (due <= 10) dueList = dueList "\n- " text; else more++ }
function parse(line,   i, c, f, q, n) {
  split("", F); n = 0; f = ""; q = 0
  for (i = 1; i <= length(line); i++) {
    c = substr(line, i, 1)
    if (q) { if (c == "\"") { if (substr(line, i + 1, 1) == "\"") { f = f "\""; i++ } else q = 0 } else f = f c }
    else if (c == "\"") q = 1
    else if (c == ",") { F[++n] = f; f = "" }
    else f = f c
  }
  F[++n] = f
  return n
}
# Join records whose quoted cells contain line breaks (Excel Alt+Enter in notes).
{ rec = (pending == "" ? $0 : pending "\n" $0); if (gsub(/"/, "\"", rec) % 2) { pending = rec; next }; pending = ""; $0 = rec }
NR == 1 { if (index($0, bom) == 1) $0 = substr($0, length(bom) + 1); n = parse($0); for (i = 1; i <= n; i++) H[tolower(F[i])] = i; next }
NF == 0 { next }
{
  parse($0)
  co = F[H["company"]]; if (co == "") next
  st = tolower(F[H["status"]]); gsub(/^[ \t]+|[ \t]+$/, "", st); d = iso(F[H["next_action_date"]]); act = F[H["next_action"]]; role = F[H["role"]]
  count[st]++
  if (amb && st ~ /^(interested|applied|screening|interviewing|offer)$/) ambn++
  if (st ~ /^(interested|applied|screening|interviewing|offer)$/ && d ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/ && d <= today) {
    addDue(co " (" role "): " act " [due " d "]")
  }
  if (st ~ /^(interested|offer)$/ && soon != "" && !(d ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/ && d <= today)) {
    dl = iso(F[H["deadline"]]); if (amb) ambn++
    if (dl ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/ && dl <= soon) {
      addDue(co " (" role "): " (st == "offer" ? "answer the offer" : "apply") " [deadline " dl "]")
    }
  }
}
END {
  applied = count["applied"] + count["screening"]
  line = applied + 0 " applied, " count["interviewing"] + 0 " interviewing"
  if (count["offer"] > 0) line = line ", " count["offer"] " offer(s)"
  line = line ", " count["interested"] + 0 " to apply"
  if (due > 0) line = line ", " due " due"
  if (drafts > 0) line = line ", " drafts " in Outbox"
  total = 0; for (k in count) total += count[k]
  if (total == 0 && drafts == 0) { print (mode == "short" ? "nothing tracked yet (try /find-jobs)" : "Pipeline: nothing tracked yet."); exit }
  if (mode == "short") { print line; exit }
  print "Pipeline: " line
  if (due > 0) print "Due today, overdue, or deadline within 3 days:" dueList (more > 0 ? "\n- ...and " more " more" : "")
  if (ambn > 0) print "Some open jobs have dates like 03/04/2026 that could be day/month or month/day, so they were left out above. Ask the user what they mean before giving deadline advice, then save them as YYYY-MM-DD."
}'
