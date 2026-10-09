#!/usr/bin/env bash
# First-run setup: copies every starter file in templates/blank/ that is missing from the workspace
# into place (one to one, same relative path). Never overwrites, never deletes. Safe to run any time.
# Usage: bash .claude/skills/start/scripts/init-data.sh [--quiet] [--dry-run]
#   --quiet    print only the summary line, and only if something was created or went wrong (session-start hook)
#   --dry-run  list what would be created; change nothing
# Output: "created: <path>" per file, then "init: created N file(s)" or "init: nothing to do";
# "error: ..." and exit 1 if the workspace or templates/blank/ can't be found.
set -u
quiet=""; dry=""
for a in "$@"; do
  case "$a" in
    --quiet) quiet=1 ;;
    --dry-run) dry=1 ;;
    *) echo "error: unknown option $a"; exit 1 ;;
  esac
done

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || { echo "error: cannot find the script folder"; exit 1; }
ROOT="$(cd "$here/../../../.." 2>/dev/null && pwd -P)" || { echo "error: cannot find the workspace"; exit 1; }
[ -f "$ROOT/AGENTS.md" ] || { echo "error: AGENTS.md not found in $ROOT; this is not a Job Search HQ workspace"; exit 1; }
BLANK="$ROOT/templates/blank"
[ -d "$BLANK" ] && [ ! -L "$BLANK" ] || { echo "error: templates/blank/ is missing; nothing was created"; exit 1; }

n=0; failed=0
# Every regular file under templates/blank/ except its own README.md. Paths have no newlines (product files).
# No here-document or pipe into the loop: on some locked-down Macs bash can't make the temporary file a
# here-document needs, and the loop would silently do nothing and report "nothing to do".
list="$(cd "$BLANK" && find . -type f ! -path ./README.md | sed 's#^\./##' | LC_ALL=C sort)" && [ -n "$list" ] \
  || { echo "error: could not list the starter files in templates/blank/; nothing was created"; exit 1; }
oldifs="$IFS"; IFS='
'
for rel in $list; do
  IFS="$oldifs"
  [ -n "$rel" ] || continue
  dst="$ROOT/$rel"
  # Present (or a link, even a broken one): leave it alone.
  if [ -e "$dst" ] || [ -L "$dst" ]; then continue; fi
  n=$((n + 1))
  if [ -n "$dry" ]; then echo "would create: $rel"; continue; fi
  if mkdir -p "$(dirname "$dst")" 2>/dev/null && cp "$BLANK/$rel" "$dst" 2>/dev/null; then
    [ -n "$quiet" ] || echo "created: $rel"
  else
    failed=$((failed + 1)); echo "error: could not create $rel"
  fi
done
IFS="$oldifs"

# Empty folders the workflows expect.
for d in interviews outbox outbox/sent outbox/discarded imports; do
  [ -d "$ROOT/$d" ] || [ -L "$ROOT/$d" ] || { [ -n "$dry" ] || mkdir -p "$ROOT/$d" 2>/dev/null; }
done

[ "$failed" -eq 0 ] || { echo "error: $failed starter file(s) could not be created"; exit 1; }
if [ "$n" -gt 0 ]; then
  if [ -n "$dry" ]; then echo "init: would create $n file(s)"; else echo "init: created $n file(s)"; fi
elif [ -z "$quiet" ]; then
  echo "init: nothing to do"
fi
exit 0
