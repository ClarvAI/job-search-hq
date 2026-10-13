# Migrations

Updates never change the user's own files (`DATA_CONTRACT.md`). When a release changes the shape of a personal file that users already have (a new line in `profile/preferences.md`, a new part of a page in `pages/`, a renamed column in `jobs/tracker.csv`), it ships a note here telling the assistant how to bring each user's copy up to date, with the user.

## File format

One Markdown file per change, named `NNN-short-name.md` (three digits, counting up: `001-...`, `002-...`). The first line names the version that introduced it:

```
version: 1.1.0
# Add the work-search log line to preferences

Why: ...
Check first: (how to tell if this user's file already has the change; skip if so)
Change: (exactly what to add or edit, in which file)
Ask the user: yes / no (anything personal, or anything they might have customized, needs a yes first)
```

## How they run

`/update` lists every migration whose `version:` is newer than the version the user had and not newer than the one installed, in file-name order. The assistant then, for each one:

1. Reads it and checks whether the user's file already has the change (skip it if so).
2. Shows the user the exact change in plain words, gets a yes where the note says to (always for `profile/master-resume.md` and `profile/preferences.md`, per AGENTS.md), and makes it with a targeted edit.
3. Logs one line in `history/activity.md` (`- <date time> · Claude · Update: applied migration NNN`).

A migration only describes edits; it never deletes the user's data. Changes to blank starter files themselves go in `templates/blank/` (new users get them automatically); a migration is for users who already have the file.

There are no migrations yet (1.0.0 is the first release).
