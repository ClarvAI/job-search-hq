#!/usr/bin/env bash
# Brings a /my-data backup back into this workspace, from the UNPACKED backup (unzip it outside the workspace first).
# Usage: bash .claude/skills/my-data/scripts/restore.sh [--dry-run] [--add-only] <unpacked folder>
#   <unpacked folder>  the job-search-backup-<date> folder, or the new folder it was unzipped into
#   --dry-run   list what would happen; change nothing
#   --add-only  only copy files that are missing here; change nothing that exists (not even blank starter files)
# For each file in the backup's user folders (profile jobs contacts outbox interviews history knowledge/field pages
# imports):
#   missing here                                   -> copied               "restored: <path>"
#   here, still the blank starter (same as templates/blank/<path>, carriage returns ignored)
#                                                  -> replaced             "replaced starter: <path>"
#   history/activity.md                            -> the backup's log, then any line here it doesn't have
#                                                                          "merged: history/activity.md"
#   here and different                             -> left as it is        "differs: <path>" (the assistant asks)
#   here and identical                             -> nothing
# Links are never followed or copied ("skipped link: <path>"). Nothing outside those folders is written; the backup's
# templates/, app files, READ-ME.txt and resume.json are never copied ("ignored: <name>" for unexpected top-level items).
# Refuses while an Office lock file (~$...) is in a user folder, or if a user folder here is a link.
# Output: last line "restore: done (N restored, N replaced starter, N merged, N differ)" or "error: ..." and exit 1.
set -u

die() { echo "error: $*"; exit 1; }

dry=""; addonly=""; src=""
for a in "$@"; do
  case "$a" in
    --dry-run) dry=1 ;;
    --add-only) addonly=1 ;;
    -*) die "unknown option $a" ;;
    *) [ -z "$src" ] || die "give just one backup folder"; src="$a" ;;
  esac
done
[ -n "$src" ] || die "give the unpacked backup folder (unzip the backup outside the workspace first)"

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || die "cannot find the script folder"
ROOT="$(cd "$here/../../../.." 2>/dev/null && pwd -P)" || die "cannot find the workspace"
[ -f "$ROOT/AGENTS.md" ] || die "AGENTS.md not found in $ROOT; this is not a Job Search HQ workspace"
[ "$here" = "$ROOT/.claude/skills/my-data/scripts" ] || die "script is not where it should be inside the workspace"
BLANK="$ROOT/templates/blank"

# shellcheck disable=SC2088  # a literal "~" typed by the user, expanded on purpose
case "$src" in "~"|"~/"*) src="$HOME${src#\~}" ;; esac
[ -d "$src" ] || die "no such folder: $src"
src="$(cd "$src" && pwd -P)" || die "cannot open the folder $src"

# The job-search-backup-<date> folder itself, or the folder it was unzipped into (holding exactly one).
B=""
case "${src##*/}" in job-search-backup-*) [ -f "$src/READ-ME.txt" ] && B="$src" ;; esac
if [ -z "$B" ]; then
  n=0
  for c in "$src"/job-search-backup-*; do
    if [ -d "$c" ] && [ ! -L "$c" ] && [ -f "$c/READ-ME.txt" ]; then n=$((n + 1)); B="$c"; fi
  done
  [ "$n" -le 1 ] || die "that folder holds more than one backup; give the job-search-backup-<date> folder to restore"
fi
[ -n "$B" ] || die "that folder is not an unpacked Job Search HQ backup (no job-search-backup-<date> folder with READ-ME.txt)"
B="$(cd "$B" && pwd -P)" || die "cannot open the backup folder"
d="$B"
while :; do
  [ "$d" -ef "$ROOT" ] && die "the unpacked backup is inside the workspace; unzip it into a new folder outside it (e.g. in Downloads) and try again"
  p="$(dirname "$d")"; [ "$p" = "$d" ] && break; d="$p"
done

DIRS="profile jobs contacts outbox interviews history knowledge/field pages imports"
# A user folder here that is a link would make the restore write outside the workspace.
for x in $DIRS knowledge outbox/sent outbox/discarded; do
  [ -L "$ROOT/$x" ] && die "$x is a link to another folder; restore only works on real folders (nothing was changed)"
done
# Excel and Word leave a ~$<name> lock file next to an open file; writing under them loses the change.
locks="$(cd "$ROOT" && for x in $DIRS; do [ -d "$x" ] && find "$x" -name '~$*' -print; done | LC_ALL=C sort)"
if [ -n "$locks" ]; then
  printf '%s\n' "$locks" | sed 's/^/open: /'
  [ -n "$dry" ] || die "a file is open in Excel or Word (see the open: lines; each ~\$ file is its lock). Close it, then run the restore again. (nothing was changed)"
fi

# Top-level items of the backup that are never restored.
for e in "$B"/* "$B"/.[!.]* "$B"/..?* "$B"/knowledge/* "$B"/knowledge/.[!.]* "$B"/knowledge/..?*; do
  [ -e "$e" ] || [ -L "$e" ] || continue
  r="${e#"$B"/}"
  case "$r" in
    profile|jobs|contacts|outbox|interviews|history|pages|imports|knowledge|knowledge/field|READ-ME.txt|resume.json) ;;
    *) echo "ignored: $r" ;;
  esac
done
[ -L "$B/knowledge" ] && echo "skipped link: knowledge"

# Every file and link in the backup's user folders (find does not follow links; a linked folder is listed, not entered).
list="$(cd "$B" && for x in $DIRS; do
  if [ "${x%%/*}" = knowledge ] && [ -L knowledge ]; then continue; fi   # (no case here: bash 3.2 misreads it inside $( ))
  if [ -e "$x" ] || [ -L "$x" ]; then find "$x" \( -type f -o -type l \) -print; fi
done | LC_ALL=C sort)" || die "could not list the backup's files (nothing was changed)"

same_text() { [ "$(tr -d '\r' < "$1" | cksum)" = "$(tr -d '\r' < "$2" | cksum)" ]; }
parent_state() {  # "link" if a folder between the workspace and this file is a link, "file" if one is a file
  q="$(dirname "$1")"
  while [ "$q" != . ] && [ -n "$q" ]; do
    if [ -L "$ROOT/$q" ]; then echo link; return; fi
    if [ -e "$ROOT/$q" ] && [ ! -d "$ROOT/$q" ]; then echo file; return; fi
    q="$(dirname "$q")"
  done
}
copy_in() {
  mkdir -p "$(dirname "$ROOT/$1")" && cp -p "$B/$1" "$ROOT/$1.restore-tmp" && mv -f "$ROOT/$1.restore-tmp" "$ROOT/$1"
}
merge_log() {  # the backup's log, then the lines here that it doesn't have
  t="$ROOT/$1.restore-tmp"
  { cat "$B/$1"; [ -z "$(tail -c 1 "$B/$1")" ] || echo
    awk 'FILENAME == ARGV[1] { sub(/\r$/, ""); seen[$0] = 1; next } { sub(/\r$/, ""); if ($0 != "" && !($0 in seen)) print }' \
      "$B/$1" "$ROOT/$1"
  } > "$t" && mv -f "$t" "$ROOT/$1"
}

n_rest=0; n_rep=0; n_merge=0; n_diff=0
old_ifs="$IFS"; IFS='
'
set -f
for r in $list; do
  [ -n "$r" ] || continue
  if [ -L "$B/$r" ]; then echo "skipped link: $r"; continue; fi
  case "${r##*/}" in '~$'*|.DS_Store|Thumbs.db|*.restore-tmp) continue ;; esac   # lock files and clutter
  dst="$ROOT/$r"
  ps_="$(parent_state "$r")"
  if [ "$ps_" = link ] || [ -L "$dst" ]; then echo "skipped link: $r"; continue; fi
  if [ "$ps_" = file ]; then act="differs"
  elif [ ! -e "$dst" ]; then act="restored"
  elif [ -d "$dst" ]; then act="differs"
  elif cmp -s "$B/$r" "$dst"; then continue
  elif [ -n "$addonly" ]; then act="differs"
  elif [ "$r" = history/activity.md ]; then act="merged"
  elif [ -f "$BLANK/$r" ] && same_text "$dst" "$BLANK/$r"; then act="replaced starter"
  else act="differs"; fi
  if [ -z "$dry" ]; then
    case "$act" in
      restored|"replaced starter") copy_in "$r" || die "could not copy $r; the restore is incomplete" ;;
      merged) merge_log "$r" || die "could not merge $r; the restore is incomplete" ;;
    esac
  fi
  echo "$act: $r"
  case "$act" in
    restored) n_rest=$((n_rest + 1)) ;;
    "replaced starter") n_rep=$((n_rep + 1)) ;;
    merged) n_merge=$((n_merge + 1)) ;;
    differs) n_diff=$((n_diff + 1)) ;;
  esac
done
set +f; IFS="$old_ifs"

counts="$n_rest restored, $n_rep replaced starter, $n_merge merged, $n_diff differ"
if [ -n "$dry" ]; then
  [ -n "$locks" ] && echo "note: the real restore will refuse until the open: files above are closed"
  echo "restore: dry-run ($counts; nothing changed)"
else
  echo "restore: done ($counts)"
fi
