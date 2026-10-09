# Take-home assignments

Background for `/interview-prep` (and `/evaluate-job` red flags). Researched 2026-10. Labels: **Law** where a statute or regulator says it, **Common practice** for what many employers and hiring advisers describe, **Opinion** for single-author advice. Laws differ by country; look up the job's location before quoting one.

## 1. When one arrives: get the facts first

Before the user starts, make sure these five are known. Read the email or assignment; ask the recruiter only for what's missing (one short message, section 4):
1. **Scope:** what exactly to hand in (a slide deck, a written plan, code, a spreadsheet, a short memo) and how it will be judged.
2. **Time limit:** the employer's expected hours, and whether that's a cap or a guess.
3. **AI rules:** whether AI tools are allowed, and for what. No answer means assume **not allowed** (this workspace's rule: take-home tests are the user alone unless the employer explicitly says AI is allowed; `knowledge/job-search-playbook.md`).
4. **Due date:** and whether a later date is possible if the user is working or has other interviews.
5. **Who owns the work:** whether the employer will use it, and whether the user may keep it in a portfolio.

## 2. Time box

- **Common practice:** many hiring advisers and employers treat about **2-4 hours** as a fair take-home; more than about a day's work deserves scrutiny, payment, or a polite no. Ask a Manager (a long-running hiring-advice column) argues unpaid assignments shouldn't take more than an hour or two. None of this is law.
- Suggest the user set a time box before starting (the employer's stated time, or 3 hours if none is stated), plan the work in the first 15 minutes, and stop at the limit. A short "what I'd do with more time" note at the end shows judgment without unpaid overtime. Spending 20 hours on a 4-hour task rarely helps (common practice).
- Put the work sessions on the user's own calendar only if they say yes (AGENTS.md calendar rules).

## 3. Red flags

Raise these with the user plainly; they decide whether to continue:
- **Looks like real work:** the task is the company's actual backlog, a live client or customer problem, a real campaign, real copy for their site, or "improve our product/process" with their internal data. In the US, if an employer has a candidate do real work that it then uses without paying, that is in most cases a Fair Labor Standards Act problem (Ask a Manager's reading of the FLSA; Opinion, not legal advice). Exercises, simulations and samples are normal.
- **Real data:** customer lists, real financials, patient or personal data. A candidate shouldn't be handed it, and shouldn't handle it.
- **Unpaid multi-day work:** more than about a day of effort, a "challenge" over weeks, or "work for free for two weeks" (seen and criticised on Ask a Manager).
- **Vague spec:** no deliverable, no criteria, no time guide. Clarify before starting.
- **No interview tied to it:** the assignment comes before any conversation with a person, or no review meeting is planned after it. A fair one usually ends in a conversation about the work.
- **Payment or equipment asks:** any request to pay, buy software, or share bank or ID details is a scam signal (`.claude/skills/sync-inbox/references/scam-check.md`).

## 4. Draft: polite scope (and pay) question

Draft into `outbox/` (draft only; the user sends it). Example shape, filled with real names and the real task; no placeholders in the saved file:

> Subject: Question about the <role> exercise
>
> Hi <Name>,
>
> Thanks for sending the exercise. I'm looking forward to it. Before I start, a few quick questions so I aim at the right thing:
> - About how many hours do you expect it to take? I'd planned to keep it to about <N>.
> - Are AI tools allowed for any part of it?
> - Is <date> the firm due date, or is <later date> possible? I'm working full-time this week.
> - Will the work be used beyond the hiring process? If it goes past a few hours, is it paid?
>
> Thanks,
> <First name>

Leave out the pay question unless the task is long or looks like real work; it's fair to ask, but it's the user's call. Run `voice-editor` on it.

## 5. Ownership and the user's copy

- The user keeps their own copy of everything they hand in (in the job folder: `jobs/<folder>/take-home/`).
- Where the work could be reused (a plan, designs, copy, a model), suggest a footer line: "Prepared by <name> as a sample for evaluation in the <role> hiring process only." It doesn't settle ownership legally, but it states the purpose. (Opinion; Ask a Manager readers report employers reusing samples.)
- Don't include confidential material from past employers in the submission (same rule as presentations).

## 6. How the assistant helps (and doesn't)

- **The work must show the user's own skills.** Follow the employer's AI rules exactly. If AI isn't allowed (or the employer hasn't said), the assistant **coaches only**: clarifies the brief, helps plan the time box, explains concepts, reviews the user's approach in general terms, and helps them rehearse presenting it. It does not write, build, solve or rewrite the deliverable.
- If AI is allowed, help only as far as the employer allows, and have the user disclose it in the way the employer asks. Never let the result claim skills the user doesn't have; they'll be asked to explain it live.
- Facts about the user in the submission (experience, results) still come only from the master resume.

## 7. Tracking

When a take-home arrives, re-read `jobs/tracker.csv` and set that job's row: `next_action` = `Take-home due <YYYY-MM-DD>` (the real due date) and `next_action_date` = the day the user should start (by default two days before the due date, or today if it's due sooner). Leave `status` as it is (it's usually `screening` or `interviewing` already; if it's still `applied`, set `screening`). Log one line in `history/activity.md`. After the user submits, set `next_action` = `Wait for decision` (or `Interview <date>` if a review meeting is booked) with a follow-up date per the playbook.

## Sources

- Ask a Manager, "should you do free work as part of a job interview?" (2017; FLSA point, samples vs real work): https://www.askamanager.org/2017/04/should-you-do-free-work-as-part-of-a-job-interview.html
- Ask a Manager, "are we asking for too much work from job candidates?" (2022; time expectations): https://www.askamanager.org/2022/08/are-we-asking-for-too-much-work-from-job-candidates.html
- Ask a Manager, "an employer 'challenged' me and other applicants to work for free for 2 weeks" (2022): https://www.askamanager.org/2022/09/company-challenges-applicants-to-work-for-free-for-2-weeks.html
- Ask a Manager, "employer stole the work sample I created for an interview" (2017): https://www.askamanager.org/2017/09/employer-stole-the-work-sample-i-created-for-an-interview-coworker-uses-an-offensive-word-and-more.html
- Career-site guidance on fair scope (2-4 hours, time box; common practice, not research): https://blog.loopcv.pro/take-home-assignment-interview/ ; https://www.finalroundai.com/glossary/take-home-assignment
- CNBC on unpaid interview assignments (2018): https://www.cnbc.com/2018/05/24/if-youre-hunting-for-a-job-expect-to-do-this-for-free.html
