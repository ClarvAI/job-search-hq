#!/usr/bin/env bash
# UserPromptSubmit (Claude Code only): if the session is in Manual permission mode
# ("permission_mode": "default"), asks the assistant to tell the user once per session how to
# switch to auto mode. Silent in every other mode, when the field is missing, and on input it
# can't read. Pure bash (no jq, no python), so it adds no noticeable delay to a prompt. Never
# blocks: always exits 0.
# The last session told is kept in .claude/.health/mode-notice (local-only, git-ignored).
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
IFS= read -r -d '' input || true
# A JSON string can't hold an unescaped quote, so these only match the real top-level fields,
# never text inside the user's prompt.
re='"permission_mode"[[:space:]]*:[[:space:]]*"default"'
[[ $input =~ $re ]] || exit 0
re='"session_id"[[:space:]]*:[[:space:]]*"([A-Za-z0-9_.:-]{1,100})"'
[[ $input =~ $re ]] || exit 0   # no session id: can't tell once per session, so say nothing
sid="${BASH_REMATCH[1]}"
mark=.claude/.health/mode-notice
last=""; [ -f "$mark" ] && IFS= read -r last < "$mark" 2>/dev/null
[ "$last" = "$sid" ] && exit 0
# Record first; if that fails (a read-only folder), stay quiet rather than repeat on every prompt.
{ mkdir -p .claude/.health && printf '%s\n' "$sid" > "$mark"; } 2>/dev/null || exit 0
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"Job Search HQ: this session is in Manual permission mode (it asks before almost every step), and the user has not been told yet in this session. Before your answer, tell them once, plainly and in their language: \"This session is set to ask before almost every step. To let me work without constant prompts, press Shift+Tab until it shows auto mode (desktop app: the mode selector next to the prompt box). If auto mode isn\u0027t offered, your model or your organization doesn\u0027t allow it; /model can switch to a newer model.\" Then answer as usual. This note comes only once per session; don\u0027t repeat it."}}'
exit 0
