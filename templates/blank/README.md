# Blank copies (do not edit)

Clean, never-filled-in copies of the personal files, laid out exactly as they sit in the workspace (`profile/`, `knowledge/`, `history/`, `jobs/`, `contacts/`, `pages/`). The `my-data` skill's reset ("delete everything / start over") copies these back over the user's files.

- Never write the user's information here, and never update these from the user's filled-in files.
- The pages here and `profile/design.md` always use the **Default** look, so a reset brings back the default look too. A user's theme (colors, fonts, size) never goes here; `apply-theme.mjs` never touches this folder.
- If a blank file itself changes structurally (a new section in `preferences.md`, a new part of a page from `page-design`), update both the live file and its copy here, keep the copy free of anyone's data, and keep the page copies on the Default preset (`node .claude/skills/page-design/scripts/apply-theme.mjs --preset default --root <a scratch copy>` shows what that block should be).
- This README is not copied during a reset.
