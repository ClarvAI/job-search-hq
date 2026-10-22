---
name: share-lessons
description: "Use when the user got a job (or wraps up or pauses their search) and wants to help future job seekers, says 'share what worked', 'give feedback', 'lessons learned', 'tell the makers', or presses Share what worked in the Celebration panel. A few quick questions, then an anonymous draft with no names, companies, pay or contact details, checked by a script, that the user may post on the project's GitHub page themselves."
---

# share-lessons (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/share-lessons/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/share-lessons/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents follow that table's review-agent row (mostly separate, honest passes you do yourself from `.claude/agents/<name>.md`, and you say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- Run the privacy check exactly as step 4 says. Never post the draft yourself: give the user the link and the steps.
