---
name: today
description: "The user's daily job-search plan. Use when they ask what to do today, open a session without a specific task, say \"what's next\", or want a status check."
---

# /today: what to do today

0. If `jobs/tracker.csv` has a practice row with `source` = `tour` (left from the tour), ask the user once whether to remove it.
1. Read `jobs/tracker.csv`, `jobs/leads.csv`, `contacts/contacts.csv`, `profile/preferences.md`, drafts in `outbox/` (files whose header has `status: draft`), and the last 10 lines of `history/activity.md` (mention in one line anything the other app changed since this session started). Today is the session date. The due-alerts pop-up may already have shown the user up to 3 urgent items when the session opened; give the full plan anyway, and don't treat those as already handled.
2. If Gmail/Calendar connectors are available, also check whether any `outbox/` drafts marked `in-gmail-drafts` now appear in their Sent mail (match and mark them exactly as `sync-inbox` step 4b does, then update follow-ups from the sent date), and quickly check (read-only) for: replies from companies or contacts since the last check, interview invites, and upcoming interviews in the next 7 days. Don't open unrelated mail. If not connected, skip silently.
3. Reply in this shape, short:

**Today, <weekday Mon D>**
- **Due now:** each open job or contact whose next date is today or past, with the action (max 5; oldest first)
- **Deadlines:** any `interested` job whose application `deadline` is within 7 days, and any `offer` whose answer-by date (`deadline`) is within 7 days; say how many days and flag ≤ 3 as urgent. Also any `READY.md` packages waiting for the user's review
- **Interviews coming up:** date, company, and whether prep exists in the job folder
- **Waiting in your Outbox:** count, with subjects
- **New leads:** if `jobs/leads.csv` has rows with status `new`, the count and "sort them in `/job-inbox`"; leads marked `saved` still need `/add-job`
- **New in your inbox:** anything job-related (if checked). Anything from a new sender, or asking for money, personal details, a download, or a move to text/WhatsApp, gets the scam check in `.claude/skills/sync-inbox/references/scam-check.md` before you suggest replying
- **This week:** progress vs weekly goals (applications sent, conversations, mock interviews, counted from tracker dates and interview logs)

**My suggestion for the next hour:** three concrete actions, most valuable first, each startable with one reply (e.g., "Draft the follow-up to Acme's recruiter → say 'go 1'"). Usual order: anything time-bound (interview, offer, deadline), then replies and follow-ups to real people, then one tailored application, then practice. Warm contacts before cold applications. Each action should fit inside the hour.

**Pacing and wellbeing:** never shame a slow day or week. After a rejection, give one line of perspective plus one concrete lesson if there is one. If the user sounds burned out, suggest a lighter day (one small task). If they express hopelessness or thoughts of self-harm, respond with care first and point them to local crisis resources (US: call or text 988) before anything job-related.

4. When the user picks one, do it. Update the tracker and next dates in the same turn. When it's done, say in one line what it moved ("That's 3 of 4 applications this week"): seeing progress helps people keep a long search going.
5. Nothing tracked yet → suggest `/start` (if setup isn't done), naming 3 employers (for students and new grads, new-grad programs) from `knowledge/target-employers.md` and offering `/find-jobs` to check which are hiring now (don't claim a role is open without checking), and emailing the user's former managers (for students, co-op or internship managers).
