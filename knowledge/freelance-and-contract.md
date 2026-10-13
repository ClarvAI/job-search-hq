# Freelance, contract and agency work

Shared background for `find-jobs`, `add-job`, `evaluate-job`, `network`, `tailor-resume`, `apply` and `offer` when the work is a contract, a gig, freelance or consulting, contract-to-hire, or through a staffing agency. Load it only then. Checked 2026-10-13; sources at the end. Tax and employment status rules are country-specific and change: never tell the user what their status or tax will be; point them to the official page or an accountant.

## 1. The kinds of arrangement

- **Agency or staffing contract (US "W-2 contract"):** the agency employs the user and places them with a client for a set period; the agency runs payroll and taxes, and may offer some benefits. The pay rate is per hour; the agency's markup is on top and the user never pays it.
- **Independent contractor / freelancer (US "1099"):** the user runs their own business, invoices the client, and pays their own taxes. In the US, self-employment tax is 12.4% Social Security plus 2.9% Medicare (15.3% in total) on net earnings, on top of income tax, and there are no employer benefits (IRS Topic 554).
- **Corp-to-corp:** the user's own company contracts with the client or agency. Usually only for experienced contractors with an accountant.
- **Contract-to-hire:** a contract (commonly about 3 to 6 months; staffing-industry sources, not measured data) with a possible permanent offer at the end. Ask how many contractors in this role were converted last year, what the permanent salary range would be, and whether a conversion fee is involved. Treat the conversion as a maybe, not a promise.
- **UK limited-company contracting and IR35:** for contracts with medium or large private clients and the public sector, the **client** decides whether the off-payroll working rules (IR35) apply and must give a Status Determination Statement with its reasons; for small private clients the contractor's own company decides. HMRC's CEST tool helps check status. These rules have applied to medium and large private clients since 6 April 2021 (GOV.UK, updated 2026-02-26). "Inside IR35" means tax and National Insurance are taken much like an employee's, so the same day rate is worth less; ask which side a role sits on before comparing rates.
- **Who counts as a contractor (US):** the IRS looks at behavioral control, financial control and the type of relationship. A "contractor" who works fixed hours under a manager, on the employer's equipment, indefinitely, may legally be an employee; if something looks misclassified, point the user to the IRS page or their state's labor department, not a verdict from us. The US Labor Department proposed a new contractor test in February 2026 (comments closed 2026-04-28; no final rule as of 2026-10-13) and isn't applying its 2024 rule in investigations.

## 2. Rates

- Record the rate exactly as offered or posted, with its unit: `$85/hour (W-2 via Acme Staffing)`, `GBP 550/day outside IR35`, `$6,000 fixed (project)`.
- **Turning a salary into a freelance rate** (the common method from freelancer guides; opinion, not a rule): start from the salary the user would want, add what an employer would have paid on top (benefits, retirement, the employer's half of payroll taxes, paid holidays), add business costs (software, insurance, accountant), then divide by **billable** hours, not 2,080: freelancers spend a big share of their time finding work and on admin, and guides assume well under 1,500 billable hours a year. Show the user the arithmetic with their own numbers; don't quote a standard multiplier.
- **Agency W-2 hourly vs a salary:** hourly × hours a year, minus unpaid holidays and gaps between contracts, plus or minus benefits. Keep the parts on separate lines (as `/offer` does).
- **Day rates** are the norm in UK contracting; vendor surveys show very wide ranges by role, so only use a sourced, dated range for the specific role (`.claude/skills/offer/references/pay-data.md`).

## 3. Finding work and applying

- **Agencies and recruiters:** a good agency recruiter is a free route to several clients. Never pay an agency or "placement firm" for work: honest firms are paid by the employer (FTC). In the UK, agencies generally may not charge work-seekers a fee for finding them work (Employment Agencies Act 1973, section 6); the 2003 Conduct Regulations allow narrow exceptions, mainly some entertainment and modelling work and work-seekers who are themselves a limited company, so a limited-company contractor asked for a fee should read the terms closely. Ask which client a role is with before the user's resume goes out, so two agencies don't submit them to the same client.
- **Freelance platforms and proposals:** short proposals beat long ones: the client's problem in one line, the most similar past result (from the master resume), how the user would start, a price or a question about scope. One specific detail only the user could write (playbook, "Writing with AI"). Platform fees and payment protection differ; read the platform's terms.
- **Portfolio:** for creative, technical and consulting work, 3-5 relevant samples matter more than the resume. Nothing confidential from past clients or employers (ground rule 3); ask permission or use anonymized versions. The portfolio page (`/pages portfolio`) can hold them.
- **Resume for contract work:** list multiple short contracts under one entry ("Freelance UX designer, 2023-present" with 2-4 client results) or under the agency, with the client named only if allowed. Contract and freelance work is real experience; write it like any job, with real titles.
- **Scams:** fake "clients" who send a check and ask for part back, ask the user to buy equipment from their vendor, or want work done as an unpaid "test" that is really the deliverable (FTC job scams; the playbook's "Scam red flags").

## 4. Contracts and offers (what to read before signing)

Rate and unit, payment terms (when and how invoices are paid; 30 days is common, late payment is common too), scope and how changes are priced, who owns the work, notice or termination terms, non-compete or non-solicit clauses, the IR35 status (UK), whether the agency or client can extend or end it early, and expenses. Suggest an accountant or lawyer for anything unusual; never judge enforceability.

## 5. How the tracker records gigs and contracts (no new columns)

- One row per opportunity: a posted contract, a proposal to a client, or a role an agency put the user forward for. `company` = the client (or `Acme Staffing (client unknown)` until the agency says), `role` = the contract or gig title.
- `status`: `interested` → `applied` (application or proposal sent) → `screening` / `interviewing` (calls with the agency or client) → `offer` (contract offered) → `accepted` (signed). `withdrawn`, `rejected`, `ghosted` and `skipped` as usual.
- `salary_range` holds the posted or offered rate with its unit (`$85/hour`, `GBP 550/day`, `$6,000 project`); `source` the platform or agency; `contact` the agency recruiter.
- `notes` starts with the arrangement, so it's easy to scan: `contract 6 months, W-2 via Acme Staffing; ...`, `freelance, fixed price; ...`, `contract-to-hire; ...`, `outside IR35; ...`. Keep the playbook's `Also:` token first if there is one.
- `posting.md` `employment:` uses `contract`, `contract-to-hire`, `freelance` or `temporary`.
- **Repeat work for an existing client:** a new row only for a genuinely new contract; otherwise add a dated line to the old row's notes. Finished contracts stay `accepted` (they're history for the weekly review).
- The contract's end date goes in `next_action` (`Decide next step`) with `next_action_date` about four weeks before it ends, so the user starts looking for the next one in time.

## Sources

- IRS, "Independent contractor (self-employed) or employee?" (reviewed 2026-05-19): https://www.irs.gov/businesses/small-businesses-self-employed/independent-contractor-self-employed-or-employee
- IRS, Topic 554, self-employment tax (reviewed 2026-09-24): https://www.irs.gov/taxtopics/tc554
- US Department of Labor, 2026 independent contractor rulemaking (proposed 2026-02-26; comments closed 2026-04-28; 2024 rule not applied in investigations): https://www.dol.gov/agencies/whd/flsa/misclassification/2026rulemaking
- GOV.UK, "Understanding off-payroll working (IR35)" (updated 2026-02-26): https://www.gov.uk/guidance/understanding-off-payroll-working-ir35
- UK Conduct of Employment Agencies and Employment Businesses Regulations 2003 (fee rules and exceptions): https://www.legislation.gov.uk/uksi/2003/3319/regulation/26
- FTC, job scams ("Don't pay for the promise of a job"; fake checks): https://consumer.ftc.gov/articles/job-scams
- Contract-to-hire length (staffing-software blog; indicative only): https://www.shiftflow.app/blog/contract-to-hire
- Freelance rate method (freelancer guide; opinion): https://www.selfemployed.com/how-to-price-freelance-services/
