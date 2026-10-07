---
name: offer
description: "Help the user evaluate, compare, and negotiate job offers (total compensation, cost of living, growth), and draft negotiation or acceptance messages. Use when the user gets an offer or is deciding between offers."
---

# offer (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/offer/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/offer/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- Unpublishing pages (in "Closing the search") needs Claude; tell the user to ask Claude, or skip it.
