#!/usr/bin/env bash
# Makes a dated zip backup of the user's own job-search data in a folder OUTSIDE the workspace.
# Usage: bash .claude/skills/my-data/scripts/export.sh [destination-folder] [--include-imports] [--include-templates]
#   destination-folder  default: ~/Downloads (created if missing; must be outside the workspace)
# Includes: profile/ jobs/ contacts/ outbox/ interviews/ history/ knowledge/field/ pages/ (the user-owned paths), plus resume.json at the top
# if profile/resume.json exists (the assistant writes it just before exporting).
# Never includes .claude/ .agents/ .codex/ .git/; templates/ and imports/ only when asked.
# Links (shortcuts) are left out, each reported as "skipped link: <path>".
# Output: last line "saved: <path>" on success; "error: ..." and exit 1 otherwise.
set -u

die() { echo "error: $*"; exit 1; }

# The workspace root is four levels above this script; it must contain AGENTS.md.
here="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || die "cannot find the script folder"
ROOT="$(cd "$here/../../../.." 2>/dev/null && pwd -P)" || die "cannot find the workspace"
[ -f "$ROOT/AGENTS.md" ] || die "this script is not inside a Job Search HQ workspace ($ROOT)"
[ -d "$ROOT/profile" ] || die "there is nothing to back up yet (no profile folder; setup has not run)"

dest=""; with_imports=""; with_templates=""
for a in "$@"; do
  case "$a" in
    --include-imports) with_imports=1 ;;
    --include-templates) with_templates=1 ;;
    -*) die "unknown option $a" ;;
    *) dest="$a" ;;
  esac
done
[ -n "$dest" ] || dest="$HOME/Downloads"
# shellcheck disable=SC2088  # a literal "~" typed by the user, expanded on purpose
case "$dest" in "~"|"~/"*) dest="$HOME${dest#\~}" ;; esac
made=""; [ -d "$dest" ] || made=1
mkdir -p "$dest" 2>/dev/null || die "cannot create the folder $dest"
dest="$(cd "$dest" && pwd -P)" || die "cannot open the folder $dest"
case "$dest/" in "$ROOT/"*)
  [ -n "$made" ] && rmdir "$dest" 2>/dev/null
  die "the backup folder must be outside the workspace (pick e.g. Downloads or Documents)" ;;
esac

stamp="$(date +%Y-%m-%d)"
name="job-search-backup-$stamp"
[ -e "$dest/$name.zip" ] && name="job-search-backup-$stamp-$(date +%H%M%S)"
out="$dest/$name.zip"

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t jshq)" || die "cannot make a temporary folder"
trap 'rm -rf "$tmp"' EXIT
stage="$tmp/$name"; mkdir -p "$stage" || die "cannot make a temporary folder"

dirs="profile jobs contacts outbox interviews history knowledge/field pages"
[ -n "$with_imports" ] && dirs="$dirs imports"
[ -n "$with_templates" ] && dirs="$dirs templates"
for d in $dirs; do
  if [ -e "$ROOT/$d" ] || [ -L "$ROOT/$d" ]; then
    mkdir -p "$(dirname "$stage/$d")" && cp -R "$ROOT/$d" "$stage/$d" || die "could not copy all of $d (nothing was saved)"
  fi
done
# Links (shortcuts) point outside the backup; leave them out rather than copy whatever they point to.
find "$stage" -type l | while IFS= read -r l; do echo "skipped link: ${l#"$stage"/}"; rm -f "$l"; done
# Leave out throwaway files: publish copies, theme previews, page-count PDFs, OS clutter.
rm -rf "$stage/pages/.publish" "$stage/pages/.preview"
find "$stage" \( -name '*.check.pdf' -o -name '.DS_Store' -o -name 'Thumbs.db' -o -name '~$*' \) -exec rm -f {} + 2>/dev/null
if [ -f "$ROOT/profile/resume.json" ] && [ ! -L "$ROOT/profile/resume.json" ]; then
  cp "$ROOT/profile/resume.json" "$stage/resume.json" || die "could not copy profile/resume.json (nothing was saved)"
fi

{
  echo "Job search backup made $stamp."
  echo ""
  echo "profile/     your master resume, stories, preferences, writing style, references"
  echo "jobs/        tracker.csv (opens in Excel), leads.csv (openings found, not yet saved) and one folder per job"
  echo "contacts/    contacts.csv: people you met or wanted to meet"
  echo "outbox/      message drafts; sent/ holds what you sent"
  echo "interviews/  interview notes, mock-interview scorecards, weekly reviews"
  echo "history/     activity.md: what changed and when"
  echo "knowledge/field/  your field pack: primer, keywords, target employers, role questions, background"
  echo "pages/       dashboard, flashcards, portfolio (open in a browser)"
  [ -f "$stage/resume.json" ] && echo "resume.json  your resume in JSON Resume format (jsonresume.org), for tools that import it"
  echo ""
  echo "This backup holds other people's names and contact details (contacts, references, interviewers)."
  echo "Keep it private: don't post it or share it, and delete old copies you no longer need."
  echo "To restore, unzip it and copy the folders back into a Job Search HQ workspace."
} > "$stage/READ-ME.txt" || die "could not write the backup's READ-ME (nothing was saved)"

count="$(find "$stage" -type f | wc -l | tr -d ' ')"
if command -v zip >/dev/null 2>&1; then
  (cd "$tmp" && zip -q -r -X "$out" "$name") || die "zip failed"
elif command -v python3 >/dev/null 2>&1 && python3 -c 1 >/dev/null 2>&1; then   # -c 1: skip the Windows Store stub
  (cd "$tmp" && python3 -I -m zipfile -c "$out" "$name") || die "zip failed"
elif command -v python >/dev/null 2>&1 && python -c 1 >/dev/null 2>&1; then
  (cd "$tmp" && python -I -m zipfile -c "$out" "$name") || die "zip failed"
else
  die "no zip tool found (on Windows, use export.ps1 instead)"
fi
[ -s "$out" ] || die "the backup file was not created"
chmod 600 "$out" 2>/dev/null
size="$(du -h "$out" | cut -f1 | tr -d ' ')"
echo "files: $count"
echo "size: $size"
echo "saved: $out"
