# First week after a US layoff: rules and dates

Checked 2026-10-08 against the official pages linked in each section. Rules change; if a page now says something different, follow the page and tell the user. None of this is legal advice: it's what the official sources say, so the user knows which dates to watch. Questions about their own case go to an employment lawyer (the state bar's lawyer referral service is a good start), the state labor department, or the agency named.

How to compute dates: count calendar days from the date named, with the computer's calendar (`date`). If the last day falls on a day the user isn't sure about, use the earliest likely date so nothing is missed.

## 1. Unemployment insurance: file now

- The US Department of Labor: "You should contact your state's unemployment insurance program as soon as possible after becoming unemployed" and "Generally, you should file your claim with the state where you worked." It typically takes two to three weeks after filing to get the first payment. Source: https://www.dol.gov/general/topic/unemployment-insurance
- Find the state's claim site: CareerOneStop Unemployment Benefits Finder (US Department of Labor), https://www.careeronestop.org/LocalHelp/UnemploymentBenefits/unemployment-benefits.aspx. Keep filing (certifying) every week or every two weeks as the state says, or benefits stop.
- **Plan line:** file on the first business day after the last day of work (or today, if that's passed). Don't wait for severance, final pay or a separation letter; the claim asks about them and the state decides how they count. Answer every question on the claim truthfully; the user does this themselves.
- Most states require a work search while claiming: after filing, offer `/work-search-log`.

## 2. Health coverage: two windows, both about 60 days

**COBRA** (keeping the employer's plan; US Department of Labor, Employee Benefits Security Administration):
- Applies to group health plans of employers with 20 or more employees (https://www.dol.gov/general/topic/health-plans/cobra). Many states have their own continuation laws for smaller employers; check the state insurance department.
- The employer has 30 days to notify the plan, and the plan administrator then has 14 days to send the election notice, so the letter can take about six weeks to arrive. Source: *An Employee's Guide to Health Benefits Under COBRA*, https://www.dol.gov/sites/dolgov/files/ebsa/about-ebsa/our-activities/resource-center/publications/an-employees-guide-health-benefits-under-cobra-2022.pdf
- "You have 60 days to enroll in COBRA, starting when your job-based coverage ends or when you receive a COBRA election notice, whichever is later" (https://www.dol.gov/agencies/ebsa/laws-and-regulations/laws/cobra). Coverage is usually up to 18 months, and the person usually pays the full premium (up to 102% of the plan's cost) unless the employer agreed to pay some as part of the separation.
- After electing, the first premium is due within 45 days; coverage then applies back to the date the old coverage ended (Employee's Guide, above). That's why some people wait to elect unless they need care.

**Marketplace** (HealthCare.gov or the state's own marketplace):
- Losing job-based coverage opens a Special Enrollment Period: 60 days from losing that coverage to enroll in a Marketplace plan. Voluntarily dropping COBRA later (or stopping payments) does **not** open a new one outside open enrollment. Source: https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/
- Medicaid and CHIP can be applied for any time (income-based; a lower income after a layoff may qualify).

**Plan lines:** ask when health coverage ends (often the last day or the end of that month; the HR letter says). Then:
- `coverage_end + 60 days`: last day of the Marketplace Special Enrollment Period. Decide Marketplace vs COBRA before this date.
- `coverage_end + 60 days` (later if the COBRA notice arrives later: notice date + 60): last day to elect COBRA. Mark it "about" until the notice arrives.
- `election date + 45 days`: first COBRA premium due (only once they elect).

## 3. Severance agreement: review time, and the 40+ rules

- No federal law requires severance pay; it's a matter of agreement between employer and employee (https://www.dol.gov/general/topic/wages/severancepay). An agreement usually trades money for a release of legal claims, which is why a lawyer should read the release.
- **If the user is 40 or older**, the Older Workers Benefit Protection Act makes a release of age-discrimination claims valid only if, among other things, it: is written clearly; refers to the Age Discrimination in Employment Act by name; advises the employee **in writing to consult an attorney**; gives **at least 21 days** to consider it (**at least 45 days** when the layoff is part of a group program, which also requires written information about who was selected); and gives **7 days after signing to revoke**, a period that "cannot be changed or waived". The employee can still file a charge with the EEOC after signing. Source: EEOC, *Q&A: Understanding Waivers of Discrimination Claims in Employee Severance Agreements*, https://www.eeoc.gov/laws/guidance/qa-understanding-waivers-discrimination-claims-employee-severance-agreements
- **Under 40:** no federal minimum review period; the agreement sets its own deadline. Ask for more time politely if it's short (draft in section 3 of the skill).

**Which period applies (without asking the user's age):** use the period written in the agreement. An agreement that names the ADEA and gives a 7-day revocation period is following the 40+ rules; it gives 45 days when the layoff is a group program (it then comes with a list of job titles and ages of the people selected and not selected), otherwise 21. If the agreement's period looks shorter than that, or it's unclear whether the layoff was a group program, ask "Was this offered to a group of people at once, or just to you?" and put "check the period with a lawyer" on the plan line rather than deciding it.

**Plan lines:** `date received + the agreement's review period` (under the 40+ rules: at least 21, or 45 for a group program): "last day to sign, if you decide to". After the user says they signed: `signed + 7 days`: "revocation period ends" (only when the agreement gives a revocation period). And early in the week: "Book an employment lawyer to read the release (before signing)".

## 4. Final pay, unused vacation, and documents

- Federal law doesn't require immediate final pay; state law sets when the last paycheck is due and whether unused vacation or PTO is paid out. Source: https://www.dol.gov/general/topic/wages/lastpaycheck (it points to state labor departments: https://www.dol.gov/agencies/whd/state/contacts). If pay is late, the state labor department handles wage claims.
- **Plan line:** "Check final paycheck and PTO payout against your state's rule (link)" on the next payday after the last day.
- **Keep (the user's own documents only):** the last pay stubs and the final one, the termination or layoff letter, the severance agreement and any WARN notice, benefits and COBRA letters, retirement plan statements, their own copies of performance reviews or awards if HR gives them, and the job's start and end dates and title (for applications and background checks). Download their own pay and benefits documents from the HR portal before access ends. Update the mailing address with HR so the W-2 arrives. Never copy the employer's files, email, code or customer data.
- Retirement plans: nothing has to be decided this week; questions go to the plan administrator or a financial adviser, not the assistant.

## 5. WARN notices (larger layoffs)

- The federal WARN Act applies to employers with 100 or more employees and requires 60 days' advance notice of qualified plant closings and mass layoffs. Sources: https://www.dol.gov/agencies/eta/layoffs/warn and the Worker's Guide linked there. Some states have their own, stricter notice laws.
- If the user got pay "in lieu of notice" or thinks notice was required and missing, that's a question for the state labor department or an employment lawyer. Note the notice date in the plan; don't calculate what they're owed.

## 6. If the user's visa depends on the job

Time is short; this goes at the top of the plan. Refer them **today** to their school's Designated School Official (F-1) or an immigration lawyer (H-1B and others). Never advise on status.
- **H-1B and some other work classifications:** up to 60 consecutive days, or until the end of the authorized stay if sooner, during which they may file for a change of status, adjustment, a "compelling circumstances" work permit, or be named in a new employer's petition; with no action they may need to leave within that period. Source: USCIS, *Options for Nonimmigrant Workers Following Termination of Employment*, https://www.uscis.gov/archive/options-for-nonimmigrant-workers-following-termination-of-employment-0 (an archived page; the USCIS Policy Manual, https://www.uscis.gov/policy-manual/volume-2-part-m-chapter-9, is the current text).
- **F-1 OPT:** 90 days of unemployment on post-completion OPT; 150 in total with a STEM OPT extension (including days used on post-completion OPT). SEVIS counts every day with no employer information on record. Source: Study in the States (DHS), https://studyinthestates.dhs.gov/sevis-help-hub/student-records/fm-student-employment/unemployment-counter. Students must report employment changes as their DSO and the SEVP Portal direct.
- Offer to fill the visa lines in `profile/preferences.md` so `/today` counts the days, using the numbers the DSO or lawyer confirms.
