---
name: work-search-log
description: "Keep the work-search record that unemployment benefits ask for (US state unemployment, UK Universal Credit or New Style JSA, and similar programs): pulls applications, networking and interviews from the tracker, contacts and activity log, records other activities (job fairs, workshops, job-center appointments, networking events), and builds the week's log in the order the user's state or program asks for, as a spreadsheet and a printable page. The user files and certifies it themselves. Use when the user mentions unemployment benefits, work search, a weekly or biweekly certification or claim, their Universal Credit journal or work coach, or asks for a list of what they did this week."
---

# /work-search-log: the record unemployment benefits ask for

Usage: `/work-search-log [this week | last week | add <activity> | week of YYYY-MM-DD]` (or just ask).

Most US states, and UK Universal Credit, expect people claiming benefits to look for work every week and to keep a record of it. Much of what the user does here already counts; this skill turns it into the record, in the order their agency asks for.

**Boundaries (say once, the first time):** "I keep the record and lay it out the way your agency asks. You enter it and certify it yourself; I never sign in to the benefits site, file, or answer the claim questions for you. The agency's own rules always win, and I'm not giving legal advice about eligibility." Never tell the user they qualify, will be paid, or can skip a requirement. The certification questions (able and available to work, earnings, job offers refused) are theirs alone: if they ask, point them to the agency's own instructions. Any work or pay in the week must be reported as the agency says.

## 1. Where they claim (ask once, then remember)

Read `profile/preferences.md`. If `benefits_jurisdiction:` is blank or the line is missing, ask **[choices]**: "Where are you claiming?" Options: "A US state (I'll say which)" · "UK Universal Credit" · "UK New Style JSA" · "Somewhere else (I'll say)". Then, one at a time and only if not already known: the day their benefit week starts (from their claim letter or the agency site; the reference says what each state uses when it's published), and when they certify or report (`benefits_cert_day`, e.g. "Sunday", "every other Monday from 2026-10-12", "before each work coach appointment").

Show the exact lines and ask "OK to save?" (preferences rule in AGENTS.md). Save them under "## Benefits and visa clocks" (if that section is missing, add it, with these three lines, just above "## Voluntary self-identification"). Log one line in `history/activity.md` ("Work-search log set up for <jurisdiction>").

Then read that jurisdiction's section in `references/requirements.md`: how many activities a week, what counts, the fields to record and their order, how it's reported, how long to keep records, and the official link. **If the jurisdiction isn't in the reference, or the reference says "check your state's site", don't fill the gaps from memory:** fetch the agency's official page (government domain only), and if you can't confirm a number, say "check <official link>" and use the default field order below. Tell the user in two sentences what their agency expects and where that's written.

## 2. Build the week's record

The log lives in `jobs/work-search-log.csv`, one row per activity, kept for the whole claim (and after; see "Keeping records"):

```
date,activity_type,employer,contact_person,contact_method,position,result,notes,source
```

- **date**: `YYYY-MM-DD`, the day it happened. **activity_type**: `application`, `interview`, `networking` (a message or conversation about work with a real person), `job fair`, `workshop`, `job center appointment`, `networking event`, `job bank registration`, `resume posted`, or the agency's own word for it. **contact_method**: how and where (`online - <careers site or job board>`, `email - <address>`, `phone`, `in person - <address>`, `LinkedIn message`); add the employer's website, address or phone only when the agency asks for it, from the posting or the user. **result**: what happened as of that day (`applied, no response yet`, `interview scheduled 10-14`, `not hiring`, `attended`). **source**: `tracker`, `contacts`, `outbox`, `history`, or `manual` (the user told you).
- **Gather for the week** (benefit week start to start + 6 days), from records only, each event once:
  - `jobs/tracker.csv`: rows with `date_applied` in the week → `application` (employer = company, position = role, contact_person = contact, contact_method from `apply_link` or `source`). Interviews on a date in the week (from `next_action` "Interview <date>", job folder notes, or `interviews/` files) → `interview`.
  - `outbox/sent/` (the `sent:` date and `kind`), `contacts/contacts.csv` (`last_contact`), and dated lines in `history/activity.md` → `networking` for messages actually sent to a person about work. A thank-you note is not a new activity; a follow-up to an employer about a specific application can be, if the agency counts employer contacts (say so).
  - Rows already in `jobs/work-search-log.csv` for the week (manual entries and earlier runs).
  - Skip duplicates (same date, type, employer and position). Never count a draft, a saved-but-not-sent application, or something the records don't date; ask the user instead. Never invent or backdate an activity, and never pad the week to reach the number.
- **Add the activities they did outside this folder.** Ask once: "Anything else this week, like a job fair, workshop, appointment at the job center, or a call with someone about work?" Add each as a `manual` row, asking one question at a time for anything the agency needs that's missing (often the contact person or the method). The user can also say "add: went to the county job fair today" any time; add that row the same way.
- **Write the new rows** to `jobs/work-search-log.csv`: re-read it first, append only, never rewrite or reorder existing rows (they're the record), and follow the CSV rules in `knowledge/job-search-playbook.md` ("Tracker"). Log one line in `history/activity.md` ("Work-search log: N activities for week of <date>").

## 3. Check it against the requirement

Count the week's activities the way the agency counts them (some count only employer contacts, some require a share of them to be applications, some count registering with the state job bank once). Then say it plainly: "You have 2 of the 3 activities <agency> asks for this week. The week ends Saturday." If short and the week isn't over, offer two concrete ideas from the user's real pipeline (a saved `interested` job to apply to, a contact due a follow-up, an event). Never suggest a fake or token contact.

## 4. Export the week

Write both to `jobs/work-search/` (create it if needed), named by the week's start date:
- `week-YYYY-MM-DD.csv`: the week's rows, with the columns renamed and ordered the way the agency's form or online certification lists them (the reference gives the order; otherwise: date, employer, contact person, how contacted, position, result). Same CSV rules.
- `week-YYYY-MM-DD.html`: a plain printable table for their files or a meeting with the agency. Black text on white, system font, 11-12pt, table borders, one heading ("Work search record, week of <Mon D, YYYY>"), the user's name from `profile/preferences.md`, the jurisdiction, and a footer line "Prepared by <name> from their own records". No scripts, no links to other sites, no logos, and no ID or claim numbers (the user writes those by hand if the agency wants them). Landscape print if the table is wide.

Tell the user where they are in one line ("Your week is ready to copy into your certification; the printable copy is in your jobs folder"), and how to use it for their agency (from the reference: typed into the weekly certification, kept on file for an audit, or added to the Universal Credit journal). In Claude Code they can also ask you to open the printable page.

## 5. Keeping records

Tell the user once how long their agency says to keep the record (reference), and that `jobs/work-search-log.csv` keeps every week. Suggest a backup (`/my-data`) now and then. If the agency asks for proof (screenshots of applications, confirmation emails), save only what the user gives you into the job's folder, and remind them the confirmation emails in their own inbox are good evidence too.

## Reminders

- `/today` reminds the user on their certification day (`benefits_cert_day`) with the week's count, and mid-week if they're behind the agency's number.
- `/weekly-review` reports the week's count next to their own goals.
- When the claim ends (a new job, or benefits run out), offer to clear the three `benefits_` lines with their OK; keep the log file.
