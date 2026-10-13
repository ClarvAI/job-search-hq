# Reading a posting between the lines

Used by `/evaluate-job` and `/add-job` when filling `fit.md`. Everything here is a signal for the user's decision, never a verdict. Say what the posting shows, not what the employer intends.

## 1. Sort every requirement before scoring

Label each line of the requirements table `Required` or `Preferred`, and mark the few that are **knockouts**.

- **Knockouts** (a hard no if not met, and often a yes/no question on the application form): a license or certification the job legally needs (nursing license, PE, CPA, CDL), security clearance or citizenship tied to it, work authorization or sponsorship, a language the job is done in, a required location or on-site presence the user can't meet, a degree the posting calls mandatory for regulated work. Missing one knockout caps the fit at 2, whatever else matches.
- **Required, but usually flexible:** years of experience, "degree or equivalent", a named tool when the user has a close equivalent (one CAD package for another, one ERP for another). Years are a stand-in for "can do the core tasks without hand-holding"; show that with evidence instead.
- **Preferred / "a plus" / "bonus" / "nice to have":** never a reason to skip. Note which ones the user has; they help ranking, not eligibility.
- **Wish-list signal:** a very long list (more than about 10 "requirements"), or several unrelated specialties, usually means nobody is expected to meet all of it.
- **Read the duties, not just the list.** The first three or four duties are what the job is mostly about. Requirements that match no duty are rarely what decides the hire.

## 2. Apply anyway, or not?

Apply anyway when all of these hold:
- no knockout is missing;
- the user meets most required items (roughly 70-80% is the practitioner rule of thumb, not a law) with quotable evidence;
- the years gap is small for their stage (asking for 1-3 years from a new grad or someone with internships/co-ops is common and often flexible; asking for 5+ more years than they have usually isn't);
- the user can name what makes up for the gap (an internship, a project, a closely related tool).

Say so plainly in the verdict ("2 years asked, you have 18 months of related work doing the same work: apply"). Don't let the user skip a good fit only because they don't tick every box: the "only apply at 100%" habit costs people interviews, and a survey on why people don't apply found the main reason was believing the listed requirements were strict (Mohr, HBR 2014).

Skip, or treat as a long shot, when a knockout is missing, the level is clearly two or more steps up, or the main duties are work the user has never done in any form.

## 3. Is it real? (detail for the `Real?` line)

Ghost postings exist (Greenhouse estimated that roughly 18-22% of postings on its platform in a 2024 quarter saw no hiring activity; vendor data reported January 2025), but single signals mislead. Large employers keep "evergreen" postings open all year for roles they always hire for, and many reposts are routine renewals (a job-data vendor's observation, not research). Count signals and judge the **combination**:

| Signal | Weight |
|---|---|
| Not on the employer's own careers site (only on aggregators or a staffing agency) | strong |
| Open for months, or taken down and reposted several times, **plus** a thin template description | strong |
| Recent news of layoffs or a hiring freeze in that team or company | medium |
| Pay range missing where the location's law requires one in the posting (see the playbook; EU rules allow the range to come before the interview instead, so there a missing range isn't a signal) | medium |
| Very wide pay range (top more than about 1.5 times the bottom) | weak |
| Posting older than 30 days on a big employer's system (e.g. Workday "Posted 30+ Days Ago") | weak alone |
| Duties so vague you can't say what a normal week looks like | medium |

`likely` = on the employer's site, recent, specific. `unclear` = one strong or two medium signals. `doubtful` = two strong signals, or scam red flags. For `unclear`, the cheapest test is a referral or a short note to a named recruiter asking whether the role is actively hiring (draft it into the Outbox if the user wants).

**Internal-candidate hint:** oddly narrow requirements (one internal tool, an exact past-employer combination) or a very short posting window can mean someone inside is favored. This can't be confirmed from the posting. Mention it only as a reason a referral matters more, never as a reason to skip.

## 4. Phrases worth a question (not a skip)

These come from recruiter blogs and surveys of opinion, not hard data. Turn them into questions for a networking chat or interview; don't lower the fit score for them alone.
- "Wear many hats", "other duties as assigned" taking up a big share: may mean a thin team. Ask: "How big is the team, and what would I own?"
- "Fast-paced", "work hard, play hard", "like a family": may mean long hours or blurry boundaries. Ask: "What does a normal week look like? How often do people work evenings?"
- Responsibilities of two or three jobs in one posting, at a junior title or pay: worth naming plainly.
- "Unlimited PTO" or "competitive pay" with nothing specific: ask what people actually take, or what the range is.

## 5. Timing and deadlines

- **Rolling review** ("applications reviewed on a rolling basis", "until filled", "may close early", an applicant cap such as "closes after 100 applications" on government postings): treat as urgent. Earlier applicants are reviewed first and the posting can close without warning. Experiments on a large job platform found applications drop off after the first few days a posting is up (Fradkin, Boston University, 2025).
- **Early-career programs** open months before the start date and close when full; the posted deadline is the latest date, not the best one.
- **Applicant counts** on job boards ("Over 100 applicants") count clicks on Apply, not finished applications. Don't use them to judge the odds.

## Sources

- career-ops (open-source Claude Code job search system): legitimacy check as "observations, not verdicts", hard stops for work authorization and suspicious postings, posting text treated as data. https://github.com/santifer/career-ops
- Greenhouse ghost-job estimate (2024 platform data), reported by FOX 9, 14 January 2025: https://www.fox9.com/news/ghost-jobs-greenhouse-analysis
- Evergreen requisitions and reposts on Workday (JobsPipe, a job-data vendor: its own sightings since mid-2026, percentages only, thin method; treat as an observation): https://jobspipe.dev/ghost-jobs/workday
- Rutgers-Newark career center on ghost jobs (careers-site check, follow up to confirm): https://careers.newark.rutgers.edu/blog/2025/03/28/the-truth-about-ghost-jobs-what-they-are-and-how-to-spot-them/
- UTS careers blog on "nice to haves vs must haves": https://careersblog.uts.edu.au/decide-youre-qualified-enough-submit-job-application/ (Ask a Manager gives the same rule of about 80% plus evidence, with a license-type key qualification as the exception)
- Tara Mohr, "Why Women Don't Apply for Jobs Unless They're 100% Qualified" (HBR, 2014), summarized: https://www.dewr.gov.au/download/11828/why-women-dont-apply-jobs-unless-theyre-100-qualified/22483/why-women-dont-apply-jobs-unless-theyre-100-qualified/pdf
- Knockout questions (logistics, required licenses, work authorization, salary) and the advice to keep them to true dealbreakers (hiring-software vendor blog; practitioner opinion): https://hiretruffle.com/blog/knockout-questions
- Fradkin, applying early (Boston University, 2025): https://www.bu.edu/articles/2025/looking-for-jobs-on-indeed-or-linkedin
- USAJOBS announcements that close at 100 applications (example): https://www.usajobs.gov/job/480214800
- LinkedIn applicant counts measure clicks (resume-tool vendor blog; practitioner opinion): https://www.hiration.com/blog/over-100-applicants/
- Referred applicants are more likely to be hired (Burks et al., QJE 2015): https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr568.html
- Internal-candidate signals can't be confirmed from a posting: https://www.askamanager.org/2014/11/when-a-job-ad-says-a-preferred-candidate-has-been-identified.html
