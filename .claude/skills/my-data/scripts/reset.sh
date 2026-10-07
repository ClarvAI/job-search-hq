#!/usr/bin/env bash
# Wipes the user's personal job-search data and puts the blank starting files back
# (from templates/blank/). Tools, skills, settings, the playbook and templates are kept.
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
BLANK_FILES="profile/master-resume.md profile/story-bank.md profile/voice.md profile/preferences.md
profile/references.md profile/published-pages.md profile/design.md knowledge/field-primer.md knowledge/resume-keywords.md
knowledge/target-employers.md knowledge/background.md knowledge/interview-questions.md history/activity.md
jobs/tracker.csv jobs/leads.csv contacts/contacts.csv pages/dashboard.html pages/flashcards.html pages/interview-brief.html
pages/portfolio.html"
# Check every blank copy exists and is non-empty BEFORE touching anything.
for f in $BLANK_FILES; do [ -s "$BLANK/$f" ] || die "blank copy missing: templates/blank/$f (nothing was changed)"; done
# The blank tracker, leads and contacts must be just the header line.
for f in jobs/tracker.csv jobs/leads.csv contacts/contacts.csv; do
  [ "$(grep -c . "$BLANK/$f")" = 1 ] || die "templates/blank/$f is not header-only (nothing was changed)"
done
# A folder that is a link (shortcut) to somewhere else would make the reset delete or overwrite
# files outside the workspace. Refuse before touching anything. (Links inside these folders are
# safe: rm -rf removes the link itself, never what it points to.)
for d in jobs contacts outbox outbox/sent outbox/discarded interviews imports profile history pages knowledge \
         templates templates/blank templates/blank/profile templates/blank/knowledge templates/blank/history \
         templates/blank/jobs templates/blank/contacts templates/blank/pages; do
  [ -L "$ROOT/$d" ] && die "$d is a link to another folder; reset only works on real folders (nothing was changed)"
done

n_del=0
del() {  # del <path inside ROOT>
  p="$1"
  case "$p" in "$ROOT"/?*) ;; *) die "refusing to delete outside the workspace: $p" ;; esac
  [ -e "$p" ] || [ -L "$p" ] || return 0
  for f in $BLANK_FILES; do [ "$p" = "$ROOT/$f" ] && [ -f "$p" ] && [ ! -L "$p" ] && return 0; done  # overwritten in step 2
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

# 1. Personal folders: delete their contents (keeping placeholders and examples).
clear_dir jobs tracker.csv leads.csv               # job folders, Excel copies of the tracker
clear_dir contacts contacts.csv
clear_dir outbox _example.md sent discarded
clear_dir outbox/sent .gitkeep
clear_dir outbox/discarded .gitkeep
clear_dir interviews .gitkeep
clear_dir imports README.md
clear_dir profile signature.example.txt             # signature.txt, resume-original.*, career-log.md, resume.json, extras
clear_dir history
del "$ROOT/pages/.publish"

# 2. Put the blank files back.
n_reset=0
for f in $BLANK_FILES; do
  n_reset=$((n_reset + 1))
  if [ "$mode" = dry ]; then
    echo "reset: $f"
  else
    mkdir -p "$(dirname "$ROOT/$f")" || die "could not make the folder for $f; the reset is incomplete"
    if [ -L "$ROOT/$f" ]; then rm -f -- "$ROOT/$f" || die "could not remove the link $f; the reset is incomplete"; fi  # never write through a link to a file outside
    cp "$BLANK/$f" "$ROOT/$f" || die "could not restore $f; the reset is incomplete"
  fi
done
for d in interviews outbox/sent outbox/discarded; do
  [ "$mode" = dry ] || { mkdir -p "$ROOT/$d" && { [ -e "$ROOT/$d/.gitkeep" ] || : > "$ROOT/$d/.gitkeep"; }; } \
    || die "could not recreate $d; the reset is incomplete"
done

if [ "$mode" = dry ]; then
  echo "would delete: $n_del item(s); would reset: $n_reset file(s)"
  echo "reset: dry-run (nothing changed)"
  exit 0
fi
printf -- '- %s · Reset · Personal data cleared; workspace back to blank.\n' "$(date '+%Y-%m-%d %H:%M')" >> "$ROOT/history/activity.md" \
  || die "personal data was cleared, but history/activity.md could not be updated"
echo "deleted: $n_del item(s); reset: $n_reset file(s)"
echo "reset: done"
