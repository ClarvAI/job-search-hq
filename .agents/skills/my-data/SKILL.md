---
name: my-data
description: "Use when the user says \"back up my stuff\", \"export my data\", \"I got the job\", \"I accepted an offer\", \"pause my search\", \"delete everything\", \"start over\", \"restore my backup\" or \"move to a new computer\". Backs up to a dated zip, wraps up or pauses the search, wipes the folder, or restores a backup."
---

# my-data (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/my-data/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/my-data/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents follow that table's review-agent row (mostly separate, honest passes you do yourself from `.claude/agents/<name>.md`, and you say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- On Windows without bash, use the `.ps1` scripts as the Claude skill describes. If the sandbox blocks writing outside the workspace, ask the user to allow it for this one command (the backup must land outside this folder).
- Deleting published pages needs Claude: list the links from `profile/published-pages.md` and tell the user to ask Claude or delete them at claude.ai before the reset.
- `references/reset.md` step 8: in Codex, Gmail and Google Calendar are plugins: remove them from the **Plugins** tab in the ChatGPT desktop app, or with `/plugins` in the terminal.
- The confirm phrase rule is the same: run the reset only after the user's own next message is exactly "delete my data", or the translated phrase you showed them (AGENTS.md, "Exact confirm phrases"). "Yes" in any language never counts.
