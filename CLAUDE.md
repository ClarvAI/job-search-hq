@AGENTS.md

# Claude Code notes

Everything in `AGENTS.md` applies. This part covers what only Claude Code has. Skip AGENTS.md's "If you are Codex" section.

## Open the top folder, on a current version

Start Claude Code in the top folder (the one holding `CLAUDE.md` and `.claude/`). Started inside `profile/` or `jobs/`, Claude doesn't load the shared settings, the safety guard or the panels, and nothing warns you. If `/health` says the session started in a subfolder, reopen the top folder.

Use Claude Code 2.1.287 or later in the terminal, and 2.1.286 or later in the Desktop app's Code tab (type `/status` there: the Desktop app runs its own copy). Before 2.1.295 a guard that times out lets the action go ahead; update when you can.

## Slash commands

Every workflow in AGENTS.md is a slash command here: `/start`, `/today`, `/add-job`, `/find-jobs`, `/evaluate-job`, `/tailor-resume`, `/cover-letter`, `/apply`, `/network`, `/follow-up`, `/thank-you`, `/interview-prep`, `/mock-interview`, `/offer`, `/linkedin`, `/resume-review`, `/weekly-review`, `/import-linkedin`, `/sync-inbox`, `/career-fair`, `/laid-off`, `/work-search-log`, `/pages`, `/my-data`, `/health`, `/update`, `/tour` (offer it after `/start` and whenever the user seems unsure), `/menu`. `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` are panels here (below), opened with `/outbox`, `/pipeline`, `/contacts`, `/job-inbox` and `/apply-kit`. Point the user to them when they fit; they can also just ask.

Review agents (`truth-checker`, `voice-editor`, `recruiter-reviewer`, `company-researcher`, `job-scout`) are subagents in `.claude/agents/`.

## Panels (mods)

Each panel is a plugin in `.claude/skills/<name>/` (`.claude-plugin/plugin.json` plus a `hooks/` module). Recent Claude Code versions load plugins from a project's `.claude/skills/<name>/` folders by themselves once the folder is trusted; nothing needs installing. Older versions, or sessions that don't load project plugins, simply have no panels; then everything works in chat (below), and updating the app is optional, not a fix to chase:
- `/outbox`: review drafts; make a Gmail draft, copy, mark sent, discard. It leaves an `[Outbox]` note for you when the user acts and adds its own line to `history/activity.md`; update the tracker and contacts from the note, and log only those changes.
- `/pipeline`: the user's live job board. They change stage, next step and due date there; it writes `jobs/tracker.csv`, adds a line to `history/activity.md`, and leaves a `[Pipeline]` note for you. A one-line band above the prompt shows the pipeline summary, plus Contacts follow-ups due and new Job Inbox leads when there are any.
- `/apply-kit`: while the user fills in an application form themselves, every answer for one job with a Copy button (contact details, work authorization and sponsorship per country, start date, relocation, the job's salary answer, their self-identification choice, education, each job, the job's questions from `application-answers.md`, PDF file names). The salary floor from preferences shows only as "Your minimum — don't type this", with no Copy button. Read-only except **Mark applied…**: it sets the row to applied today, follow-up in 7 business days, `followups=0`, adds a line to `history/activity.md`, and leaves an `[Apply Kit]` note for you. Don't re-apply that change; finish the rest of `apply` step 6 (a recruiter question, a referral in contacts). If they applied on another day, fix the dates.
- `/contacts`: the user's networking board over `contacts/contacts.csv` (by status; cold collapsed). They record Message sent (with date), They replied, We talked, Referred me, Mark cold, or set a follow-up date; it applies the playbook contact rules (touches, never-backwards status, job row owns the follow-up once applied), adds a line to `history/activity.md`, and leaves a `[Contacts]` note for you. Don't re-apply a change the note already made. "We talked" and "Referred me" also pre-fill a request for a thank-you and job update.
- `/job-inbox`: new job leads from /find-jobs as cards. The user presses Save, Skip, or Not for me (with a reason); it writes `jobs/leads.csv` and, on each Save, leaves a `[Job Inbox]` note for you: run `add-job` on the saved leads. It adds one line per sitting to `history/activity.md`.
- `/interview-room`: mock-interview room (question read aloud, answer timer, live scorecard).
- Due alerts (nothing to type): when a session opens, a short pop-up lists interviews, offer and application deadlines, follow-ups, and Gmail drafts due today or tomorrow (most urgent first, at most 3, then "type /today"). It shows each alert once a day and stays quiet when nothing is due. It is the only pop-up at session start; the Outbox and Job Inbox show their counts in the band instead.

All the panels that save (Pipeline, Contacts, Job Inbox, Apply Kit) read dates and CSVs by the rules in AGENTS.md: unclear dates show as "date unclear" and are never rewritten, and they refuse to save a file that looks damaged (an unclosed quote, or saved with semicolons) or that Excel has open (a `~$` lock file next to it). Long lists show what's due first and hide the rest behind **Show all**.

If a panel says it can't show here, or the `interview_start` tool is missing, use the same flows in chat: the `outbox`, `pipeline`, `contacts`, `job-inbox` and `apply-kit` skills in `.agents/skills/`, and the chat version in `.agents/skills/mock-interview/SKILL.md`.

What the Outbox's main button does depends on `outbox_mode`:
- `draft-only` (default): **Create Gmail draft…** puts a formatted draft (with `profile/signature.txt`) in their Gmail; they press Send there. The draft then shows under **Waiting in Gmail** until the user presses **Mark sent…** (or `/sync-inbox` finds it in Sent).
- `send`: **Send…** sends from their Gmail after a confirm step. The first time the panel sees `send`, it asks the user to confirm send mode inside the panel and keeps making Gmail drafts until they do; the confirmation counts only for this folder, and it asks again whenever a new dated "turned on send mode" note appears in preferences (so turning it off and back on means confirming again). It can't attach files: a draft that mentions an attachment goes through **Create Gmail draft…** so the user can attach it there.
Other buttons: **Copy**, **Ask Claude to edit**, **Discard**. When a draft is ready, tell the user it's in `/outbox`.

## Mock interviews and voice

`/mock-interview` runs the Interview Room: call `interview_start`, then `interview_say` for each line (it shows on screen, is read aloud, and starts the user's answer clock), `interview_score` after each main answer, `interview_end` at the close. The user answers out loud with dictation (terminal: `/voice` once, then hold Space; Desktop: the mic button). Stay in character until the end; feedback goes in the debrief. For one-way recorded video interviews (HireVue-style), use style `one-way` with `prep_seconds: 30`.

## Connectors and browser in Claude

- The user connects Gmail and Google Calendar themselves (Desktop: Settings → Connectors; terminal: connect and sign in to them at claude.ai/customize/connectors with the same Claude account Claude Code uses, then type `/mcp` to check they appear; restart the session if they don't).
- The Claude desktop app has a **built-in browser** (no setup, keeps the user's sign-ins); Claude in Chrome is the alternative.
- Design system import (Claude only): with the Artifact tool, `/start` and `page-design` can list the user's Claude design systems (`action: "list"`, `type: "Design System"`), read the chosen one and map its tokens into `profile/design.md` (see `.claude/skills/page-design/references/importing-a-design-system.md`). Read only; never publish or edit it. `apply-theme.mjs --preview` writes sample dashboards to `pages/.preview/` inside the folder (git-ignored), which the built-in browser can open.
- Publishing pages as private claude.ai links follows the `pages` skill and `profile/published-pages.md`, and works only in sessions that have the Artifact tool; without it, open the pages locally and say so.
- Claude Dashboard (Claude only): when the Artifact tool lists the Dashboard type and Node is installed, `pages` can publish the dashboard as a private Claude Dashboard instead of the themed page (numbers that show their source, a warning after 72 hours, Claude's look instead of the user's theme). It asks once before the first publish, records the yes in `profile/published-pages.md`, updates the same link afterwards, and never shares or pins it. Both routes publish only the user's own job list and counts. Steps: `.claude/skills/pages/references/claude-dashboard.md`.
- Pages and panels follow `page-design` and get a `page-review` pass before the user sees them.

## Commits

Commits made in this folder carry no Claude or AI attribution (the `attribution` key in `.claude/settings.json`). Don't add `Co-authored-by`, `Claude-Session` or "Generated with" lines to commit messages or pull request descriptions yourself.
