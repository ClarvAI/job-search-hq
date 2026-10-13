version: 1.1.0
# Add the Kind column and the Claude Dashboard consent line to the published-pages list

Why: the dashboard can now be published two ways (the themed page, or a Claude Dashboard), so the list of published pages records which kind each link is, and when the user agreed to the Claude Dashboard.
Check first: `profile/published-pages.md` already has a `Kind` column in its table and a line starting `Claude Dashboard consent:`. Skip if both are there.
Change: in `profile/published-pages.md`, add a `Kind` column right after `Page` (header `| Page | Kind | Link | Who can see it | Last published |`, separator `|---|---|---|---|---|`). Every existing row gets `themed page` (everything published before this version was a themed page), except a row whose link is still `not published`, which gets `themed page` for Flashcards and Portfolio and stays blank for Dashboard. Keep every link, date and "shared" note exactly as it is. Add the line `Claude Dashboard consent: not asked` below the table, and the note above the table: `> The dashboard can go up as your **themed page** or as a **Claude Dashboard** (Kind). Either way it shows only your job list and counts: no contacts, notes, pay or activity log.`
Also: if the dashboard has a link, the next time it is republished its copy carries only the job list and counts (no contacts, activity or notes), which the `pages` skill now does by itself. Tell the user that in one line.
Ask the user: no (the links and dates don't change); show them the new table.
