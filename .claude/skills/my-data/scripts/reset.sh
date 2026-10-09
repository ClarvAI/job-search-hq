#!/usr/bin/env bash
# Wipes the user's personal job-search data (every user-owned path in DATA_CONTRACT.md), then puts the
# blank starting files back by running the first-run script (.claude/skills/start/scripts/init-data.sh,
# which copies templates/blank/). Tools, skills, settings, the playbook and templates are kept.
# Usage:
#   bash .claude/skills/my-data/scripts/reset.sh --dry-run      list what would be deleted or reset; changes nothing
#   bash .claude/skills/my-data/scripts/reset.sh --yes-delete   do it (only after the user typed the confirm phrase)
# Works only on the workspace this script lives in (four levels up), and only if AGENTS.md
# and a complete templates/blank/ are there. Output ends with "reset: done" or "error: ...".
set -u

die() { echo "error: $*"; exit 1; }

mode=""
for a in "$@"; do
  case "$a" in
    --yes-delete) mode=delete ;;
    --dry-run) [ -n "$mode" ] || mode=dry ;;
    *) die "unknown option $a" ;;
  esac
done
[ -n "$mode" ] || die "refusing to run: add --dry-run to preview, or --yes-delete to really delete (only after the user confirms)"

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || die "cannot find the script folder"
ROOT="$(cd "$here/../../../.." 2>/dev/null && pwd -P)" || die "cannot find the workspace"
case "$ROOT" in ""|/|"$HOME"|"$(cd "$HOME" 2>/dev/null && pwd -P)") die "unsafe workspace path: $ROOT" ;; esac
[ -f "$ROOT/AGENTS.md" ] || die "AGENTS.md not found in $ROOT; this is not a Job Search HQ workspace"
[ "$here" = "$ROOT/.claude/skills/my-data/scripts" ] || die "script is not where it should be inside the workspace"

BLANK="$ROOT/templates/blank"
INIT="$ROOT/.claude/skills/start/scripts/init-data.sh"
[ -f "$INIT" ] || die "the starter-file script is missing (.claude/skills/start/scripts/init-data.sh); nothing was changed"
# Every blank copy the init will restore (all of templates/blank/ except its README), checked BEFORE touching anything.
[ -d "$BLANK" ] && [ ! -L "$BLANK" ] || die "templates/blank/ is missing or a link (nothing was changed)"
BLANK_FILES="$(cd "$BLANK" && find . -type f ! -path ./README.md | sed 's#^\./##' | LC_ALL=C sort)"
[ -z "$(find "$BLANK" -type l 2>/dev/null | head -1)" ] || die "something inside templates/blank/ is a link to another place; reset only works on real files and folders (nothing was changed)"
# Every blank copy the app shipped (product-manifest.json) must be there; without a manifest, at least these.
REQUIRED="$(tr -d '\r' < "$ROOT/product-manifest.json" 2>/dev/null | sed -n 's#^    "templates/blank/\(.*\)": "[0-9a-f]\{64\}",\{0,1\}$#\1#p' | grep -v '^README\.md$')"
[ -n "$REQUIRED" ] || REQUIRED="profile/preferences.md profile/master-resume.md history/activity.md jobs/tracker.csv jobs/leads.csv contacts/contacts.csv"
for f in $REQUIRED; do
  case "
$BLANK_FILES
" in *"
$f
"*) ;; *) die "blank copy missing: templates/blank/$f (nothing was changed)" ;; esac
done
while IFS= read -r f; do
  [ -s "$BLANK/$f" ] || [ "${f##*/}" = .gitkeep ] || die "blank copy missing: templates/blank/$f (nothing was changed)"
done <<EOF2
$BLANK_FILES
EOF2
# The blank tracker, leads and contacts must be just the header line.
for f in jobs/tracker.csv jobs/leads.csv contacts/contacts.csv; do
  [ "$(grep -c . "$BLANK/$f")" = 1 ] || die "templates/blank/$f is not header-only (nothing was changed)"
done
# A folder that is a link (shortcut) to somewhere else would make the reset delete or overwrite
# files outside the workspace. Refuse before touching anything. (Links inside these folders are
# safe: rm -rf removes the link itself, never what it points to.)
for d in jobs contacts outbox outbox/sent outbox/discarded interviews imports profile history pages knowledge knowledge/field \
         templates templates/blank $(cd "$BLANK" && find . -mindepth 1 -type d | sed 's#^\./#templates/blank/#'); do
  [ -L "$ROOT/$d" ] && die "$d is a link to another folder; reset only works on real folders (nothing was changed)"
done

n_del=0
del() {  # del <path inside ROOT>
  p="$1"
  case "$p" in "$ROOT"/?*) ;; *) die "refusing to delete outside the workspace: $p" ;; esac
  [ -e "$p" ] || [ -L "$p" ] || return 0
  n_del=$((n_del + 1))
  if [ "$mode" = dry ]; then echo "delete: ${p#"$ROOT"/}"
  else rm -rf -- "$p" && [ ! -e "$p" ] && [ ! -L "$p" ] || die "could not delete ${p#"$ROOT"/}; the reset is incomplete"; fi
}
# Delete everything directly inside <dir> except the names listed.
clear_dir() {  # clear_dir <dir relative to ROOT> [keep-name ...]
  dir="$ROOT/$1"; shift
  [ -d "$dir" ] || return 0
  for p in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do
    [ -e "$p" ] || [ -L "$p" ] || continue
    b="$(basename "$p")"; keep=""
    for k in "$@"; do [ "$b" = "$k" ] && keep=1; done
    [ -n "$keep" ] || del "$p"
  done
}

# 1. Personal folders: delete their contents (keeping the folder guides and placeholders that ship with the app).
clear_dir profile README.md                          # everything: resume, stories, preferences, signature, resume copies
clear_dir jobs README.md                             # tracker, leads, job folders, Excel copies of the tracker
clear_dir contacts README.md
clear_dir outbox sent discarded
clear_dir outbox/sent .gitkeep
clear_dir outbox/discarded .gitkeep
clear_dir interviews .gitkeep
clear_dir imports README.md
clear_dir history
clear_dir pages README.md                            # the user's pages and publish copies
del "$ROOT/knowledge/field"                          # the field pack

# 2. Put the blank starter files back (the same first-run script the session-start hook uses).
n_reset="$(printf '%s\n' "$BLANK_FILES" | grep -c .)"
if [ "$mode" != dry ]; then
  out="$(bash "$INIT" 2>&1)" || die "personal data was deleted, but the blank files could not all be put back ($(printf '%s' "$out" | grep 'error:' | head -1)); the reset is incomplete. Run bash .claude/skills/start/scripts/init-data.sh"
  n_reset="$(printf '%s\n' "$out" | grep -c '^created: ')"
  for d in interviews outbox/sent outbox/discarded; do
    { mkdir -p "$ROOT/$d" && { [ -e "$ROOT/$d/.gitkeep" ] || : > "$ROOT/$d/.gitkeep"; }; } || die "could not recreate $d; the reset is incomplete"
  done
else
  printf '%s\n' "$BLANK_FILES" | sed 's/^/reset: /'
fi

if [ "$mode" = dry ]; then
  echo "would delete: $n_del item(s); would reset: $n_reset file(s)"
  echo "reset: dry-run (nothing changed)"
  exit 0
fi
printf -- '- %s · Reset · Personal data cleared; workspace back to blank.\n' "$(date '+%Y-%m-%d %H:%M')" >> "$ROOT/history/activity.md" \
  || die "personal data was cleared, but history/activity.md could not be updated"
echo "deleted: $n_del item(s); reset: $n_reset file(s)"
echo "reset: done"
