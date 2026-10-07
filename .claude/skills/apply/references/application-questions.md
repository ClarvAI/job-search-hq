# Application forms: questions, channels, referrals, confirmations

Background for `/apply`. Researched 2026-10. Most of this is practitioner advice (recruiters, career centers, ATS vendor help pages); where there's a study it's named. Sorting requirements and spotting knockouts in the posting itself: `.claude/skills/evaluate-job/references/reading-postings.md`. Pay ranges: `.claude/skills/offer/references/pay-data.md`.

## Knockout and screening questions

- Yes/no and number questions (work authorization, sponsorship, location, license, years of experience, willingness to travel or relocate, shift availability) are often scored automatically, and a wrong answer can end the application before anyone reads the resume. Harvard Business School's *Hidden Workers* report found many employers' systems filter on rigid criteria like these.
- Answer every one exactly and truthfully from the profile files. Never round up. If a question is ambiguous ("years of experience" when the user has internships, contract or part-time work), use the most honest reading, and say how it was counted in any free-text box ("18 months of full-time contract work"). Mark for the user any you can't answer from files.
- Sponsorship and authorization: copy from `profile/preferences.md` word for word. These are legal statements; the user confirms them.

## Salary fields

- If the field is optional, leaving it blank or writing "Negotiable" is fine.
- If it requires a number, give a researched figure at or above the user's floor, as a range if the field accepts text (from the posted range or the "Market pay" block in `fit.md`). Don't enter 0, 1 or 999999: recruiters warn these can be read literally by a filter or look careless to a person.
- Expected pay and past pay are different. Many US states and cities ban asking about salary history; where they do, the user can skip or decline it (look up the current rule for the job's location). Expectations are allowed everywhere.

## "Why us?", "Why this role?" and other free text

- First sentence answers the question. Then one specific, true detail about this employer and one matching result from the user's record. About 50-100 words unless the form says otherwise.
- Don't paste the cover letter; reuse its hook in fewer words.
- Text that sounds machine-written is now a known risk: in Greenhouse's 2025 survey of about 4,100 job seekers and hiring staff, 65% of US hiring managers said they had caught applicants using AI deceptively and 61% use detection software. Detection tools are unreliable, but the suspicion is real, so the voice rules in `profile/voice.md` apply to every answer.
- "How did you hear about us?": the real source. If someone referred the user, name them here too.

## Company site or Easy Apply?

- Prefer the employer's own careers site (`apply_link`) for priority A and B jobs: the application lands straight in the employer's system with all of its questions answered, and the user can attach the tailored files.
- One-click options (LinkedIn Easy Apply, Indeed Apply) are fine for priority C or when the employer accepts only that route. The user clicks them; we never automate LinkedIn.
- Don't apply to the same job through both; it can create duplicate profiles.
- Widely shared numbers comparing response rates (e.g. "Easy Apply 3% vs company site 15-30%") come from vendor blogs with no method. Don't quote them.

## Referrals

- Referred applicants are more likely to be hired than similar non-referred applicants (Burks et al., QJE 2015, nine large firms).
- **Get the referral before applying.** Ask the referrer how their company does it: some have the employee submit the referral in an internal tool, which emails the user a link to apply; others want the employee's name in a "referred by" field. Some systems can't attach a referral to an application that already exists.
- Put the referrer's name in the referral field exactly as they gave it, and only with their OK.

## Confirmations and tracking

- It isn't submitted until there's a confirmation page or email. Workday and similar systems show a review page before the final Submit.
- Save the confirmation (screenshot or "Print → Save as PDF") in the job folder as `confirmation-<date>.pdf` or `.png`. The confirmation email also lets `/sync-inbox` confirm it.
- No email within a day: check spam and the employer's candidate portal. Each Workday employer has its own account; note the portal link and the login email in `posting.md`, never the password.
- `date_applied` is the date on the confirmation.

## Employer AI screening

- Many employers now use AI to summarize, rank or score applications and form answers. What helps is the same as for a person: complete, accurate answers in plain words using the posting's real terms. Hidden text and prompts are detected and rejected.
- New York City: employers using an automated tool to screen NYC-resident candidates must give notice at least 10 business days before use and let them request an alternative process or accommodation (Local Law 144); the employer doesn't have to grant it.

## Sources

- Harvard Business School *Hidden Workers* report: https://www.hrdive.com/news/report-applicant-tracking-systems-may-exclude-whole-segments-of-candidates/606614/
- Knockout questions: https://hiretruffle.com/blog/knockout-questions
- Salary field advice (iHire career advisor): https://www.ihireengineering.com/resourcecenter/jobseeker/pages/ask-a-career-advisor-desired-salary-on-job-applications
- Greenhouse 2025 AI in Hiring Report: https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair
- Applying on the employer's site (College Recruiter via University of Washington Career Center, 2026): https://careers.uw.edu/blog/2026/07/02/why-diverse-job-seekers-should-apply-on-the-employers-career-site-and-not-via-easy-apply-buttons-on-job-search-sites/
- Burks, Cowgill, Hoffman & Housman, "The Value of Hiring through Employee Referrals" (QJE 2015): https://experts.umn.edu/en/publications/the-value-of-hiring-through-employee-referrals/
- Referral after applying depends on the employer's setup (Workday is configurable): https://www.froghire.ai/blog/referral-after-applying-can-employee-still-refer-you
- NYC Local Law 144 final rules: https://perkinscoie.com/en/news-insights/nyc-adopts-final-rules-for-law-governing-automated-employment-decision-tools.html
