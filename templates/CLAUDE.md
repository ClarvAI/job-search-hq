# templates/ (the app's own files)

- These templates are the app's, on the Default look. Never edit them for one user: a user's look lives in `profile/templates/` (made by `page-design`), and resumes and cover letters are built from `profile/templates/<name>.html` when it exists, else from here.
- `templates/blank/` holds the blank starter copies of every personal file. Never write anyone's real information there, and never update it from a user's filled-in files (see its README).
- Changing the app itself: a structural change to a blank file needs a `migrations/` note and a `CHANGELOG.md` entry; blank pages stay on the Default look (`node .claude/skills/page-design/scripts/apply-theme.mjs --check-blank`); data blocks in pages escape `<` (checked by `scripts/ci/check-parity.sh`); sample data uses the Alex Rivera persona, `example.com` and 555 numbers.
