# Panel code (maintainers)

- This folder is a Claude Code mod. After any change, run `claude plugin validate --strict` and `claude plugin test` on this panel (`bash scripts/ci/check-mods.sh`, in a clone of the repository, runs all seven), and give anything a user sees a `page-review` pass.
- Dates and CSVs follow AGENTS.md ("Reading dates someone else wrote", "CSV files"). Five panels share `hooks/csvdate.ts`, byte-identical (CI-checked): change all five copies together.
- Saving a CSV goes through `saveRow` in `csvdate.ts` (re-read right before the write, refused when the file changed since the panel read it: there is no file lock). Engine calls can't cross an import, so each panel passes its own `FileIo` built from `$.fs`.
- Nothing plays a sound or speaks until the user opts in (the Interview Room's voice and sounds are off in a new folder, kept per folder); every spoken line is also shown as text.
- Never save a CSV that looks damaged (a semicolon header, an unclosed quote) or that has an Excel `~$` lock file next to it, and never rewrite a date that is unclear.
- A failing hook must never leave the panel stuck or a file half-saved: catch errors in every hook that gates an action, and show the user a plain message.
- No real data in tests: the Alex Rivera persona, `example.com`, 555 numbers.
