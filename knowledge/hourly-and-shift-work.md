# Hourly, shift and part-time jobs

Shared background for `find-jobs`, `add-job`, `evaluate-job`, `tailor-resume`, `apply` and `offer` when the job is paid by the hour, works in shifts, or is part-time: stores, warehouses, restaurants and hotels, call centers, delivery, care and healthcare aides, security, seasonal work. Load it only for those jobs. Checked 2026-10-13; sources at the end. Laws change: check the official page before quoting a rule, and name the country or city it applies to.

## 1. How these hires work

- **Fast and local.** Many employers hire hourly staff within days, sometimes at an open-hiring day or on the spot. Speed matters more than polish: apply within a day or two of a posting, and follow up by phone or in person if the posting allows it. (No current independent data on hiring speed was found; this is common practice, not a measured figure.)
- **Availability decides a lot.** Forms ask which days and hours the user can work, as a grid. Wider availability usually gets more callbacks; never promise hours the user can't keep.
- **Quick apply is normal here.** One-click and text-to-apply routes (Indeed, Snagajob, the employer's mobile form) are fine for hourly roles; a tailored resume still helps but doesn't need a cover letter unless asked. The usual ground rule still applies: no mass-applying, and each application is one the user would take.
- **Short assessments** (situational questions, a basic skills or personality quiz) are common. Answer honestly; consistent answers matter more than guessing the "right" profile. No AI help unless the employer says it's allowed.
- **Certifications are knockouts**: a food handler card, CNA or HHA certificate, forklift certification, security license, driver's license with a clean record, CPR/First Aid, a background check for care work. Check which ones the job and place require (they vary by state and country).

## 2. Availability in `profile/preferences.md`

When the user targets hourly or shift work, ask once (one question at a time) and save under "What you want", with their yes:
- `- Availability: <days and hours, e.g. "Mon-Fri after 3pm, weekends any time">`
- `- Hours wanted: <e.g. "20-30 a week" or "full-time">`
- `- Shifts: <e.g. "no overnights", "open to nights">` (the deal-breakers line already covers "night or weekend shifts")
- `- Travel to work: <e.g. "bus only, within 30 minutes">`

These feed the availability grid answers in `application-answers.md` (which the Apply Kit shows with the job's other questions) and `evaluate-job`'s fit check.

## 3. Pay as an hourly rate

- Record the posted rate exactly as written in `pay_range` (`$18.50-$21.00/hour`) and the tracker's `salary_range`. Keep the floor for hourly work as an hourly figure (`- Salary floor: US: USD 18/hour`) when the user thinks that way.
- **To compare with a yearly figure:** hourly × hours a week × 52. For full-time US work, 2,080 hours (40 × 52) is the usual convention; the federal government divides by 2,087. For part-time, use the hours the user will really get, not the maximum.
- **US:** the federal minimum wage is $7.25 an hour, and many states and cities set more (US Department of Labor state table). Non-exempt workers get time-and-a-half for hours over 40 in a workweek under the federal law; some states add daily overtime. A posted rate below the local minimum is a red flag.
- **Shift differentials** (more for nights or weekends), tips, and guaranteed minimum hours change the real pay; ask about them. A rate with no guaranteed hours can mean very little income.
- **Scheduling laws (US, some places only):** Oregon, and cities including New York City, Seattle, Chicago and Emeryville, have "fair workweek" or predictive-scheduling rules for some large retail, food-service or hospitality employers: schedules posted ahead (often 14 days), extra pay for late changes, rest between closing and opening shifts. Coverage depends on the industry and employer size; check the city's or state's page.
- **UK:** part-time workers have the right to be treated no less favourably than comparable full-timers, with benefits pro rata. Zero-hours ("casual") contracts don't guarantee any hours, and the employer can't stop the worker taking other work. New rights to guaranteed hours and reasonable notice of shifts are planned for 2027 under the Employment Rights Act (GOV.UK timeline, checked 2026-10-13); don't describe them as in force yet.

## 4. Benefits eligibility (ask, don't assume)

- **US health insurance:** large employers must offer coverage to full-time employees, defined for this rule as an average of 30 hours a week (130 hours a month) (IRS). Below that, many employers offer none; ask "How many hours do I need for benefits, and how long is the wait?"
- **US retirement:** from 2025 plan years, many 401(k) plans must let long-term part-time workers (500+ hours in each of two consecutive years, age 21+) contribute (SECURE 2.0, per law-firm summaries; the IRS page was not reachable on 2026-10-13, so check the plan's documents).
- Also ask about paid sick time (many states and cities require it), PTO accrual, employee discounts, tuition help, and when benefits start.

## 5. Resume and application for hourly roles

- **One page, short.** Contact line, a one-line **availability** statement near the top ("Available weekdays after 3pm and weekends; can start immediately"), then Experience with 2-3 bullets each, Certifications, and Skills (equipment, registers, languages spoken, software). Education briefly.
- Bullets show reliability and customers: shifts covered, speed and accuracy, safety record, customers served, cash handled, training others, perfect attendance, only where the master resume backs them.
- Job titles stay real. Gaps and short jobs are normal in hourly work; no explanation is needed on the resume.
- A cover letter only when asked. For in-person applications, a printed resume and a 20-second introduction ("Hi, I'm Alex, I saw you're hiring for weekend shifts; I have two years of register experience and I'm free weekends") help.
- **Scams aimed at hourly seekers:** "jobs" paying for reshipping packages, check-cashing, or app "tasks" that need a deposit (playbook, "Scam red flags"; FTC: no honest employer sends a check and asks for part of it back).

## 6. Tracking

Same tracker columns as any job. Use `employment: part-time` (or `full-time`) in `posting.md` and put the shift pattern in its `schedule:` line when posted. Follow-ups are shorter: a call or visit after 3-5 business days is normal for hourly roles if the posting doesn't forbid it, still once.

## Sources

- US Department of Labor, state minimum wage table (federal $7.25; updated 2026-07-01): https://www.dol.gov/agencies/whd/minimum-wage/state ; overtime: https://www.dol.gov/agencies/whd/overtime
- OPM, hourly rates use a 2,087-hour divisor: https://www.opm.gov/policy-data-oversight/pay-leave/pay-administration/fact-sheets/computing-hourly-rates-of-pay-using-the-2087-hour-divisor/
- Oregon BOLI, predictive scheduling: https://www.oregon.gov/boli/workers/pages/predictive-scheduling.aspx ; Seattle Secure Scheduling: https://www.seattle.gov/laborstandards/ordinances/secure-scheduling ; NYC Fair Workweek: https://www.nyc.gov/site/dca/about/fairworkweek-deductions-laws.page ; Chicago Fair Workweek: https://www.chicago.gov/city/en/depts/bacp/supp_info/fairworkweek.html ; Emeryville: https://www.emeryville.org/Services/Business/Labor-Standards/Fair-Workweek-Ordinance (city pages seen through search on 2026-10-13, Oregon fetched)
- IRS, ACA employer rules (30 hours / 130 hours a month): https://www.irs.gov/affordable-care-act/employers/questions-and-answers-on-employer-shared-responsibility-provisions-under-the-affordable-care-act
- Long-term part-time 401(k) rule (law-firm summary; verify on irs.gov): https://www.foley.com/?p=106026
- GOV.UK, part-time worker rights: https://www.gov.uk/part-time-worker-rights ; zero-hours contracts: https://www.gov.uk/contract-types-and-employer-responsibilities/zero-hour-contracts ; Employment Rights Act timeline: https://www.gov.uk/government/publications/implementing-the-plan-to-make-work-pay-and-employment-rights-act/plan-to-make-work-pay-and-employment-rights-act-timeline-update
- FTC, job scams (fake checks, paying for a job): https://consumer.ftc.gov/articles/job-scams
