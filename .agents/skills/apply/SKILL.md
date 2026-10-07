---
name: apply
description: "Prepare a complete job application package and checklist, then update the tracker. Use when the user says they want to apply to a job, are ready to submit, or ask what they need for an application."
---

# apply (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/apply/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/apply/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- There is no Apply Kit panel in Codex: where the skill says `/apply-kit`, use the chat skill `apply-kit` (`$apply-kit`), which prints the same answers as copyable blocks.
- Making a missing PDF: on Windows without Git Bash, use `make-pdf.ps1` (same arguments; the full command is in the `tailor-resume` skill). If neither script can run, treat it as `no-browser`.
- Assisted mode in Codex uses the Codex desktop app's built-in browser, with exactly the same rules (stop before Submit; submit only on "submit it").
