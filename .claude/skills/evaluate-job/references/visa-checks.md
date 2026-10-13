# Visa and sponsorship checks for a job

Signals for the user's decision, never immigration advice. Always end with: "For your own situation, check with <your school's DSO / an immigration lawyer>." Values below were read on gov.uk and USCIS / DHS pages on 2026-10-08. Thresholds change often (the UK changed them in 2024 and 2025 and is reviewing them again), so re-read the official page on the day and quote what it says, with the date. If the page and this file disagree, the page wins; tell the user.

## UK: does this employer sponsor, and does this job look like it qualifies?

1. **Is the employer a licensed sponsor?** The Home Office publishes the *Register of licensed sponsors: workers*, updated almost daily: https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers. It's a large spreadsheet (CSV) linked from that page. Search it for the employer's legal name (and common variants; the trading name on the posting can differ), and note the town, the route ("Skilled Worker") and the rating. In `fit.md` write one of: `On the register (Skilled Worker, <town>), checked <date>`, `Not found under <names tried>, checked <date>` (a knockout for a user who needs sponsorship, unless the posting says sponsorship is offered through another entity), or `Couldn't check` (say why). Being on the register doesn't mean they'll sponsor this role; the posting or the recruiter has to say so.
2. **Does the job look eligible?** From https://www.gov.uk/skilled-worker-visa/your-job (read 2026-10-08):
   - The job needs an eligible occupation code (the "table of eligible jobs"; "higher skilled" jobs, or "medium skilled" ones only if on the immigration salary list or the temporary shortage list).
   - Pay must be at least the general threshold (**£41,700 a year** on that page on 2026-10-08) or the occupation's "going rate", whichever is higher. Lower thresholds exist for some cases (for example new entrants at the start of their career, relevant PhDs, and some health and education jobs); see the same page. Don't decide which applies to the user; say which one might and point to the page.
   - The user needs a job offer and a certificate of sponsorship from the employer before applying.
   In `fit.md`, compare the posted pay with the threshold that seems relevant and say "looks above / below / unclear (no pay posted)", with the date and link. Never tell the user they will or won't get a visa.
3. **Graduate visa or other routes** the user mentions: just note the route and its end date from their preferences; don't evaluate eligibility.

## US: sponsorship signals

- Posting language: "unable to sponsor", "must be authorized to work without sponsorship now or in the future", US citizenship or clearance required. Quote it.
- Past H-1B filings: USCIS H-1B Employer Data Hub, https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub (past approvals are a signal, not a promise).
- **The $100,000 H-1B payment (presidential proclamation of 19 September 2025):** it was added to new H-1B petitions filed from 21 September 2025 for people outside the US. It never applied when USCIS approves a change of status, amendment or extension for someone inside the US (for example F-1 to H-1B), but it did apply if that request was denied or the person left the US first. On 8 June 2026 a federal court vacated the guidance that put the payment into effect, and on 24 July 2026 the First Circuit refused to pause that order; USCIS says it will comply but plans to collect the payment again if the order is lifted. So this changes month to month: read the current USCIS page on the day (https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations; it said all of the above when read on 2026-10-12, "last reviewed 09/21/2026"), quote its date, and treat it only as a signal (an employer may be slower to sponsor someone abroad). For the user's own case: their DSO or an immigration lawyer.
- **F-1 OPT and STEM OPT:** the unemployment allowance is 90 days on post-completion OPT and 150 days in total with a STEM OPT extension (SEVIS counts each day without employer information). Source: Study in the States, https://studyinthestates.dhs.gov/sevis-help-hub/student-records/fm-student-employment/unemployment-counter. STEM OPT also needs an employer enrolled in E-Verify and a training plan (Form I-983): https://studyinthestates.dhs.gov/stem-opt-hub. If the user is on STEM OPT or plans to be, note whether the posting or the company says it uses E-Verify; ask the recruiter if not stated.
- **H-1B after a job ends:** up to 60 consecutive days, or until the authorized stay ends if sooner, to change status, adjust status, or be named in a new employer's petition: https://www.uscis.gov/policy-manual/volume-2-part-m-chapter-9 (and the archived USCIS page "Options for Nonimmigrant Workers Following Termination of Employment"). A long hiring process can matter more than fit here; say so.

## Visa clock

The one formula (used by `/today` and `/evaluate-job`; don't vary it). The lines in `profile/preferences.md`:
- `visa_clock_start`: the **first counted unemployment day** of the current gap (as the DSO or official counter counts it, usually the day after the last day of work). Blank while employed.
- `visa_days_used`: unemployment days already used, from the official count (SEVP Portal, SEVIS counter, DSO or lawyer).
- `visa_days_used_as_of`: the date that count was read. Blank means the count covers only gaps before `visa_clock_start`.
- `visa_days_allowed`: the total allowed, from the official source.

Days used today = `visa_days_used` + the number of calendar days from the counting start through today, both included, where the counting start is the later of `visa_clock_start` and the day after `visa_days_used_as_of` (if `visa_days_used_as_of` is blank: `visa_clock_start`). If the counting start is after today, add 0. Days left = `visa_days_allowed` − days used today. All four numbers are needed: if any is missing, don't estimate; say which one to get from the DSO or the official counter.

Example: allowed 90; the SEVP Portal showed 12 used on 2026-10-01; clock started 2026-09-20; today 2026-10-09. Counting start = 2026-10-02, so 8 more days: 20 used, 70 left.

When the user starts a job again (with their OK): clear `visa_clock_start`, and set `visa_days_used` to the official count with today's date in `visa_days_used_as_of`, so a later gap starts from the right number.

## Visa clock vs. the hiring timeline

If `visa_clock_start` is set, work out the days left with the formula above and compare with how long this employer's process is likely to take (posting, recruiter, or "unknown"). If it's tight, say so in the verdict and suggest asking the recruiter about their timeline early. The official counter (SEVP Portal or the DSO) or the lawyer has the real number.
