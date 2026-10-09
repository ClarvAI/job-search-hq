# Job Search Preferences

SETUP: not done
<!-- Assistant: /start fills this in with the user and then changes the line above to "SETUP: done YYYY-MM-DD". -->

## Settings

autonomy: coach
<!-- coach = the assistant drafts and tracks; the user submits applications themselves.
     assisted = the assistant may also fill application forms in the app's built-in browser, stopping before Submit (see AGENTS.md).
     Only the user changes this. -->

outbox_mode: draft-only
<!-- draft-only = approving an Outbox draft creates a Gmail draft; the user presses Send in Gmail.
     send = approving an Outbox draft sends it from their Gmail after a confirm step.
     Only the user changes this. -->

pdf_engine: html
<!-- html = the assistant makes the PDF from the resume template with Chrome or Edge (default).
     rendercv = use RenderCV for resumes if it's installed (see the tailor-resume RenderCV reference); cover letters always use html.
     Only the user changes this. -->

weekly_goals: 5 applications, 3 networking conversations, 1 mock interview
<!-- /start sets these from the user's hours per week. /today, the weekly review and the dashboard use them. Quality over volume. -->

search_status: active
<!-- active, or "closed YYYY-MM-DD" (set by the offer skill when the user accepts a job; quiets reminders and the status line). A pause is noted under "Notes from conversations" instead. Only change this with the user's OK. -->

## About you

name:
career_stage:
<!-- student | new-grad | early-career | mid-career | senior | career-changer | returning -->
graduation:
<!-- students and new grads only, YYYY-MM; blank otherwise -->
field:
<!-- the user's field or industry in their own words, e.g. "medical devices", "B2B SaaS marketing", "public school teaching" -->
home_base:
<!-- city / region -->
application_languages:
<!-- Languages the user can read well enough to check an application in, with a level, e.g. "English (native), German (B2)". Application documents are written only in these (about B2 or above); anything else gets an English gloss and "Needs a native-speaker check before sending." Set by /start, or the first time the user applies in another language. -->

## What you want

- Target roles, best first: **[ASK]**
- Industries: **[ASK]**
- Locations: **[ASK]** (and open to relocating? where?)
- Remote / hybrid / onsite: **[ASK]**
- Company size or type: **[ASK]**
- Salary floor: **[ASK]** (if unsure: "not set; use market range")
- Deal-breakers: **[ASK]** (e.g., long commute, heavy travel, night shifts)
- Work authorization: **[ASK]** (the answers to "Are you legally authorized to work in <country>?" and "Will you now or in the future require sponsorship?". Never store ID numbers.)
- Earliest start date: **[ASK]**
- Hours per week for the search: **[ASK]** (sets the weekly goals)
- Willing to travel for work: **[ASK]**

## Benefits and visa clocks (optional; leave blank if they don't apply)

benefits_jurisdiction:
<!-- Where the user claims unemployment benefits, if they do: a US state ("US-PA"), "UK-UC" (Universal Credit), "UK-JSA" (New Style JSA), or "<country>: <program>". Set by /work-search-log after the user says so. -->
benefits_week_starts:
<!-- The weekday the benefit week starts on (e.g. "Sunday"), from the user's claim letter or the agency's site. -->
benefits_cert_day:
<!-- When the user certifies or reports, e.g. "Sunday", "every other Monday from 2026-10-12", "UK journal: before each work coach appointment". /today reminds them that day. -->
visa_type:
<!-- Only if the user's right to stay depends on being employed, e.g. "F-1 post-completion OPT", "F-1 STEM OPT", "H-1B grace period". No visa or ID numbers, ever. -->
visa_clock_start:
<!-- YYYY-MM-DD the current unemployment clock started (e.g. the last day of employment). Blank while employed. -->
visa_days_allowed:
<!-- Total unemployment days allowed, from the official source or the user's school's DSO / immigration lawyer (e.g. 90 on post-completion OPT, 150 in total with STEM OPT, up to 60 for the H-1B grace period). -->
visa_days_used:
<!-- Days already used before visa_clock_start (earlier gaps on the same OPT); 0 if none. The official count (e.g. the SEVP Portal or SEVIS counter, or the DSO) always wins. -->

## Voluntary self-identification (application EEO questions)

These questions are always optional. Until the user confirms answers here, leave them for the user on every application.
- Use these on applications: **[ASK]** (yes / decline to self-identify / decide each time)
- Race/ethnicity: **[ASK]**
- Gender: **[ASK]**
- Disability: **[ASK]**
- Veteran status: **[ASK]**

## Notes from conversations

<!-- Assistant: log decisions the user makes about their search here, dated. -->
