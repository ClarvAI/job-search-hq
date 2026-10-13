# Recruiters, agencies and executive search firms (headhunters)

For `/network`, `/find-jobs`, `/sync-inbox` and `/evaluate-job` when a recruiter contacts the user or the user wants to reach search firms. Mostly relevant to mid-career, senior and specialist users. Checked 2026-10-13; sources at the end. Fee figures below come from search firms themselves (self-interested) and are background only, never something to tell an employer.

## 1. Who's who

| Kind | Works for | Paid how | What it means for the user |
|---|---|---|---|
| **In-house recruiter** (talent acquisition) | The employer | Salary | The usual contact for a posted job. |
| **Contingency agency recruiter** | The employer (the client) | Only if someone they put forward is hired; firms describe roughly 20-30% of first-year pay | Often non-exclusive: several agencies may chase the same role, so speed and volume matter to them. Common for mid-level and specialist roles. |
| **Retained executive search firm** | The employer | A fee paid in stages whether or not they fill the role; firms describe roughly a third of first-year pay | Exclusive, slower, thorough. Senior and executive roles, often never posted publicly. They approach people; they rarely place people who simply send a CV, but a good note can put the user in their database for the right search. |
| **Staffing agency** (temp, contract) | Employs the user, bills the client | Markup on the user's hourly rate | See `knowledge/freelance-and-contract.md`. |

**The user never pays.** Honest recruiters and placement firms are paid by the employer (FTC). A fee, a "registration charge", paid resume rewriting as a condition of being put forward, or "career marketing" packages sold as headhunting are red flags (playbook, "Scam red flags"). In the UK, agencies generally may not charge work-seekers fees for finding them work (Employment Agencies Act 1973, section 6), with narrow exceptions (`knowledge/freelance-and-contract.md` §3). AESC, the executive search trade body, warns that fake recruiters are on the rise: verify the person and the firm before sharing anything.

## 2. Verifying a recruiter

The firm has a real website listing this person; the email comes from the firm's domain (letter by letter, `.claude/skills/sync-inbox/references/scam-check.md`); they can name the client, or at least the industry and level, before asking for the resume; no money, no ID numbers, no move to WhatsApp or Telegram.

## 3. Working with them

- **Ask before the resume goes anywhere:** "Which company is this, and may I see the description before you share my resume?" Keep a record in `contacts/contacts.csv` (`relationship: recruiter`, firm in `company`, the client and role in `notes`) so two recruiters never submit the user to the same employer. If the user already applied or has a contact there, say so: recruiters commonly warn that a duplicate submission can start a fee dispute that makes the employer drop the candidate.
- **Pay:** recruiters ask for "expectations". The user can give a researched range (`/offer`'s pay data) or ask the range first; never their private floor. Where salary-history questions are banned, they never have to share past pay (`interview-prep`, salary question).
- **Be honest and quick:** recruiters prioritize candidates who reply, show up and say no clearly. A short "not for me, but I'd be interested in X" keeps the door open.
- **Exclusivity:** the user shouldn't sign anything that stops them applying directly or through others, unless they understand it.
- **Searching while employed:** a recruiter is a discreet route, but tell them the current employer doesn't know and must not be contacted (`knowledge/searching-while-employed.md`).

## 4. Reaching out to search firms (senior users)

- Pick two or three firms or individual recruiters who actually place people in the user's function, level and region (their site lists recent placements or practice areas). Don't mass-mail firms.
- A short note (under 150 words) by email, from `/network` into the Outbox: target role and level, function and industry, location, one or two results with numbers from the master resume, timing, and the resume attached (its checked PDF named in the draft's `attach:` header; the Gmail draft carries it, or the user attaches it in Gmail). No "I'm open to anything".
- Expect silence unless a search matches; that's normal. Keep the profile current (LinkedIn headline and About), because search firms find people more than people find them.
- After a placement process (hired or not), a thank-you keeps the relationship for the next search.

## 5. In the tracker

A role a recruiter puts the user forward for is a tracker row like any other: `company` = the client (or `<Firm> (client unknown)` until named), `source` = the firm, `contact` = the recruiter. `applied` only once the user agrees and the recruiter confirms they submitted; the date is the submission date.

## Sources

- FTC, job scams ("Honest placement firms do not typically charge a fee to job candidates"): https://consumer.ftc.gov/articles/job-scams
- UK Conduct of Employment Agencies and Employment Businesses Regulations 2003, regulation 26 (exceptions to the work-seeker fee ban): https://www.legislation.gov.uk/uksi/2003/3319/regulation/26
- AESC (Association of Executive Search and Leadership Consultants), recruitment-scam warning, checked 2026-10-13: https://aesc.org/
- Retained vs contingency, how fees work (search-firm blogs; self-interested): https://talentfoot.com/retained-vs-contingency-vs-engaged-executive-search/ ; https://cowenpartners.com/the-two-types-of-executive-search-firms-fees/
