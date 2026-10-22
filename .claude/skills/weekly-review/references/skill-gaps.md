# Skill gaps: what the jobs keep asking for

Used by `/weekly-review` step 2b and when the user asks what to learn. It turns the requirement tables already saved in each job's `fit.md` into the few gaps worth closing.

## 1. Gather

- Read the requirements table in every `jobs/*/fit.md` for jobs found in the last 90 days (`date_found` in `jobs/tracker.csv`), any status. Leave out jobs the user skipped for reasons unrelated to skills (location, pay, timing, company) and jobs scored 1 (wrong field or level: their requirements aren't the user's target).
- Count each `Not met` and `Partly` requirement once per job. Merge the same skill in different words ("SQL", "writing SQL queries", "relational databases"); keep different skills apart even when they sound close ("Tableau" is not "Excel").
- Weight what matters more: a requirement the posting lists as required counts more than a preferred one, and a priority A or B job counts more than a C. Keep it simple: required in an A/B job = 3, required in a C job or preferred in an A/B job = 2, anything else = 1.
- Fewer than 6 `fit.md` files: say "too early to see a pattern" and stop. A gap that shows up in one job only is noise; list it only if that job is the user's top target.

## 2. Show the top three

For each of the top three by weight:

- **The gap** in the user's field's own words, and how often it came up: "Asked for by 5 of the 14 jobs you looked at, 4 of them A or B."
- **Knockout or not.** A license, certification, clearance or degree a job legally needs (a knockout in `fit.md`) caps those jobs at fit 2 until it's closed; say so plainly. A skill gap usually doesn't.
- **Partly or not at all.** If most rows say `Partly`, the user may already have it and just not show it: check the master resume and `profile/story-bank.md` for related work, and offer to add a true line or a story (with the user's yes, as always) before suggesting they learn anything.
- **One way to close or bridge it,** the smallest that would count for a hiring manager in their field: a short course or certification, a small project they can show, a volunteer or side task at their current job, or a bridge sentence for the cover letter ("I've used Excel pivot tables daily; Tableau is my next step and I'm partway through its free training").

Never suggest a gap is closed until the user has done the work. Learning something doesn't put it on the resume; when they finish, offer to add it to the master resume with the date.

## 3. A learning plan (only if the user asks)

Look up two or three current options per gap on the web, free and low-cost first (the provider's own training, public libraries and community colleges, government job-training programs where the user lives, well-known course sites). For each: provider, what it covers, length and cost as the provider states them, link, and the date you checked. Never guess a length or price, and say when a certification has a fee or an exam. If the user is on unemployment benefits, mention that some job-training programs count toward the work search (the rules vary; `/work-search-log` knows theirs).

Save the plan as `interviews/skill-gaps-<YYYY-MM-DD>.md`: the three gaps with their counts, the options, and one suggested first step that fits the hours they have (`weekly_goals` in `profile/preferences.md`). Keep it to a page.
