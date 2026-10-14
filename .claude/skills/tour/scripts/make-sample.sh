#!/usr/bin/env bash
# Makes a SEPARATE sample workspace filled with made-up data (Alex Rivera), so someone can try the panels and
# pages before entering anything about themselves. The user's own workspace is never written to: the sample is
# a new folder next to it, holding a copy of the app (no personal files, no .git) plus the sample data from
# templates/sample/ (dates moved to today), with the rest of the personal files from templates/blank/.
# make-sample.ps1 is the Windows twin: keep the two in step.
# Usage:
#   bash .claude/skills/tour/scripts/make-sample.sh [--dry-run] [--parent <folder>] [--name <folder name>]
#   bash .claude/skills/tour/scripts/make-sample.sh --remove [--parent <folder>] [--name <folder name>]
#   (--today YYYY-MM-DD sets the day the sample dates count from; for tests.)
# Default folder: "<this workspace's folder name> (sample - Alex Rivera)", next to this workspace.
# Refuses: a target that exists (then prints "suggest: <a free name>"), a parent folder that is a link or is
# inside this workspace, and running from inside a sample workspace. --remove deletes only a folder this script
# made (its .sample-workspace marker) that still holds the sample person, never a link.
# Output ends with "sample: made <path>", "sample: removed <path>", "sample: dry-run ..." or "error: ...".
set -u
die() { echo "error: $*"; exit 1; }

MARK_LINE="Job Search HQ sample workspace (made by make-sample)"
SAMPLE_NAME_LINE="name: Alex Rivera (sample)"
mode="make"; parent=""; name=""; today=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) mode=dry ;;
    --remove) mode=remove ;;
    --parent) [ $# -ge 2 ] || die "--parent needs a folder"; parent="$2"; shift ;;
    --name) [ $# -ge 2 ] || die "--name needs a folder name"; name="$2"; shift ;;
    --today) [ $# -ge 2 ] || die "--today needs a date"; today="$2"; shift ;;
    *) die "unknown option $1" ;;
  esac
  shift
done
set -f   # no file-name expansion anywhere: names come from lists, never from patterns

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || die "cannot find the script folder"
ROOT="$(cd "$here/../../../.." 2>/dev/null && pwd -P)" || die "cannot find the workspace"
case "$ROOT" in ""|/|"$HOME") die "unsafe workspace path: $ROOT" ;; esac
[ -f "$ROOT/AGENTS.md" ] || die "AGENTS.md not found in $ROOT; this is not a Job Search HQ workspace"
[ "$here" = "$ROOT/.claude/skills/tour/scripts" ] || die "script is not where it should be inside the workspace"
if [ "$mode" != remove ] && { [ -e "$ROOT/.sample-workspace" ] || [ -L "$ROOT/.sample-workspace" ]; }; then
  die "this folder is already a sample workspace. Make a sample from your own workspace instead."
fi

lc() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }
# inside <path> <folder>: true if path is folder itself or somewhere under it (case-insensitive, like macOS and Windows).
inside() { case "$(lc "$1")/" in "$(lc "$2")/"*) return 0 ;; esac; return 1; }

# ---- Where the sample goes
if [ -z "$parent" ]; then parent="$(dirname "$ROOT")"; fi
case "$parent" in
  /*) ;;
  [A-Za-z]:[/\\]*) command -v cygpath >/dev/null 2>&1 && parent="$(cygpath -u "$parent")" ;;  # Git Bash: D:/... or D:\...
  *) parent="$(pwd -P)/$parent" ;;
esac
parent="${parent%/}"; [ -n "$parent" ] || parent=/
[ -L "$parent" ] && die "the folder $parent is a link (shortcut) to another place; choose a real folder"
[ -d "$parent" ] || die "the folder $parent does not exist"
parent_real="$(cd "$parent" 2>/dev/null && pwd -P)" || die "cannot open the folder $parent"
[ -n "$name" ] || name="$(basename "$ROOT") (sample - Alex Rivera)"
case "$name" in ""|.|..|.*|*/*|*\\*|*:*) die "not a usable folder name: $name" ;; esac
case "$name" in *"
"*) die "not a usable folder name" ;; esac
target="$parent_real/$name"
if inside "$target" "$ROOT"; then die "the sample can't go inside your own workspace ($ROOT); choose a folder outside it"; fi
if inside "$ROOT" "$target"; then die "the sample can't be a folder that holds your own workspace"; fi
case "$target" in "$HOME"|/) die "unsafe sample folder: $target" ;; esac

# ---- Remove a sample this script made
if [ "$mode" = remove ]; then
  { [ -e "$target" ] || [ -L "$target" ]; } || die "there is no sample folder at $target"
  [ -L "$target" ] && die "$target is a link (shortcut), not a sample folder; nothing was deleted"
  [ -d "$target" ] || die "$target is not a folder; nothing was deleted"
  real="$(cd "$target" && pwd -P)" || die "cannot open $target"
  [ "$real" = "$target" ] || die "$target resolves to another place; nothing was deleted"
  inside "$real" "$ROOT" && die "that folder is inside your own workspace; nothing was deleted"
  inside "$ROOT" "$real" && die "that folder holds your own workspace; nothing was deleted"
  m="$target/.sample-workspace"
  { [ -f "$m" ] && [ ! -L "$m" ] && [ "$(head -n 1 "$m" | tr -d '\r')" = "$MARK_LINE" ]; } \
    || die "$target was not made by make-sample (no sample marker), so it was not deleted. Delete it yourself if you're sure."
  p="$target/profile/preferences.md"
  { [ -f "$p" ] && [ ! -L "$p" ] && tr -d '\r' < "$p" | grep -qxF "$SAMPLE_NAME_LINE"; } \
    || die "$target no longer looks like the sample (its preferences don't name the sample person), so it was not deleted: someone may have put real details in it. Delete it yourself if you're sure."
  { [ -e "$target/.git" ] || [ -L "$target/.git" ]; } && die "$target has its own git history now, so it was not deleted. Delete it yourself if you're sure."
  locks="$(cd "$target" && find . -name '~$*' -print 2>/dev/null | head -1)"
  [ -z "$locks" ] || die "a file in the sample is open in Excel or Word (${locks#./}). Close it, then try again."
  rm -rf -- "$target" || die "could not delete everything in $target"
  { [ -e "$target" ] || [ -L "$target" ]; } && die "could not delete everything in $target"
  echo "sample: removed $target"
  exit 0
fi

# ---- Make a new sample
SAMPLE="$ROOT/templates/sample"
for d in "$SAMPLE" "$SAMPLE/workspace" "$SAMPLE/page-data"; do
  [ -d "$d" ] && [ ! -L "$d" ] || die "the sample data (templates/sample/) is missing or incomplete; nothing was made"
done
[ -z "$(find "$SAMPLE" -type l 2>/dev/null | head -1)" ] || die "something inside templates/sample/ is a link; nothing was made"
for f in dashboard flashcards interview-brief; do [ -f "$SAMPLE/page-data/$f.json" ] || die "templates/sample/page-data/$f.json is missing; nothing was made"; done

if { [ -e "$target" ] || [ -L "$target" ]; }; then
  echo "error: $target already exists, so nothing was made. It may be a sample from before: open it, or remove it first (--remove)."
  n=2
  while [ $n -lt 100 ]; do
    [ -e "$parent_real/$name $n" ] || [ -L "$parent_real/$name $n" ] || { echo "suggest: $name $n"; break; }
    n=$((n + 1))
  done
  exit 1
fi

[ -n "$today" ] || today="$(date +%Y-%m-%d)"
case "$today" in [12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]) ;; *) die "--today must be YYYY-MM-DD" ;; esac

# render: replaces the date tokens on stdin (see templates/sample/README.md). Bytes pass through unchanged
# otherwise (byte-order marks and line endings included).
render() {
  LC_ALL=C awk -v today="$today" '
    function dfc(y, m, d,   era, yoe, doy, doe) { y -= (m <= 2); era = int(y / 400); yoe = y - era * 400
      doy = int((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1; doe = yoe * 365 + int(yoe / 4) - int(yoe / 100) + doy
      return era * 146097 + doe - 719468 }
    function civil(z,   era, doe, yoe, y, doy, mp, d, m) { z += 719468; era = int(z / 146097); doe = z - era * 146097
      yoe = int((doe - int(doe / 1460) + int(doe / 36524) - int(doe / 146096)) / 365); y = yoe + era * 400
      doy = doe - (365 * yoe + int(yoe / 4) - int(yoe / 100)); mp = int((5 * doy + 2) / 153)
      d = doy - int((153 * mp + 2) / 5) + 1; m = (mp < 10 ? mp + 3 : mp - 9); if (m <= 2) y++
      CY = y; CM = m; CD = d }
    function iso(off) { civil(base + off); return sprintf("%04d-%02d-%02d", CY, CM, CD) }
    function compact(off) { civil(base + off); return sprintf("%04d%02d%02d", CY, CM, CD) }
    function unclear(   k) { for (k = 7; k < 60; k++) { civil(base + k); if (CD <= 12 && CD != CM) return sprintf("%02d/%02d/%04d", CM, CD, CY) } return "" }
    BEGIN { base = dfc(substr(today, 1, 4) + 0, substr(today, 6, 2) + 0, substr(today, 9, 2) + 0); U = unclear() }
    { out = ""; s = $0
      while (match(s, /[{][{](D[-+][0-9]+|N[-+][0-9]+|UNCLEAR)[}][}]/)) {
        tok = substr(s, RSTART + 2, RLENGTH - 4)
        if (tok == "UNCLEAR") v = U
        else { off = substr(tok, 3) + 0; if (substr(tok, 2, 1) == "-") off = -off; v = (substr(tok, 1, 1) == "D" ? iso(off) : compact(off)) }
        out = out substr(s, 1, RSTART - 1) v; s = substr(s, RSTART + RLENGTH)
      }
      print out s }'
}
# A relative path that is safe to create under the new folder.
safe_rel() { case "$1" in ""|/*|*\\*|*:*|..|../*|*/..|*/../*|./*|*/./*) return 1 ;; esac; return 0; }
# User-owned and local-only paths (DATA_CONTRACT.md; update.sh is_protected) and maintainer-only paths
# (build-manifest.sh is_maintainer): never copied into the sample. Lowercase input.
skip_app() {
  case "$1" in
    profile/readme.md|jobs/readme.md|contacts/readme.md|imports/readme.md|pages/readme.md|\
    interviews/.gitkeep|outbox/sent/.gitkeep|outbox/discarded/.gitkeep) return 1 ;;
    profile/*|jobs/*|contacts/*|outbox/*|interviews/*|history/*|imports/*|pages/*|knowledge/field/*) return 0 ;;
    .git/*|.backup/*|.claude/.health/*|.claude/settings.local.json|*.local|.sample-workspace) return 0 ;;
    docs/maintainers/*|.github/*|scripts/ci/*|.claude/skills/*/tests/*|contributing.md) return 0 ;;
    *.pdf|*.zip) case "$1" in */*) ;; *) return 0 ;; esac ;;
  esac
  case "${1##*/}" in .ds_store|thumbs.db|'~$'*) return 0 ;; esac
  return 1
}

app_list="$(cd "$ROOT" && find . \( -path ./.git -o -path ./.backup -o -path ./profile -o -path ./jobs -o -path ./contacts \
  -o -path ./outbox -o -path ./interviews -o -path ./history -o -path ./imports -o -path ./pages -o -path ./knowledge/field \
  -o -path ./docs/maintainers -o -path ./.github -o -path ./scripts/ci -o -path ./.claude/.health \) -prune \
  -o -type f -print | sed 's#^\./##' | LC_ALL=C sort)" || die "could not list the app's files; nothing was made"
# The folder guides that live inside personal folders are app files too.
for g in profile/README.md jobs/README.md contacts/README.md imports/README.md pages/README.md interviews/.gitkeep \
         outbox/sent/.gitkeep outbox/discarded/.gitkeep; do
  [ -f "$ROOT/$g" ] && [ ! -L "$ROOT/$g" ] && app_list="$app_list
$g"
done
sample_list="$(cd "$SAMPLE/workspace" && find . -type f ! -name .DS_Store -print | sed 's#^\./##' | LC_ALL=C sort)" \
  || die "could not list templates/sample/; nothing was made"
[ -n "$sample_list" ] || die "templates/sample/workspace/ is empty; nothing was made"

if [ "$mode" = dry ]; then
  n_app=0; old="$IFS"; IFS='
'
  for rel in $app_list; do IFS="$old"; skip_app "$(lc "$rel")" || n_app=$((n_app + 1)); done; IFS="$old"
  echo "would make: $target"
  echo "would copy: $n_app app file(s); would add: $(printf '%s\n' "$sample_list" | grep -c .) sample file(s), dates counted from $today"
  echo "sample: dry-run (nothing changed)"
  exit 0
fi

# mkdir without -p: fails if the folder appeared in the meantime, so nothing is ever written into an existing one.
mkdir "$target" 2>/dev/null || die "could not make $target (is the folder writable?)"
printf '%s\n%s\n%s\n' "$MARK_LINE" "Made from: $ROOT" \
  "Everything here is made up. Delete this whole folder when you're done (make-sample --remove), or just move it to the Trash." \
  > "$target/.sample-workspace" || die "could not write in $target"
fail() { echo "error: $*"; echo "note: the half-made sample is at $target; remove it with --remove"; exit 1; }

n_app=0; old="$IFS"; IFS='
'
for rel in $app_list; do
  IFS="$old"
  [ -n "$rel" ] || continue
  skip_app "$(lc "$rel")" && continue
  safe_rel "$rel" || continue
  src="$ROOT/$rel"; dst="$target/$rel"
  [ -f "$src" ] && [ ! -L "$src" ] || continue
  mkdir -p "$(dirname "$dst")" && cp "$src" "$dst" || fail "could not copy $rel"
  n_app=$((n_app + 1))
done
IFS="$old"
[ -f "$target/AGENTS.md" ] && [ -f "$target/.claude/skills/start/scripts/init-data.sh" ] || fail "the app files were not all copied"

n_s=0; IFS='
'
for rel in $sample_list; do
  IFS="$old"
  out_rel="$(printf '%s\n' "$rel" | render)"
  safe_rel "$out_rel" || fail "bad sample file name: $rel"
  dst="$target/$out_rel"
  { [ -e "$dst" ] || [ -L "$dst" ]; } && fail "two sample files would land on $out_rel"
  mkdir -p "$(dirname "$dst")" && render < "$SAMPLE/workspace/$rel" > "$dst" || fail "could not write $out_rel"
  # render() always ends with a newline; keep a file that had none byte-identical in that respect.
  if [ -n "$(tail -c 1 "$SAMPLE/workspace/$rel")" ]; then
    printf '%s' "$(cat "$dst")" > "$dst.tmp" && mv "$dst.tmp" "$dst" || fail "could not write $out_rel"
  fi
  n_s=$((n_s + 1))
done
IFS="$old"

# Everything the sample doesn't provide (page look, references, published pages, pages, work-search log)
# comes from templates/blank/ through the sample's own first-run script.
init_out="$(bash "$target/.claude/skills/start/scripts/init-data.sh" 2>&1)" \
  || fail "the starter files could not be set up ($(printf '%s' "$init_out" | grep 'error:' | head -1))"

# fill <page file> <json file>: replace the page's JSON data block with the rendered sample data.
fill() {
  page="$1"; json="$(render < "$2")" || return 1
  case "$json" in *"<"*) echo "error: $2 contains a < character"; return 1 ;; esac
  [ "$(grep -c '<script type="application/json" id="data">' "$page")" = 1 ] || { echo "error: no single data block in ${page#"$target"/}"; return 1; }
  J="$json" LC_ALL=C awk '
    BEGIN { j = ENVIRON["J"] }
    skip && /<\/script>/ { skip = 0; done = 1 }
    skip { next }
    { print }
    index($0, "<script type=\"application/json\" id=\"data\">") { print j; skip = 1 }
    END { if (!done) exit 3 }' "$page" > "$page.tmp" && mv "$page.tmp" "$page" || { rm -f "$page.tmp"; echo "error: could not fill ${page#"$target"/}"; return 1; }
}
fill "$target/pages/dashboard.html" "$SAMPLE/page-data/dashboard.json" || fail "the sample dashboard could not be filled"
fill "$target/pages/flashcards.html" "$SAMPLE/page-data/flashcards.json" || fail "the sample flashcards could not be filled"
brief_dir="$target/jobs/acme-senior-product-marketing-manager"
cp "$target/pages/interview-brief.html" "$brief_dir/interview-brief.html" \
  && fill "$brief_dir/interview-brief.html" "$SAMPLE/page-data/interview-brief.json" || fail "the sample interview brief could not be filled"

left="$(cd "$target" && grep -rlE '[{][{](D[-+][0-9]+|N[-+][0-9]+|UNCLEAR)[}][}]' profile jobs contacts outbox interviews history knowledge/field pages 2>/dev/null | head -1)"
[ -z "$left" ] || fail "a date was not filled in: $left"

echo "copied: $n_app app file(s); added: $n_s sample file(s); dates counted from $today"
echo "open: $target"
echo "sample: made $target"
exit 0
