#!/usr/bin/env bash
# Runs the shared guard fixtures against guard.sh and guard.ps1 and checks they decide every case
# the same way (allow / deny). Cases only one side runs (wrappers, pre-push, PowerShell-only
# syntax) are compared only where both sides ran them.
# Usage: bash scripts/ci/guard-parity.sh      (PowerShell from $PS_EXE, else pwsh, else powershell)
# Exits 1 if either suite fails or any shared case differs.
set -u
HERE="$(cd "$(dirname "$0")" && pwd -P)"
TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
D="$(mktemp -d "$TMPBASE/guardpar.XXXXXX")" || exit 2
trap 'rm -rf "$D"' EXIT
rc=0
bash "$HERE/guard-fixtures.sh" --impl sh --decisions "$D/sh.tsv" > "$D/sh.log" 2>&1 || { rc=1; echo "FAIL  guard.sh fixtures"; grep -E '^(FAIL|SKIP)' "$D/sh.log"; }
bash "$HERE/guard-fixtures.sh" --impl ps --decisions "$D/ps.tsv" > "$D/ps.log" 2>&1 || { rc=1; echo "FAIL  guard.ps1 fixtures"; grep -E '^(FAIL|SKIP)' "$D/ps.log"; }
tail -1 "$D/sh.log"; tail -1 "$D/ps.log"
[ -s "$D/sh.tsv" ] && [ -s "$D/ps.tsv" ] || { echo "FAIL  no decisions recorded"; exit 1; }
diffs="$(awk -F '\t' 'NR == FNR { a[$1] = $2; next } ($1 in a) { n++; if (a[$1] != $2) printf "DIFF  %s: guard.sh %s, guard.ps1 %s\n", $1, a[$1], $2 } END { printf "compared %d shared cases\n", n }' "$D/sh.tsv" "$D/ps.tsv")"
printf '%s\n' "$diffs"
printf '%s\n' "$diffs" | grep -q '^DIFF' && rc=1
exit $rc
