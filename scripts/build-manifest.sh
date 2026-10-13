#!/usr/bin/env bash
# Maintainers: regenerates product-manifest.json, the list of every app (product) file with its
# fingerprint, which /update uses to tell app files from the user's and to spot app files the user edited.
# Usage (from anywhere):
#   bash scripts/build-manifest.sh                 rewrite product-manifest.json
#   bash scripts/build-manifest.sh --check         exit 1 if product-manifest.json is out of date (CI); changes nothing
#   bash scripts/build-manifest.sh --zip <file>    also build a release zip: job-search-hq-<version>/ + every listed file
# The file list is every file git tracks or would track (tracked + untracked, minus .gitignore'd), or,
# outside a git checkout, every file minus the same ignored paths. User-owned paths (DATA_CONTRACT.md)
# are never listed, even if someone force-added one. Fingerprint = SHA-256 of the file with every
# carriage return removed, so a Windows checkout (CRLF) and a Mac one match.
# Keep is_protected in step with .claude/skills/update/scripts/update.sh and update.ps1.
set -u
die() { echo "error: $*" >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)" || die "cannot find the workspace"
[ -f "$ROOT/AGENTS.md" ] && [ -f "$ROOT/VERSION" ] || die "$ROOT is not a Job Search HQ workspace (AGENTS.md and VERSION needed)"
cd "$ROOT" || die "cannot open $ROOT"

mode="write"; zipout=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) mode=check ;;
    --zip) shift; [ $# -gt 0 ] || die "--zip needs a file name"; zipout="$1" ;;
    *) die "unknown option $1" ;;
  esac
  shift
done

# User-owned or local-only paths: never part of the product. Case-insensitive, like Windows and macOS.
is_protected() {
  local p; p="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
  case "$p" in
    profile/readme.md|jobs/readme.md|contacts/readme.md|imports/readme.md|pages/readme.md|\
    interviews/.gitkeep|outbox/sent/.gitkeep|outbox/discarded/.gitkeep) return 1 ;;
    profile/*|jobs/*|contacts/*|outbox/*|interviews/*|history/*|imports/*|pages/*|knowledge/field/*) return 0 ;;
    .git/*|.backup/*|.claude/.health/*|.claude/settings.local.json|*.local|product-manifest.json) return 0 ;;
    .ds_store|*/.ds_store|thumbs.db|*/thumbs.db|\~\$*|*/\~\$*|*.check.pdf|*-check.pdf) return 0 ;;
  esac
  return 1
}
if command -v sha256sum >/dev/null 2>&1; then H="sha256sum"; else H="shasum -a 256"; fi
fp() { LC_ALL=C tr -d '\r' < "$1" | $H | awk '{print $1}'; }

if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ "$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null)" -ef "$ROOT" ]; then
  list="$(git -c core.quotepath=off ls-files --cached --others --exclude-standard)"
else
  list="$(find . -type f ! -path './.git/*' | sed 's#^\./##')"
fi
list="$(printf '%s\n' "$list" | LC_ALL=C sort -u)"

ver="$(sed -n 's/^version:[[:space:]]*//p' VERSION | head -1 | tr -d '\r')"
src="$(sed -n 's/^update_source:[[:space:]]*//p' VERSION | head -1 | tr -d '\r')"
case "$ver" in [0-9]*.[0-9]*.[0-9]*) ;; *) die "VERSION has no version: line like 1.2.3" ;; esac
jstr() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

tmp="$(mktemp 2>/dev/null || mktemp -t jshqman)" || die "cannot make a temporary file"
trap 'rm -f "$tmp"' EXIT
{
  echo '{'
  echo '  "name": "Job Search HQ",'
  printf '  "version": "%s",\n' "$(jstr "$ver")"
  printf '  "update_source": "%s",\n' "$(jstr "$src")"
  echo '  "hash": "sha256 of the file with carriage returns removed",'
  # "themed": app templates a user may have a themed copy of in profile/templates/ (D1: the app copies stay on the
  # Default look); /update rebuilds that copy when one of these changes.
  echo '  "themed": ['
  echo '    "templates/cover-letter-template.html",'
  echo '    "templates/resume-designed-template.html",'
  echo '    "templates/resume-template.html"'
  echo '  ],'
  echo '  "files": {'
  first=1
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$f" ] && [ ! -L "$f" ] || continue          # deleted in the working tree, or a link
    is_protected "$f" && continue
    case "$f" in *'"'*|*'\'*) die "file name not allowed in the product: $f" ;; esac
    [ $first = 1 ] || printf ',\n'
    printf '    "%s": "%s"' "$f" "$(fp "$f")"; first=0
  done <<EOF
$list
EOF
  printf '\n  }\n}\n'
} > "$tmp" || die "could not write the manifest"

if [ "$mode" = check ]; then
  # Carriage returns don't count: a Windows checkout may have given the manifest CRLF line endings.
  if [ -f product-manifest.json ] && LC_ALL=C tr -d '\r' < product-manifest.json | cmp -s "$tmp" -; then echo "manifest: up to date"
  else
    LC_ALL=C tr -d '\r' < product-manifest.json 2>/dev/null | diff - "$tmp" | head -20
    die "product-manifest.json is out of date; run bash scripts/build-manifest.sh"
  fi
else
  cp "$tmp" product-manifest.json || die "could not write product-manifest.json"
  echo "manifest: $(grep -c '": "[0-9a-f]\{64\}"' product-manifest.json) files, version $ver"
fi

if [ -n "$zipout" ]; then
  case "$zipout" in /*|[A-Za-z]:[\\/]*) ;; *) zipout="$OLDPWD/$zipout" ;; esac   # absolute, or a Windows C:\ or C:/ path
  stage="$(mktemp -d 2>/dev/null || mktemp -d -t jshqzip)" || die "cannot make a temporary folder"
  top="job-search-hq-$ver"
  mkdir -p "$stage/$top"
  sed -n 's/^    "\(.*\)": "[0-9a-f]\{64\}",\{0,1\}$/\1/p' product-manifest.json | while IFS= read -r f; do
    mkdir -p "$stage/$top/$(dirname "$f")" && cp -p "$f" "$stage/$top/$f" || exit 1
  done || die "could not copy the files into the release"
  cp product-manifest.json "$stage/$top/" || die "could not copy the manifest"
  rm -f "$zipout"
  if command -v zip >/dev/null 2>&1; then (cd "$stage" && zip -q -r -X "$zipout" "$top") || die "zip failed"
  else (cd "$stage" && python3 -I -m zipfile -c "$zipout" "$top") || die "zip failed"; fi
  rm -rf "$stage"
  echo "zip: $zipout"
fi
