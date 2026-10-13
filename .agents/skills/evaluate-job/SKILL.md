---
name: evaluate-job
description: "Use when the user asks \"should I bother applying\", \"is this worth it\" or \"should I still apply\" about a saved job, or new information comes in. Re-checks fit, start timing, each requirement, gaps and red flags, and gives an apply/skip call. For a new job link or posting, use add-job."
---

# evaluate-job (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/evaluate-job/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/evaluate-job/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents follow that table's review-agent row (mostly separate, honest passes you do yourself from `.claude/agents/<name>.md`, and you say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.
