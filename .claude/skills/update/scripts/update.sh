#!/usr/bin/env bash
# Installs a new version of the app (Job Search HQ) from a release zip, without touching the user's own files.
# Usage (from anywhere; the workspace is the folder four levels above this script):
#   bash .claude/skills/update/scripts/update.sh --status                  installed version, update address, backups
#   bash .claude/skills/update/scripts/update.sh --check [zip|URL]         what an update would change; changes nothing
#   bash .claude/skills/update/scripts/update.sh [zip|URL] [--sha256 HEX]  install it (only after the user said yes)
#   bash .claude/skills/update/scripts/update.sh --rollback [backup-name]  undo the last update (or the named one)
# With no zip or URL, the address in VERSION (update_source) is used; it must be an https:// link to a release zip.
# Until the maintainer sets one, VERSION says "update_source: set by the maintainer before publishing": --status then
# prints "update_source: none ..." and an install without a zip stops with a plain "no download address" error.
#
# Rules (DATA_CONTRACT.md): only paths listed in the release's product-manifest.json are written; a release that
# lists a user-owned path, or whose files don't match their fingerprints, is refused before anything changes.
# An app file the user edited (its fingerprint matches neither the installed nor the new version) is kept as
# <file>.local next to the new one. Everything replaced or removed is copied to .backup/<old version>/ first; if
# anything fails midway, the update undoes itself. The app's templates/*.html are plain app files (the user's theme
# lives in their own copies in profile/templates/); when an update changes one the user has a copy of, that copy is
# rebuilt from the new template plus their theme (apply-theme.mjs --regenerate), and the old copy is kept as
# profile/templates/<name>.previous.html. Pages (pages/, interview briefs) are never touched.
# Output: "added:/updated:/removed:/kept-local:/new starter file:/template:/migration:/hooks-changed: claude|codex/
# note:" lines, a changelog block, and a last line "update: done A -> B (backup: .backup/X)", "update: check ...",
# "update: already up to date", "rollback: done ...", or "error: ..." (exit 1).
# Maintainer-only paths (ship: tests, CI, maintainer notes) are never installed, replaced, removed or
# reported, even if a manifest lists them: a release doesn't ship them, and a git clone's own copies stay as they are.
# Keep is_protected and ship (is_maintainer there) in step with scripts/build-manifest.sh and update.ps1.
set -u
die() { echo "error: $*"; exit 1; }

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || die "cannot find the script folder"
ROOT="$(cd "$here/../../../.." 2>/dev/null && pwd -P)" || die "cannot find the workspace"
case "$ROOT" in ""|/|"$HOME") die "unsafe workspace path: $ROOT" ;; esac
[ -f "$ROOT/AGENTS.md" ] && [ -f "$ROOT/VERSION" ] || die "AGENTS.md or VERSION not found in $ROOT; this is not a Job Search HQ workspace"
[ "$here" = "$ROOT/.claude/skills/update/scripts" ] || die "script is not where it should be inside the workspace"

mode=install; src=""; want_sha=""; rb_name=""
while [ $# -gt 0 ]; do
  case "$1" in
    --status) mode=status ;;
    --check) mode=check ;;
    --rollback) mode=rollback; case "${2:-}" in ""|-*) ;; *) rb_name="$2"; shift ;; esac ;;
    --sha256) shift; want_sha="$(printf '%s' "${1:-}" | tr 'A-F' 'a-f')" ;;
    -*) die "unknown option $1" ;;
    *) src="$1" ;;
  esac
  shift
done

if command -v sha256sum >/dev/null 2>&1; then H="sha256sum"; elif command -v shasum >/dev/null 2>&1; then H="shasum -a 256"; else die "no SHA-256 tool found (sha256sum or shasum)"; fi
fp() { LC_ALL=C tr -d '\r' < "$1" | $H | awk '{print $1}'; }            # fingerprint, as in product-manifest.json
rawsha() { $H < "$1" | awk '{print $1}'; }

is_protected() {   # user-owned or local-only: never written, moved or deleted by an update
  local p; p="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
  case "$p" in
    profile/readme.md|jobs/readme.md|contacts/readme.md|imports/readme.md|pages/readme.md|\
    interviews/.gitkeep|outbox/sent/.gitkeep|outbox/discarded/.gitkeep) return 1 ;;
    profile/*|jobs/*|contacts/*|outbox/*|interviews/*|history/*|imports/*|pages/*|knowledge/field/*) return 0 ;;
    .git/*|.backup/*|.claude/.health/*|.claude/settings.local.json|*.local|product-manifest.json) return 0 ;;
  esac
  return 1
}
# ship: drops maintainer-only paths (in the git repository, never in a release; the list and its reasons are in
# scripts/build-manifest.sh, is_maintainer) from a "path<TAB>fingerprint" list. Case-insensitive. awk, not a shell
# loop: one process for the whole list.
ship() {
  awk -F'\t' '{ l = tolower($1)
    if (l ~ /^(docs\/maintainers|\.github|scripts\/ci)\// || l ~ /^\.claude\/skills\/.*\/tests\// || l == "contributing.md") next
    print }'
}
safe_path() {      # relative, no "..", no backslashes or odd characters
  case "$1" in ""|/*|*\\*|*:*|*'"'*|..|../*|*/..|*/../*|*/./*|./*) return 1 ;; esac
  return 0
}
linked_parent() {  # linked_parent <relative path>: true if a folder on its way is a link (plink: the outermost one)
  plink=""; local q="$1"
  while :; do
    case "$q" in */*) q="${q%/*}" ;; *) break ;; esac
    [ -L "$ROOT/$q" ] && plink="$q"
  done
  [ -n "$plink" ]
}
man_files() { tr -d '\r' < "$1" | awk -F'"' '/^    "[^"]+": "[0-9a-f]{64}",?$/ { print $2 "\t" $4 }'; }
# "themed": the app templates a user may have their own themed copy of (profile/templates/<file name>).
man_themed() { tr -d '\r' < "$1" | awk -F'"' '/"themed": \[/ { t = 1; next } t && /\]/ { t = 0 } t && /^    "[^"]+",?$/ { print $2 }'; }
# hooks_lines <file listing paths>: which app must reload its hooks after these app files changed.
# Claude Code reads hook settings from .claude/settings.json when the folder opens; Codex turns changed hooks in
# .codex/hooks.json off until the user trusts them again. (Hook scripts in .claude/hooks/ take effect on their own.)
hooks_lines() {
  grep -qxF '.claude/settings.json' "$1" 2>/dev/null && echo "hooks-changed: claude"
  grep -qxF '.codex/hooks.json' "$1" 2>/dev/null && echo "hooks-changed: codex"
  return 0
}
man_version() { tr -d '\r' < "$1" | sed -n 's/^  "version": "\([0-9][0-9.]*\)",\{0,1\}$/\1/p' | head -1; }
ver_of() { tr -d '\r' < "$1" | sed -n 's/^version:[[:space:]]*\([0-9][0-9.]*\).*/\1/p' | head -1; }
ver_cmp() {        # prints -1, 0 or 1 comparing dotted versions $1 and $2
  awk -v a="$1" -v b="$2" 'BEGIN { na = split(a, x, "."); nb = split(b, y, "."); n = (na > nb ? na : nb)
    for (i = 1; i <= n; i++) { p = x[i] + 0; q = y[i] + 0; if (p < q) { print -1; exit } if (p > q) { print 1; exit } } print 0 }'
}
install_file() {   # install_file <source> <relative dest>: write via a temporary file + rename (safe even for this script)
  local d="$ROOT/$2"
  mkdir -p "$(dirname "$d")" && cp "$1" "$d.update-tmp" || return 1
  # Scripts and git hooks stay executable even when the zip was unpacked without permissions (Python's
  # zipfile drops them): git silently skips a hook that isn't executable.
  case "$2" in *.sh|.githooks/*) chmod +x "$d.update-tmp" 2>/dev/null ;; esac
  mv -f "$d.update-tmp" "$d"
}

OLDV="$(ver_of "$ROOT/VERSION")"; [ -n "$OLDV" ] || die "VERSION has no version: line"
SRC_DEFAULT="$(tr -d '\r' < "$ROOT/VERSION" | sed -n 's/^update_source:[[:space:]]*//p' | head -1)"
BK="$ROOT/.backup"

# ---------------------------------------------------------------- status
if [ "$mode" = status ]; then
  echo "version: $OLDV"
  case "$SRC_DEFAULT" in
    https://*) echo "update_source: $SRC_DEFAULT" ;;
    ""|*"set by the maintainer"*) echo "update_source: none (no download address is set yet; updates need a release zip you downloaded)" ;;
    *) echo "update_source: $SRC_DEFAULT (not an https:// link, so it can't be used; updates need a release zip you downloaded)" ;;
  esac
  if [ -d "$BK" ]; then
    for d in "$BK"/*/; do
      [ -f "$d/backup-info.txt" ] || continue
      echo "backup: .backup/$(basename "$d") ($(tr '\n' ' ' < "$d/backup-info.txt" | sed 's/ *$//'))"
    done
  fi
  echo "status: done"; exit 0
fi

# ---------------------------------------------------------------- rollback
restore_from() {   # restore_from <backup dir>: undo one update. Prints what it did. Returns 1 on a failure.
  local b="$1" p l bad=0
  if [ -f "$b/added.txt" ]; then
    while IFS= read -r p; do
      [ -n "$p" ] && safe_path "$p" && ! is_protected "$p" || continue
      if linked_parent "$p"; then echo "note: skipped $p ($plink/ is a link to another folder; nothing is changed through it)"; continue; fi
      if [ -f "$ROOT/$p" ] || [ -L "$ROOT/$p" ]; then rm -f -- "$ROOT/$p" && echo "removed: $p" || bad=1; fi
    done < "$b/added.txt"
  fi
  if [ -f "$b/changed.txt" ]; then
    while IFS= read -r p; do
      [ -n "$p" ] && safe_path "$p" && ! is_protected "$p" || continue
      [ -f "$b/files/$p" ] || { echo "error: the backup has no copy of $p"; bad=1; continue; }
      if linked_parent "$p"; then echo "note: skipped $p ($plink/ is a link to another folder; nothing is changed through it)"; continue; fi
      # Already as it was (an update that failed before reaching it): nothing to write, so a file that
      # can't be written (open in another program) doesn't turn a clean undo into "could not put back".
      if [ -f "$ROOT/$p" ] && [ ! -L "$ROOT/$p" ] && cmp -s "$b/files/$p" "$ROOT/$p" \
        && { [ -x "$b/files/$p" ] && [ -x "$ROOT/$p" ] || { [ ! -x "$b/files/$p" ] && [ ! -x "$ROOT/$p" ]; }; }; then
        echo "restored: $p"; continue
      fi
      install_file "$b/files/$p" "$p" && echo "restored: $p" || bad=1
    done < "$b/changed.txt"
  fi
  if [ -f "$b/local.txt" ]; then
    while IFS="$(printf '\t')" read -r p l; do
      [ -n "$p" ] && [ -n "$l" ] || continue
      # The user's edited version is back in place; drop the .local copy only if it is the same file.
      if [ -f "$ROOT/$l" ] && cmp -s "$ROOT/$l" "$ROOT/$p"; then rm -f -- "$ROOT/$l"; fi
    done < "$b/local.txt"
  fi
  if [ -f "$b/files/product-manifest.json" ]; then install_file "$b/files/product-manifest.json" product-manifest.json || bad=1
  elif [ -f "$b/added-manifest" ]; then rm -f -- "$ROOT/product-manifest.json"; fi
  return $bad
}

if [ "$mode" = rollback ]; then
  b=""
  if [ -n "$rb_name" ]; then
    case "$rb_name" in */*|..|.) die "backup name must be a folder name inside .backup" ;; esac
    b="$BK/$rb_name"
  else
    # Newest first: the folder whose backup-info.txt is newest and not yet rolled back.
    for d in "$BK"/*/; do
      d="${d%/}"; [ -f "$d/backup-info.txt" ] && ! grep -q '^rolled_back:' "$d/backup-info.txt" || continue
      { [ -z "$b" ] || [ "$d/backup-info.txt" -nt "$b/backup-info.txt" ]; } && b="$d"
    done
  fi
  [ -n "$b" ] && [ -f "$b/backup-info.txt" ] || die "no update backup to roll back to (.backup/ has none)"
  grep -q '^rolled_back:' "$b/backup-info.txt" && die "that update was already rolled back"
  grep -q '^complete: yes' "$b/backup-info.txt" || die "that backup is incomplete; restore by hand from $b/files"
  from="$(sed -n 's/^from: //p' "$b/backup-info.txt")"; to="$(sed -n 's/^to: //p' "$b/backup-info.txt")"
  [ "$(ver_of "$ROOT/VERSION")" = "$to" ] || die "the installed version is $(ver_of "$ROOT/VERSION"), not $to; roll back the newer update first"
  restore_from "$b" || die "some files could not be restored; the rest were (see above). Backup: ${b#"$ROOT"/}"
  echo "rolled_back: $(date '+%Y-%m-%d %H:%M')" >> "$b/backup-info.txt"
  cat "$b/added.txt" "$b/changed.txt" 2>/dev/null > "$b/touched.tmp"; hooks_lines "$b/touched.tmp"; rm -f "$b/touched.tmp"
  if [ -f "$b/templates.txt" ]; then
    while IFS= read -r t; do
      [ -n "$t" ] && [ -f "$ROOT/profile/templates/${t%.html}.previous.html" ] && \
        echo "note: that update refreshed your profile/templates/$t; your copy from before it is profile/templates/${t%.html}.previous.html"
    done < "$b/templates.txt"
  fi
  echo "rollback: done ($to -> $from)"
  exit 0
fi

# ---------------------------------------------------------------- get and check the release
from_default=""; [ -n "$src" ] || { src="$SRC_DEFAULT"; from_default=1; }
TMP="$(mktemp -d 2>/dev/null || mktemp -d -t jshqupd)" || die "cannot make a temporary folder"
trap 'rm -rf "$TMP"' EXIT
case "$src" in
  https://*)
    command -v curl >/dev/null 2>&1 || die "curl is not available to download the update; download the zip yourself and give its path"
    curl -fsSL --proto '=https' --max-time 300 -o "$TMP/release.zip" "$src" || die "could not download $src (nothing was changed)"
    zip="$TMP/release.zip" ;;
  http://*) die "only https:// addresses are allowed (nothing was changed)" ;;
  ""|*"set by the maintainer"*) die "no download address for updates is set yet; download the latest release zip yourself and give its path (nothing was changed)" ;;
  *) [ -z "$from_default" ] || die "the update address in VERSION ($src) isn't an https:// link; download the latest release zip yourself and give its path (nothing was changed)"
     case "$src" in "~/"*) src="$HOME/${src#\~/}" ;; esac
     [ -f "$src" ] || die "file not found: $src (nothing was changed)"
     zip="$src" ;;
esac
if [ -n "$want_sha" ]; then
  [ "$(rawsha "$zip")" = "$want_sha" ] || die "the downloaded file's SHA-256 doesn't match the one given; it may be damaged or changed (nothing was changed)"
fi

X="$TMP/x"; mkdir -p "$X"
if command -v unzip >/dev/null 2>&1; then
  entries="$(unzip -Z1 "$zip" 2>/dev/null)" || die "the update file is not a readable zip (nothing was changed)"
  # A pipe, not a here-document: a here-document needs a temporary file, and if that can't be made the check
  # would silently not run.
  printf '%s\n' "$entries" | while IFS= read -r e; do
    [ -n "$e" ] || continue
    case "$e" in /*|*\\*|..|../*|*/../*|*/..|[A-Za-z]:*) printf '%s\n' "$e"; exit 1 ;; esac
  done > "$TMP/unsafe.txt" || die "the update file has an unsafe path ($(head -1 "$TMP/unsafe.txt")); refused (nothing was changed)"
  unzip -q "$zip" -d "$X" 2>/dev/null || die "the update file could not be unpacked; it may be damaged (nothing was changed)"
elif command -v python3 >/dev/null 2>&1 && python3 -c 1 >/dev/null 2>&1; then
  python3 -I - "$zip" "$X" <<'PY' || die "the update file is damaged or has an unsafe path (nothing was changed)"
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
for n in z.namelist():
    if n.startswith('/') or '\\' in n or ':' in n.split('/')[0] or '..' in n.split('/'):
        sys.exit(1)
z.extractall(sys.argv[2])
PY
else
  die "no unzip tool found (on Windows, use update.ps1)"
fi
[ -z "$(find "$X" -type l 2>/dev/null | head -1)" ] || die "the update file contains links; refused (nothing was changed)"
NEW=""
if [ -f "$X/product-manifest.json" ]; then NEW="$X"
else
  for d in "$X"/*/; do [ -f "$d/product-manifest.json" ] && { [ -z "$NEW" ] || die "the zip holds more than one release"; NEW="${d%/}"; }; done
fi
[ -n "$NEW" ] && [ -f "$NEW/VERSION" ] || die "this zip is not a Job Search HQ release (no product-manifest.json and VERSION) (nothing was changed)"
NEWV="$(man_version "$NEW/product-manifest.json")"
[ -n "$NEWV" ] && [ "$NEWV" = "$(ver_of "$NEW/VERSION")" ] || die "the release's version is unclear (manifest and VERSION disagree) (nothing was changed)"

man_files "$NEW/product-manifest.json" > "$TMP/new.tsv"
[ -s "$TMP/new.tsv" ] || die "the release's file list is empty or unreadable (nothing was changed)"
man_themed "$NEW/product-manifest.json" > "$TMP/themed.txt"
for must in AGENTS.md VERSION .claude/skills/update/scripts/update.sh; do
  awk -F'\t' -v p="$must" '$1 == p { f = 1 } END { exit !f }' "$TMP/new.tsv" || die "the release's file list is missing $must (nothing was changed)"
done
while IFS="$(printf '\t')" read -r p h; do
  safe_path "$p" || die "the release lists an unsafe path ($p); refused (nothing was changed)"
  is_protected "$p" && die "the release lists one of your own files ($p); updates never touch those, so it was refused (nothing was changed)"
  [ -f "$NEW/$p" ] && [ ! -L "$NEW/$p" ] || die "the update file is incomplete ($p is missing); it may be damaged (nothing was changed)"
  [ "$(fp "$NEW/$p")" = "$h" ] || die "the update file is damaged or was changed ($p doesn't match its fingerprint); refused (nothing was changed)"
done < "$TMP/new.tsv"

c="$(ver_cmp "$NEWV" "$OLDV")"
if [ "$c" = 0 ] && [ "$mode" = install ] && [ -z "${JSHQ_REINSTALL:-}" ]; then echo "update: already up to date ($OLDV)"; exit 0; fi
[ "$c" = -1 ] && die "that release ($NEWV) is older than the installed version ($OLDV); to go back, use --rollback (nothing was changed)"

# ---------------------------------------------------------------- plan
# Maintainer-only paths drop out of both lists here: never installed, and never removed because a release doesn't
# ship them (an older manifest, such as a git clone's from before they were excluded, may still list them).
ship < "$TMP/new.tsv" > "$TMP/ship.tsv"; mv -f "$TMP/ship.tsv" "$TMP/new.tsv"
if [ -f "$ROOT/product-manifest.json" ]; then man_files "$ROOT/product-manifest.json" | ship > "$TMP/old.tsv"; else : > "$TMP/old.tsv"; fi
: > "$TMP/local.tsv"
cut -f1 "$TMP/new.tsv" "$TMP/old.tsv" | LC_ALL=C sort -u | while IFS= read -r p; do
  [ -n "$p" ] && safe_path "$p" && ! is_protected "$p" || continue
  # A folder on the way that is a link: never write through it. PARENTLINK: nothing there; PARENTLINKX:<fingerprint>:
  # something there (read through the link only to see whether it is already the new version).
  if linked_parent "$p"; then
    if [ -f "$ROOT/$p" ] && [ ! -L "$ROOT/$p" ]; then printf '%s\tPARENTLINKX:%s\n' "$p" "$(fp "$ROOT/$p")"
    elif [ -e "$ROOT/$p" ] || [ -L "$ROOT/$p" ]; then printf '%s\tPARENTLINKX:\n' "$p"
    else printf '%s\tPARENTLINK\n' "$p"; fi
  elif [ -L "$ROOT/$p" ]; then printf '%s\tLINK\n' "$p"
  elif [ -f "$ROOT/$p" ]; then printf '%s\t%s\n' "$p" "$(fp "$ROOT/$p")"; fi
done > "$TMP/local.tsv"
# plan.tsv: ACTION<TAB>path. ADD new file; SAME already the new version; UPDATE replace an unedited file;
# LOCAL user-edited: keep theirs as .local, install new; REMOVE no longer shipped and unedited;
# LOCALREMOVE no longer shipped but edited: set aside as .local.
awk -F'\t' -v OFS='\t' '
  FILENAME == ARGV[1] { old[$1] = $2; next }
  FILENAME == ARGV[2] { loc[$1] = $2; next }
  { neu[$1] = $2; order[++n] = $1 }
  END {
    for (i = 1; i <= n; i++) { p = order[i]; h = neu[p]
      if ((p in loc) && loc[p] ~ /^PARENTLINK/) { act = (loc[p] == ("PARENTLINKX:" h)) ? "SAME" : "SKIPLINK"; print act, p }
      else if (!(p in loc)) print "ADD", p
      else if (loc[p] == h) print "SAME", p
      else if ((p in old) && loc[p] == old[p]) print "UPDATE", p
      else print "LOCAL", p }
    for (p in old) if (!(p in neu) && (p in loc)) { if (loc[p] == "PARENTLINK") continue; if (loc[p] ~ /^PARENTLINKX/) print "SKIPLINK", p
      else if (loc[p] == old[p]) print "REMOVE", p; else print "LOCALREMOVE", p }
  }' "$TMP/old.tsv" "$TMP/local.tsv" "$TMP/new.tsv" > "$TMP/plan.tsv"
count() { grep -c "^$1	" "$TMP/plan.tsv"; }
nA="$(count ADD)"; nU="$(count UPDATE)"; nL="$(( $(count LOCAL) + $(count LOCALREMOVE) ))"; nR="$(count REMOVE)"

awk -F'\t' '$1 != "SAME" && $1 != "SKIPLINK" { print $2 }' "$TMP/plan.tsv" > "$TMP/changing.txt"
# App templates that change in this update and that the user has a themed copy of.
: > "$TMP/retheme.txt"
while IFS= read -r p; do
  [ -n "$p" ] && grep -qxF "$p" "$TMP/changing.txt" && [ -f "$ROOT/profile/templates/${p##*/}" ] && echo "${p##*/}" >> "$TMP/retheme.txt"
done < "$TMP/themed.txt"

if [ "$mode" = check ]; then
  echo "installed: $OLDV"; echo "available: $NEWV"
  awk -F'\t' '$1 == "LOCAL" || $1 == "LOCALREMOVE" { print "would keep your edited version: " $2 " (saved as " $2 ".local)" }
    $1 == "SKIPLINK" { print "would skip: " $2 " (a folder on its way is a link to another folder; nothing is written through it)" }' "$TMP/plan.tsv"
  hooks_lines "$TMP/changing.txt"
  while IFS= read -r t; do [ -n "$t" ] && echo "would refresh your themed copy: profile/templates/$t (your current copy is kept as profile/templates/${t%.html}.previous.html)"; done < "$TMP/retheme.txt"
  echo "update: check ($nA to add, $nU to update, $nR to remove, $nL edited by you; nothing changed)"
  exit 0
fi

# ---------------------------------------------------------------- back up, then apply
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK" || die "cannot create .backup (nothing was changed)"
B="$BK/$OLDV"; [ -e "$B" ] && B="$BK/$OLDV-$stamp"
mkdir -p "$B/files" || die "cannot create the backup folder (nothing was changed)"
printf 'from: %s\nto: %s\ndate: %s\n' "$OLDV" "$NEWV" "$(date '+%Y-%m-%d %H:%M')" > "$B/backup-info.txt" || die "cannot write the backup (nothing was changed)"
: > "$B/added.txt"; : > "$B/changed.txt"; : > "$B/local.txt"
if [ -f "$ROOT/product-manifest.json" ]; then cp -p "$ROOT/product-manifest.json" "$B/files/product-manifest.json" || die "cannot back up product-manifest.json (nothing was changed)"
else : > "$B/added-manifest"; fi
while IFS="$(printf '\t')" read -r a p; do
  case "$a" in UPDATE|LOCAL|REMOVE|LOCALREMOVE)
    mkdir -p "$(dirname "$B/files/$p")" && cp -p "$ROOT/$p" "$B/files/$p" || die "cannot back up $p (nothing was changed)"
    echo "$p" >> "$B/changed.txt" ;;
  esac
done < "$TMP/plan.tsv"
echo "complete: yes" >> "$B/backup-info.txt"

fail() {  # undo everything done so far, then stop
  echo "error: $1; undoing the update"
  restore_from "$B" >/dev/null 2>&1 && echo "rolled_back: $(date '+%Y-%m-%d %H:%M') (automatic)" >> "$B/backup-info.txt" \
    && die "the update could not finish ($1); everything was put back as it was" \
    || die "the update could not finish ($1) and some files could not be put back; restore them from ${B#"$ROOT"/}/files"
}
while IFS="$(printf '\t')" read -r a p; do
  case "$a" in
    ADD) echo "$p" >> "$B/added.txt"; install_file "$NEW/$p" "$p" || fail "could not add $p"; echo "added: $p" ;;
    UPDATE) install_file "$NEW/$p" "$p" || fail "could not update $p"; echo "updated: $p" ;;
    LOCAL|LOCALREMOVE)
      l="$p.local"; [ -e "$ROOT/$l" ] && l="$p.$stamp.local"
      mv -f "$ROOT/$p" "$ROOT/$l" || fail "could not set aside $p"
      printf '%s\t%s\n' "$p" "$l" >> "$B/local.txt"
      if [ "$a" = LOCAL ]; then
        echo "$p" >> "$B/added.txt"
        install_file "$NEW/$p" "$p" || fail "could not update $p"
        echo "kept-local: $p (your edited version is now $l)"
      else echo "kept-local: $p (no longer part of the app; your edited version is now $l)"; fi ;;
    REMOVE) rm -f -- "$ROOT/$p" || fail "could not remove $p"; echo "removed: $p" ;;
    SKIPLINK) linked_parent "$p"; echo "note: skipped $p (${plink:-a folder on its way}/ is a link to another folder; the update never writes through it)" ;;
  esac
done < "$TMP/plan.tsv"
# The LOCAL files were moved, not copied over: restore_from must put the backup copy back, not delete it.
# (added.txt lists them so a rollback removes the new copy first, then changed.txt restores the user's.)
install_file "$NEW/product-manifest.json" product-manifest.json || fail "could not update product-manifest.json"

# ---------------------------------------------------------------- after the app files
out="$(bash "$ROOT/.claude/skills/start/scripts/init-data.sh" 2>&1)"
printf '%s\n' "$out" | sed -n 's/^created: /new starter file: /p'
printf '%s\n' "$out" | grep '^error:' | sed 's/^error:/note: starter files:/'
# The user's themed template copies (profile/templates/): rebuild the ones whose app template changed.
# Pages and interview briefs are never re-themed by an update.
if [ -s "$TMP/retheme.txt" ]; then
  cp "$TMP/retheme.txt" "$B/templates.txt" 2>/dev/null
  list="$(paste -sd, "$TMP/retheme.txt")"
  if command -v node >/dev/null 2>&1; then
    r="$(node "$ROOT/.claude/skills/page-design/scripts/apply-theme.mjs" --regenerate "$list" 2>&1)"
    printf '%s\n' "$r" | sed -n -E 's/^(refreshed|created): /template: /p'
    case "$(printf '%s\n' "$r" | tail -1)" in result:*) ;;
      *) echo "note: your themed template copies (profile/templates/: $list) were not refreshed ($(printf '%s\n' "$r" | grep '^error:' | head -1)); they still work but miss this update's template changes; refresh them with the page-design skill" ;; esac
  else
    echo "note: the app's $list changed, and Node isn't available to refresh your themed copy in profile/templates/; refresh it by hand (update skill, \"Themed templates without Node\")"
  fi
fi
if [ -d "$ROOT/migrations" ]; then
  for m in "$ROOT"/migrations/[0-9][0-9][0-9]-*.md; do
    [ -f "$m" ] || continue
    mv_="$(ver_of "$m")"; [ -n "$mv_" ] || continue
    [ "$(ver_cmp "$mv_" "$OLDV")" = 1 ] && [ "$(ver_cmp "$mv_" "$NEWV")" != 1 ] && echo "migration: ${m#"$ROOT"/}"
  done
fi
hooks_lines "$TMP/changing.txt"
if [ -f "$ROOT/CHANGELOG.md" ]; then
  echo "changelog:"
  tr -d '\r' < "$ROOT/CHANGELOG.md" | awk -v old="$OLDV" '
    function gt(a, b,   x, y, i, n) { n = split(a, x, "."); split(b, y, "."); for (i = 1; i <= 3; i++) { if (x[i] + 0 > y[i] + 0) return 1; if (x[i] + 0 < y[i] + 0) return 0 } return 0 }
    /^## [0-9]+\.[0-9]+\.[0-9]+/ { v = $2; show = gt(v, old) }
    show { print }'
  echo "end of changelog"
fi
echo "update: done $OLDV -> $NEWV (backup: ${B#"$ROOT"/})"
