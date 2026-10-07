---
name: page-review
description: "One-pass quality review of the user's visual pages and print templates (pages/*.html, jobs/*/interview-brief.html, templates/*.html) and of the Claude panels (Outbox, Pipeline, Contacts, Job Inbox, Apply Kit, Interview Room, due alerts), covering accessibility, layout, readability, color contrast, motion, print, and interface copy. Use after any change to how one of them looks or behaves, or when the user asks whether a page looks right."
---

# page-review (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/page-review/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/page-review/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- The panels only run inside Claude Code. Here you can review their code and copy by reading it, but you can't open them or run `claude plugin validate`/`test`; mark those checks "Not verified".
