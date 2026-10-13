#!/usr/bin/env bash
# Fixture tests for the Manual-mode notice (.claude/hooks/mode-notice.sh, Claude Code's
# UserPromptSubmit hook) on a scratch copy: it speaks once per session in Manual ("default") mode,
# stays silent in every other mode and on input it can't read, and always exits 0.
# Runs the hook with the bash that runs this script (CI: /bin/bash 3.2 on macOS, Git Bash on Windows).
# Usage: bash scripts/ci/mode-notice-fixtures.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd -P)"
REPO="$(cd "$HERE/../.." && pwd -P)"
SH="${BASH:-bash}"
PY=""
for c in python3 python; do "$c" -c 'import json' >/dev/null 2>&1 && { PY="$c"; break; }; done
TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
T="$(mktemp -d "$TMPBASE/modefx.XXXXXX")" || exit 2
trap 'chmod -R u+w "$T" 2>/dev/null; rm -rf "$T"' EXIT
pass=0; fail=0
ok() { pass=$((pass + 1)); printf 'PASS  %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL  %s\n%s\n' "$1" "$2"; }

W="$T/ws"
mkdir -p "$W/.claude/hooks"
cp "$REPO/.claude/hooks/mode-notice.sh" "$W/.claude/hooks/"
cp "$REPO/.claude/settings.json" "$W/.claude/"
MARK="$W/.claude/.health/mode-notice"

# hook <stdin text>: runs the hook from outside the workspace with CLAUDE_PROJECT_DIR set, as Claude
# Code does. Sets OUT and RC.
hook() { OUT="$(cd "$T" && printf '%s' "$1" | CLAUDE_PROJECT_DIR="$W" "$SH" "$W/.claude/hooks/mode-notice.sh" 2>&1)"; RC=$?; }
inp() { printf '{"session_id":"%s","transcript_path":"/tmp/x.jsonl","cwd":"%s","permission_mode":"%s","hook_event_name":"UserPromptSubmit","prompt":"what should I do today?"}' "$1" "$W" "$2"; }

# notice <label>: the hook spoke, with valid JSON in the shape Claude Code reads.
notice() {
  if [ "$RC" -ne 0 ]; then bad "$1" "exit $RC: $OUT"; return; fi
  case "$OUT" in *'"hookEventName":"UserPromptSubmit"'*'"additionalContext":"'*'Shift+Tab'*'auto mode'*'/model'*) ;;
    *) bad "$1" "no notice: $OUT"; return ;; esac
  if [ -n "$PY" ]; then
    j="$(printf '%s' "$OUT" | "$PY" -c 'import json,sys
d=json.loads(sys.stdin.read()); h=d["hookSpecificOutput"]
assert h["hookEventName"]=="UserPromptSubmit" and set(d)=={"hookSpecificOutput"}
print(h["additionalContext"])' 2>&1)" || { bad "$1" "not valid hook JSON: $j"; return; }
    case "$j" in *"press Shift+Tab until it shows auto mode"*"isn't offered"*) ;; *) bad "$1" "odd text: $j"; return ;; esac
  fi
  ok "$1"
}
silent() { if [ "$RC" -eq 0 ] && [ -z "$OUT" ]; then ok "$1"; else bad "$1" "exit $RC, output: $OUT"; fi; }
marked() { m="$(cat "$MARK" 2>/dev/null)"; if [ "$m" = "$2" ]; then ok "$1"; else bad "$1" "marker holds '$m', want '$2'"; fi; }

# ---- once per session in Manual mode
hook "$(inp sess-A default)";  notice "Manual mode, first prompt of a session: notice"
marked "the session is recorded as told in .claude/.health/mode-notice" "sess-A"
hook "$(inp sess-A default)";  silent "Manual mode, second prompt of the same session: silent"
hook "$(inp sess-A default)";  silent "Manual mode, third prompt of the same session: still silent"
hook "$(inp sess-B default)";  notice "Manual mode, a new session: notice again"
marked "the marker holds only the last session told (one small file)" "sess-B"
[ "$(find "$W/.claude/.health" -type f | wc -l | tr -d ' ')" = 1 ] && ok "no clutter: one marker file in .claude/.health" \
  || bad "no clutter: one marker file in .claude/.health" "$(ls -la "$W/.claude/.health")"

# ---- every other mode, or no mode: silent, marker untouched
for m in auto plan acceptEdits bypassPermissions dontAsk manual Default; do
  hook "$(inp "sess-$m" "$m")"; silent "permission_mode $m: silent"
done
marked "other modes leave the marker alone" "sess-B"
hook '{"session_id":"sess-none","hook_event_name":"UserPromptSubmit","prompt":"hi"}'; silent "no permission_mode field: silent"
hook '{"permission_mode":"default","hook_event_name":"UserPromptSubmit","prompt":"hi"}'; silent "Manual mode but no session id: silent (can't tell once per session)"
hook '{"session_id":"bad id;rm","permission_mode":"default"}'; silent "session id with odd characters: silent"

# ---- input it can't read: silent, exit 0
hook 'not json at all';                               silent "malformed input (not JSON): silent, exit 0"
hook '{"session_id":"sess-M","permission_mode":default}'; silent "malformed JSON (unquoted value): silent, exit 0"
hook '';                                              silent "empty input: silent, exit 0"
hook '{"session_id":"sess-P","permission_mode":"auto","prompt":"paste: {\"permission_mode\":\"default\",\"session_id\":\"x\"}"}'
silent "the words permission_mode default inside the user's prompt don't trigger it"
marked "none of those touched the marker" "sess-B"

# ---- spacing and field order as other JSON writers produce them
hook '{ "permission_mode" : "default" , "session_id" : "sess-S" }'; notice "spaces around colons and session_id after permission_mode: notice"

# ---- run exactly as .claude/settings.json wires it (the file goes in on stdin and the command comes
# back with no newline, so a Windows Python's C:\ paths and \r\n endings don't get in the way)
if [ -n "$PY" ]; then
  cmd="$("$PY" -c 'import json,sys
d=json.loads(sys.stdin.buffer.read().decode("utf-8"))
gs=d["hooks"]["UserPromptSubmit"]
assert len(gs)==1 and "matcher" not in gs[0] and len(gs[0]["hooks"])==1
h=gs[0]["hooks"][0]
assert h["type"]=="command" and 0 < h["timeout"] <= 30 and "onFailure" not in h
sys.stdout.write(h["command"])' < "$W/.claude/settings.json" 2>&1)"
  case "$cmd" in
    *mode-notice.sh*)
      ok "settings.json: one UserPromptSubmit hook, a command with a short timeout that can't block"
      OUT="$(cd "$T" && inp sess-W default | CLAUDE_PROJECT_DIR="$W" "$SH" -c "$cmd" 2>&1)"; RC=$?
      notice "run as wired (CLAUDE_PROJECT_DIR set): notice"
      OUT="$(cd "$T" && inp sess-W default | CLAUDE_PROJECT_DIR="$W" "$SH" -c "$cmd" 2>&1)"; RC=$?
      silent "run as wired, same session again: silent" ;;
    *) bad "settings.json: one UserPromptSubmit hook, a command with a short timeout that can't block" "$cmd" ;;
  esac
else
  echo "SKIP  settings.json wiring (no python)"
fi

# ---- no CLAUDE_PROJECT_DIR: finds the workspace from its own path
rm -f "$MARK"
OUT="$(cd "$T" && inp sess-N default | env -u CLAUDE_PROJECT_DIR "$SH" "$W/.claude/hooks/mode-notice.sh" 2>&1)"; RC=$?
notice "without CLAUDE_PROJECT_DIR: notice"
marked "without CLAUDE_PROJECT_DIR: the marker lands in the workspace" "sess-N"

# ---- a folder it can't write to: silent rather than repeating on every prompt
if [ "$(id -u 2>/dev/null)" != 0 ] && ! command -v cygpath >/dev/null 2>&1; then
  rm -rf "$W/.claude/.health"; chmod a-w "$W/.claude"
  hook "$(inp sess-R default)"; silent "can't record the session (read-only folder): silent, exit 0"
  chmod u+w "$W/.claude"
else
  echo "SKIP  read-only folder (running as root, or Windows where chmod doesn't stop writes)"
fi

echo
echo "mode-notice fixtures: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
