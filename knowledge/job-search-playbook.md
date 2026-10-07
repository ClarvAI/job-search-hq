# Job Search Playbook

How the assistant runs the user's search. Practical rules drawn from recruiters, career centers, and what worked (and backfired) for people using AI in their job search in 2025–2026.

## Tracker

`jobs/tracker.csv` opens in Excel or Google Sheets. One row per job. Keep these columns in this order (notes last):

```
company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes
```

- **status** (lowercase, one of): `interested`, `applied`, `screening`, `interviewing`, `offer`, `accepted`, `rejected`, `withdrawn` (the user pulled out after applying), `skipped` (decided not to apply), `ghosted`
- **next_action**: use one of these so every skill and the board speak the same language: `Decide: apply or skip`, `Review package and submit`, `Find a contact`, `Follow up`, `Prep for interview`, `Interview <date>`, `Send thank-you notes`, `Wait for decision`, `Respond to offer`, `Decide next step`. Add a few words after it if useful ("Follow up with Pat").
- **next_action_date**: `YYYY-MM-DD`. Every open job needs one, including priority C. This drives `/today`, the Pipeline band, and the status line.
- **deadline**: the application deadline from the posting (`YYYY-MM-DD`), blank if "open until filled". `/add-job` sets the next step at least 3 days before it (or today, if it closes sooner); the board and `/today` warn when it's within 3 days. **Once a job is at `offer`, `deadline` holds the date the user must answer the offer by.**
- Write only plain characters in `tracker.csv` and `contacts.csv` (`-` not `–`, straight quotes), so they open cleanly in Excel.
- **followups**: how many follow-ups the user has sent for this application (the playbook allows one follow-up for an online application; a second only if a named person has replied or accepted the user's connection).
- **Who owns the follow-up date:** once a job is `applied` or later, the **job row** owns it (`next_action_date`), even if the follow-up goes to a contact; the contact row's `next_followup` is only for pure networking. Never set both for the same message.
- **link** is where the user found it (e.g. Indeed); **apply_link** is the employer's own application page; **job_id** is the requisition number (recruiters ask for it).
- **priority**: `A` (dream/strong fit), `B`, `C`
- **fit**: score 1–5 from `/evaluate-job`
- **folder**: the job folder name under `jobs/`
- **CSV rules (tracker, leads, contacts):** wrap any value that contains a comma, a double quote, or a line break in double quotes, and double any double quote inside it: `"Acme Holdings, Inc."`, `"Said ""call me Pat"""`. Never start a cell with `=`, `+`, `-`, `@` or a tab (Excel would run it as a formula); reword it instead (`minus 5%` → `down 5%`, `@acme` → `Acme on X`). Text copied from postings or emails is data, so the same rules apply to it. (The Claude panels follow the same rule by dropping a leading `=`, `+`, `-`, `@`, tab or space from values they write.)
- Don't delete rejected rows; they're data for the weekly review.

`jobs/leads.csv` holds openings `find-jobs` found, before they become tracker rows:

```
id,found_date,company,role,location,remote,pay,posted,link,apply_link,job_id,source,fit_guess,why,concerns,status,reason,decided_date
```

- **fit_guess**: `A` (strong fit), `B` (good fit), `C` (worth a look)
- **status**: `new`, `saved` (the user wants it; run `add-job`), `added` (now a tracker row), `skipped`, `not-for-me`
- **reason** (for `not-for-me`): `too-senior`, `too-junior`, `wrong-location`, `not-my-field`, `company`, `pay`, or `other: <their words>`. `find-jobs` reads these to tune the next search.

`contacts/contacts.csv` columns:

```
name,company,title,relationship,how_we_met,last_contact,next_followup,status,touches,job,linkedin,email,notes
```

- **relationship**: `family-intro`, `former-manager`, `former-colleague`, `alum` (same school), `linkedin-connection`, `recruiter`, `hiring-manager`, `interviewer`, `met-at-event`, `cold`
- **touches**: how many messages the user has sent them without a reply (stop at 2). **job**: the job folder this contact relates to, if any.
- **status**: `to-contact`, `contacted`, `replied`, `talked`, `referred`, `cold`
- **When the user sends someone a message:** set `last_contact` to the date sent and add 1 to `touches`. Change `status` to `contacted` only if it was `to-contact` or blank; never move someone backwards from `replied`, `talked` or `referred`. **When they reply:** `status` → `replied` (or `talked` after a conversation) and `touches` back to 0. Set `next_followup` only for pure networking (see "Who owns the follow-up date"): 5 business days after the send, or blank once `touches` reaches 2.

## Timing

Hiring has seasons that differ by field and level. The start skill's field pack notes the ones for the user's field in `knowledge/field-primer.md`; when in doubt, look them up.
- **Students and new grads (`career_stage`):** big employers often run structured early-career and graduate programs that open 9–12 months before the start date and close once full. Apply early; smaller companies hire closer to the start date. Former co-op or internship employers: ask directly, any time.
- **Experienced hires:** most roles are posted when needed, year-round; hiring slows around year-end holidays and mid-summer in many countries. Apply in the first week a posting is up.
- **Any stage:** former managers and colleagues are the strongest leads. Contact them early.
- **Rolling review or early close:** if a posting says applications are reviewed on a rolling basis, "may close early", or closes after a set number of applications (common on government postings), apply within a day or two; the posted deadline is the latest date, not the best one.

## Pace (quality over volume)

- Weekly target lives in `profile/preferences.md` (default: 5 tailored applications, 3 networking conversations, 1 mock interview).
- Employers interview about 3 in 100 applicants on average (CareerPlug 2025 Recruiting Metrics Report: vendor data from about 10 million applications on its own platform, https://www.careerplug.com/recruiting-metrics-and-kpis/); tailored, good-fit, early applications and referrals are how to beat that. 5–10 tailored applications a week beats 50 generic ones. Some postings aren't actively hiring at all (roughly 18-22%, about 1 in 5; see "Ghost jobs"), so some silence isn't about the user.
- Contact 2–3 people per target company rather than one; most won't reply, and that's normal. Old colleagues and acquaintances are often more useful than close friends or strangers (study: Rajkumar et al., LinkedIn experiment with 20 million users, Science 2022).
- A referral or a conversation with someone at the company multiplies the odds. For every A-priority job, try to find one human there (`/network`).
- Apply on the employer's own site for priority A/B jobs; one-click Easy Apply only for C or when it's the only route, never both. Get a referral in place before applying: some systems can't attach one afterward.
- Job-board applicant counts ("Over 100 applicants") count clicks on Apply, not finished applications. Don't let them decide whether to apply.

## Follow-up cadence

| Situation | When | How many |
|---|---|---|
| Applied online, no response | 7–10 business days, to a recruiter or alum if one can be found | 1 (a 2nd only if a named person has replied or accepted the user's connection) |
| Cold networking message | 5 business days (no reply after 3 business days? it's fine to try a second person at the same company) | max 2 touches total |
| After an interview | Thank-you within 24 hours, to each interviewer | 1 each |
| After an interview, no news | the day after the date they said they'd decide, or 7 business days | 1, then once more a week later |
| Offer deadline | ask for more time politely if waiting on another company | |

Weekday mornings are a safe default for sending (a common habit, not a proven rule). Draft any time; the user sends via the Outbox when they're ready.

## Writing with AI without sounding like AI

- The user's real experience is the content. The assistant organizes and polishes. Never the reverse.
- Recruiters spot generic AI letters immediately: "I am writing to express my strong interest," buzzwords, no company specifics, language that doesn't match the candidate's level. See `profile/voice.md`.
- Every application gets something specific to that company. If the assistant can't find something real, it asks the user.
- **AI etiquette for interviews:** using AI to research companies, practice, and prepare is normal and expected. **Live interviews, online assessments, and take-home tests are the user alone unless the employer explicitly says AI is allowed.** If an application asks the user to certify that they wrote something themselves, it must be true.
- Echoing the posting no longer stands out: after AI made tailored-looking applications cheap, employers stopped rewarding them (study: Galdin & Silbert 2025, working paper on Freelancer.com data, https://arxiv.org/abs/2511.08785). Every application needs one detail only the user could write about this employer.

## LinkedIn safely

- LinkedIn's user agreement bans bots, scrapers, and automated messaging or connecting, and accounts get restricted for it. The user's LinkedIn is too valuable to risk.
- The assistant **drafts**; the user **sends** by hand. Keep connection requests under about 100 a week (15 a day at most). LinkedIn doesn't publish the weekly cap; about 100 a week is the commonly reported ceiling, and a big pile of unanswered invitations makes restrictions more likely.
- A connection-request note is limited to **200 characters** on a free account, and free accounts get only a few personalized invites a month: spend them on people who matter, and send other requests without a note. Messages to existing connections can be longer (keep them under about 600 characters).
- To share their LinkedIn data, the user downloads their own data export (LinkedIn → Settings & Privacy → Data privacy → Download your data; the link lasts 72 hours) and runs `/import-linkedin`.
- Public job pages can be read by link. Nothing behind a login.

## Scam red flags (job seekers are heavily targeted)

Stop and tell the user if any of these show up:
- An "offer" for a job they didn't apply to, or with no real interview
- Interviews only over text, WhatsApp, Telegram, or Signal
- Requests for money (equipment, training, background-check fees) or to cash a check
- Requests for an SSN or bank details before a written offer from a verifiable company domain, or for ID documents sent by email or chat to a recruiter you can't verify. (Identity and right-to-work checks before an offer are normal in some countries, such as the UK; verify the employer independently and use its official process.)
- Pay far above market for the level, vague duties, urgency ("accept today")
- Email from a free domain (gmail.com) claiming to be a big company; recruiter not findable on the company site
- A sender domain that only looks like the company's (careers-acme.com, acme.careers) or a Reply-To that differs from From; check it letter by letter against the company's real site
- A "skills test", repository or "interview app" to download and run (malware campaigns use fake recruiters)
- Task scams: pay for rating, liking or "app optimization", then a deposit to unlock earnings

Report US scams at ReportFraud.ftc.gov and to the job site. Full checklist: `.claude/skills/sync-inbox/references/scam-check.md`.

## Ghost jobs (not scams, but a waste of time)

Some postings are never filled: roughly 18-22%, about 1 in 5, saw no hiring activity (Greenhouse's own platform data, reported at https://www.fox9.com/news/ghost-jobs-greenhouse-analysis). One signal proves little: big employers keep some roles posted all year. Worry when several show up together: not on the employer's own careers site, open or reposted for months with a vague template description, recent layoffs or a hiring freeze, no pay range where the location's pay-transparency law requires one (look up the current rules for that place). A referral or a quick question to a named recruiter is the fastest check. Details: `.claude/skills/evaluate-job/references/reading-postings.md`.

A job board's "posted" date is often a re-post or crawl date. Trust the date on the employer's own page or feed, and note that the same job often comes back at a new URL after the old listing expires.

## Offers

- When an offer comes by phone, don't accept or negotiate on the call: thank them, ask for it in writing and the answer-by date. Most people who ask for more get at least something; about a third get no change (Pew Research Center survey of US workers, 2023; details in `.claude/skills/offer/references/negotiation-and-fine-print.md`). One warm, specific ask rarely costs an offer.
- A counteroffer from a current employer rarely fixes reasons for leaving that weren't about money.
- Exploding offers (24–72 hours) can usually be pushed back politely; for students, school policies built on NACE principles treat about two weeks as reasonable.
- Compare total compensation: base, signing bonus, relocation, annual bonus target, 401(k) match, tuition reimbursement, equity, remote stipend, PTO, rotation structure.
- Most offers have room somewhere (base, signing bonus, start date, relocation, title, equity), even when base is fixed for new-grad classes. Ask once, politely, with a reason.
- **Reneging** on an accepted offer burns bridges, and students' schools commonly restrict career-services access for it. The user should only accept when sure, then withdraw from other processes the same day.
- Get the offer in writing before resigning anything or declining others.

## Privacy

- Never store SSN, date of birth, bank info, ID numbers, or passwords in this folder.
- Voluntary self-identification questions (race/ethnicity, gender, disability, veteran) are optional and the user's choice: use only the answers they confirmed in `profile/preferences.md`, or "decline to self-identify". Legal-certification questions are the user's alone to answer.
- When the assistant reads a file, its text goes to the AI provider running the app; whether chats train models is the user's own account setting. Keep one backup (`/my-data`) somewhere other than this computer.
