#!/usr/bin/env bash
# Smoke test for the /my-data backup (export) and reset scripts, on a throwaway copy of the
# workspace in a temp folder. The real workspace is never touched.
# Usage: bash scripts/ci/mydata-smoke.sh [--impl sh|ps]
#   sh: export.sh / reset.sh     ps: export.ps1 / reset.ps1 (PowerShell from $PS_EXE, else pwsh, else powershell)
# Exits 1 on any failure.
set -u
IMPL="sh"; [ "${1:-}" = --impl ] && IMPL="${2:-sh}"
HERE="$(cd "$(dirname "$0")" && pwd -P)"
REPO="$(cd "$HERE/../.." && pwd -P)"
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }
PY=""
for c in python3 python; do "$c" -c 'import zipfile' >/dev/null 2>&1 && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "python is needed"; exit 2; }
PS=""
if [ "$IMPL" = ps ]; then
  PS="${PS_EXE:-}"
  [ -n "$PS" ] || { command -v pwsh >/dev/null 2>&1 && PS=pwsh; }
  [ -n "$PS" ] || { command -v powershell >/dev/null 2>&1 && PS=powershell; }
  [ -n "$PS" ] || { echo "no PowerShell found (set PS_EXE)"; exit 2; }
fi

TMPBASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
command -v cygpath >/dev/null 2>&1 && TMPBASE="$(cygpath -u "$TMPBASE")"
W="$(mktemp -d "$TMPBASE/mydata.XXXXXX")" || exit 2
W="$(cd "$W" && pwd -P)"
trap 'rm -rf "$W"' EXIT
WS="$W/Job Search HQ"          # a space in the path, like many real folders
mkdir -p "$WS"
tar -C "$REPO" --exclude=./.git --exclude=./node_modules --exclude=./.backup -cf - . | tar -C "$WS" -xf - || { echo "copy failed"; exit 2; }
case "$WS" in "$REPO"/*|"$REPO") echo "refusing: temp copy is inside the workspace"; exit 2 ;; esac

pass=0; fail=0
ok() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; [ -n "${3:-}" ] && printf '%s\n' "$3" | sed 's/^/      | /'; fi; }

cd "$WS" || exit 2
# A fresh download has no user files yet: create them the way first run does.
if [ -f .claude/skills/start/scripts/init-data.sh ]; then
  out="$(bash .claude/skills/start/scripts/init-data.sh 2>&1)"; ok "init-data.sh fills in the starter files" $? "$out"
else
  while IFS= read -r f; do
    rel="${f#templates/blank/}"; [ "$rel" = README.md ] && continue
    [ -e "$rel" ] || { mkdir -p "$(dirname "$rel")"; cp "$f" "$rel"; }
  done <<EOF
$(find templates/blank -type f ! -name .DS_Store)
EOF
fi
# Some personal data to back up and then wipe.
[ -f profile/preferences.md ] || { echo "FAIL  no profile/preferences.md after init"; exit 1; }
"$PY" - <<'PY'
p = "profile/preferences.md"
s = open(p, encoding="utf-8").read().replace("SETUP: not done", "SETUP: done", 1)
open(p, "w", encoding="utf-8").write(s + "\nCI-MARKER-PREFS\n")
PY
mkdir -p jobs/acme-engineer && printf 'CI-MARKER-POSTING\n' > jobs/acme-engineer/posting.md

run() { # run <script base name> <args...>  (sh args are translated for ps)
  local name="$1"; shift
  if [ "$IMPL" = sh ]; then bash ".claude/skills/my-data/scripts/$name.sh" "$@"
  else
    local a=() x
    for x in "$@"; do
      case "$x" in
        --dry-run) a+=(-DryRun) ;; --yes-delete) a+=(-YesDelete) ;;
        --*) a+=("$x") ;;
        *) a+=(-Destination "$(native "$x")") ;;
      esac
    done
    "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$(native "$WS/.claude/skills/my-data/scripts/$name.ps1")" ${a[@]+"${a[@]}"}
  fi
}

echo "== export ($IMPL)"
out="$(run export "$W/backups" 2>&1)"; rc=$?
last="$(printf '%s\n' "$out" | tr -d '\r' | tail -1)"
zipp="${last#saved: }"
r=1; [ "$rc" = 0 ] && [ "$zipp" != "$last" ] && r=0; ok "export ends with 'saved: <path>'" "$r" "$out"
if command -v cygpath >/dev/null 2>&1; then zipp="$(cygpath -u "$zipp")"; fi
"$PY" - "$zipp" <<'PY'
import sys, zipfile
names = [n.replace("\\", "/") for n in zipfile.ZipFile(sys.argv[1]).namelist()]
need = ["profile/preferences.md", "jobs/acme-engineer/posting.md"]
missing = [n for n in need if not any(x.endswith(n) for x in names)]
leaked = [x for x in names if x.startswith((".claude/", ".agents/", ".codex/", ".git/")) or "/.claude/" in x]
if missing or leaked:
    print("missing:", missing, "app files included:", leaked[:5]); sys.exit(1)
PY
ok "backup zip has the user's files and none of the app's" $?
out="$(run export "$WS/inside" 2>&1)"; rc=$?
[ "$rc" != 0 ] && printf '%s' "$out" | grep -q 'error:'; ok "export refuses a folder inside the workspace" $? "$out"

echo "== reset ($IMPL)"
out="$(run reset 2>&1)"; rc=$?
[ "$rc" != 0 ] && grep -q CI-MARKER-PREFS profile/preferences.md; ok "reset refuses to run without a flag" $? "$out"
out="$(run reset --dry-run 2>&1)"; rc=$?
[ "$rc" = 0 ] && [ -f jobs/acme-engineer/posting.md ] && grep -q CI-MARKER-PREFS profile/preferences.md; ok "reset --dry-run changes nothing" $? "$out"
out="$(run reset --yes-delete 2>&1)"; rc=$?
last="$(printf '%s\n' "$out" | tr -d '\r' | tail -1)"
[ "$rc" = 0 ] && [ "$last" = "reset: done" ]; ok "reset --yes-delete ends with 'reset: done'" $? "$out"
[ ! -e jobs/acme-engineer ] && ! grep -q CI-MARKER-PREFS profile/preferences.md && grep -q '^SETUP: not done' profile/preferences.md
ok "after reset: personal files gone, preferences back to SETUP: not done" $?
[ -f AGENTS.md ] && [ -d .claude/hooks ] && [ -d templates/blank ]; ok "after reset: the app's own files are still there" $?

echo
echo "my-data smoke ($IMPL): passed $pass, failed $fail"
[ "$fail" -eq 0 ]
