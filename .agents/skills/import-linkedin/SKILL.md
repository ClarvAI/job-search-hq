---
name: import-linkedin
description: "Use the user's own LinkedIn data export (not scraping) to check their profile against their resume and find contacts at target companies. Use when the user wants to use their LinkedIn, find who they know somewhere, or drops a LinkedIn export in imports/."
---

# import-linkedin (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/import-linkedin/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/import-linkedin/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- Unzipping: Mac/Linux/Git Bash exactly `unzip -n imports/<file>.zip -d imports/<file-name-without-.zip>`; Windows PowerShell `Expand-Archive imports\<file>.zip imports\<file-name-without-.zip>` (no `-Force`, so nothing is overwritten). Ask before any other form.
