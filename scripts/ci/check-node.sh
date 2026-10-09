#!/usr/bin/env bash
# Syntax-checks every .mjs and .js script with node --check.
# Usage: bash scripts/ci/check-node.sh      Exits 1 on any error; skips (exit 0) if Node isn't installed, except in CI.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$REPO" || exit 2
if ! command -v node >/dev/null 2>&1; then
  echo "note  node isn't installed; skipped"
  [ -n "${CI:-}" ] && exit 1
  exit 0
fi
fail=0; n=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  n=$((n + 1))
  if node --check "$f" 2>/tmp/check-node.$$; then echo "ok    $f"
  else fail=1; echo "FAIL  $f"; sed 's/^/      /' /tmp/check-node.$$; fi
done <<EOF
$(find . \( -name .git -o -name node_modules -o -name .backup \) -prune -o -type f \( -name '*.mjs' -o -name '*.js' \) -print | sort)
EOF
rm -f /tmp/check-node.$$
echo "node --check: $n files"
exit $fail
