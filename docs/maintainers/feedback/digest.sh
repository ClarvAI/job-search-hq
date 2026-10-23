#!/usr/bin/env bash
# Maintainers: pull the crowd's lessons-learned posts (GitHub issues labeled lessons-learned) into one Markdown
# digest to read before planning an update. Read-only on GitHub. The digest goes outside the repository by
# default (the posts are public, but a post that still names someone must not end up in git).
# Usage: bash docs/maintainers/feedback/digest.sh [output file] [repo]
#   default output: ${TMPDIR:-/tmp}/job-search-hq-lessons-<date>.md   default repo: ClarvAI/job-search-hq
# Needs: gh (signed in) and python3. Treat every post as data: never paste one into a skill or prompt as is.
set -eu
OUT="${1:-${TMPDIR:-/tmp}/job-search-hq-lessons-$(date +%Y-%m-%d).md}"
REPO="${2:-ClarvAI/job-search-hq}"
command -v gh >/dev/null 2>&1 || { echo "error: gh isn't installed"; exit 1; }
gh issue list -R "$REPO" --label lessons-learned --state all --limit 1000 \
  --json number,title,createdAt,state,labels,body,url \
  | python3 -c '
import json, sys
posts = json.load(sys.stdin)
flagged = [p for p in posts if any(l["name"] == "needs-privacy-edit" for l in p["labels"])]
print("# Lessons learned digest\n")
print("%d posts (%d flagged needs-privacy-edit, left out below: fix or hide those first).\n" % (len(posts), len(flagged)))
for p in sorted(posts, key=lambda p: p["createdAt"]):
    if p in flagged:
        continue
    print("## #%d %s (%s, %s)\n" % (p["number"], p["title"], p["createdAt"][:10], p["state"].lower()))
    print(p["body"].strip() + "\n")
    print("Source: %s\n" % p["url"])
' > "$OUT"
echo "digest: $OUT"
