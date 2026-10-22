#!/usr/bin/env bash
# Fixture tests for the health check (.claude/skills/health/scripts/health.sh, or health.ps1 with
# --impl ps) on scratch copies of the workspace: an edited app template, a missing VERSION file, a
# startup-hook time stamp from another app (or an old one in Codex), Claude's disableAllHooks seen from Codex, and
# Windows line endings in a skill script.
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
mkdir -p "$W/.claude/skills/routines/scripts"
cp "$REPO/.claude/skills/routines/scripts/"routine-status.* "$W/.claude/skills/routines/scripts/"
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
run() {  # run [claude|codex]
  local app="${1:-claude}"
  if [ "$IMPL" = ps ]; then (cd "$W" && "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .claude/skills/health/scripts/health.ps1 -App "$app" 2>&1)
  else (cd "$W" && CLAUDE_CODE_SESSION_ID='' bash .claude/skills/health/scripts/health.sh "$app" 2>&1); fi
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

# Codex has no session id: only a marker from the last few minutes counts as proof for this chat (review J1-03).
printf '%s codex\n' "$(date +%s)" > "$W/.claude/.health/last-session-start"
OUT="$(run codex)"
has "codex: a marker from just now is OK" '^OK: hooks running: the startup hook last ran just now \(codex\)'
printf '%s codex\n' "$(( $(date +%s) - 7200 ))" > "$W/.claude/.health/last-session-start"
OUT="$(run codex)"
has "codex: a marker from 2 hours ago is not proof for this chat" '^NOTE: hooks running: not confirmed for this chat: .*2 hours ago'
# Claude's disableAllHooks is a note about Claude when health runs in Codex, and a fix in Claude (review J1-04).
printf '{ "disableAllHooks": true }\n' > "$W/.claude/settings.local.json"
OUT="$(run codex)"
has "codex: Claude's disableAllHooks is a note about Claude only" '^NOTE: hook setup: .*Note for Claude Code only: hooks are switched off'
OUT="$(run claude)"
has "claude: disableAllHooks is a fix" '^FIX: hook setup: hooks are switched off in .*settings.local.json'
rm -f "$W/.claude/settings.local.json"

# Routines: none set up is fine; one with nothing logged for longer than its schedule is a fix; paused is not.
OUT="$(run)"
has "no routine log: none set up" '^OK: routines: none set up'
dago() { "$PY" -c "import datetime,sys; print((datetime.date.today() - datetime.timedelta(days=int(sys.argv[1]))).isoformat())" "$1"; }
mkdir -p "$W/history"
{ printf '# Routine results\n\n'
  printf -- '- %s 08:00 \302\267 morning scan \302\267 3 new leads\n' "$(dago 7)"
  printf -- '- %s 07:30 \302\267 inbox check \302\267 1 update\n' "$(dago 1)"; } > "$W/history/routines.md"
OUT="$(run)"
has "stalled routine is a fix" "^FIX: routines: .*morning scan \(last ran $(dago 7), weekdays\)"
printf -- '- %s 09:00 \302\267 morning scan \302\267 paused\n' "$(dago 0)" >> "$W/history/routines.md"
OUT="$(run)"
has "paused routine is not flagged" '^OK: routines: 1 routine running on schedule'
rm -rf "$W/history"

echo
echo "health fixtures ($IMPL): passed $pass, failed $fail"
[ "$fail" -eq 0 ]
