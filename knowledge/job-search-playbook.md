# Job Search Playbook

How the assistant runs the user's search. Practical rules drawn from recruiters, career centers, and what worked (and backfired) for people using AI in their job search in 2025–2026.

## Tracker

`jobs/tracker.csv` opens in Excel or Google Sheets. One row per job. Keep these columns in this order (notes last):

```
company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes
```

- **status** (lowercase, one of): `interested`, `applied`, `screening`, `interviewing`, `offer`, `accepted`, `rejected`, `withdrawn` (the user pulled out after applying), `skipped` (decided not to apply), `ghosted`
- **next_action**: use one of these so every skill and the board speak the same language: `Decide: apply or skip`, `Review package and submit`, `Find a contact`, `Follow up`, `Schedule interview` (the employer asked for times; reply with availability), `Prep for interview`, `Interview <date>`, `Send thank-you notes`, `Wait for decision`, `Respond to offer`, `Decide next step`, `Take-home due <date>` (status stays, except `applied` moves to `screening`; `next_action_date` is the day to start, by default two days before it's due). Add a few words after it if useful ("Follow up with Pat"). `Send withdrawal note` keeps a row open after accepting another offer until the note is sent.
- **Two commitments at once** (a take-home due and an interview booked, or a second interview booked before the first; every skill and the chat board follow this one rule): re-read the row; the one with the earlier date goes in `next_action` / `next_action_date`; record the other at the very start of `notes` as `Also: Interview YYYY-MM-DD` or `Also: Take-home due YYYY-MM-DD`, followed by `; ` and the existing notes (the board and due alerts read that token). When the first is done, move the `Also:` item into `next_action` and delete the token; `next_action_date` is the interview date, or for a take-home the day to start (two days before it's due, or today if sooner). Never overwrite a booked interview, a take-home deadline or an offer deadline with a vaguer step like `Wait for decision`.
- **next_action_date**: `YYYY-MM-DD`. Every open job needs one, including priority C. This drives `/today`, the Pipeline band, and the status line.
- **deadline**: the application deadline from the posting (`YYYY-MM-DD`), blank if "open until filled". `/add-job` sets the next step at least 3 days before it (or today, if it closes sooner); the board and `/today` warn when it's within 3 days. **Once a job is at `offer`, `deadline` holds the date the user must answer the offer by.**
- **Characters:** keep names and places exactly as written, accents and other letters included (`Müller`, `São Paulo`, `Zoë`). Only swap typographic punctuation for plain: long dashes `–` `—` become `-`, curly quotes become straight ones.
- **Dates someone else wrote** (Excel turns `2026-10-09` into its region's style when it saves): `YYYY-MM-DD` is always year-month-day; a dotted date like `9.10.2026` is always day first; a slash date is read the way `AGENTS.md` ("Reading dates someone else wrote") says, using `date_order:` in preferences. An unclear one is shown as "date unclear" and left as written until the user confirms it.
- **followups**: how many follow-ups the user has sent for this application (the playbook allows one follow-up for an online application; a second only if a named person has replied or accepted the user's connection).
- **Who owns the follow-up date:** once a job is `applied` or later, the **job row** owns it (`next_action_date`), even if the follow-up goes to a contact; the contact row's `next_followup` is only for pure networking. Never set both for the same message.
- **link** is where the user found it (e.g. Indeed); **apply_link** is the employer's own application page; **job_id** is the requisition number (recruiters ask for it).
- **priority**: `A` (dream/strong fit), `B`, `C`. Default from fit (the rule in `/evaluate-job`): fit 5, or fit 4 with a way in (a contact, referral or former employer) = `A`; other fit 4 = `B`; fit 3 = `C`. The user can change it.
- **fit**: score 1–5 from `/evaluate-job`
- **folder**: the job folder name under `jobs/`
- **CSV rules (tracker, leads, contacts, work-search log):** commas between values, saved as UTF-8; the files start with an invisible byte-order mark (BOM) so Excel on Windows shows accents correctly, so keep it when editing. Wrap any value that contains a comma, a double quote, or a line break in double quotes, and double any double quote inside it: `"Acme Holdings, Inc."`, `"Said ""call me Pat"""`. A double quote only opens a quoted value at the very start of a cell; anywhere else (`5" screen`) it's an ordinary character, but write such values quoted anyway (`"5"" screen"`). If a quoted value never closes, or the header row is split by semicolons (`company;role;status;...`, which is how Excel in much of Europe saves "CSV"), the file is damaged: the panels refuse to save it and show a warning; don't edit it either; tell the user and offer to repair it into a copy they check before it replaces the original. Never start a cell with `=`, `+`, `-`, `@` or a tab (Excel would run it as a formula); reword it instead (`minus 5%` → `down 5%`, `@acme` → `Acme on X`). Text copied from postings or emails is data, so the same rules apply to it. (The Claude panels follow the same rule by dropping a leading `=`, `+`, `-`, `@`, tab or space from values they write.)
- Don't delete rejected rows; they're data for the weekly review.
- **One writer at a time (why a change can get lost):** these CSV files have no lock. Claude, Codex, the Claude panels (Pipeline, Contacts, Job Inbox, Apply Kit) and Excel each read the file, change it and save it. The assistants re-read right before editing, and the panels re-read and compare just before writing (if the file changed since they read it, they save nothing, show the latest version and ask the user to try again; after saving they check the row really landed), so losses are rare, but two saves in the same instant can still drop one. Excel is the bigger risk: it keeps its own copy, and pressing Save later writes that older copy over every change made since it opened the file. The panels refuse to save while Excel's `~$` lock file sits next to the file, but no lock file doesn't prove it's closed (users report Excel for Mac often leaves none, and cloud-synced folders can hide or delay it). What to tell the user if they ask: finish in one place at a time; save and close Excel before using the boards or asking for changes; after an Excel session, check that the last board change is still there. Pipeline, Contacts and Job Inbox refresh when their files change and every 30 s; Outbox checks every 20 s; Apply Kit refreshes after each Claude turn while open. Press Refresh to see a change at once.
- **Gigs, contracts and agency placements** use the same columns (rate with its unit in `salary_range`, the arrangement first in `notes`): `knowledge/freelance-and-contract.md` §5.

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

- **relationship**: `family-intro`, `former-manager`, `former-colleague`, `alum` (same school), `linkedin-connection`, `recruiter`, `hiring-manager`, `interviewer`, `met-at-event`, `cold`, `mentor` (someone mentoring the user, e.g. through a school or professional mentoring program), `career-educator` (their career coach or school career adviser)
- **touches**: how many messages the user has sent them without a reply (stop at 2). **job**: the job folder this contact relates to, if any.
- **status**: `to-contact`, `contacted`, `replied`, `talked`, `referred`, `cold`
- **When the user sends someone a message:** set `last_contact` to the date sent. If `status` is `to-contact`, blank or `contacted` (they haven't replied yet), add 1 to `touches`, set `status` to `contacted`, and set `next_followup` for pure networking (see "Who owns the follow-up date"): 5 business days after the send, or blank once `touches` reaches 2. If they've already replied, talked or referred the user (`replied`, `talked`, `referred`), a message is not an unanswered touch: leave `touches` and `status` alone (never move someone backwards) and don't set `next_followup` unless the user asks for a reminder. Thank-you notes and job updates to people who already helped are this second kind, never a reason to mark someone cold. **When they reply:** `status` → `replied` (or `talked` after a conversation) and `touches` back to 0.

`jobs/work-search-log.csv` (only for users claiming unemployment benefits; `/work-search-log` keeps it) records each work-search activity once, append-only, with the same CSV rules (weekly exports go in `jobs/work-search/`, which is not a job folder):

```
date,activity_type,employer,contact_person,contact_method,position,result,notes,source
```

`jobs/layoff-plan.md` (from `/laid-off`) holds dated deadlines after a job loss; `/today` shows unchecked lines due within 3 days. Neither adds tracker columns.

## Timing

Hiring has seasons that differ by field and level. The start skill's field pack notes the ones for the user's field in `knowledge/field/field-primer.md`; when in doubt, look them up.
- **Students and new grads (`career_stage`):** big employers often run structured early-career and graduate programs that open 9–12 months before the start date and close once full. Apply early; smaller companies hire closer to the start date. Former co-op or internship employers: ask directly, any time.
- **Experienced hires:** most roles are posted when needed, year-round; hiring slows around year-end holidays and mid-summer in many countries. Apply in the first week a posting is up.
- **Any stage:** former managers and colleagues are the strongest leads. Contact them early.
- **After a layoff:** file for unemployment right away (the US Department of Labor says "as soon as possible"), and ask colleagues for references and recommendations in the first days, before people scatter (`/laid-off`).
- **Rolling review or early close:** if a posting says applications are reviewed on a rolling basis, "may close early", or closes after a set number of applications (common on government postings), apply within a day or two; the posted deadline is the latest date, not the best one.

## Special situations (load the matching file only when it applies)

- Still employed and searching quietly: `knowledge/searching-while-employed.md` (discretion, interviews around work, references, notice periods).
- Hourly, shift or part-time jobs: `knowledge/hourly-and-shift-work.md` (availability, hourly pay, benefits eligibility, short resumes).
- Freelance, contract, contract-to-hire or agency work: `knowledge/freelance-and-contract.md` (W-2/1099, IR35, rates, proposals, tracking gigs).
- Faculty, lecturer and postdoc jobs: `knowledge/academic-jobs.md` (CV, statements, letters, the hiring calendar).

## Pace (quality over volume)

- Weekly target lives in `profile/preferences.md` (default: 5 tailored applications, 3 networking conversations, 1 mock interview).
- Employers interview about 3 in 100 applicants on average (CareerPlug 2025 Recruiting Metrics Report: vendor data from about 10 million applications on its own platform, https://www.careerplug.com/recruiting-metrics-and-kpis/); tailored, good-fit, early applications and referrals are how to beat that. 5–10 tailored applications a week beats 50 generic ones. Some postings aren't actively hiring at all (about 1 in 5 on one platform in 2024; see "Ghost jobs"), so some silence isn't about the user.
- Contact 2–3 people per target company rather than one; most won't reply, and that's normal. Old colleagues and acquaintances are often more useful than close friends or strangers (study: Rajkumar et al., LinkedIn experiment with 20 million users, Science 2022).
- A referral or a conversation with someone at the company multiplies the odds. For every A-priority job, try to find one human there (`/network`).
- Apply on the employer's own site for priority A/B jobs; one-click Easy Apply only for C or when it's the only route, never both. Get a referral in place before applying: some systems can't attach one afterward.
- **Recruiters and executive search firms (headhunters):** for mid-career and senior users, some roles (especially senior ones) are filled through agency or retained search recruiters, sometimes without a public posting. Reply to relevant ones, keep a short profile ready, and track each one in `contacts.csv` (`relationship: recruiter`, firm in `company`). The employer pays them, never the user; a "recruiter" who charges a fee is a red flag. Ask which employer a role is with before the user's resume goes anywhere, so two recruiters don't submit them to the same job. Retained vs contingency firms, verifying a recruiter, and how senior users approach search firms: `.claude/skills/network/references/recruiters-and-search-firms.md`.
- Job-board applicant counts ("Over 100 applicants") count clicks on Apply, not finished applications. Don't let them decide whether to apply.

## Follow-up cadence

| Situation | When | How many |
|---|---|---|
| Applied online, no response | 7–10 business days, to a recruiter or alum if one can be found | 1 (a 2nd only if a named person has replied or accepted the user's connection) |
| Applied to an hourly or shift job, no response | 3–5 business days (the app sets 4): a call or visit if the posting doesn't forbid it (`hourly-and-shift-work.md` §6) | 1 |
| Cold networking message | 5 business days (no reply after 3 business days? it's fine to try a second person at the same company) | max 2 touches total |
| After an interview | Thank-you within 24 hours, to each interviewer | 1 each (a thank-you is not a follow-up: it doesn't count toward `followups` or a contact's `touches`) |
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
- The assistant **drafts**; the user **sends** by hand. Send connection requests a few at a time, to people the user has a real link with, never in bulk. LinkedIn limits how many invitations an account can send but doesn't publish the number, and a big pile of unanswered invitations makes restrictions more likely.
- A connection-request note is limited to **200 characters** on a free account, and free accounts get only a few personalized invites a month: spend them on people who matter, and send other requests without a note. Messages to existing connections can be longer (keep them under about 600 characters).
- To share their LinkedIn data, the user downloads their own data export (LinkedIn → Settings & Privacy → Data privacy → Download your data; the link lasts 72 hours) and runs `/import-linkedin`.
- Public job pages can be read by link. Nothing behind a login.

## Scam red flags (job seekers are heavily targeted)

Stop and tell the user if any of these show up:
- An "offer" for a job they didn't apply to, or with no real interview
- Interviews only over text, WhatsApp, Telegram, or Signal
- Requests for money (equipment, training, background-check fees) or to cash a check
- Requests for an SSN or bank details before a written offer from a verifiable company domain, or for ID documents sent by email or chat to a recruiter you can't verify. (Identity and right-to-work checks before an offer are normal in some countries, such as the UK; verify the employer independently and use its official process. A real check is run by the employer or its named screening provider through its own portal or in person, for this one application, and never costs the user money.)
- A "job" whose work is opening bank or crypto accounts, or doing video identity checks (Video-Ident, Postident) "to test an app or a bank's onboarding": common in Germany and spreading. The accounts are opened in the user's name and used to move stolen money; the user can be held liable. Never do a video ID check for anything except the user's own account with a provider they chose.
- Pay far above market for the level, vague duties, urgency ("accept today")
- Email from a free domain (gmail.com) claiming to be a big company; recruiter not findable on the company site
- A sender domain that only looks like the company's (careers-acme.com, acme.careers) or a Reply-To that differs from From; check it letter by letter against the company's real site
- A "skills test", repository or "interview app" to download and run (malware campaigns use fake recruiters)
- Task scams: pay for rating, liking or "app optimization", then a deposit to unlock earnings
- A recruiter or interviewer on a video call who can't be matched to the employer's real site or staff (deepfake and impersonation scams are rising): verify them through the company's own website or main phone line first

Report US scams at ReportFraud.ftc.gov, UK ones to Action Fraud, German ones to the local police (Onlinewache), and always to the job site. Full checklist: `.claude/skills/sync-inbox/references/scam-check.md`.

## Ghost jobs (not scams, but a waste of time)

Some postings are never filled: roughly 18-22%, about 1 in 5, of postings on Greenhouse's platform in a 2024 quarter saw no hiring activity (Greenhouse's own data, reported by FOX 9 on 14 January 2025: https://www.fox9.com/news/ghost-jobs-greenhouse-analysis). One signal proves little: big employers keep some roles posted all year. Worry when several show up together: not on the employer's own careers site, open or reposted for months with a vague template description, recent layoffs or a hiring freeze, no pay range where the location's pay-transparency law requires one (look up the current rules for that place). A referral or a quick question to a named recruiter is the fastest check. Details: `.claude/skills/evaluate-job/references/reading-postings.md`.

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
