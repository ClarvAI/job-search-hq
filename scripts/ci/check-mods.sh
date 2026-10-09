#!/usr/bin/env bash
# Validates and tests every Claude Code mod (each folder with .claude-plugin/plugin.json):
#   claude plugin validate --strict <mod>   (manifest, hooks; warnings count as errors)
#   claude plugin test <mod>                (the mod's *.test.ts / *.test.tsx files)
# Neither needs a sign-in or the network. Needs the claude command (Claude Code 2.1.287 or later).
# Usage: bash scripts/ci/check-mods.sh [--no-strict]      Exits 1 on any failure.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$REPO" || exit 2
STRICT=--strict; [ "${1:-}" = --no-strict ] && STRICT=""
if ! command -v claude >/dev/null 2>&1; then
  echo "note  the claude command isn't installed; skipped"
  [ -n "${CI:-}" ] && exit 1
  exit 0
fi
echo "claude $(claude --version 2>/dev/null | head -1)"
fail=0; n=0
while IFS= read -r m; do
  [ -n "$m" ] || continue
  m="$(dirname "$(dirname "$m")")"; n=$((n + 1))
  if out="$(claude plugin validate $STRICT "$m" 2>&1)"; then echo "ok    validate ${STRICT:+--strict }$m"
  else fail=1; echo "FAIL  validate ${STRICT:+--strict }$m"; printf '%s\n' "$out" | grep -v '❯ .*\(state \|calls:\|hooks:\)' | sed 's/^/      /'; fi
  if out="$(cd "$m" && claude plugin test . 2>&1)"; then echo "ok    test $m ($(printf '%s\n' "$out" | tail -1))"
  else fail=1; echo "FAIL  test $m"; printf '%s\n' "$out" | tail -40 | sed 's/^/      /'; fi
done <<EOF
$(find . \( -name .git -o -name node_modules -o -name .backup \) -prune -o -type f -path '*/.claude-plugin/plugin.json' -print | sort)
EOF
[ "$n" -gt 0 ] || { echo "FAIL  no mods found"; exit 1; }
echo "mods: $n checked"
exit $fail
