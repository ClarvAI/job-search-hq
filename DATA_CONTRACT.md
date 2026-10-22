# Data contract: your files and the app's files

This folder holds two kinds of files. Keeping them apart is what lets you download a new version of the app without losing anything.

**The rule: no update ever changes, moves or deletes your files.** Updates only replace app files listed in `product-manifest.json`, and the update script refuses any release whose manifest lists a user-owned path. It adds to your folders in exactly two cases, and reports each one: a missing starter file (copied from `templates/blank/`, never over an existing file), and, when an update changes the app's resume or cover-letter template, a refreshed copy of your themed version of it (your previous copy is kept next to it as `<name>.previous.html` (an older `.previous.html` that differs is kept as `<name>.previous-2.html`, `-3` and so on, never overwritten)).

## User-owned (yours)

Never part of the app's download or its git repository (`.gitignore` lists them), never changed by an update (only the two additions in the rule above). Back them up with `/my-data`; "delete everything" in `/my-data` removes exactly these.

| Path | What it holds |
|---|---|
| `profile/` (except `profile/README.md`) | Master resume, stories, preferences, writing style, references, signature, page look (`design.md`), setup checklist (`setup-progress.md`), your themed resume and cover-letter templates (`profile/templates/`), resume copies |
| `jobs/` (except `jobs/README.md`) | Tracker, leads, one folder per job |
| `contacts/` (except `contacts/README.md`) | Your contacts list |
| `outbox/` (except the `.gitkeep` placeholders in `outbox/sent/` and `outbox/discarded/`) | Drafts, sent and discarded messages |
| `interviews/` (except `interviews/.gitkeep`) | Interview notes, scorecards, weekly reviews |
| `history/` | The activity log, what routines found (`routines.md`), and whether saved postings are still open (`posting-watch.md`) |
| `imports/` (except `imports/README.md`) | Files you drop in |
| `pages/` (except `pages/README.md`) | Your dashboard, flashcards, portfolio, interview-brief template, publish copies (`pages/.publish/`, including the Claude Dashboard files in `pages/.publish/claude-dashboard/`), theme previews (`pages/.preview/`) |
| `knowledge/field/` | Your field pack: primer, background, resume keywords, target employers, role questions |

Also local and never shipped: `.claude/settings.local.json`, `.claude/.health/`, `.backup/` (copies of the app's own files kept by updates, for undoing one), and any `*.local` file (your edited version of an app file, set aside by an update). "Delete everything" in `/my-data` removes these too, so the folder ends up exactly like a fresh download after its first run.

## App-owned (the product)

Everything else, for example: `AGENTS.md`, `CLAUDE.md`, `README.md`, `HOW-IT-WORKS.md`, `.claude/` (skills, agents, hooks, panels, settings), `.agents/`, `.codex/` (hooks, review agents, and the folder's Codex settings in `.codex/config.toml`), `.githooks/`, `scripts/build-manifest.sh`, `migrations/`, `templates/` (including `templates/blank/`), `knowledge/job-search-playbook.md`, `knowledge/interview-questions.md`, the folder guides listed as exceptions above, `VERSION`, `CHANGELOG.md`, `DATA_CONTRACT.md`, `product-manifest.json`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `DISCLAIMER.md`, `SECURITY.md`. The exact list, with a fingerprint (SHA-256, carriage returns removed) of each file, is `product-manifest.json`.

## In the repository only (for maintainers)

A few app files exist only in the git repository, for the people who build and test the app. They are never in the release zip, never listed in `product-manifest.json`, and `/update` never installs, replaces, removes or mentions them:

| Path | What it holds |
|---|---|
| `docs/maintainers/` | Handoff notes and review reports |
| `.github/` | CI workflows, issue and pull request templates |
| `scripts/ci/` | Every check and end-to-end test, with its fixtures |
| `.claude/skills/*/tests/` | The panels' tests |
| `CONTRIBUTING.md` | How to change, test and release the app (it points at the paths above) |

If you downloaded the release zip, you don't have these, and you don't need them. If you cloned the repository, you have them; `git pull` keeps them current, and an update from a zip leaves your copies exactly as they are.

## How your files start, and how they change

- **First run:** `.claude/skills/start/scripts/init-data.sh` (`.ps1` on Windows) copies every file in `templates/blank/` that is missing into the same place in the workspace. It never overwrites. The session-start hook runs it, so you never have to.
- **Your look** (`page-design`): your theme lives in `profile/design.md`. Applying it rewrites the theme part of your pages and of your own copies of the resume and cover-letter templates in `profile/templates/` (made from `templates/` the first time your theme differs from the default). The app's `templates/*.html` always stay on the default look and are never edited, so an update or a `git pull` never meets a changed app template. Resumes and cover letters are built from `profile/templates/<name>` when it exists, else from `templates/<name>`.
- **Updates** (`/update`): replace app files whose fingerprint still matches the version you have. If you edited an app file, your version is kept next to it as `<file>.local` and the update tells you. Replaced app files are copied to `.backup/<old version>/` first, so an update can be rolled back. After the app files, the update runs the first-run script again, which adds any new starter file (never changing an existing one). If the update changed an app template you have a themed copy of, that copy is rebuilt from the new template with your theme, and your previous copy is kept as `profile/templates/<name>.previous.html` (an older `.previous.html` that differs is kept as `<name>.previous-2.html`, `-3` and so on, never overwritten) (so changes you made by hand are never lost). Updates never re-theme or otherwise change your pages.
- **`git pull`** (a git clone of the app): your files are ignored by git, so a pull only changes app files. The `update` skill lists what to do after a pull (starter files, template copies, migrations).
- **When the shape of a personal file changes** (a new line in `preferences.md`, a new part of a page), the release includes a note in `migrations/`. The assistant reads it after the update and makes that change in your file with you, showing you the exact change first.

## For maintainers

- A path is user-owned if it matches the table above. Don't ship files there; put starter copies in `templates/blank/` instead.
- After changing any app file, run `bash scripts/build-manifest.sh` to refresh `product-manifest.json` (CI checks it with `--check`). `bash scripts/build-manifest.sh --zip <file>` builds the release zip from exactly the files the manifest lists.
- The maintainer-only list above is `is_maintainer` in `scripts/build-manifest.sh`, mirrored by `ship` in `.claude/skills/update/scripts/update.sh` and `Test-Maintainer` in `update.ps1` (the same way `is_protected` / `Test-Protected` are). Change all three together, and the table above. Put a new test or maintainer note under one of those paths so it stays out of releases. Shrinking the list later is safe (an older `/update` skips a newly shipped file once, and the next update adds it); growing it means the next update removes those files from zip users' folders (and from a clone that updates from a zip; `git checkout` brings them back there), which is what you want for a file that stopped shipping.
- A change to a blank file's structure needs a `migrations/` note (see `migrations/README.md`) and a `CHANGELOG.md` entry.
