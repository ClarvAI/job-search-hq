# Panel code (maintainers)

- This folder is a Claude Code mod. After any change, run `claude plugin validate --strict` and `claude plugin test` on this panel (`bash scripts/ci/check-mods.sh` runs all seven), and give anything a user sees a `page-review` pass.
- Dates and CSVs follow AGENTS.md ("Reading dates someone else wrote", "CSV files"). Five panels share `hooks/csvdate.ts`, byte-identical (CI-checked): change all five copies together.
- Never save a CSV that looks damaged (a semicolon header, an unclosed quote) or that has an Excel `~$` lock file next to it, and never rewrite a date that is unclear.
- A failing hook must never leave the panel stuck or a file half-saved: catch errors in every hook that gates an action, and show the user a plain message.
- No real data in tests: the Alex Rivera persona, `example.com`, 555 numbers.
