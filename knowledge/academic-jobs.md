# The academic job market

Shared background for `find-jobs`, `add-job`, `evaluate-job`, `tailor-resume`, `cover-letter`, `interview-prep`, `network` and `offer` when the user is applying for faculty, lecturer, postdoc, research scientist or teaching jobs at universities and research institutes. Load it only then. Checked 2026-10-13; sources at the end. Norms differ by discipline and country: when in doubt, the posting and the user's advisor or department win over this file.

## 1. CV, not resume

- An academic CV has **no page limit** and lists everything relevant, in reverse-chronological order within sections. A common order: contact, education (with postdocs), dissertation, honors and awards, teaching experience, publications, presentations, grants, service, professional affiliations, languages, references. Only contact and education reliably lead; the rest is reordered to fit the job (teaching first for a teaching-focused college, research first for a research university). Keep two or three versions (Berkeley Career Center).
- Every entry comes from `profile/master-resume.md`; publications need full citations exactly as published (authors in order, the user's name as printed, "under review" or "in preparation" stated honestly, never upgraded).
- Use the academic CV layout if one is present in the templates (`profile/templates/` or `templates/`); otherwise the resume template with the stage norms in `.claude/skills/tailor-resume/references/tailoring-and-formats.md` §2, without the one-page limit. Industry jobs for PhDs still get a resume, not a CV.
- **US federal jobs** are different again: USAJOBS resumes are capped at two pages since 27 September 2025, and a position that needs a CV says so as an "other document" (`tailoring-and-formats.md` §6).

## 2. The application packet (send exactly what the posting asks for)

- **Cover letter:** commonly up to two pages in the US (one page for some STEM research jobs); names the position, the research program in brief, teaching fit, and why this department. If the posting asks only for a letter and CV, the letter carries short research and teaching paragraphs (UCLA, UChicago career guides).
- **Research statement:** past, current and future research; often about two pages in humanities and social sciences, longer in STEM (UChicago guide gives 3-10).
- **Teaching statement / teaching philosophy:** one to two pages, concrete (courses taught, a method that worked, evidence such as evaluations), not abstract.
- **Diversity or community statement:** see section 3.
- **Also common:** writing sample, teaching evaluations, sample syllabi, transcripts, a list of references or the letters themselves.
- These documents are first-person and factual: every claim traces to the master resume or the user's own words, `truth-checker` and `voice-editor` run on each, and nothing is written in the user's name that they haven't confirmed. Keep them in the job folder (`research-statement.md`, `teaching-statement.md`); for the next job, start from the most recent checked version in another job folder and tailor it.

## 3. Diversity statements: check the posting and the place

Requirements have changed quickly; follow each posting's exact wording and never add a statement nobody asked for.
- **Stopped requiring them:** MIT (announced May 2024); the University of California system (provost's letter of 20 March 2025; candidates may still describe such work).
- **State laws restricting them at public universities** (per the ASHA state tracker, no last-updated date shown, checked 2026-10-13): Texas SB 17 (2023), North Carolina SB 364 (2023), Idaho SB 1274 (2024), Indiana SB 202 (2024), Kansas HB 2105 (2024), Arkansas HB 1512 (2025), Kentucky HB 4 (2025), Mississippi HB 1193 (2025), Ohio SB 1 (2025), Oklahoma SB 796 (2025), West Virginia SB 474 (2025). Reports of others (Alabama, Florida, Utah, Missouri) weren't confirmed against primary sources here.
- **US federal:** Executive Order 14173 (21 January 2025) added anti-discrimination certifications to federal grants and contracts; an appeals court lifted an injunction against those orders in February 2026 (law-firm reports), and the situation is still moving. Don't explain it to the user beyond "rules are in flux; follow what each posting asks".
- Where a posting asks for one, write it from the user's real actions (mentoring, access, outreach, teaching practice), in their words, never invented. Where it's restricted or not requested, relevant work can go in the teaching statement or letter if the user wants.

## 4. Timing (US tenure-track; fields differ)

- Most postings appear late summer through fall, with deadlines October to December; first-round interviews (often video, or at a conference) late fall to January; campus visits January to March; offers in spring. Postdocs and lecturer jobs run year-round.
- **Economics** runs a fixed calendar: listings in the AEA's JOE (published monthly August to December), signals, first-round interviews in early January, then flyouts (check the AEA's current year's guidance). Other fields with society job boards: MLA (languages and literature), AHA (history), APS (physics) and others; check the user's society for its timeline.
- **Market conditions:** postings fell in several humanities fields recently (AHA reported tenure-line history ads for 2024-25 down 20%, to 213, in May 2026), while US federal research-funding cuts led some universities to pause or slow faculty searches from 2025. Apply widely within the user's real constraints and keep a non-academic option in view if they want one.
- Track each job's own deadline in the tracker; academic deadlines are firm, and "review begins" dates mean apply before that date.

## 5. Postdocs

- Two routes, used together: advertised openings (lab websites, society boards, EURAXESS in Europe, jobs.ac.uk in the UK) and a direct, specific email to the PI: subject naming the position, why this lab (one concrete paper or method), the user's fit in two lines, CV attached, a follow-up after one to two weeks of silence (UCSF, UChicago guides). `/network` drafts it into the Outbox; the user attaches the CV in Gmail.
- Before accepting, suggest talking to current lab members without the PI about mentoring, funding and authorship.
- **Fellowships** (e.g. NIH F32, NSF postdoctoral fellowships) have their own eligibility and deadlines; some NIH institutes accept F32s only before or soon after joining a lab. Check the current notice.
- **US NIH NRSA stipends** (often used as a benchmark): postdoc $63,480 at 0 years of experience to $77,076 at 7+ years, for awards made on or after 1 October 2025 (NIH notice NOT-OD-26-044, 18 March 2026; a newer notice may exist, so check the NIH Guide).

## 6. Letters of recommendation

- Usually three letters (common norm; the posting says how many and how). Ask each writer four to six weeks ahead, earlier in the busy fall season, and before postings appear if possible.
- Give each writer: the CV, the posting or a list of jobs with deadlines, the research statement, and two or three things the user hopes they can speak to. One reminder about a week or two before a deadline is normal.
- Letters often go through a confidential service (Interfolio Dossier, or the university's own system) or are requested by the employer only for a shortlist. Check each posting.
- Track writers in `profile/references.md` (with their permission) and the reminder dates as `Follow up` steps in the tracker or contacts; draft thank-yous after the season.

## 7. UK and Europe

- UK lectureships are applied for on the university's own form (often via jobs.ac.uk) with a CV and a **supporting statement** that addresses each criterion in the **person specification** in order, essentials first, with an example for each.
- Interview days usually include a presentation (often a short teaching or research talk to the department) and a panel interview on teaching, research plans, funding and what the user would contribute. Ask for the format and timing in advance.
- In Europe, EURAXESS (EU-backed) lists research and postdoc jobs; country conventions for CVs are in `.claude/skills/cover-letter/references/languages-and-countries.md`.

## 8. Offers

Start-up package (equipment, research funds, summer salary), teaching load and course releases, tenure clock, spousal or partner hiring, moving costs and start date can often be discussed; base salary sometimes less so at public institutions (published salary scales). Use `/offer`; public universities' salaries are often public records, which is sourced market data.

## Sources

- UC Berkeley Career Center, academic CV elements and order: https://career.berkeley.edu/grad-students-postdocs/academic-job-search/the-cv-part-2-elements/
- UCLA Career Center, academic cover letter (up to two pages): https://career.ucla.edu/resources/academic-cover-letter-for-phd-students/ ; diversity statements: https://career.ucla.edu/resources/diversity-statements/
- UChicago Career Advancement, job documents and lengths: https://grad.uchicago.edu/career-development/job-resources/
- MIT ends diversity statements (WBUR, 2024-05-07): https://www.wbur.org/news/2024/05/07/massachusetts-institute-technology-diversity-statements
- UC system ends diversity statement requirement (EdSource, 2025-03-20): https://edsource.org/2025/university-of-california-to-no-longer-require-diversity-statements-in-faculty-hiring/728778
- ASHA, states with restrictions on DEI in higher education: https://www.asha.org/advocacy/state/states-with-restrictions-on-diversity-equity-and-inclusion-concepts-in-higher-education/
- Texas SB 17 bill analysis: https://capitol.texas.gov/tlodocs/88R/analysis/pdf/SB00017H.pdf
- Fourth Circuit and the DEI executive orders (law-firm alert, February 2026): https://www.saul.com/insights/alert/fourth-circuit-lifts-injunction-dei-executive-orders
- AEA job market guidance (example year): https://www.aeaweb.org/news/member-announcements-2022-july-01
- AHA, 2025 academic jobs report (May 2026): https://www.historians.org/perspectives-article/the-2025-academic-jobs-report/
- UCSF, applying for a postdoc: https://career.ucsf.edu/how-do-i-apply-postdoc ; UChicago, finding a postdoc lab: https://grad.uchicago.edu/finding-postdoc-lab-guide
- NIH, NRSA stipend levels FY2026 (NOT-OD-26-044): https://www.grants.nih.gov/grants/guide/notice-files/NOT-OD-26-044.html ; NINDS F32 timing: https://www.ninds.nih.gov/funding/training-career-development/choose-award-career-stage-eligibility/predoctoral-fellows/applying-ninds-f32
- Inside Higher Ed, letters of recommendation: https://www.insidehighered.com/blogs/gradhacker/dos-and-donts-academic-job-search-letters-recommendation
- Nottingham careers, academic applications and supporting statements: https://nottingham.ac.uk/careers/postgraduate-researchers/applying-for-an-academic-job/index.aspx ; Cambridge, teaching presentations: https://www.careers.cam.ac.uk/files/teaching_presentation_tips.pdf ; Edinburgh, academic interviews: https://careers.ed.ac.uk/phd-and-mres-students/make-it-happen/prepare-for-an-academic-interview
- EURAXESS jobs: https://euraxess.ec.europa.eu/jobs
- OPM, two-page resume limit for USAJOBS: https://www.opm.gov/policy-data-oversight/hiring-information/merit-hiring-plan-resources/agency-guidance-on-the-two-page-limit-on-resume-length
