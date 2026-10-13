#!/usr/bin/env bash
# Status line: the most urgent job-search item in one line. (The Pipeline panel's band above the
# prompt already shows the counts, so this line shows what to do next instead of repeating them.)
# Claude Code sends JSON on stdin; workspace.project_dir is the folder the session was opened in.
IFS= read -r -d '' input || true
re='"project_dir"[[:space:]]*:[[:space:]]*"((\\.|[^"\\])*)"'
if [[ $input =~ $re ]] && [ -d "${BASH_REMATCH[1]//\\\\/\\}" ]; then export CLAUDE_PROJECT_DIR="${BASH_REMATCH[1]//\\\\/\\}"; fi
s="$(bash "$(dirname "$0")/summary.sh" next 2>/dev/null)"
{ [ "$s" = "no tracker" ] || [ -z "$s" ]; } && s="nothing tracked yet (try /find-jobs)"
echo "Job search: $s"
