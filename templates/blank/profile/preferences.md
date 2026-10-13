# Job Search Preferences

SETUP: not done
<!-- Assistant: /start fills this in with the user and then changes the line above to "SETUP: done YYYY-MM-DD". Which setup sections are finished is kept in profile/setup-progress.md. -->

## Settings

autonomy: coach
<!-- coach = the assistant drafts and tracks; the user submits applications themselves.
     assisted = the assistant may also fill application forms in the app's built-in browser, stopping before Submit (see AGENTS.md). Even then, the assistant asks the user in chat to confirm before it first fills a form in each session.
     Only the user changes this. -->

outbox_mode: draft-only
<!-- draft-only = approving an Outbox draft creates a Gmail draft; the user presses Send in Gmail.
     send = approving an Outbox draft sends it from their Gmail after a confirm step. The Claude Outbox panel also asks the user once, in the panel, to confirm send mode before it sends anything; until then it keeps making Gmail drafts.
     Only the user changes this. -->

pdf_engine: html
<!-- html = the assistant makes the PDF from the resume template with Chrome or Edge (default).
     rendercv = use RenderCV for resumes if it's installed (see the tailor-resume RenderCV reference); cover letters always use html.
     Only the user changes this. -->

date_order:
<!-- How the user's spreadsheet writes dates with slashes: MDY (US style, 10/09/2026 = October 9), DMY (UK and most of Europe, 09/10/2026 = 9 October) or YMD. /start sets it from the user's country and asks if unsure. Blank = unknown: a slash date that could be either way (like 03/04/2026) shows as "date unclear" until the user confirms it, and is never rewritten. YYYY-MM-DD dates are always read the same way, and dotted dates (9.10.2026) are always day first. -->

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
language:
<!-- The language the user wants the assistant to talk with them in, e.g. "English", "Deutsch", "español". Blank = the language the user writes in. Set by /start; the user can change it any time just by asking. Only the conversation follows it: files keep their fixed formats, application documents follow application_languages below, and the panels' buttons stay in English. -->
application_languages:
<!-- Languages the user can read well enough to check an application in, with a level, e.g. "English (native), German (B2)". Application documents are written only in these (about B2 or above); anything else gets an English gloss and "Needs a native-speaker check before sending." Set by /start, or the first time the user applies in another language. -->

## What you want

- Target roles, best first: **[ASK]**
- Industries: **[ASK]**
- Locations: **[ASK]** (and open to relocating? where?)
- Remote / hybrid / onsite: **[ASK]**
- Company size or type: **[ASK]**
- Salary floor: **[ASK]** (if unsure: "not set; use market range")
<!-- With currency and period, and one per country if the user applies in more than one, e.g. "US: USD 65,000/year; Germany: EUR 52,000/year". Compare a posting's pay in its own currency; if a conversion is needed, say it's an estimate and give the rate and date used. This is the user's private minimum, never typed into a form as their expectation. -->
- Deal-breakers: **[ASK]** (e.g., long commute, heavy travel, night shifts)
- Work authorization (<country>): **[ASK]**
- Needs sponsorship (<country>): **[ASK]**
<!-- One pair of lines per country the user applies in, with the country in brackets and the answer after the colon, exactly like "- Work authorization (US): Yes" and "- Needs sponsorship (US): No". Answers: Yes, No, or Not sure (then the user answers that form question themselves). The first line answers "Are you legally authorized to work in <country>?", the second "Will you now or in the future require sponsorship?". The Apply Kit reads these lines as written. Never store ID, visa or passport numbers. -->
- Earliest start date: **[ASK]**
- Hours per week for the search: **[ASK]** (sets the weekly goals)
- Willing to travel for work: **[ASK]**
- Availability:
- Hours wanted:
- Shifts:
<!-- Optional, only for hourly, shift or part-time work (knowledge/hourly-and-shift-work.md): the days and hours the user can work (e.g. "Mon-Fri after 3pm, weekends any time"), hours a week wanted ("20-30 a week" or "full-time"), and shift limits ("no overnights"). Blank = not asked; never promise hours the user can't keep. -->

## Benefits and visa clocks (optional; leave blank if they don't apply)

benefits_jurisdiction:
<!-- Where the user claims unemployment benefits, if they do: a US state ("US-PA"), "UK-UC" (Universal Credit), "UK-JSA" (New Style JSA), or "<country>: <program>". Set by /work-search-log after the user says so. -->
benefits_week_starts:
<!-- The weekday the benefit week starts on (e.g. "Sunday"), from the user's claim letter or the agency's site. -->
benefits_claim_start:
<!-- YYYY-MM-DD the claim started (the effective date on the claim letter). Weeks before the work-search requirement begins are skipped (for example, Pennsylvania's starts with the third week of the claim). -->
benefits_cert_day:
<!-- When the user certifies or reports, e.g. "Sunday", "every other Monday from 2026-10-12", "UK journal: before each work coach appointment". /today reminds them that day. -->
benefits_cert_covers:
<!-- How many benefit weeks each certification covers: 1 or 2 (e.g. 2 in Pennsylvania, which files every two weeks). On certification day /today counts the weeks being claimed, not the week just started. -->
visa_type:
<!-- Only if the user's right to stay depends on being employed, e.g. "F-1 post-completion OPT", "F-1 STEM OPT", "H-1B grace period". No visa or ID numbers, ever. -->
visa_clock_start:
<!-- YYYY-MM-DD of the first day counted as unemployed in the current gap, as the DSO or the official counter shows it (usually the day after the last day of work, or the OPT start date if no job has started yet). Not the last day worked. Blank while employed. -->
visa_days_allowed:
<!-- Total unemployment days allowed, from the official source or the user's school's DSO / immigration lawyer (e.g. 90 on post-completion OPT, 150 in total with STEM OPT, up to 60 for the H-1B grace period). -->
visa_days_used:
<!-- Unemployment days already used. If visa_days_used_as_of is blank: only the days used before visa_clock_start (earlier gaps on the same OPT); 0 if none. If visa_days_used_as_of is set: the official total on that date, current gap included. The official count (the SEVP Portal or SEVIS counter, or the DSO) always wins. -->
visa_days_used_as_of:
<!-- YYYY-MM-DD the user read visa_days_used from the official counter; blank if visa_days_used covers only earlier gaps. Days used today = visa_days_used + the days from the later of visa_clock_start and the day after this date, through today, counting both ends (without it: from visa_clock_start); the one formula is in .claude/skills/evaluate-job/references/visa-checks.md. When the user starts a job again, visa_clock_start is cleared and this pair is set to the official count. Example: allowed 90, the SEVP Portal showed 40 used on 2026-10-01, today is 2026-10-09: used 40 + 8 = 48, left 42. -->

## Voluntary self-identification (application EEO questions)

These questions are always optional. Until the user confirms answers here, leave them for the user on every application.
- Use these on applications: **[ASK]** (yes / decline to self-identify / decide each time)
- Race/ethnicity: **[ASK]**
- Gender: **[ASK]**
- Disability: **[ASK]**
- Veteran status: **[ASK]**

## Notes from conversations

<!-- Assistant: log decisions the user makes about their search here, dated. -->
