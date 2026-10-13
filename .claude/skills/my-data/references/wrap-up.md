# my-data: wrap up or pause the search

Part of the `my-data` skill (scripts and how to run them: its SKILL.md).

Ask which: **[choices]** "I accepted a job" · "I'm pausing for a while".

**Always back up first** (`references/backup.md`), and say why in one line: "Before I change anything, I'll save a copy of where things stand."

Before changing `jobs/tracker.csv` or `contacts/contacts.csv`: make sure neither is open in Excel, re-read the file, and change only the rows you mean to. Log each change in `history/activity.md` (one line per job or group of jobs). Status rules are in `knowledge/job-search-playbook.md` ("Tracker"); leave `rejected`, `ghosted`, `skipped` and `withdrawn` rows as they are (they're the record of the search).

**Accepted a job:** follow "Closing the search" in `.claude/skills/offer/SKILL.md` step by step (accepted row, withdrawal notes for every other open application, `skipped` for `interested` rows, thank-you notes to contacts and references, reminding the user to report the new job to an unemployment-benefits office or a visa (DSO) contact, with those lines cleared only on the start date, career log, changing the existing `search_status: active` line to `search_status: closed YYYY-MM-DD` (one line, never a second one), unpublishing). Don't redo or reword those steps here. Then also:
- Benefits and visa clocks (only if those lines in `profile/preferences.md` are filled; skip if offer's step 2a already did this): tell the user to report the new job, its start date, hours and pay to their unemployment-benefits agency (whether they keep claiming is the agency's call), and, on OPT, to report the employer to their DSO or in the SEVP Portal within the required time. Clear the `benefits_` lines and `visa_clock_start` only on or after the start date, as offer's step 2a says (show the exact change, get a yes).
- `search_status`: change the existing `search_status: active` line to `search_status: closed YYYY-MM-DD`; never add a second `search_status:` line (if there are two, keep one).
- Contacts with a `next_followup` date: ask whether to keep in touch with each one (keep the date) or clear it.
- Outbox drafts the user no longer needs (follow-ups, outreach for other jobs): list them and, with their OK, set `status: discarded` and move them to `outbox/discarded/`. If any are `in-gmail-drafts`, tell them to delete those drafts in Gmail themselves.
- Upcoming interviews on their calendar: list them so the user can cancel with the company and remove the events themselves (never change the calendar).
- Routines (if `history/routines.md` exists or they set any up): suggest deleting them, since they'd only log skipped runs now. Keep the certification reminder until the new job starts if `benefits_cert_day:` is set. Steps are in the `routines` skill ("Pause, change or delete"): Claude desktop app, **Routines** → the routine → **Delete**; Codex, the task in **Scheduled** → remove. The user does it themselves, or asks you in a desktop session that can manage them.
- Offer a second backup at the end so the saved copy shows the finished search.

**Pausing:**
1. Ask until when (a date). "Not sure" means a check-in 8 weeks from today. Call it the resume date.
2. Go through open rows, one group at a time, and confirm each group with the user before saving:
   - `offer`: an offer can't wait. Run `/offer` to answer it or ask for more time.
   - `screening` / `interviewing`: ask job by job: keep going (no change), or pull out. Pulling out: draft a short, warm withdrawal note into `outbox/` (to their recruiter or contact, thanking the people they met; never invent a reason; "I've decided to step back from my search for now" is enough), and set the row's `next_action=Send withdrawal note`, `next_action_date` = today, so it stays visible until the note goes out. Set the row to `withdrawn` (and clear its next step) only once the user says the note was sent, with that date in notes.
   - `applied`: leave the status as is (a reply may still come, and they can answer it). Set `next_action` to `Decide next step` and `next_action_date` to the resume date. Withdraw only if the user asks (same as above).
   - `interested`: if the application deadline falls before the resume date, set `skipped` and add "paused YYYY-MM-DD" to notes. Otherwise keep it, with `next_action_date` = the resume date.
3. Contacts with `next_followup` before the resume date: move it to the resume date, or clear it if the user prefers. Offer a short heads-up note to anyone actively helping (status `talked` or `referred`), drafted into `outbox/`.
4. Ask before adding a dated line under "Notes from conversations" in `profile/preferences.md`, in exactly this form: "YYYY-MM-DD: search paused until YYYY-MM-DD." Don't set `search_status` (that is only for a finished search). Scheduled routines read this line and skip their runs until that date.
5. Routines (if `history/routines.md` exists or they set any up): suggest pausing them in the app until the resume date, except the certification reminder while `benefits_cert_day:` is set. Claude desktop app: **Routines** → the routine → **Status** → **Paused**; Codex: the task in **Scheduled** → pause (`routines` skill, "Pause, change or delete"). Runs skip on their own while the note's date is ahead, but each one still starts a session.
6. Tell the user what changed in plain words: which search tasks now wait until the resume date, and which interviews, offers, deadlines or other commitments they chose to keep going (those still come due as normal). Saying "I'm back" (or `/today`) picks the paused tasks up again. If they come back before the resume date, ask before adding "YYYY-MM-DD: search resumed." under the pause line (so routines run again), and remind them to turn paused routines back on.
