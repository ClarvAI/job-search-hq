---
name: page-design
description: "Change how the user's pages and documents look and move: their theme in profile/design.md (presets, or their own brand or design system), colors (measured), fonts, text size, layout, animation, and print. Use whenever the user asks to restyle, recolor, re-theme, change the look, use their brand or design system, or redesign their dashboard, flashcards, portfolio site, interview brief, or the resume/cover-letter templates (e.g. \"make it navy and gold\", \"use my brand\", \"switch to the minimal look\", \"bigger text\", \"less motion\"). Not for the wording of resumes, cover letters, or emails; those follow profile/voice.md."
---

# page-design (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/page-design/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/page-design/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- The palette tools (`palette.mjs`, `tokens.mjs`) need Node. If it isn't installed, do what the Claude skill says: keep the current palette and tell the user colors can't be contrast-checked here. Font, layout and motion changes don't need Node (a layout switch is the one `data-layout` attribute per file; see "Without Node"); run a page-review pass after any change.
