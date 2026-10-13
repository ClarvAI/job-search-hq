#!/usr/bin/env bash
# Fixture tests for the health check (.claude/skills/health/scripts/health.sh, or health.ps1 with
# --impl ps) on scratch copies of the workspace: an edited app template, a missing VERSION file, a
# startup-hook time stamp from another app, and Windows line endings in a skill script.
# Usage: bash scripts/ci/health-fixtures.sh [--impl sh|ps]   (PowerShell from $PS_EXE, else pwsh)
set -u
IMPL="sh"
[ "${1:-}" = "--impl" ] && IMPL="${2:-sh}"
HERE="$(cd "$(dirname "$0")" && pwd -P)"
REPO="$(cd "$HERE/../.." && pwd -P)"
PS=""
if [ "$IMPL" = ps ]; then
  PS="${PS_EXE:-}"
  [ -n "$PS" ] || { command -v pwsh >/dev/null 2>&1 && PS=pwsh; }
  [ -n "$PS" ] || { command -v powershell >/dev/null 2>&1 && PS=powershell; }
  [ -n "$PS" ] || { echo "no PowerShell found (set PS_EXE)" >&2; exit 2; }
fi
PY=""
for c in python3 python; do "$c" -c 'import json' >/dev/null 2>&1 && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "python 3 is needed" >&2; exit 2; }
TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
T="$(mktemp -d "$TMPBASE/healthfx.XXXXXX")" || exit 2
trap 'rm -rf "$T"' EXIT
pass=0; fail=0

W="$T/ws"
mkdir -p "$W/.claude/skills/health/scripts" "$W/.claude/skills/demo/scripts" "$W/.claude/hooks" "$W/.codex" "$W/templates" "$W/.claude/.health"
cp "$REPO/AGENTS.md" "$REPO/product-manifest.json" "$W/"
# The safety checks are wired here, so the folder and hook-setup checks see a complete workspace.
cp "$REPO/.claude/settings.json" "$W/.claude/"
cp "$REPO/.codex/hooks.json" "$W/.codex/"
cp "$REPO/.claude/hooks/"guard.* "$W/.claude/hooks/"
cp "$REPO/.claude/skills/health/scripts/"health.* "$W/.claude/skills/health/scripts/"
cp "$REPO/.claude/hooks/session-start.sh" "$W/.claude/hooks/"
cp "$REPO/templates/"*.html "$W/templates/"
# Make the copied manifest agree with the copied templates, so this test checks health's logic
# (unchanged -> OK, edited -> NOTE) and not whether the repo's manifest happens to be freshly built.
if command -v sha256sum >/dev/null 2>&1; then HSH="sha256sum"; else HSH="shasum -a 256"; fi
for f in "$W/templates/"*.html; do
  rel="templates/$(basename "$f")"
  h="$(tr -d '\r' < "$f" | $HSH | awk '{print $1}')"
  "$PY" - "$W/product-manifest.json" "$rel" "$h" <<'PY'
import json, sys
p, rel, h = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(p, encoding="utf-8"))
for key in ("files", "manifest"):
    if isinstance(d.get(key), dict) and rel in d[key]:
        d[key][rel] = h
if rel in d:
    d[rel] = h
json.dump(d, open(p, "w", encoding="utf-8"), indent=2)
PY
done
run() {
  if [ "$IMPL" = ps ]; then (cd "$W" && "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .claude/skills/health/scripts/health.ps1 -App claude 2>&1)
  else (cd "$W" && CLAUDE_CODE_SESSION_ID='' bash .claude/skills/health/scripts/health.sh claude 2>&1); fi
}
has() {
  if printf '%s\n' "$OUT" | grep -qE -- "$2"; then pass=$((pass + 1)); printf 'PASS  %s\n' "$1"
  else fail=$((fail + 1)); printf 'FAIL  %s (no line matching %s)\n' "$1" "$2"; printf '%s\n' "$OUT" | sed 's/^/      | /'; fi
}

OUT="$(run)"
has "untouched templates are OK" '^OK: app templates'
has "missing VERSION points to a fresh copy" "^NOTE: version: .*download a fresh copy"
has "summary line printed" '^summary: '

printf '\n<!-- edited -->\n' >> "$W/templates/resume-template.html"
printf '%s codex\n' "$(date +%s)" > "$W/.claude/.health/last-session-start"
printf 'echo hi\r\n' > "$W/.claude/skills/demo/scripts/demo.sh"
OUT="$(run)"
has "edited template noted" '^NOTE: app templates: .*templates/resume-template.html'
has "marker from the other app is not proof" '^NOTE: hooks running: not confirmed for claude'
has "CRLF in a skill script found" '^FIX: script line endings: .*demo.sh'
has "fresh-copy advice when VERSION is missing" 'fresh copy'

echo
echo "health fixtures ($IMPL): passed $pass, failed $fail"
[ "$fail" -eq 0 ]
