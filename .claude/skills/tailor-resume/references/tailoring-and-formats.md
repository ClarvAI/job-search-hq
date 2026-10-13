# Tailoring that helps, formats by stage, and what breaks parsing

Background for `/tailor-resume`. Researched 2026-10. Evidence is labeled; most resume advice is opinion from recruiters, career centers and vendors, so say "recruiters commonly advise", not "studies show", unless a study is cited. For the first skim, bullet shape, numbers, length by country and ATS myths, see `.claude/skills/resume-review/references/what-recruiters-check.md` (don't repeat it here).

## 1. Tailoring that moves the needle

- **Mirror the posting's words, only where true.** Recruiters search their systems by title and keyword, so the posting's exact term (its tool name, "supplier corrective action" rather than "vendor fixes") helps the resume surface. Repeating a term doesn't add anything; a person reads it next. Vendor figures for this (for example Jobscan's job-title multipliers, quoted as 3.5x or 10.6x in different places) have no published method; don't quote them.
- **Job titles:** always the user's real past title (background checks verify it), even when the posting uses another name for the same work. The posting's wording goes in the summary or a bullet, where true.
- **Order by relevance:** within each role, the bullet that matches the posting's first two or three duties goes first. Those duties are what the job is mostly about (`.claude/skills/evaluate-job/references/reading-postings.md`).
- **Skills section:** short labeled lines (e.g. "Tools:", "Methods:", "Languages:"), posting matches first, no rating bars or "proficiency" levels. Each key skill the posting asks for should also appear in a bullet that shows it used; a bare list is weak evidence. Soft skills ("communication", "teamwork") don't belong in the list; show them in bullets.
- **Summary, by stage** (opinion; career centers disagree):
  - Student or new grad: usually skip. Use one line only if the experiences don't obviously point at the target role (e.g. a biology major applying to supply chain).
  - Career changer or returning: yes, one or two lines that name the target role and the bridge ("Operations coordinator moving into quality: 3 years running ISO 9001 audits").
  - Experienced or senior: yes, two or three lines with level, domain and one result.
  - Never an objective ("Seeking a challenging role...").
- **No number available:** use scale, frequency, before/after or who used the result (see `what-recruiters-check.md`). If the user offers an estimate, use it only if they confirm they could defend it in an interview, and write it as approximate ("about 40 orders a day"). Never estimate for them.

## 2. Format by career stage

| Stage | Order | Notes |
|---|---|---|
| Student / new grad | Education first, then Experience (internships, co-ops, part-time), Projects, Skills | Expected graduation as "Expected May 2027". GPA only if the field expects it or it's strong (commonly 3.0+ in the US, but check the posting). Relevant coursework only if it fills a gap the posting names. |
| Career changer | Summary, Experience (reverse-chronological), then Projects / Training that bridge | A **hybrid** layout (short skills summary on top of a normal work history) beats a pure skills-based "functional" resume; recruiters widely say functional resumes look like they're hiding something (opinion, consistent across recruiter sources). Re-word past bullets toward transferable results, never toward duties the user didn't do. |
| Returning after a break | Normal reverse-chronological; the break as its own one-line entry | Example: "Career break: full-time caregiving, 2022-2024" plus any courses or volunteer work from that time. Evidence: in a 3,771-resume field experiment, applicants who explained a 7+ month gap (illness, explained in the cover letter) got more callbacks than identical applicants who didn't explain it, though still fewer than people with no gap (Blankenau, Namingit & Schwab, Kansas State); a vendor experiment (ResumeGo) found a similar direction. Employers' systems may also filter on unexplained gaps (HBS *Hidden Workers*). The user decides how much reason to give; one plain line is enough. |
| Experienced / senior | Summary, Experience, Education at the end | Two pages is normal in the US with roughly 10+ years. Detail the last 10-15 years; older roles in a short "Earlier experience" list. Dropping old graduation years is common advice to limit age bias; a 40,000-application field experiment found age discrimination in callbacks, strongest for older women (Neumark, Burn & Button 2019). |
| Academic, medical, legal | Their own formats | An academic or medical CV has different rules; look them up rather than forcing one page. |
| US federal (USAJOBS) | Contact, Experience, Education, optional details | **Two pages maximum** since 27 Sep 2025 (§6). The old long-form federal resume is no longer accepted. |

## 3. What actually breaks parsing

Applicant tracking systems (Workday, Greenhouse, iCIMS, Taleo and others) pull text out of the file to fill the candidate record and the search index. When that fails, the recruiter sees garbled fields, and the user may have to retype everything. Common failures (recruiter and vendor testing, consistent across sources; no system publishes its parser):
- **Two columns or sidebars:** text read straight across both columns, so a skills sidebar interleaves with job history. (The optional designed resume's `sidebar` layout is the one exception here: it puts a short sidebar first in the file, its PDF text reads sidebar then main column, `make-pdf.sh` checks that, and it is never the version uploaded to a form.)
- **Headers and footers:** contact details placed in a Word header/footer are often skipped. Keep the name and contact in the body.
- **Text boxes, tables, icons, images, charts, skill bars:** dropped or scrambled. A phone icon instead of the word or a plain number can lose the phone number.
- **Scanned or image PDFs:** no text layer at all. Our PDFs are printed from HTML, so they have one; `make-pdf` checks it (`parse:`).
- **Odd headings:** "Where I've been" instead of "Experience". Use standard headings.
- **Dates in mixed formats:** keep one format ("Jun 2024 - Dec 2024").
- **Self-test:** OpenResume's free parser (open-resume.com/resume-parser) shows what a basic parser pulls out; at minimum the name and email should come through. It is built for single-column English resumes.

## 4. PDF or Word?

- **PDF** by default: it looks the same everywhere and modern systems read text PDFs well.
- **Word (.docx)** when the posting or upload field asks for it, when a staffing agency or recruiter asks (they often edit it to put their own letterhead on it), or for some older systems that say "Word preferred". Offer one through a docx skill if available; it must have the same checked text. Remind the user that an editable copy can be changed by whoever holds it, so send it only to the employer or a recruiter they trust.

## 5. Employer AI screening

- What's measured: Greenhouse's 2025 survey of about 4,100 job seekers and hiring staff in the US, UK, Ireland and Germany found 41% of US job seekers said they had tried hidden prompt text and 61% of US hiring managers use software to detect AI use. ManpowerGroup told the New York Times it finds hidden text in about 10% of resumes it scans. Recruiters say they reject it. Hence the "Nothing hidden" rule.
- Many systems now summarize or rank applications with AI. What helps is the same as for a human: the posting's real terms, clear titles and dates, results stated plainly. There is no trick that beats it reliably.
- In New York City, employers using an automated tool to screen candidates must give NYC-resident candidates notice (at least 10 business days before use) and let them ask for an alternative process or accommodation (Local Law 144). The employer doesn't have to grant it.

## 6. US federal resumes (USAJOBS)

**Rule (OPM, "Agency Guidance on the Two-Page Limit on Resume Length"):** the Merit Hiring Plan (May 2025) ended the long-form federal resume. Starting **27 September 2025**, USAJOBS restricts all resumes to two pages: stored profile resumes, uploads and resume-builder resumes. It applies to all Title 5 competitive and excepted service announcements. If the only resume an applicant sends is longer than two pages, they are ineligible. Older advice to write a 4-6 page federal resume is out of date; don't follow it.
- **Exceptions:** non-Title 5, judicial and legislative branch agencies may allow longer resumes, but only if the announcement says how (an "other documents" upload). Positions needing a CV (often medical or research) may ask for it as an "other document". Follow the announcement's "How to Apply" and "Required Documents" sections exactly.
- **What OPM tells applicants to include,** within the two pages:
  - Contact: name, email, phone.
  - For each relevant job: job title and employer; **series and grade** for any federal position (e.g. "GS-0343-09"); **start and end dates with month and year** (e.g. "05/2019 - 08/2022"); **hours worked per week** (e.g. "40 hours/week"). Descriptions that match the announcement and show each required qualification at the stated level.
  - Education, certifications or licences when relevant or required: school, completion date, degree type, cumulative GPA; any required transcripts as documents.
  - Optional where relevant: security clearance, job-related training, language skills, organisations, publications, eligibility for special hiring programs (e.g. veterans, military spouses, people with disabilities). Clearance and eligibility only as the user states them; never guess.
- **Formatting OPM passes on through the USAJOBS Help Center** (recommendations, not rules): PDF preferred to keep page count, 5 MB or less; a sans-serif font such as Lato, Calibri, Arial or Helvetica; 0.5-inch margins; about 14 pt titles and 10 pt body text. Our template (Letter, text PDF) is fine as it is; to fit two pages, cut content rather than shrinking the type below the template's size, and run the page check.
- **Hints from OPM:** prioritise the most relevant and recent experience, use concise result-focused language, and align wording with the announcement. Keep it two pages even if the user has many years of experience: older roles go in one line each.

## Sources

- US Office of Personnel Management, "Agency Guidance on the Two-Page Limit on Resume Length" (checked 2026-10): https://www.opm.gov/policy-data-oversight/hiring-information/merit-hiring-plan-resources/agency-guidance-on-the-two-page-limit-on-resume-length
- IRS jobs, guidance for applicants on the 2-page resume (agency example): https://jobs.irs.gov/sites/default/files/2025-12/guidance-for-applicants-on-2-page-resume%20(1).pdf
- Greenhouse 2025 AI in Hiring Report (Nov 2025): https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair
- Hidden prompts, ManpowerGroup ~10%: https://builtin.com/articles/hidden-ai-prompts-in-resume
- Explained vs unexplained gap ("Sick and Tell", Blankenau, Namingit & Schwab; 3,771 resumes, 2016; registry entry, results summarized there): https://www.socialscienceregistry.org/trials/2117
- Harvard Business School, *Hidden Workers* (gap filters): https://www.hrdive.com/news/report-applicant-tracking-systems-may-exclude-whole-segments-of-candidates/606614/
- Neumark, Burn & Button, "Is It Harder for Older Workers to Find Jobs?" (JPE 2019): https://www.nber.org/papers/w21669
- Functional vs hybrid resumes (recruiter opinion): https://www.jobscan.co/blog/recruiters-functional-resume-format/
- Parsing failures by system (vendor testing; directional): https://www.techinterview.org/post/3233474603/ats-friendly-resume-formatting-engineers/
- OpenResume parser (single-column English resumes): https://www.open-resume.com/resume-parser
- Why agencies ask for Word (forum thread; anecdote): https://quantnet.com/threads/recruitment-agencies-asking-for-resume-in-word-format.8359/
- NYC Local Law 144 rules: https://perkinscoie.com/en/news-insights/nyc-adopts-final-rules-for-law-governing-automated-employment-decision-tools.html
- career-ops (open-source job search system): "reformulates your CV; it must never fabricate it", fact-check gate before PDF: https://github.com/santifer/career-ops
