# Blank copies (do not edit)

Clean, never-filled-in copies of every personal starter file, laid out exactly as they sit in the workspace (`profile/`, `knowledge/field/`, `history/`, `jobs/`, `contacts/`, `pages/`). The personal files themselves are not part of the download (they are ignored by git and never touched by updates; see `DATA_CONTRACT.md`).

- **First run:** `.claude/skills/start/scripts/init-data.sh` (or `init-data.ps1`) copies every file here that is missing from the workspace into place, one to one. It never overwrites a file that exists. The session-start hook runs it, and so does `/start`.
- **Reset:** the `my-data` skill's "delete everything / start over" deletes the user's files and then runs the same init, so everything comes back from here.
- **Updates:** a new release may change or add files here; the update then copies any new file into place (existing personal files are never changed). Structural changes to a file the user already has are described in `migrations/` for the assistant to apply with the user.
- Never write the user's information here, and never update these from the user's filled-in files.
- The CSV files (`jobs/tracker.csv`, `jobs/leads.csv`, `jobs/work-search-log.csv`, `contacts/contacts.csv`) are a header row only, saved as UTF-8 **with a byte-order mark** so Excel on Windows reads accents correctly. Keep the mark when editing them (every reader strips it).
- The user's themed resume and cover-letter templates are not here either: `page-design` writes them to `profile/templates/` (user-owned) from the app's `templates/*.html`.
- The pages here and `profile/design.md` always use the **Default** look, so a reset brings back the default look too. A user's theme (colors, fonts, size) never goes here; `apply-theme.mjs` never touches this folder (`apply-theme.mjs --check-blank` confirms they're still on Default).
- If a blank file itself changes structurally (a new section in `preferences.md`, a new part of a page from `page-design`), change it here with generic content only, keep the page copies on the Default preset, and add a `migrations/` note so existing users get the same change.
- This README is not copied.
