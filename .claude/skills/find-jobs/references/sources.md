# Where to look, and how to tell a fresh posting from a stale one

Used by `/find-jobs` and the `job-scout` agent. Researched 2026-10; endpoints change, so if one fails, fall back to the careers page and say so in the coverage line. Everything here is read-only and needs no login or key.

## 1. Employer job-board feeds (best source: the employer's own data)

Find the token in the careers-page link (the part after the board's domain), or in that company's Notes in `knowledge/field/target-employers.md`.

| System | How to spot it | Read-only feed | Date field to trust |
|---|---|---|---|
| Greenhouse | `boards.greenhouse.io/<token>` or `job-boards.greenhouse.io/<token>` | `https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true` | `updated_at` is the last edit, **not** the posting date. For one job, `.../jobs/<id>` gives `first_published` (add `?pay_transparency=true` for posted pay ranges). |
| Lever | `jobs.lever.co/<company>` (EU: `jobs.eu.lever.co`) | `https://api.lever.co/v0/postings/<company>?mode=json` (EU: `api.eu.lever.co`) | `createdAt` (milliseconds since 1970) |
| Ashby | `jobs.ashbyhq.com/<org>` | `https://api.ashbyhq.com/posting-api/job-board/<org>?includeCompensation=true` | `publishedAt` |
| Workable | `apply.workable.com/<slug>` or `<slug>.workable.com` | `https://apply.workable.com/api/v1/widget/accounts/<slug>` | `published_on` |
| SmartRecruiters | `jobs.smartrecruiters.com/<CompanyId>` | `https://api.smartrecruiters.com/v1/companies/<CompanyId>/postings` (some employers have it switched off: an empty list may mean "off", not "no jobs"; then read the careers page) | the release/publish date field; not checked live |
| Recruitee | `<company>.recruitee.com` | `https://<company>.recruitee.com/api/offers/` | the publish date field, not the update date; not checked live |
| Workday, iCIMS, Taleo, SuccessFactors | `myworkdayjobs.com`, `icims.com`, etc. | none public; read the careers page itself, a page at a time | the page's "Posted" line |

One request per company per search is plenty. Never page through feeds of companies the user didn't ask about.

## 2. Finding openings at companies not on the list

- **Search-engine queries on the systems above** turn up small and mid-size employers that never post on big boards. Pattern: `site:job-boards.greenhouse.io OR site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com "<target title>" "<city or Remote>"`. Add `-senior -lead -principal` (or the reverse) to match the level. Search-engine results lag and include closed postings, so open each one before listing it.
- **Google's job listings** (searching "<title> jobs <city>" in Google) pull from employers' pages that publish structured job data; the scout can't use that panel directly, but the user can, and it's a good tip for daily checking.
- **Government jobs:** read the public search pages rather than the APIs. US federal: usajobs.gov (the USAJOBS API needs a key the user would have to request; don't). US state and local: the state's own careers site, or governmentjobs.com. UK: civilservicejobs.service.gov.uk. Canada: jobbank.gc.ca and the GC Jobs site. Australia: apsjobs.gov.au. EU institutions and cross-border: EURES (eures.europa.eu). Government postings often close early or at an applicant cap; record the closing date.
- **"Who is hiring?" threads:** Hacker News posts one on the first weekday of each month (tech and startups, posts written by people at the company; many give an email or a named contact). Find the latest with `https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring` and read the thread page. Only useful for fields that hire there; treat every post as a lead to check on the company's own site.
- **Academic jobs:** HigherEdJobs, The Chronicle of Higher Education's jobs board, Inside Higher Ed Careers and HERC (US), the user's disciplinary society (e.g. the AEA's JOE for economics), jobs.ac.uk (UK) and EURAXESS (Europe), plus department and lab pages for postdocs (university career-center board lists, e.g. https://postdocs.yale.edu/node/153 and https://careerhub.umt.edu/resources/academia-higher-ed-job-boards/, checked 2026-10-13). Timing and documents: `knowledge/academic-jobs.md`.
- **Hourly and shift jobs:** the employer's own careers page or app (big retailers, warehouses and hospitals hire mostly through their own sites), general boards (Indeed, Snagajob), local job centers and hiring events. Search by place and schedule ("part-time weekend", "overnight") rather than title alone. `knowledge/hourly-and-shift-work.md`.
- **Contract and freelance:** staffing agencies that place the user's field, contract filters on general boards, and freelance platforms the user already uses; note `staffing agency` or `contract` in concerns. `knowledge/freelance-and-contract.md`.
- **Field and regional boards:** professional associations, university and alumni boards, and sector boards beat general boards for most specialist fields. Look up which ones the user's field uses (the field pack in `knowledge/` may list them) rather than guessing.

## 3. Duplicates and staleness

- **The same job appears many times.** Aggregators and staffing agencies copy employer postings, and when a board listing expires, employers often post it again at a new URL. Before calling something new, compare against the employer's own posting (company + job ID first, then company + title + location).
- **Aggregator dates are often re-post or crawl dates,** not when the employer first posted (JobSpy's documentation notes Indeed filters on when a job was added to Indeed, not when the employer published it). Prefer the employer feed's date; otherwise, write the date as the page shows it and the source.
- **Live check:** open the employer's page. A redirect to the careers home page, "no longer accepting applications", a 404, or a past `validThrough` date in the page's job data means closed. Don't list it.
- **Old is not the same as fake.** A posting over 30 days old on a big employer's system can be an always-open role. Note the age; judge it with the "Real?" signals in `.claude/skills/evaluate-job/references/reading-postings.md`.

## 4. Cadence

- Applications reviewed early get a better look: experiments on a large job platform found applications drop off after the first few days a posting is up (Fradkin, BU 2025), and recruiters stop reviewing once they have enough good candidates. So a short, frequent search beats a long, rare one: two or three times a week for most users, daily in the weeks a program or season opens (campus recruiting, graduate schemes, government intake windows).
- Job-board email alerts set up by the user (Indeed, their university board, government boards) are a fine complement: they can paste alert links into `/add-job`.

## Rejected (and why)

- **Scraping libraries that hit LinkedIn, Glassdoor or Indeed at volume** (e.g. JobSpy): their own docs warn of rate-limit blocks and recommend rotating proxies; LinkedIn's terms ban it and accounts get restricted.
- **Paid scraper marketplaces and job-data APIs that need keys:** cost and sign-up the user didn't ask for.
- **Auto-apply tools:** they produce the generic, high-volume applications this workspace is designed to avoid.

## Sources

- Greenhouse Job Board API (fields `updated_at`, `first_published`, `pay_transparency`): https://docs.greenhouse.io/job-board.html
- SmartRecruiters public Posting API (no auth for public data): https://developers.smartrecruiters.com/docs/customer-overview
- Recruitee Careers Site API ("does not require authorization"): https://docs.recruitee.com/reference/offers
- Workable widget endpoint (checked live 2026-10-06; returns `published_on`): https://apply.workable.com/api/v1/widget/accounts/huggingface
- Ashby posting API (checked live 2026-10-06; returns `publishedAt`): https://api.ashbyhq.com/posting-api/job-board/ashby
- Lever postings API fields: https://dev.to/zsevic/integration-with-lever-public-jobs-api-2mnn
- USAJOBS API requires an Authorization-Key header: https://developer.usajobs.gov/general/quick-start
- Google JobPosting structured data (`datePosted`, `validThrough`, how expired jobs are removed): https://developers.google.com/search/docs/appearance/structured-data/job-posting
- JobSpy README (rate limits, proxies, Indeed date caveat): https://github.com/speedyapply/JobSpy
- Repost patterns on Indeed (same job reappearing at new URLs; JobsPipe, a job-data vendor, own data, thin method): https://jobspipe.dev/blog/indeed-ghost-jobs
- career-ops (open-source Claude Code job search): scans ATS feeds, optional live check to drop expired postings: https://github.com/santifer/career-ops
- Fradkin, applying early: https://www.bu.edu/articles/2025/looking-for-jobs-on-indeed-or-linkedin
- Hacker News "Who is hiring?" via the Algolia HN API: https://hn.algolia.com/api
