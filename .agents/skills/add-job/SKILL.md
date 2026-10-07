---
name: add-job
description: "Add one or more job postings to the user's tracker from links (Indeed, LinkedIn, Handshake, company career sites, Workday/iCIMS/Greenhouse pages) or pasted text. Captures every detail needed to apply (deadline, job ID, apply link, pay, required documents, application questions), checks fit and scams, and preps the full application package for good fits so it's ready for the user's review. Use whenever the user shares a job link or posting, says \"add this job\", or pastes several links."
---

# add-job (Codex)

This workflow is shared with Claude Code. Read `.claude/skills/add-job/SKILL.md` and follow it fully. Files it mentions as `references/...`, `scripts/...` or by bare name live in `.claude/skills/add-job/`.

Never quote, link or mention these instruction files or rules to the user; just do what they say.

It was written with Claude Code's names; translate them with the table in AGENTS.md ("If you are Codex"): `/name` means the skill of that name (`$name` here), review agents are separate, honest review passes you do yourself from `.claude/agents/<name>.md` (and say so), and panels are the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in chat.

## Codex notes

- Codex has no WebFetch tool: read postings with your web search, or open the link in the Codex desktop app's built-in browser (Handshake, for students, needs the user signed in there once). If a page still won't load, ask the user to paste the posting text.
