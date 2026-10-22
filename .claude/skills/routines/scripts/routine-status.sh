#!/usr/bin/env bash
# Which routines have stopped running, from history/routines.md (the routines skill's log). Read-only.
# Prints one line per routine, in the order each first appears in the log, fields separated by tabs:
#   <state>	<name>	<last>	<date>	<cadence>
# state: ok, stalled (nothing for longer than its schedule allows), stopped (the user paused or deleted it)
# or inactive (nothing for over 45 days: taken as removed without telling us).
# last/date: "run" and the date of its latest run when it has run since it was last set up, else "setup"
# and the date it was set up. cadence: daily, weekdays, weekly or fortnightly.
# Two kinds of lines: runs (written by the routine), and the user's changes, logged by the assistant:
# "set up (...)", "changed (...)", "paused", "resumed", "deleted". Only "set up" and "resumed" make a
# paused or deleted routine active again; a run or a schedule change doesn't. A routine is stalled when the
# newer of its latest run and its latest set up/changed/resumed line is more than 2 (daily), 4 (weekdays),
# 9 (weekly) or 16 (fortnightly) days old, and at most 45. The cadence comes from its latest "set up (...)"
# or "changed (...)" line, else from its name. Names match case-blind in A-Z only (the same in both
# versions). The name "routines" is reserved for the assistant's own notes ("offered", "not wanted").
# session-start.sh and health.sh use this; routine-status.ps1 does the same on Windows.
# Usage: bash .claude/skills/routines/scripts/routine-status.sh (reads the workspace it lives in)
cd "$(dirname "$0")/../../../.." 2>/dev/null || exit 0
[ -f history/routines.md ] || exit 0
# (No awk array named RT, RS, FS, ...: GNU awk's built-ins RT and the like are fatal as array names.)
LC_ALL=C awk -v today="$(date +%Y-%m-%d)" -v sep=' · ' -v bom="$(printf '\357\273\277')" '
  function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
  function daynum(s,   y, m, d, dim) {  # days since a fixed start, for a real YYYY-MM-DD date (else 0)
    y = substr(s, 1, 4) + 0; m = substr(s, 6, 2) + 0; d = substr(s, 9, 2) + 0
    if (m < 1 || m > 12 || d < 1) return 0
    dim = (m == 2) ? ((y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) ? 29 : 28) : ((m == 4 || m == 6 || m == 9 || m == 11) ? 30 : 31)
    if (d > dim) return 0
    if (m <= 2) { y--; m += 12 }
    return 365 * y + int(y / 4) - int(y / 100) + int(y / 400) + int((153 * (m - 3) + 2) / 5) + d
  }
  function cadence_in(s) {
    if (index(s, "fortnightly")) return "fortnightly"
    if (index(s, "weekdays")) return "weekdays"
    if (index(s, "daily")) return "daily"
    if (index(s, "weekly")) return "weekly"
    return ""
  }
  { sub(/\r$/, ""); if (NR == 1 && index($0, bom) == 1) $0 = substr($0, length(bom) + 1) }
  /^- [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]( |$)/ {
    dt = substr($0, 3, 10); if (daynum(dt) == 0) next
    rest = trim(substr($0, 19)); if (index(rest, trim(sep)) == 1) rest = trim(substr(rest, length(trim(sep)) + 1))
    i = index(rest, sep); nm = trim(i ? substr(rest, 1, i - 1) : rest); rs = tolower(trim(i ? substr(rest, i + length(sep)) : ""))
    k = tolower(nm); if (nm == "" || k == "routines") next
    if (!(k in NAME)) { n++; ORD[n] = k; STOP[k] = 0 }
    NAME[k] = nm
    if (rs ~ /^(paused|deleted)/) { STOP[k] = 1; next }
    if (rs ~ /^set up/) { STOP[k] = 0; SETUP[k] = dt; ADMIN[k] = dt; RAN[k] = 0; c = cadence_in(rs); if (c != "") CAD[k] = c; next }
    if (rs ~ /^changed/) { ADMIN[k] = dt; c = cadence_in(rs); if (c != "") CAD[k] = c; next }
    if (rs ~ /^resumed/) { STOP[k] = 0; ADMIN[k] = dt; next }
    RUN[k] = dt; RAN[k] = 1
  }
  END {
    t = daynum(today)
    for (j = 1; j <= n; j++) {
      k = ORD[j]; c = CAD[k]
      if (c == "") c = (k == "morning scan" || k == "follow-up drafts") ? "weekdays" : (k == "inbox check" ? "daily" : "weekly")
      lim = (c == "daily") ? 2 : (c == "weekdays" ? 4 : (c == "fortnightly" ? 16 : 9))
      ref = RUN[k]; if (ADMIN[k] > ref) ref = ADMIN[k]
      if (ref == "") { st = "stopped" } else {
        age = t - daynum(ref)
        st = STOP[k] ? "stopped" : (age > 45 ? "inactive" : (age > lim ? "stalled" : "ok"))
      }
      if (RAN[k]) printf "%s\t%s\trun\t%s\t%s\n", st, NAME[k], RUN[k], c
      else printf "%s\t%s\tsetup\t%s\t%s\n", st, NAME[k], (SETUP[k] != "" ? SETUP[k] : ref), c
    }
  }' history/routines.md 2>/dev/null
exit 0
