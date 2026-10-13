# Market pay data: how to get a sourced range

Use this whenever a skill needs "the market range" for a role and place (offer benchmark, salary floor check, the salary question in interview prep, setup's salary question). Never give a number from memory. Every figure you show the user comes from a source you just read (or a dated cache line), with its year and geography.

## 0. Check the cache first

Look in the job folder before fetching: `posting.md` (`pay_range`), `fit.md` and `offer.md` ("Market pay" block). If a block exists for the same title, level and location and was checked in the last 6 months, reuse it and say when it was checked. OEWS updates once a year (new data each spring), so there's rarely a reason to re-fetch sooner.

## 1. Pin down what you're pricing

- **Title → occupation code.** Search O*NET OnLine: `https://www.onetonline.org/find/quick?s=<title words>`. Pick the closest match from the duties, not the title (a "Supply Chain Analyst" might be Logistics Analysts 13-1081.02 or Management Analysts 13-1111). Wage data is published at the 6-digit SOC level (drop the `.0x`). If two codes fit, pull both and say so.
  - O*NET's search ranks by title words, so the first hit is often a higher-paid neighbor. Check duties against the posting. Examples that often go wrong: "Data Analyst" or "Reporting Analyst" usually fits Management Analysts 13-1111, Operations Research Analysts 15-2031 or Market Research Analysts 13-1161 (for marketing data), not Data Scientists 15-2051 (that's for roles that build models, with Python/R and machine learning as core duties); "BI Analyst" or "BI Developer": Business Intelligence Analysts 15-2051.01 sits under Data Scientists, so also pull Computer Systems Analysts 15-1211 or Database Architects 15-1243 if the duties are dashboards, SQL and data models; "Financial Analyst" is 13-2051, "Budget Analyst" 13-2031, "Business Analyst" usually 13-1111.
  - If the only matching code pays clearly more (or less) than the duties suggest, say "closest code is a stretch" in the block, and lean on current postings.
- **Common titles:** for titles with many current postings in the area (analyst, coordinator, specialist, engineer, nurse), current posted ranges for the same title and level are the main source; government data is the context line, not the anchor.
- **Level:** from the posting (years required, title words like I/II/Senior) and the user's `career_stage`.
- **Geography:** the job's metro area; also the state and national figures for context. Remote roles: use the employer's posted range, then the user's metro.

## 2. Sources, in order

### US: government wage data (BLS OEWS)

Percentiles of base wages by occupation and area, from employer surveys. **Limits:** the data is about a year old when published (May 2025 data came out May 2026), it counts straight-time gross pay: base pay plus commissions, production bonuses and tips, but not overtime, year-end or other non-production bonuses, equity or benefits (BLS OEWS FAQ, https://www.bls.gov/oes/oes_ques.htm, read 2026-10-12), and it mixes every experience level in the occupation.

- **Easiest (verified working):** O*NET's local wages page gives the state and every metro in it, with P10 / P25 / median / P75 / P90 annual wages:
  `https://www.onetonline.org/link/localwages/<SOC>.00?st=<state code>` (e.g. `.../localwages/13-1161.00?st=TX`). The occupation's summary page (`https://www.onetonline.org/link/summary/<code>`) shows the national median.
- **Exact figures by API (verified; no key needed):** BLS Public API v1, one series per GET:
  `https://api.bls.gov/publicAPI/v1/timeseries/data/<series id>`
  Series id = `OEU` + area type (`N` national, `S` state, `M` metro) + 7-digit area code + `000000` (all industries) + 6-digit SOC (no dash) + 2-digit data type. Area codes: national `0000000`; state = FIPS + `00000` (Texas `4800000`); metro = `00` + 5-digit CBSA code (Austin-Round Rock-San Marcos `0012420`). Full list: `https://download.bls.gov/pub/time.series/oe/oe.area`. Data types: `11` annual P10, `12` P25, `13` median, `14` P75, `15` P90, `04` annual mean.
  Example: `OEUM001242000000013116113` = median annual wage, Market Research Analysts and Marketing Specialists (SOC 13-1161), Austin metro. The API returns only the latest year. v1 limits: 25 queries a day, so pull only what you need. (v2 needs a registration key; don't use it.)
- **For a person to browse:** `https://www.bls.gov/oes/` → Data Tools / occupation profiles. These pages load with JavaScript and the old static per-occupation pages (`/oes/current/oes<code>.htm`) now redirect, so don't rely on fetching them.

### US: what employers actually pay (strongest signal)

- **The posting's own range.** Many places now require a pay range in postings (as of 2026, including CA, CO, WA, NY, IL, MN, MD, MA, NJ, VT, HI and DC, plus some cities; check the current rules, they change). Treat the posted range as the company's real band for that level.
- **Other current postings** for the same title and level in the same area, with posted ranges (company career sites, public job-board pages; the public Greenhouse / Lever / Ashby feeds listed in `.claude/agents/job-scout.md` often include pay). Note how many you found; 3–5 is enough.
- **H-1B wage filings (employer-specific):** employers must disclose the offered wage for each H-1B role. `https://h1bdata.info/index.php?em=<employer>&job=<title words>&city=<city>&year=<year>` (verified; free, no login) indexes the Department of Labor's LCA disclosure data: employer, job title, base salary, location, dates. The raw DOL files (`https://www.dol.gov/agencies/eta/foreign-labor/performance`, LCA Disclosure Data, quarterly .xlsx) are very large; use h1bdata.info instead. These are base wages for sponsored hires, often skewed to technical roles; a signal for what a specific employer pays a title, not a market range. (The USCIS H-1B Employer Data Hub shows approval counts, not wages.)

### Outside the US

Look up the national statistics office's earnings-by-occupation tables. Two that are easy:
- **UK:** ONS ASHE Table 14 (earnings by 4-digit occupation, with percentiles and regions): search ONS for "ASHE table 14"; published each autumn as a spreadsheet download.
- **Canada:** Job Bank wage pages give low / median / high hourly wages by occupation (NOC) and region: `https://www.jobbank.gc.ca/wagereport/occupation/<id>` (find the id by searching the occupation on jobbank.gc.ca). Convert hourly to annual (× about 2,080 hours) and say you did.
- **Germany:** the Federal Employment Agency's **Entgeltatlas** (https://web.arbeitsagentur.de/entgeltatlas/) gives median gross monthly pay (with quartiles) by occupation (KldB code), region, age group and gender, for full-time employees. Monthly × 12 for an annual figure (say so; many offers add a 13th month or holiday pay, so compare like with like). Tariff (collective agreement) tables apply in many sectors; if the posting names a tariff (e.g. TV-L, IG Metall), read that table instead.
- **EU:** check the country's statistics office. Also: the EU Pay Transparency Directive (2023/970, Article 5) gives applicants the right to the starting pay or its range "in a published job vacancy notice, prior to the job interview or otherwise", and bars employers from asking about pay history. Member states had to make it national law by 7 June 2026; by mid-2026 only a few had fully done so (for example Slovakia, Lithuania, Italy and Malta) and others, such as Ireland and Denmark, announced delays (law-firm trackers, May-June 2026), so check the country's current law. Ask the employer for the range if the posting doesn't give one; where the law is in force they must say before the interview (Directive text: https://eur-lex.europa.eu/eli/dir/2023/970/oj ; transposition status: https://www.littler.com/news-analysis/asap/did-member-states-meet-deadline-status-implementation-eu-pay-transparency ; read 2026-10-12).

### Crowd data (secondary only)

Read only public pages; never sign in, never use a page behind a login or paywall. Always give the number of data points.
- **Levels.fyi** (best for tech and engineering; shows total comp percentiles and data-point counts): `https://www.levels.fyi/t/<role-slug>/locations/<city-area>` (verified public).
- **Indeed salary pages** (average base from Indeed postings, with the count): `https://www.indeed.com/career/<role-slug>/salaries/<City>--<ST>` (verified public).
- **Glassdoor** and **CareerOneStop** block automated reading (403). Skip them, or ask the user to look in their own browser if they want a third opinion.

## 3. Adjust for level (rough rule, say it's rough)

OEWS percentiles mix all experience levels. As a rough guide: entry level / new grad ≈ P10–P25 (closer to median in high-demand fields or expensive metros); early career (2–5 years) ≈ P25–median; mid-level ≈ median–P75; senior or lead ≈ P75–P90. Managers have their own SOC codes; use those instead. Posted ranges for the actual level beat this rule whenever you have them.

## 4. Base vs. total comp

Keep them separate. H-1B filings and most posted ranges are **base**; OEWS is close to base (it also counts commissions and production bonuses), so treat it as base for comparing, except in commission- or tip-heavy work (sales, servers, bartenders), where it runs above base: compare with base-pay postings there instead. Levels.fyi headlines are usually **total comp** (base + bonus + equity). Never compare a total-comp number with a base offer. When the offer has a bonus or equity, compare base to base, then show total separately.

## 5. Write it down (and cache it)

Put this block in the job folder (in `fit.md` when evaluating, in `offer.md` for an offer, in the interview brief when prepping), so it isn't fetched again:

```
## Market pay (checked YYYY-MM-DD)
| Source | Figure | Period | Geography | Link |
|---|---|---|---|---|
| Posting (pay transparency) | $A-$B base | posted YYYY-MM-DD | <city> | <link> |
| BLS OEWS via O*NET, SOC <code> | P25 $… / median $… / P75 $… | May <year> | <metro> | <link> |
| Other postings (N) | $…-$… base | <month year> | <metro> | <links> |
| H-1B filings, <employer> | $…-$… base (N filings) | FY<year> | <city> | <link> |
| Levels.fyi (N data points) | median $… total comp | <date> | <area> | <link> |
Market range for <title, level> in <place>: about $A-$B base. OEWS P25-median for <metro> is $…-$… (May <year>, straight-time pay, no overtime or year-end bonus); posted ranges from N postings: $…-$…. <one line on total comp if relevant>
```

## Rules

- **Always cite and date.** Each figure gets its source, year or period, geography and link. If you couldn't verify a figure, leave it out rather than estimate it.
- **Never present one number as the truth.** Give a range and say which source it leans on. Sources disagree; say so when they do.
- **Say what's missing:** "OEWS is straight-time pay (no overtime, year-end bonus or equity) and about a year old" and "crowd data is self-reported, N data points".
- **Don't over-precise.** Round the synthesis to the nearest thousand (or the local equivalent).
- A posted range or an actual offer outranks any market estimate for that job.
