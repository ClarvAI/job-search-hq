#!/usr/bin/env bash
# Maintainers, once (safe to run again): set up the public repository for crowd feedback and outside
# contributions. Run it yourself in a terminal: the workspace's safety check blocks assistants from changing
# a public repository's settings, on purpose. Needs gh signed in as an admin of the repository.
# Usage: bash docs/maintainers/feedback/setup-github.sh [owner/repo]     (default ClarvAI/job-search-hq)
set -eu
REPO="${1:-ClarvAI/job-search-hq}"

# Labels the issue forms, the feedback privacy workflow and triage use (created, or updated if they exist).
label() { gh label create "$1" -R "$REPO" --color "$2" --description "$3" --force >/dev/null && echo "label: $1"; }
label lessons-learned 0e8a16 "What worked in someone's search (the Lessons learned form)"
label feedback c5def5 "Feedback from people using the workspace"
label needs-privacy-edit d93f0b "May hold personal details: the poster is asked to edit; a maintainer checks"
label needs-triage fbca04 "Not looked at yet"
label panels 1d76db "The Claude Code panels (mods)"
label routines 1d76db "Automatic checks"
label codex 5319e7 "Codex (ChatGPT) only"
label windows bfdadc "Windows only"

# Delete merged branches; squash or merge commits both allowed; Discussions on for questions.
gh repo edit "$REPO" --delete-branch-on-merge --enable-discussions --enable-issues >/dev/null && echo "settings: delete merged branches, issues and discussions on"

# Protect main: changes arrive through pull requests whose CI passed; no force pushes or deletion. Admins can
# still merge in an emergency (enforce_admins off), and no review is required (a solo maintainer can't
# approve their own pull request).
gh api -X PUT "repos/$REPO/branches/main/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "contexts": [
      "Linux (lint, JSON, mods, guard, parity)",
      "macOS (bash 3.2)",
      "Windows (PowerShell 5.1, PowerShell 7, Git Bash)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false
}
JSON
echo "branch protection: main needs the Linux, macOS and Windows checks to pass"

# Private vulnerability reporting (SECURITY.md points people to it).
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null 2>&1 && echo "security: private vulnerability reporting on" || echo "security: turn on private vulnerability reporting in Settings > Code security"
echo "done"
