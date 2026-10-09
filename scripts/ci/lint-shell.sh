#!/usr/bin/env bash
# Syntax-checks (bash -n) and lints (shellcheck -S warning) every bash script in the workspace:
# all *.sh files plus the git hooks in .githooks/. Skips shellcheck (with a note) if it isn't installed.
# Usage: bash scripts/ci/lint-shell.sh      Exits 1 on any problem.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$REPO" || exit 2
files=()
while IFS= read -r f; do files+=("$f"); done <<EOF
$(find . \( -name .git -o -name node_modules -o -name .backup \) -prune -o -type f \( -name '*.sh' -o -path './.githooks/*' \) -print | sort)
EOF
[ "${#files[@]}" -gt 0 ] && [ -n "${files[0]}" ] || { echo "no shell scripts found"; exit 1; }
fail=0
for f in "${files[@]}"; do
  if bash -n "$f" 2>/tmp/lint-shell.$$; then echo "ok    bash -n  $f"
  else fail=1; echo "FAIL  bash -n  $f"; sed 's/^/      /' /tmp/lint-shell.$$; fi
done
rm -f /tmp/lint-shell.$$
# -x -P SCRIPTDIR: follow `. "$here/lib.sh"` so variables a library sets count as set.
# A library that other scripts source sets variables for them, so "appears unused" (SC2034) is
# expected there. SC2088 ("~" in quotes) is off because the scripts compare user input against a
# literal "~" on purpose (export.sh).
libs=" "
for f in "${files[@]}"; do
  for g in "${files[@]}"; do
    [ "$f" = "$g" ] && continue
    grep -qE "^[[:space:]]*(\\.|source)[[:space:]]+\"?[^\"]*/$(basename "$f")\"?" "$g" 2>/dev/null && { libs="$libs$f "; break; }
  done
done
if command -v shellcheck >/dev/null 2>&1; then
  sc=0
  for f in "${files[@]}"; do
    extra="SC2088"
    case "$libs" in *" $f "*) extra="$extra,SC2034" ;; esac
    shellcheck -S warning -s bash -x -P SCRIPTDIR -e "$extra" "$f" || sc=1
  done
  if [ "$sc" = 0 ]; then echo "ok    shellcheck -S warning (${#files[@]} files)"
  else fail=1; echo "FAIL  shellcheck found problems (above)"; fi
else
  echo "note  shellcheck isn't installed; only the syntax check ran"
  [ -n "${CI:-}" ] && fail=1
fi
exit $fail
