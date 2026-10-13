#!/usr/bin/env bash
# Prints the job-search summary used by the session-start hook and status line.
# Usage: summary.sh [short|next|long] (short: counts; next: the most urgent item, for the status line;
# long: the startup note). Plain bash + awk so it runs on macOS, Linux, and Git Bash on Windows.
# session-start.ps1 is the Windows port of this file: keep the two in step.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
MODE="${1:-short}"
TODAY="$(date +%Y-%m-%d)"
WDAY="$(LC_ALL=C date +%A)"
PREFS=profile/preferences.md

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

# pref <key>: the value on the first "key:" line of the preferences (comments and blanks give "").
pref() { sed -n "s/^$1:[[:space:]]*//p" "$PREFS" 2>/dev/null | head -1 | tr -d '\r' | sed 's/[[:space:]]*<!--.*//; s/[[:space:]]*$//'; }
CLOSED=0; case "$(pref search_status)" in closed*) CLOSED=1 ;; esac
if [ "$CLOSED" = 0 ] && [ "$MODE" != "long" ] && { [ ! -f "$PREFS" ] || grep -q '^SETUP: not done' "$PREFS" 2>/dev/null; }; then echo "not set up yet (type /start)"; exit 0; fi
TRACKER=jobs/tracker.csv
if [ ! -f "$TRACKER" ]; then
  if [ "$CLOSED" = 1 ]; then echo "search closed. Congratulations!"; else echo "no tracker"; fi
  exit 0
fi
LAYOFF=/dev/null; [ -f jobs/layoff-plan.md ] && LAYOFF=jobs/layoff-plan.md

# date_order (csvdate.ts dateOrder): the first "date_order:" line outside HTML comments, optionally
# written as a list item ("- date_order: DMY"); MDY, DMY or YMD in any case; anything else = unknown.
DATE_ORDER="$(tr -d '\r' < "$PREFS" 2>/dev/null | awk '{
  s = $0; out = ""
  while (s != "") {
    if (inc) { i = index(s, "-->"); if (!i) s = ""; else { s = substr(s, i + 3); inc = 0 } }
    else { i = index(s, "<!--"); if (!i) { out = out s; s = "" } else { out = out substr(s, 1, i - 1); s = substr(s, i + 4); inc = 1 } }
  }
  if (match(tolower(out), /^[ \t]*([-*][ \t]+)?date_order:[ \t]*`?[a-z][a-z][a-z]/)) {
    v = tolower(substr(out, RSTART + RLENGTH - 3, 4)); if (v ~ /^(mdy|dmy|ymd)([^a-z]|$)/) print toupper(substr(v, 1, 3)); exit
  } }')"

LC_ALL=C tr '\r' '\n' < "$TRACKER" | LC_ALL=C awk -v today="$TODAY" -v wday="$WDAY" -v mode="$MODE" -v drafts="$DRAFTS" -v bom="$BOM" \
  -v closed="$CLOSED" -v order="$DATE_ORDER" -v layoff="$LAYOFF" \
  -v vtype="$(pref visa_type)" -v vstart="$(pref visa_clock_start)" -v vallowed="$(pref visa_days_allowed)" \
  -v vused="$(pref visa_days_used)" -v vasof="$(pref visa_days_used_as_of)" -v certday="$(pref benefits_cert_day)" '
function isodate(s) { return s ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/ }
# Day number, for differences between two YYYY-MM-DD dates.
function dnum(s,   y, m, d) { y = substr(s, 1, 4) + 0; m = substr(s, 6, 2) + 0; d = substr(s, 9, 2) + 0; if (m <= 2) { y--; m += 12 }
  return 365 * y + int(y / 4) - int(y / 100) + int(y / 400) + int((153 * (m - 3) + 2) / 5) + d }
function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
function mk(y, m, d) { if (m < 1 || m > 12 || d < 1 || d > 31) return ""; return sprintf("%04d-%02d-%02d", (length(y) == 2 ? 2000 + y : y), m, d) }
# The order a slash date proves by itself (a part over 12, the other a month): "MDY", "DMY" or "".
function slashorder(d,   p) {
  d = trim(d)
  if (d !~ /^[0-9][0-9]?\/[0-9][0-9]?\/([0-9][0-9]|[0-9][0-9][0-9][0-9])$/) return ""
  split(d, p, "/"); p[1] += 0; p[2] += 0
  if (p[1] > 12 && p[2] >= 1 && p[2] <= 12) return "DMY"
  if (p[2] > 12 && p[1] >= 1 && p[1] <= 12) return "MDY"
  return ""
}
# Dates (the same rules as csvdate.ts in the panels): YYYY-MM-DD always; YYYY/MM/DD always year first;
# D.M.YYYY always day first; a slash date by its own parts (a part over 12, or both equal), else by
# another slash date in the same row (rowo), else by date_order in the preferences; otherwise it is
# "date unclear" (amb = 1), never alerted on. A date that cannot be read comes back as written.
function iso(d,   p, a, b, r, o) {
  amb = 0; d = trim(d)
  if (d ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]?-[0-9][0-9]?$/) { split(d, p, "-"); r = mk(p[1], p[2] + 0, p[3] + 0); return r != "" ? r : d }
  if (d ~ /^[0-9][0-9][0-9][0-9]\/[0-9][0-9]?\/[0-9][0-9]?$/) { split(d, p, "/"); r = mk(p[1], p[2] + 0, p[3] + 0); return r != "" ? r : d }
  if (d ~ /^[0-9][0-9]?\.[0-9][0-9]?\.([0-9][0-9]|[0-9][0-9][0-9][0-9])$/) { split(d, p, "."); r = mk(p[3], p[2] + 0, p[1] + 0); return r != "" ? r : d }
  if (d !~ /^[0-9][0-9]?\/[0-9][0-9]?\/([0-9][0-9]|[0-9][0-9][0-9][0-9])$/) return d
  split(d, p, "/"); a = p[1] + 0; b = p[2] + 0
  if (a == b) r = mk(p[3], a, b)
  else if (a > 12) r = mk(p[3], b, a)
  else if (b > 12) r = mk(p[3], a, b)
  else {
    o = rowo; if (o == "") o = order
    if (o == "MDY") r = mk(p[3], a, b)
    else if (o == "DMY") r = mk(p[3], b, a)
    else { amb = 1; return d }
  }
  return r != "" ? r : d
}
# "Also: Interview 2026-10-12" at the start of the notes of a job: a second dated commitment (csvdate.ts alsoOf).
function also(notes,   s, t, dt) {
  alsoText = ""; alsoDate = ""
  if (!match(notes, /^[ \t]*[Aa][Ll][Ss][Oo]:[ \t]*/)) return 0
  s = substr(notes, RLENGTH + 1); if (match(s, /[;|]/)) s = substr(s, 1, RSTART - 1)
  if (match(s, /[0-9][0-9][0-9][0-9]-[0-9][0-9]?-[0-9][0-9]?|[0-9][0-9]?[.\/][0-9][0-9]?[.\/]([0-9][0-9][0-9][0-9]|[0-9][0-9])/)) {
    dt = substr(s, RSTART, RLENGTH); t = trim(substr(s, 1, RSTART - 1))
    alsoText = trim(t " " dt); alsoDate = iso(dt); if (!isodate(alsoDate)) alsoDate = ""
    return 1
  }
  return 0
}
# CSV: a double quote opens a quoted cell only as the first character of a cell; anywhere else it is
# an ordinary character. A quoted cell may run over several lines (Excel Alt+Enter in notes).
function feed(line,   i, c, L) {
  L = length(line)
  for (i = 1; i <= L; i++) {
    c = substr(line, i, 1)
    if (q) { if (c == "\"") { if (substr(line, i + 1, 1) == "\"") { f = f "\""; i++ } else q = 0 } else f = f c }
    else if (c == "\"" && cs) { q = 1; cs = 0 }
    else if (c == ",") { F[++n] = f; f = ""; cs = 1 }
    else { f = f c; cs = 0 }
  }
}
function col(name) { return (name in H) ? F[H[name]] : "" }
# Due items, ranked: 0 = offers and overdue layoff-plan steps, 1 = interviews, take-homes and
# deadlines, 2 = everything else; earliest date first within a rank.
function addDue(rank, date, text) { due++; R[due] = rank; D[due] = date; T[due] = text }
function addList(name, text) { cnt[name]++; if (cnt[name] <= 5) L[name] = L[name] (L[name] == "" ? "" : "; ") text }
function row(   co, role, st, act, d, dl, k, o, rank, text, extra, nd) {
  co = trim(col("company")); if (co == "") return
  role = col("role"); st = tolower(trim(col("status"))); act = col("next_action")
  total++; count[st]++
  if (act ~ /^[ \t]*[Ss]end withdrawal/) addList("withdraw", co " (" role ")")
  if (st !~ /^(interested|applied|screening|interviewing|offer)$/) return
  open++
  rowo = ""
  for (k = 1; k <= n; k++) { o = slashorder(F[k]); if (o == "") continue; if (rowo == "" || rowo == o) rowo = o; else { rowo = "?"; break } }
  if (rowo == "?") rowo = ""
  d = iso(col("next_action_date")); if (amb) addList("unclear", co " (" role "): next step " d)
  dl = iso(col("deadline")); if (amb) addList("unclear", co " (" role "): deadline " dl)
  if (also(col("notes"))) {
    if (amb) addList("unclear", co " (" role "): " alsoText)
    else if (alsoDate != "" && alsoDate <= today)
      addDue(st == "offer" ? 0 : (alsoText ~ /[Ii]nterview|[Tt]ake-home/ ? 1 : 2), alsoDate, co " (" role "): " alsoText " [due " alsoDate "]")
  }
  if (st == "interested" && isodate(dl) && dl < today) { addList("passed", co " (" role ") [deadline " dl "]"); return }
  rank = 2; text = ""; extra = ""; nd = ""
  if (isodate(d) && d <= today) { text = act " [due " d "]"; nd = d }
  if (isodate(dl) && dnum(dl) - dnum(today) <= 3) {
    if (st == "offer") extra = "answer the offer by " dl (dl < today ? " (passed)" : "")
    else if (st == "interested") extra = "apply by " dl
    if (extra != "") { rank = 1; if (nd == "" || dl < nd) nd = dl }
  }
  if (text == "" && extra == "") return
  if (st == "offer") rank = 0
  else if (act ~ /[Ii]nterview|[Tt]ake-home/) rank = 1
  addDue(rank, nd, co " (" role "): " text (text != "" && extra != "" ? "; " : "") extra)
}
BEGIN { cont = 0 }
{
  if (!cont) { split("", F); n = 0; f = ""; q = 0; cs = 1 } else f = f "\n"
  feed($0)
  if (q) { cont = 1; next }
  cont = 0; F[++n] = f
  if (!hdr && index(F[1], bom) == 1) F[1] = substr(F[1], length(bom) + 1)
  blank = 1; for (i = 1; i <= n; i++) if (trim(F[i]) != "") { blank = 0; break }
  if (blank) next                                     # empty rows do not count (not even as the header)
  if (!hdr) {
    hdr = 1; h1 = F[1]
    if (n == 1 && gsub(/;/, ";", h1) >= 2) semis = 1
    for (i = 1; i <= n; i++) { k = tolower(trim(F[i])); if (!(k in H)) H[k] = i }
    next
  }
  if (!semis) row()
}
END {
  if (semis || cont || !("company" in H) || !("status" in H)) {
    if (semis) {
      s = "tracker saved with semicolons; ask the assistant to fix it"
      l = "jobs/tracker.csv was saved with semicolons between the columns instead of commas (Excel does this in many European regions), so it can'"'"'t be read safely. Ask the assistant to fix it. (Assistant: tell the user this, and offer to convert it back to commas; the panels will not save to it until then.)"
    } else if (cont) {
      s = "tracker looks damaged; ask the assistant to fix it"
      l = "jobs/tracker.csv looks damaged: a cell starts with a double quote that is never closed, so the rows after it run together and the panels will not save to it. Read the file, find the unfinished quote, and show the user the fix before changing anything."
    } else {
      s = "tracker header looks wrong; ask the assistant to fix it"
      l = "jobs/tracker.csv does not start with the usual header row (company,role,status,...), so it cannot be read. Read it and offer the user a fix before changing anything."
    }
    print (mode == "long" ? l : s); exit
  }
  # Layoff plan: unchecked dated lines due within 3 days or overdue.
  while ((getline ln < layoff) > 0) {
    sub(/\r$/, "", ln)
    if (ln !~ /^- \[ \] [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/) continue
    ld = substr(ln, 7, 10); if (dnum(ld) - dnum(today) > 3) continue
    t = substr(ln, 17); sub(/^ *(\([A-Za-z]+\))? *:? */, "", t); if (length(t) > 90) t = substr(t, 1, 87) "..."
    addDue(ld < today ? 0 : 1, ld, "Layoff plan: " t " [" (ld < today ? "overdue since " : "due ") ld "]")
  }
  # Benefits certification day: a weekday name, or "every other <weekday> from YYYY-MM-DD".
  cd = tolower(certday); wd = tolower(substr(wday, 1, 3)); cert = 0
  if (match(cd, /every other [a-z]+ from [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/)) {
    split(substr(cd, RSTART, RLENGTH), w, " ")
    if (substr(w[3], 1, 3) == wd && dnum(today) >= dnum(w[5]) && (dnum(today) - dnum(w[5])) % 14 == 0) cert = 1
  } else if (cd ~ /^(every )?(mon|tue|wed|thu|fri|sat|sun)[a-z]*([ ,.;(]|$)/) {
    sub(/^every /, "", cd); if (substr(cd, 1, 3) == wd) cert = 1
  }
  # Visa unemployment clock.
  vleft = ""
  if (isodate(vstart) && vallowed ~ /^[0-9]+/) {
    vallowed += 0; u = (vused ~ /^[0-9]+/ ? vused + 0 : 0)
    if (isodate(vasof)) u += dnum(today) - dnum(vasof); else u += dnum(today) - dnum(vstart) + 1
    vleft = vallowed - u
  }
  # Sort the due items: rank, then date.
  for (i = 2; i <= due; i++) {
    r = R[i]; dd = D[i]; tt = T[i]
    for (j = i - 1; j >= 1 && (R[j] > r || (R[j] == r && D[j] > dd)); j--) { R[j + 1] = R[j]; D[j + 1] = D[j]; T[j + 1] = T[j] }
    R[j + 1] = r; D[j + 1] = dd; T[j + 1] = tt
  }
  if (closed) {
    line = "search closed. Congratulations!"
    if (mode != "long") {
      if (open > 0) line = line " " open " still open"
      if (drafts > 0) line = line (open > 0 ? "," : "") " " drafts " in Outbox"
      print line; exit
    }
    print line
    if (open > 0) print open " job(s) are still open in the tracker. Help the user send any withdrawals and mark them withdrawn."
    if (cnt["withdraw"] > 0) print "Withdrawal notes still to send: " L["withdraw"] (cnt["withdraw"] > 5 ? "; and " cnt["withdraw"] - 5 " more" : "") "."
    if (drafts > 0) print drafts " draft(s) still waiting in the Outbox."
    exit
  }
  line = count["applied"] + 0 " applied"
  if (count["screening"] > 0) line = line ", " count["screening"] " screening"
  line = line ", " count["interviewing"] + 0 " interviewing"
  if (count["offer"] > 0) line = line ", " count["offer"] " offer(s)"
  line = line ", " count["interested"] + 0 " to apply"
  if (due > 0) line = line ", " due " due"
  if (drafts > 0) line = line ", " drafts " in Outbox"
  if (cert) line = line ", certify benefits today"
  if (vleft != "" && vleft <= 30) line = line ", visa days left: " vleft
  if (total == 0 && drafts == 0 && due == 0 && !cert && vleft == "") { print (mode != "long" ? "nothing tracked yet (try /find-jobs)" : "Pipeline: nothing tracked yet."); exit }
  if (mode == "short") { print line; exit }
  if (mode == "next") {
    nx = ""
    if (cert) nx = "certify benefits today; "
    if (vleft != "" && vleft <= 30) nx = nx "visa days left: " vleft "; "
    if (due > 0) { t = T[1]; if (length(t) > 90) t = substr(t, 1, 87) "..."; nx = nx "next: " t (due > 1 ? " (+" due - 1 " more: /today)" : "") }
    else nx = nx "nothing due today (/today for a plan)"
    print nx; exit
  }
  print "Pipeline: " line
  if (cert) print "Today is the user'"'"'s benefits certification day (" certday "). Offer to bring their work-search log up to date (the work-search-log skill) before they certify."
  if (vleft != "") print "Visa clock" (vtype != "" ? " (" vtype ")" : "") ": about " vleft " of " vallowed " unemployment days left (estimate from the preferences; the official count always wins)." (vleft <= 30 ? " Urgent: mention it today." : "")
  if (due > 0) {
    print "Due today, overdue, or deadline within 3 days (most urgent first):"
    for (i = 1; i <= due && i <= 10; i++) print "- " T[i]
    if (due > 10) print "- ...and " due - 10 " more"
  }
  if (cnt["passed"] > 0) print "Application deadline passed (suggest marking skipped unless the posting is still open): " L["passed"] (cnt["passed"] > 5 ? "; and " cnt["passed"] - 5 " more" : "")
  if (cnt["unclear"] > 0) print "Date unclear (could be day/month or month/day), so not counted above: " L["unclear"] (cnt["unclear"] > 5 ? "; and " cnt["unclear"] - 5 " more" : "") ". Ask the user which they mean before giving deadline advice, then save it as YYYY-MM-DD; never guess. If date_order is blank in the preferences, ask whether their spreadsheet puts the day or the month first."
}'
