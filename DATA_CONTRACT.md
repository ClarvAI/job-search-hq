# Data contract: your files and the app's files

This folder holds two kinds of files. Keeping them apart is what lets you download a new version of the app without losing anything.

**The rule: no update ever creates, changes, moves or deletes a user-owned path.** Updates only replace app files listed in `product-manifest.json`, and the update script refuses any release whose manifest lists a user-owned path.

## User-owned (yours)

Never part of the app's download or its git repository (`.gitignore` lists them), never touched by an update. Back them up with `/my-data`; "delete everything" in `/my-data` removes exactly these.

| Path | What it holds |
|---|---|
| `profile/` (except `profile/README.md`) | Master resume, stories, preferences, writing style, references, signature, page look, resume copies |
| `jobs/` (except `jobs/README.md`) | Tracker, leads, one folder per job |
| `contacts/` (except `contacts/README.md`) | Your contacts list |
| `outbox/` (except the `.gitkeep` placeholders in `outbox/sent/` and `outbox/discarded/`) | Drafts, sent and discarded messages |
| `interviews/` (except `interviews/.gitkeep`) | Interview notes, scorecards, weekly reviews |
| `history/` | The activity log |
| `imports/` (except `imports/README.md`) | Files you drop in |
| `pages/` (except `pages/README.md`) | Your dashboard, flashcards, portfolio, interview-brief template, publish copies |
| `knowledge/field/` | Your field pack: primer, background, resume keywords, target employers, role questions |

Also local and never shipped: `.claude/settings.local.json`, `.claude/.health/`, `.backup/` (copies kept by updates), and any `*.local` file (your edited version of an app file, set aside by an update).

## App-owned (the product)

Everything else, for example: `AGENTS.md`, `CLAUDE.md`, `README.md`, `HOW-IT-WORKS.md`, `.claude/` (skills, agents, hooks, panels, settings), `.agents/`, `.codex/`, `.githooks/`, `.github/`, `scripts/`, `migrations/`, `templates/` (including `templates/blank/`), `knowledge/job-search-playbook.md`, `knowledge/interview-questions.md`, the folder guides listed as exceptions above, `VERSION`, `CHANGELOG.md`, `DATA_CONTRACT.md`, `product-manifest.json`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `DISCLAIMER.md`, `SECURITY.md`. The exact list, with a fingerprint (SHA-256, carriage returns removed) of each file, is `product-manifest.json`.

## How your files start, and how they change

- **First run:** `.claude/skills/start/scripts/init-data.sh` (`.ps1` on Windows) copies every file in `templates/blank/` that is missing into the same place in the workspace. It never overwrites. The session-start hook runs it, so you never have to.
- **Updates** (`/update`): replace app files whose fingerprint still matches the version you have. If you edited an app file, your version is kept next to it as `<file>.local` and the update tells you. The resume and cover-letter templates carry your theme, so they are replaced and your theme is applied again. Replaced app files are copied to `.backup/<old version>/` first, so an update can be rolled back. After the app files, the update runs the first-run script again, which adds any new starter file (never changing an existing one).
- **When the shape of a personal file changes** (a new line in `preferences.md`, a new part of a page), the release includes a note in `migrations/`. The assistant reads it after the update and makes that change in your file with you, showing you the exact change first.

## For maintainers

- A path is user-owned if it matches the table above. Don't ship files there; put starter copies in `templates/blank/` instead.
- After changing any app file, run `bash scripts/build-manifest.sh` to refresh `product-manifest.json` (CI checks it with `--check`). `bash scripts/build-manifest.sh --zip <file>` builds the release zip.
- A change to a blank file's structure needs a `migrations/` note (see `migrations/README.md`) and a `CHANGELOG.md` entry.
