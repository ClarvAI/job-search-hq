#!/usr/bin/env bash
# Read-only health check for this workspace. Changes nothing: it only looks, and prints one line per check:
#   OK: <check>: <what's fine>
#   FIX: <check>: <plain fix>
#   NOTE: <check>: <worth knowing; nothing is broken>
#   SKIP: <check>: <why it wasn't checked>
# then "summary: ..." and "most important: ..." (or "most important: nothing").
# Usage (from the workspace folder): bash .claude/skills/health/scripts/health.sh [claude|codex]
# Works in macOS bash 3.2, Linux bash and Git Bash on Windows. Windows-only checks live in health.ps1.
set -u
APP="${1:-claude}"
if [ "$APP" = codex ]; then START='$start'; else START='/start'; fi

ok=0; fix=0; note=0; skip=0; top=""; top_rank=999
say_ok()   { ok=$((ok + 1));     echo "OK: $1: $2"; }
say_note() { note=$((note + 1)); echo "NOTE: $1: $2"; }
say_skip() { skip=$((skip + 1)); echo "SKIP: $1: $2"; }
say_fix()  { # say_fix <rank: lower = more important> <check> <fix>
  fix=$((fix + 1)); echo "FIX: $2: $3"
  if [ "$1" -lt "$top_rank" ]; then top_rank="$1"; top="$2: $3"; fi
}

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)"
ROOT="$(cd "$here/../../../.." 2>/dev/null && pwd -P)"
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) WIN=1 ;; *) WIN="" ;; esac

# ver_ge A B: true if version A >= B (numbers separated by dots; anything after a space ignored)
ver_ge() {
  local a="$1" b="$2" x y i
  for i in 1 2 3 4; do
    x="$(printf '%s' "$a" | cut -d. -f"$i")"; y="$(printf '%s' "$b" | cut -d. -f"$i")"
    x="${x%%[!0-9]*}"; y="${y%%[!0-9]*}"; x="${x:-0}"; y="${y:-0}"
    [ "$x" -gt "$y" ] && return 0
    [ "$x" -lt "$y" ] && return 1
  done
  return 0
}

# plural <n> <word>: "1 minute", "2 minutes"
plural() { if [ "$1" = 1 ]; then echo "$1 $2"; else echo "$1 ${2}s"; fi; }
# What to suggest when product files are broken: /update needs the VERSION file.
if [ -f "$ROOT/VERSION" ]; then REPAIR="Update the workspace (/update) or download a fresh copy"
else REPAIR="Download a fresh copy of the workspace and move your data into it (/my-data explains how)"; fi

# ---- 1. Folder opened at the root ----
if [ ! -f "$ROOT/AGENTS.md" ]; then
  say_fix 1 "folder" "this copy of the workspace is incomplete (AGENTS.md is missing). Download a fresh copy, then move your data into it with /my-data."
elif [ "$(pwd -P)" != "$ROOT" ]; then
  say_fix 1 "folder" "the app is open on $(pwd -P), not on the workspace folder itself. Close it and open the folder \"$(basename "$ROOT")\" (the one with AGENTS.md in it); the safety checks and commands only load from there."
elif [ ! -f "$ROOT/.claude/settings.json" ]; then
  say_fix 1 "folder" "the file .claude/settings.json is missing, so Claude Code has no safety checks here. $REPAIR."
else
  say_ok "folder" "opened at the workspace root ($(basename "$ROOT"))"
fi
cd "$ROOT" 2>/dev/null || { echo "summary: could not open the workspace folder"; exit 0; }

# ---- 2. App versions ----
if command -v claude >/dev/null 2>&1; then
  cv="$(claude --version 2>/dev/null | head -1)"; cvn="${cv%% *}"
  if [ -z "$cvn" ]; then
    say_skip "Claude Code version" "the claude command didn't report a version"
  elif ver_ge "$cvn" 2.1.287; then
    say_ok "Claude Code version" "$cvn (the panels need 2.1.287 or later in the terminal, 2.1.286 or later in the desktop app)"
  elif [ "$APP" = codex ]; then
    say_note "Claude Code version" "$cvn is too old for the Claude panels. That only matters if you also use Claude Code: run 'claude update' there."
  else
    say_fix 5 "Claude Code version" "$cvn is too old for the panels (Outbox, Pipeline, Interview Room need 2.1.287 or later). Update Claude Code: run 'claude update' in a terminal, or update the desktop app. Everything else works without them."
  fi
else
  say_skip "Claude Code version" "the claude command isn't installed here (fine if you use the desktop app or Codex; the desktop app needs version 2.1.286 or later for panels)"
fi
if command -v codex >/dev/null 2>&1; then
  xv="$(codex --version 2>/dev/null | head -1)"; xvn="${xv##* }"
  if [ -z "$xvn" ]; then
    say_skip "Codex version" "the codex command didn't report a version"
  elif ver_ge "$xvn" 0.160; then
    say_ok "Codex version" "$xvn (0.160 or later is needed for this folder's safety checks)"
  elif [ "$APP" = codex ]; then
    say_fix 2 "Codex version" "$xvn is too old: this folder's safety checks need Codex 0.160 or later. Update Codex (run 'codex update', or update the Codex app), then type /hooks and trust the hooks again."
  else
    say_note "Codex version" "$xvn is too old for this folder's safety checks (they need 0.160 or later). That only matters if you also use Codex: run 'codex update' there."
  fi
else
  say_skip "Codex version" "Codex isn't installed here (fine if you only use Claude)"
fi

# ---- 3. Hooks wired up and not switched off ----
wired=1
grep -q 'guard.sh' .claude/settings.json 2>/dev/null && grep -q 'session-start.sh' .claude/settings.json 2>/dev/null || wired=""
grep -q 'guard.sh' .codex/hooks.json 2>/dev/null && grep -q 'session-start' .codex/hooks.json 2>/dev/null || wired=""
if [ -z "$wired" ]; then
  say_fix 2 "hook setup" "the safety checks are missing from .claude/settings.json or .codex/hooks.json. $REPAIR."
else
  off=""; managed=""
  for f in "$HOME/.claude/settings.json" .claude/settings.json .claude/settings.local.json; do
    grep -qE '"disableAllHooks"[[:space:]]*:[[:space:]]*true' "$f" 2>/dev/null && off="$f"
  done
  for f in "/Library/Application Support/ClaudeCode/managed-settings.json" /etc/claude-code/managed-settings.json /c/ProgramData/ClaudeCode/managed-settings.json; do
    # disableAllHooks turns every hook off; allowManagedHooksOnly turns off this folder's own hooks.
    grep -qE '"(disableAllHooks|allowManagedHooksOnly)"[[:space:]]*:[[:space:]]*true' "$f" 2>/dev/null && managed="$f"
  done
  if [ -n "$managed" ]; then
    say_fix 2 "hook setup" "this computer's managed settings ($managed) switch off this folder's hooks, so in Claude Code nothing blocks email sending. Only whoever manages this computer can change that; until then, don't connect Gmail in Claude Code."
  elif [ -n "$off" ]; then
    say_fix 2 "hook setup" "hooks are switched off in $off (\"disableAllHooks\": true), so nothing blocks email sending. Remove that line, then restart the app."
  else
    say_ok "hook setup" "safety checks and the daily greeting are set up for Claude and Codex"
  fi
fi

# ---- 4. Hooks actually firing (the startup hook leaves a time stamp) ----
MARK=".claude/.health/last-session-start"
if ! grep -q '.health' .claude/hooks/session-start.sh 2>/dev/null; then
  say_skip "hooks running" "this version's startup hook doesn't record when it runs"
elif [ ! -f "$MARK" ]; then
  say_fix 3 "hooks running" "the startup hook has never run in this folder, so the safety checks are probably off too. Claude: close and reopen this folder and click Trust. Codex: type /hooks, trust them, then start a new chat."
else
  # The marker is "<time> <app> <session id>". Only a marker from this app counts, and when the app
  # tells us its session (Claude Code does), only one from this very session proves hooks run now.
  ts=""; who=""; sid=""
  read -r ts who sid < "$MARK" 2>/dev/null
  now="$(date +%s)"; ts="${ts%%[!0-9]*}"; ts="${ts:-0}"; age=$(( (now - ts) / 60 ))
  if [ "$age" -lt 0 ]; then age=0; fi
  if [ "$age" -lt 1 ]; then ago="just now"
  elif [ "$age" -lt 60 ]; then ago="$(plural "$age" minute) ago"
  elif [ "$age" -lt 2880 ]; then ago="$(plural $((age / 60)) hour) ago"
  else ago="$(plural $((age / 1440)) day) ago"; fi
  here_sid=""; [ "$APP" = claude ] && here_sid="${CLAUDE_CODE_SESSION_ID:-}"
  if [ -n "$who" ] && [ "$who" != "$APP" ] && [ "$age" -le 720 ]; then
    say_note "hooks running" "not confirmed for $APP: the startup hook last ran $ago in $who. If this chat didn't open with the daily greeting, hooks aren't running here, so the safety checks are off too. Claude: reopen this folder and click Trust. Codex: type /hooks, trust them, then start a new chat."
  elif [ -n "$here_sid" ] && [ -n "$sid" ] && [ "$here_sid" = "$sid" ]; then
    say_ok "hooks running" "the startup hook ran in this session ($ago)"
  elif [ -n "$here_sid" ] && [ -n "$sid" ] && [ "$age" -le 720 ]; then
    say_note "hooks running" "not confirmed for this session: the startup hook last ran $ago in another session. If this chat didn't open with the daily greeting, hooks aren't running, so the safety checks are off too. Reopen this folder and click Trust."
  elif [ "$age" -le 720 ]; then
    say_ok "hooks running" "the startup hook last ran $ago (${who:-unknown app})"
  else
    say_fix 3 "hooks running" "the startup hook last ran $ago (${who:-unknown app}). If you started this chat just now, hooks aren't running, so the safety checks are off too. Claude: reopen this folder and click Trust. Codex: type /hooks, trust them, then start a new chat."
  fi
fi

# ---- 5. Guard self-test (the email/calendar/browser safety check) ----
# guard_test <runner...>: pipes three sample requests in; prints "" if all three came out right.
guard_test() {
  local out bad=""
  out="$(printf '%s' '{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":{"to":"a@example.com"}}' | "$@" 2>/dev/null)"
  printf '%s' "$out" | grep -qE '"permissionDecision"[[:space:]]*:[[:space:]]*"deny"' || bad="a Gmail send was not blocked"
  out="$(printf '%s' '{"tool_name":"mcp__claude_ai_Gmail__search_threads","tool_input":{"query":"from:recruiter"}}' | "$@" 2>/dev/null)" || bad="${bad:+$bad; }it crashed on a Gmail search"
  printf '%s' "$out" | grep -q 'deny' && bad="${bad:+$bad; }a Gmail search was blocked"
  out="$(printf '' | "$@" 2>/dev/null)"
  printf '%s' "$out" | grep -qE '"permissionDecision"[[:space:]]*:[[:space:]]*"deny"' || bad="${bad:+$bad; }empty input was not blocked"
  printf '%s' "$bad"
}
if [ ! -f .claude/hooks/guard.sh ]; then
  say_fix 2 "safety check (bash)" "the safety check file .claude/hooks/guard.sh is missing. $REPAIR."
else
  r="$(CLAUDE_PROJECT_DIR="$ROOT" guard_test bash .claude/hooks/guard.sh)"
  # Codex mode blocks with exit 2 and the reason on stderr.
  printf '%s' '{"tool_name":"mcp__gmail__send_email","tool_input":{}}' | CLAUDE_PROJECT_DIR="$ROOT" bash .claude/hooks/guard.sh codex >/dev/null 2>&1
  [ $? -eq 2 ] || r="${r:+$r; }a Gmail send was not blocked in Codex mode"
  if [ -z "$r" ]; then say_ok "safety check (bash)" "blocks a Gmail send, allows a Gmail search, blocks empty input"
  else say_fix 2 "safety check (bash)" "the self-test failed ($r). $REPAIR; until then, don't connect Gmail."; fi
fi
ps=""
command -v pwsh >/dev/null 2>&1 && ps=pwsh
[ -z "$ps" ] && command -v powershell >/dev/null 2>&1 && ps=powershell
gps=".claude/hooks/guard.ps1"
if [ -z "$ps" ]; then
  say_skip "safety check (PowerShell)" "PowerShell isn't installed here (only Codex on Windows uses it)"
elif [ ! -f "$gps" ]; then
  say_fix 2 "safety check (PowerShell)" "the file .claude/hooks/guard.ps1 is missing. $REPAIR."
else
  if command -v cygpath >/dev/null 2>&1; then gps="$(cygpath -w "$ROOT/$gps")"; fi
  r="$(CLAUDE_PROJECT_DIR="$ROOT" guard_test "$ps" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$gps")"
  if [ -z "$r" ]; then say_ok "safety check (PowerShell)" "blocks a Gmail send, allows a Gmail search, blocks empty input"
  else say_fix 2 "safety check (PowerShell)" "the self-test failed ($r). $REPAIR; until then, don't connect Gmail in Codex."; fi
fi

# ---- 6. Script line endings (Windows line endings break bash scripts) ----
# Every bash script the app runs: hooks, the git hook, skill scripts and maintenance scripts.
crlf=""; cr="$(printf '\r')"
shfiles="$(find .claude/hooks .claude/skills scripts -name '*.sh' -type f 2>/dev/null)"
oldifs="$IFS"; IFS='
'
for f in $shfiles .githooks/pre-push .githooks/commit-msg; do
  [ -f "$f" ] && LC_ALL=C grep -q "$cr" "$f" && crlf="${crlf:+$crlf, }$f"
done
IFS="$oldifs"
if [ -n "$crlf" ]; then
  say_fix 2 "script line endings" "these scripts have Windows line endings, which stops them running: $crlf. Download a fresh copy as a zip (or re-clone with git config core.autocrlf false)."
else
  say_ok "script line endings" "fine"
fi

# ---- 7. Windows-only checks ----
if [ -n "$WIN" ]; then
  say_ok "Git Bash" "present (Claude Code's safety checks run in it)"
  say_skip "blocked downloaded files" "run the PowerShell version of this check to look for them"
else
  say_skip "Git Bash" "only needed on Windows"
  say_skip "blocked downloaded files" "only a Windows issue"
fi

# ---- 8. Synced folder (warning only) ----
# Whole folder names only, so a folder that merely mentions one (like "dropbox-notes") doesn't count.
synced=""; oldifs="$IFS"; IFS='/'
for seg in $ROOT; do
  case "$seg" in
    OneDrive|"OneDrive - "*|OneDrive-*|Dropbox|"Dropbox ("*|iCloud|"iCloud Drive"*|"Mobile Documents"|"Google Drive"|GoogleDrive*|"My Drive"|CloudStorage|Box|"Box Sync") synced="$seg" ;;
  esac
done
IFS="$oldifs"
if [ -n "$synced" ]; then
  say_note "synced folder" "this folder is in a cloud-synced location ($synced), so your job-search files (with other people's contact details) are uploaded to that account too. That's fine if you're comfortable with it. If the app ever says a file changed by itself or seems slow, set the folder to 'always keep on this device'."
else
  say_ok "synced folder" "not in a cloud-synced folder"
fi

# ---- 9. Optional tools: what each one enables ----
if command -v node >/dev/null 2>&1; then
  say_ok "Node.js" "$(node --version 2>/dev/null) (lets the assistant restyle your pages and preview themes)"
else
  say_note "Node.js" "not installed. Only changing the look of your pages needs it (nodejs.org, the LTS version); everything else works."
fi
browser=""
if [ -f .claude/skills/tailor-resume/scripts/pdf-common.sh ]; then
  # shellcheck source=/dev/null
  . .claude/skills/tailor-resume/scripts/pdf-common.sh 2>/dev/null && find_browser >/dev/null 2>&1
fi
if [ -n "$browser" ]; then
  say_ok "Chrome or Edge" "found (lets the assistant make your resume PDFs and check they fit on one page)"
else
  say_note "Chrome or Edge" "not found. Without it you make resume PDFs yourself (open the .html, Print, Save as PDF) and check the page count by eye."
fi
if command -v pdftotext >/dev/null 2>&1; then
  say_ok "pdftotext" "found (lets the assistant check that resume PDFs read back cleanly for applicant tracking systems)"
else
  say_note "pdftotext" "not installed, so the read-back check on resume PDFs is skipped. Optional (it comes with Poppler: on a Mac 'brew install poppler')."
fi

# ---- 10. Git push safety hook ----
if [ -e .git ] && command -v git >/dev/null 2>&1; then
  hp="$(git config --get core.hooksPath 2>/dev/null)"
  case "$hp" in
    .githooks|.githooks/|"$ROOT/.githooks"|"$ROOT/.githooks/")
      say_ok "git push check" "on (stops pushes to a public GitHub repository, and keeps AI attribution lines out of commit messages)" ;;
    *)
      say_note "git push check" "this folder uses git, and the extra check that stops pushes to a public GitHub repository isn't turned on. The assistant can turn it on for you (it runs: git config core.hooksPath .githooks). It also catches pushes the built-in safety check can't see, like ones made through scripts, and keeps AI attribution lines out of commit messages." ;;
  esac
else
  say_skip "git push check" "this folder doesn't use git (that's fine)"
fi

# ---- 11. Excel lock files ----
locks=""
for f in jobs/'~$'* contacts/'~$'*; do [ -e "$f" ] && locks="${locks:+$locks, }$f"; done
if [ -n "$locks" ]; then
  say_fix 4 "Excel" "a sheet is open in Excel ($locks). Save and close it in Excel before the assistant updates it, or Excel will later put back its older copy."
else
  say_ok "Excel" "no Excel lock file found (Excel doesn't always leave one, so if the tracker or contacts sheet is open in Excel, save and close it before the assistant updates it)"
fi

# ---- 12. Setup and starter files ----
setup_done=""
if [ ! -f profile/preferences.md ] || grep -q '^SETUP: not done' profile/preferences.md 2>/dev/null; then
  say_fix 4 "setup" "setup not done: type $START (about 15 to 20 minutes)."
else
  setup_done=1; say_ok "setup" "done"
fi
if [ -d templates/blank ]; then
  missing=0; first=""
  # No here-document: some locked-down Macs can't create its temporary file, and a silent failure
  # would report "all in place".
  if ! blanks="$(find templates/blank -type f ! -name '.DS_Store' 2>/dev/null)" || [ -z "$blanks" ]; then
    missing=-1
  else
    oldifs="$IFS"; IFS='
'
    for f in $blanks; do
      rel="${f#templates/blank/}"
      [ "$rel" = README.md ] && continue
      if [ ! -e "$rel" ]; then missing=$((missing + 1)); [ -n "$first" ] || first="$rel"; fi
    done
    IFS="$oldifs"
  fi
  if [ "$missing" -lt 0 ]; then
    say_skip "starter files" "couldn't list templates/blank, so this wasn't checked"
  elif [ "$missing" -eq 0 ]; then
    say_ok "starter files" "all in place"
  elif [ -z "$setup_done" ]; then
    say_note "starter files" "$missing starter file(s) not created yet (normal before setup; $START creates them)"
  else
    say_fix 4 "starter files" "$missing starter file(s) are missing (for example $first). Type $START: it puts back only what's missing and never overwrites your files."
  fi
else
  say_fix 2 "starter files" "templates/blank is missing, so this copy of the workspace is incomplete. $REPAIR."
fi

# ---- 13. App templates unchanged (a theme belongs in profile/templates/) ----
# Same fingerprint as scripts/build-manifest.sh: sha256 of the file with carriage returns removed.
if [ ! -f product-manifest.json ]; then
  say_skip "app templates" "no product-manifest.json to compare with"
else
  if command -v sha256sum >/dev/null 2>&1; then H="sha256sum"; else H="shasum -a 256"; fi
  edited=""
  for f in templates/*.html; do
    [ -f "$f" ] || continue
    want="$(sed -n "s#^[[:space:]]*\"$f\": \"\\([0-9a-f]\\{64\\}\\)\".*#\\1#p" product-manifest.json | head -1)"
    [ -n "$want" ] || continue
    got="$(tr -d '\r' < "$f" | $H 2>/dev/null | awk '{print $1}')"
    [ "$got" = "$want" ] || edited="${edited:+$edited, }$f"
  done
  if [ -n "$edited" ]; then
    say_note "app templates" "the app's own template was edited ($edited). Your look belongs in profile/templates/, where updates never touch it: ask the assistant to re-apply your theme there (it keeps any hand edits). Until then, an update or git pull may stop or replace these files."
  else
    say_ok "app templates" "unchanged (your theme, if any, lives in profile/templates/)"
  fi
fi

# ---- 14. Version ----
if [ -f VERSION ]; then
  say_ok "version" "$(head -1 VERSION | tr -d '\r' | sed 's/^[[:space:]]*version:[[:space:]]*//')"
else
  say_note "version" "no VERSION file, so this copy can't tell which release it is, and /update can't run on it. To get the current version, download a fresh copy and move your data into it (/my-data explains how)."
fi

echo "summary: $ok ok, $fix to fix, $note notes, $skip skipped"
if [ -n "$top" ]; then echo "most important: $top"; else echo "most important: nothing"; fi
exit 0
