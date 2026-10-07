---
name: find-jobs
description: "Search the web for new job postings that fit the user (at the level that matches their career stage, former employers always included). Use when the user asks to find jobs, look for openings, see what's out there, or search a company or role they haven't picked a posting for yet. When they already have specific links, use add-job."
---

# find-jobs (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/find-jobs/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/find-jobs/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- Do the job-scout pass yourself with your web search (spawn the `job-scout` project agent only if the user asks).
