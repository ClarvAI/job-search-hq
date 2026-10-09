#!/usr/bin/env bash
# SessionStart: today's date, setup state, the pipeline, and what changed recently, so the
# assistant can greet the user usefully. Claude Code runs it plain; Codex runs it with "codex",
# which wraps the same text in the JSON Codex expects.
APP="${1:-claude}"
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
{ mkdir -p .claude/.health && printf '%s %s\n' "$(date +%s)" "$APP" > .claude/.health/last-session-start; } 2>/dev/null
cat >/dev/null  # discard the hook input
# First run (or a file was deleted): copy any missing starter file from templates/blank/. Never overwrites.
INIT="$(bash .claude/skills/start/scripts/init-data.sh --quiet 2>/dev/null)"
if [ "$APP" = codex ]; then START='$start (or just say "set me up")'; else START='/start'; fi

brief() {
  echo "Today is $(date '+%A, %B %d, %Y') ($(date +%Y-%m-%d))."
  case "$INIT" in
    *"init: created"*) echo "Missing starter files were just set up from the blank copies (${INIT##*init: created }). In a new folder that's normal (first run); otherwise tell the user a personal file was missing and came back blank." ;;
    *error:*) echo "Some starter files could not be set up ($(printf '%s' "$INIT" | grep 'error:' | head -1)). Tell the user, and run bash .claude/skills/start/scripts/init-data.sh to see why." ;;
  esac
  if [ ! -f profile/preferences.md ] || grep -q '^SETUP: not done' profile/preferences.md 2>/dev/null; then
    echo "The user has not finished setup. When they first write, welcome them in one or two sentences and suggest $START (about 15 to 20 minutes)."
  fi
  for x in jobs/*.xlsx jobs/*.xls; do [ -f "$x" ] && [ "$x" -nt jobs/tracker.csv ] && echo "The user saved $x after jobs/tracker.csv; their newest edits may be in that file. Ask before changing the tracker, and offer to copy them in."; done
  bash .claude/hooks/summary.sh long 2>/dev/null
  echo "Autonomy: $(sed -n 's/^autonomy:[[:space:]]*\([a-z-]*\).*/\1/p' profile/preferences.md 2>/dev/null | head -1). Outbox mode: $(sed -n 's/^outbox_mode:[[:space:]]*\([a-z-]*\).*/\1/p' profile/preferences.md 2>/dev/null | head -1)."
  recent="$(grep -E '^- [0-9]{4}-' history/activity.md 2>/dev/null | tail -8)"
  if [ -n "$recent" ]; then
    echo "Recent activity (from either app; newest last):"
    printf '%s\n' "$recent"
  fi
}

if [ "$APP" = codex ]; then
  text="$(brief | LC_ALL=C tr -d '\000-\010\013-\037' | { iconv -f UTF-8 -t UTF-8 -c 2>/dev/null || cat; } | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/ /g' | awk '{ printf "%s%s", (NR > 1 ? "\\n" : ""), $0 }')"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$text"
else
  brief
fi
exit 0
