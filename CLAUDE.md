@AGENTS.md

# Claude Code notes

Everything in `AGENTS.md` applies. This part covers what only Claude Code has. Skip AGENTS.md's "If you are Codex" section.

## Open the top folder, on a current version

Start Claude Code in the top folder (the one holding `CLAUDE.md` and `.claude/`). Started inside `profile/` or `jobs/`, Claude doesn't load the shared settings, the safety guard or the panels, and nothing warns you. If `/health` says the session started in a subfolder, reopen the top folder.

Use Claude Code 2.1.287 or later in the terminal, and 2.1.286 or later in the Desktop app's Code tab (type `/status` there: the Desktop app runs its own copy). Before 2.1.295 a guard that times out lets the action go ahead; update when you can.

## Slash commands

Every workflow in AGENTS.md is a slash command here (`/today`, `/add-job`, ...). Offer `/tour` after `/start` and whenever the user seems unsure. `/outbox`, `/pipeline`, `/contacts`, `/job-inbox`, `/apply-kit`, `/insights` and `/routines-board` open panels (below); point the user to them when they fit; they can also just ask. Review agents (`truth-checker`, `voice-editor`, `recruiter-reviewer`, `company-researcher`, `job-scout`) are subagents in `.claude/agents/`.

## Panels (mods)

Each panel is a plugin in `.claude/skills/<name>/`; recent Claude Code versions load them by themselves once the folder is trusted (nothing to install). Without them (an older version, a panel that says it can't show here, or no `interview_start` tool), use the same flows in chat: the `outbox`, `pipeline`, `contacts`, `job-inbox`, `apply-kit` and `insights` skills in `.agents/skills/`, "Show the routines" in the `routines` skill, and the chat version in `.agents/skills/mock-interview/SKILL.md`. Updating the app is optional then, not a fix to chase.
- `/outbox` (drafts: Gmail draft, copy, mark sent, discard), `/pipeline` (job board over `jobs/tracker.csv`), `/contacts` (networking board over `contacts/contacts.csv`), `/job-inbox` (new leads from `find-jobs`), `/apply-kit` (every answer for one job, ready to copy, while the user fills in a form; read-only except **Mark applied…**), `/interview-room` (mock interviews), `/insights` (read-only: where applications stall, what brings replies, whether fit scores hold up), `/routines-board` (each automatic check's last run, and any that stopped). Due alerts: at session start, a pop-up with at most 3 things due today or tomorrow, once a day. The Celebration pane opens by itself once, when a job first becomes `accepted` (never in the sample workspace, never for jobs accepted before the folder was first opened); `/celebrate` reopens it. A band above the prompt shows the pipeline summary, Contacts follow-ups due, Outbox and Job Inbox counts, and a routine that stopped running (the band doesn't draw in VS Code; panes do).
- **Panel notes:** a panel saves the user's change itself, adds its own line to `history/activity.md`, and leaves an `[Outbox]`, `[Pipeline]`, `[Contacts]`, `[Job Inbox]`, `[Apply Kit]` or `[Routines]` note saying what it changed and what's left. Never re-apply that change; do what's left and log only your own changes. Per-panel details: "The Claude panel" in the matching `.agents/skills/<name>/SKILL.md`; read it when a note arrives.
- Panels that save read dates and CSVs by AGENTS.md's rules ("date unclear" is never rewritten), refuse a file that looks damaged or that Excel has open, and show what's due first (the rest behind **Show all**).
- **Outbox:** when a draft is ready, tell the user it's in `/outbox`. Its main button is **Create Gmail draft…** (`outbox_mode: draft-only`, the default) or **Send…** (`send`, once the user has also confirmed send mode in the panel). It never sends attachments: a draft that mentions one goes through **Create Gmail draft…**, which attaches the job folder's checked PDF (shown first) or says what to attach by hand. If it says a send wasn't confirmed, check Gmail Sent before doing anything else.
- Panel buttons, labels and pop-ups are in English only (a known limit). When you talk with the user in another language (`language:`), name a button in English with a translation in brackets the first time ("**Mark sent…** (als gesendet markieren)"), and offer the chat version, which follows their language. A typed confirm phrase is never a panel button: those are chat steps (AGENTS.md, "Exact confirm phrases").

## Mock interviews and voice

`/mock-interview` runs the Interview Room: call `interview_start`, then `interview_say` for each line (it shows on screen, is read aloud only if voice is on, and starts the user's answer clock), `interview_score` after each main answer, `interview_end` at the close. Voice (reading aloud) and sounds (the clock's beeps) are off until the user opts in: ask first, and pass `voice: true` / `sounds: true` to `interview_start` only after a yes (the choice is kept for this folder; the user can also press **Turn on voice** / **Turn on sounds**). For an interview that isn't in English, pass `language` as a BCP-47 tag (`de`, `es-MX`): the room reads with an installed voice for that language and says if there is none. The user answers out loud with dictation (terminal: `/voice` once, then hold Space; Desktop: the mic button). Stay in character until the end; feedback goes in the debrief. For one-way recorded video interviews (HireVue-style), use style `one-way` with `prep_seconds: 30`.

## Connectors and browser in Claude

- The user connects Gmail and Google Calendar themselves (Desktop: Settings → Connectors; terminal: connect and sign in to them at claude.ai/customize/connectors with the same Claude account Claude Code uses, then type `/mcp` to check they appear; restart the session if they don't).
- The Claude desktop app has a **built-in browser** (no setup; it starts with a clean profile, and keeps sign-ins only if the user turns on **Keep cookies** in the pane's menu); Claude in Chrome is the alternative.
- Design system import (Claude only): with the Artifact tool, `/start` and `page-design` can list the user's Claude design systems (`action: "list"`, `type: "Design System"`), read the chosen one and map its tokens into `profile/design.md` (see `.claude/skills/page-design/references/importing-a-design-system.md`). Read only; never publish or edit it. `apply-theme.mjs --preview` writes sample dashboards to `pages/.preview/` inside the folder (git-ignored), which the built-in browser can open.
- Publishing pages as private claude.ai links follows the `pages` skill and `profile/published-pages.md`, and works only in sessions that have the Artifact tool; without it, open the pages locally and say so.
- Phone: Remote Control (the user's own app setting; a project setting can't turn it on) lets them use this folder's sessions from the Claude phone app; steps in `.claude/skills/start/references/phone.md`. Panels may not show there; the chat versions do.
- Automatic checks are the `routines` skill: local routines in the desktop app (this folder, worktree off), or `/loop` for a same-day watch in the terminal. Never cloud routines (`/schedule`): they can't see this folder's files.
- Claude Dashboard (Claude only): when the Artifact tool lists the Dashboard type and Node is installed, `pages` can publish the dashboard as a private Claude Dashboard instead of the themed page (numbers that show their source, a warning after 72 hours, Claude's look instead of the user's theme). It asks once before the first publish, records the yes in `profile/published-pages.md`, updates the same link afterwards, and never shares or pins it. Both routes publish only the user's own job list and counts. Steps: `.claude/skills/pages/references/claude-dashboard.md`.
- Pages and panels follow `page-design` and get a `page-review` pass before the user sees them.

## Commits

Commits made in this folder carry no Claude or AI attribution (the `attribution` key in `.claude/settings.json`). Don't add `Co-authored-by`, `Claude-Session` or "Generated with" lines to commit messages or pull request descriptions yourself.
