---
name: update
description: "Install a new version of the job-search workspace (the app's skills, safety checks, panels and templates) without touching the user's own files, show what changed, bring their files up to date where a release needs it, or undo the last update. Use when the user says \"update\", \"is there a new version\", \"install the new version\", \"I downloaded the new release\", \"what's new\", \"undo the update\" or \"roll back\", or drops a release zip in the folder."
---

# update (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/update/SKILL.md` and follow it fully. Files it mentions as `scripts/...` live in `.claude/skills/update/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here).

## Codex notes

- On Windows without bash, use `update.ps1` as the Claude skill describes. If the sandbox blocks the download or writing the backup, ask the user to allow it for this one command, or ask them to download the zip themselves and give you its path.
- After an update that prints `hooks-changed: yes`: Codex keeps changed hooks off until they're trusted again, and that turns the safety checks off too. Tell the user to type `/hooks`, review and trust them, then start a new chat, and run `$health` to confirm.
- Log the update in `history/activity.md` with `Codex` as the app.
