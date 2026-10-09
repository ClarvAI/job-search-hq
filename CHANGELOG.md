# Changelog

What changed in each version of Job Search HQ, newest first. `/update` shows you the entries newer than the version you have. Versions follow `MAJOR.MINOR.PATCH`: a patch fixes things, a minor version adds things, a major version changes how something you rely on works.

## 1.0.0 (2026-10-07)

First public release.

- Job-search workspace for Claude Code and Codex, on Mac and Windows: setup interview, daily plan, job finding and evaluation, tailored resumes and cover letters, outreach and follow-ups, interview prep and spoken mock interviews, offers, weekly reviews.
- Panels in Claude Code: Outbox, Pipeline, Contacts, Job Inbox, Apply Kit, Interview Room, due alerts.
- Safety checks: the assistant never sends email, never invites people to calendar events, never uses the browser on Gmail, Outlook or LinkedIn, and never pushes this folder to a public GitHub repository.
- Your files and the app's files are kept apart (`DATA_CONTRACT.md`): your files are set up from blank copies on the first run, are never part of the download, and are never changed by an update.
- `/update` installs a new version from a release zip, keeps any app file you edited as `<file>.local`, backs up what it replaces, and can roll back.
- `/my-data` backs up, wraps up, or resets your data.
- `/health` checks that everything is set up and working, changes nothing, and names the one thing to fix first.
- Layoff first-week plan (`/laid-off`), unemployment work-search log (`/work-search-log`), and an optional visa unemployment clock in `/today` and `/evaluate-job`.
