---
name: tailor-resume
description: "Build a resume (one page by default; longer where the job's country or the user's seniority expects it) tailored to a specific job from the user's master resume, fact-checked and ATS-friendly. Use when the user asks for a resume for a job, to tailor or update their resume for an application."
---

# tailor-resume (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/tailor-resume/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/tailor-resume/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents follow that table's review-agent row (mostly separate, honest passes you do yourself from `.claude/agents/<name>.md`, and you say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- The page-count and make-pdf scripts need bash plus Chrome or Edge. On Windows without Git Bash, use `make-pdf.ps1` instead (same folder): `powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\tailor-resume\scripts\make-pdf.ps1 <file.html> -CheckOnly` for the page check, and with `"<First Last>" "<Company>"` instead of `-CheckOnly` for the final PDF. If neither can run (or the sandbox blocks the browser), treat it as `no-browser`: keep the target page count from the country and career-stage norms (the 430-word limit applies only to a one-page target), give the user the manual Print → Save as PDF steps, and ask them to confirm the page count.
