---
name: evaluate-job
description: "Decide whether a job the user already saved is worth applying to: re-checks fit, whether the start timing works with the user's earliest start date, requirement-by-requirement match, gaps and red flags, and gives an apply/skip call. Use whenever the user asks \"should I bother applying\", \"is this worth it\", or \"should I still apply\" about a job they've saved or mentioned before, or when new information comes in (the recruiter said something, the posting changed). For a brand-new job link or pasted posting, use add-job instead."
---

# evaluate-job (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/evaluate-job/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/evaluate-job/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.
