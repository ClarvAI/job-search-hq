---
name: cover-letter
description: "Write a short, specific, human-sounding cover letter for a job from the user's real experience. Use when the user asks for a cover letter or an application requires one."
---

# cover-letter (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/cover-letter/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/cover-letter/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- The make-pdf script needs bash plus Chrome or Edge. On Windows without Git Bash, use the `make-pdf.ps1` command given in the skill. If neither can run (or the sandbox blocks the browser), treat it as `no-browser` and give the user the manual Print → Save as PDF steps.
- Do the company-researcher pass yourself with your web search (spawn the `company-researcher` project agent only if the user asks).
