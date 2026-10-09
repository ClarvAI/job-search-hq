#!/usr/bin/env bash
# Checks that every .json file in the workspace parses (settings, Codex hooks, plugin manifests,
# product-manifest.json, ...). Usage: bash scripts/ci/check-json.sh      Exits 1 on any bad file.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$REPO" || exit 2
PY=""
for c in python3 python; do "$c" -c 'import json' >/dev/null 2>&1 && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "python is needed"; exit 2; }
find . \( -name .git -o -name node_modules -o -name .backup \) -prune -o -type f -name '*.json' -print | sort |
"$PY" -c '
import json, sys
bad = 0; n = 0
for line in sys.stdin:
    p = line.rstrip("\n")
    if not p:
        continue
    n += 1
    try:
        with open(p, encoding="utf-8") as f:
            json.load(f)
        print("ok    " + p)
    except Exception as e:
        bad += 1
        print("FAIL  %s: %s" % (p, e))
print("json: %d files, %d bad" % (n, bad))
sys.exit(1 if bad or n == 0 else 0)
'
