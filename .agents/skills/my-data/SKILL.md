---
name: my-data
description: "Back up, wrap up, or wipe the user's job-search data. Makes a dated zip backup of everything (plus a JSON Resume copy of their resume) in a folder they pick; closes the search after they accept a job, or pauses it (final statuses, withdrawal notes, thank-yous); or deletes everything and resets the folder to blank for a fresh start or to hand it to someone else. Use when the user says things like \"back up my stuff\", \"export my data\", \"save a copy of everything\", \"I got the job, wrap up\", \"I accepted an offer\", \"pause my search\", \"I'm taking a break\", \"delete everything\", \"wipe my data\", \"start over\", or \"give this to a friend\"."
---

# my-data (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/my-data/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/my-data/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- On Windows without bash, use the `.ps1` scripts as the Claude skill describes. If the sandbox blocks writing outside the workspace, ask the user to allow it for this one command (the backup must land outside this folder).
- Deleting published pages needs Claude: list the links from `profile/published-pages.md` and tell the user to ask Claude or delete them at claude.ai before the reset.
- Section 3 step 8: in Codex, Gmail and Google Calendar are disconnected under **Apps** in Codex or ChatGPT settings.
- The confirm phrase rule is the same: run the reset only after the user's own message is exactly "delete my data".
