---
name: sync-inbox
description: "Read the user's Gmail (read-only) for job-search replies (recruiter emails, interview invites, rejections, application confirmations) and update the tracker, contacts, and calendar suggestions. Use when the user asks to check their email for job stuff or update the tracker from their inbox."
---

# sync-inbox (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/sync-inbox/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/sync-inbox/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- Use the Gmail and Google Calendar tools connected to Codex (if any). Read and search only; you may create drafts. If Gmail isn't connected, say so in one line and offer the manual version (the user pastes the email).
