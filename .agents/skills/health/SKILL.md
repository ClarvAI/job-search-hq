---
name: health
description: "Check that the user's job-search workspace is set up and working: right folder, app version, safety checks, hooks, panels, Gmail and Calendar connections, Excel, optional tools (Chrome or Edge, Node.js, pdftotext), setup and starter files. Read-only: it changes nothing and offers fixes. Use when the user says something isn't working, the panels or the daily greeting are missing, a command does nothing, right after installing, moving or updating the folder, or asks \"is everything working\", \"check my setup\", \"health check\" or \"run a checkup\"."
---

# health (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/health/SKILL.md` and follow it fully. Files it mentions as `scripts/...` live in `.claude/skills/health/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here).

## Codex notes

- Run the script with `codex` at the end (`bash .claude/skills/health/scripts/health.sh codex`), or on Windows without bash: `powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\health\scripts\health.ps1 -App codex`. If the sandbox blocks a check (for example running PowerShell or reading the user's home folder), say which line couldn't run rather than guessing.
- Skip the panels check: Codex has no panels; the chat versions (`outbox`, `pipeline`, `contacts`, `job-inbox`, `apply-kit` skills) always work.
- Connectors: Gmail and Google Calendar are connected under **Apps** in Codex or ChatGPT settings. Check your own tool list for them, and never call them as part of the check.
- Hooks: if this chat didn't start with the greeting (today's date and the pipeline summary), hooks aren't on, and that also means the safety checks are off. The fix: make sure the top folder (with `AGENTS.md`) is open, type `/hooks`, trust them, then start a new chat.
