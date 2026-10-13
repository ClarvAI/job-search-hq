# Changelog

What changed in each version of Job Search HQ, newest first. `/update` shows you the entries newer than the version you have. Versions follow `MAJOR.MINOR.PATCH`: a patch fixes things, a minor version adds things, a major version changes how something you rely on works.

## 1.0.0 (not yet released)

First public release.

- Job-search workspace for Claude Code and Codex, on Mac and Windows: setup interview, daily plan, job finding and evaluation, tailored resumes and cover letters, outreach and follow-ups, interview prep and spoken mock interviews, offers, weekly reviews.
- Panels in Claude Code: Outbox, Pipeline, Contacts, Job Inbox, Apply Kit, Interview Room, due alerts.
- Safety checks: the assistant never sends email, never invites people to calendar events, never uses the browser on Gmail, Outlook or LinkedIn, and never pushes this folder to a public GitHub repository.
- Your files and the app's files are kept apart (`DATA_CONTRACT.md`): your files are set up from blank copies on the first run, are never part of the download, and are never changed by an update.
- `/update` installs a new version from a release zip, keeps any app file you edited as `<file>.local`, backs up what it replaces, and can roll back.
- `/my-data` backs up, wraps up, or resets your data.
- `/health` checks that everything is set up and working, changes nothing, and names the one thing to fix first.
- Layoff first-week plan (`/laid-off`), unemployment work-search log (`/work-search-log`), and an optional visa unemployment clock in `/today` and `/evaluate-job`.
- **Your dashboard on your phone, two ways:** in Claude, besides your themed page, you can publish it as a private Claude Dashboard where every number shows where it came from and a warning appears when it's more than three days old. Either way, the published copy now shows only your job list and counts: no contacts' names, notes, pay or activity log.

Fixed and tightened before release, after end-to-end walkthroughs:

- **Dates:** every reader (panels, startup summary, status line, chat) reads dates the same way. `YYYY-MM-DD` and day-first dotted dates (`9.10.2026`) are always understood; a slash date is read from the date itself, the rest of its row, or the new `date_order:` setting. Anything still unclear shows as "date unclear", never triggers an alert, and is never rewritten. Where you live no longer decides how a date is read.
- **Spreadsheets:** a stray quote mark in a cell no longer swallows the rows after it, and a file that was cut off mid-quote or saved by Excel with semicolons gets a clear warning instead of being saved over. Blank CSV files start with a byte-order mark so Excel on Windows shows accents correctly, and accented letters are always kept. Instructions for Excel in Europe (open with Data → From Text/CSV, or use Google Sheets).
- **Your look is your data:** themed resume and cover-letter templates now live in `profile/templates/`, so the app's own templates stay untouched, `git pull` no longer conflicts, and an update never re-themes your pages. When an update changes a template, your copy is rebuilt in your look and the old one kept as `<name>.previous.html`. Theme previews go to `pages/.preview/`, where the built-in browser can open them.
- **Pages:** the data inside each page is escaped correctly, so text containing `</script>` can't break out of it, and a check guards against it.
- **Safety:** commands that would copy over, move, delete or rewrite your master resume or preferences now ask first; the Outbox panel asks you to confirm send mode once in the panel before it sends; assisted mode is confirmed in the chat each session. The safety check now follows git aliases, `-c` settings and address rewrites, blocks public gists and commands that hide what they run, decodes redirect links, and covers more calendar, meeting and mail-like connectors. The docs say plainly what it still doesn't cover (scripts saved in files, other hosting sites, sites that redirect on their own, time-outs), and the optional pre-push safety net is offered by setup and `/health`.
- **Setup and preferences:** setup records which sections are done (`setup_progress:`) and picks up where it stopped. Work authorization is stored as one exact line per country (`- Work authorization (US): Yes`, `- Needs sponsorship (US): No`) that the Apply Kit reads. New optional lines for benefits (`benefits_claim_start:`, `benefits_cert_covers:` for two-week certifications) and the visa clock (`visa_days_used_as_of:`, with one clear way to count days left). Salary floors take a currency, per country. Field-pack files say which field they were built for, so a change of field gets them rebuilt.
- **Tracking:** a take-home and a booked interview no longer overwrite each other (the second goes in notes as `Also: ...`); thank-you notes and updates to people who already helped you don't count as unanswered follow-ups; new `Schedule interview` next step.
- **Scams:** new red flag for "app tester" jobs that have you open bank accounts or do video identity checks (common in Germany), and clearer advice on when an ID check before an offer is legitimate.
- **Executive search:** advice on working with recruiters and headhunters for experienced hires.
