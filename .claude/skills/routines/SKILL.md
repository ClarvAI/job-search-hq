---
name: routines
description: "Use when the user wants automatic checks: new jobs every morning, watching their inbox, daily follow-up drafts, a weekly review, or asks to 'automate', 'schedule' or 'run this every day'. Sets up opt-in routines on their own computer that only read, draft and track."
---

# /routines: automatic checks

A routine is a check the app runs by itself on a schedule, on the user's own computer, while they do something else. Each run starts a fresh session, does one job, and leaves the results in the folder: new leads in the Job Inbox, drafts in the Outbox, a line in the tracker, a weekly review. **Routines only read, draft and track.** They never send, apply, publish, accept anything, or change `profile/`, and they ask no questions (anything that needs the user waits for them, listed). Nothing is set up without the user's yes, and they can pause or delete a routine any time.

## 1. Explain and recommend

Say it in two or three plain sentences (above), then where it runs (step 3), then the cost: **each run uses their Claude or ChatGPT plan like a short chat**, so once a day beats hourly, and the scans skip the heavy research. Recommend one to three, not all five, from what fits their search:

| Routine | Schedule | When it fits | Instructions (paste exactly) |
|---|---|---|---|
| morning scan | Weekdays, 8:00 | Almost everyone actively looking | `Job Search HQ morning scan: follow the find-jobs skill in scheduled mode.` |
| inbox check | Daily, 7:30 | Gmail, or a Microsoft 365 mailbox, connected to this app | `Job Search HQ inbox check: follow the sync-inbox skill in scheduled mode.` |
| follow-up drafts | Weekdays, 9:00 | Several applications or contacts in play | `Job Search HQ follow-up drafts: follow the follow-up skill in scheduled mode.` |
| weekly review | Weekly, Friday 16:00 | Anyone; pairs well with the morning scan | `Job Search HQ weekly review: follow the weekly-review skill in scheduled mode.` |
| certification reminder | Weekly, on their certification day, 9:00 | Only if `benefits_cert_day:` is set in `profile/preferences.md` | `Job Search HQ certification reminder: follow the routines skill's certification reminder in scheduled mode.` |

Use the user's own times if they give them (in their time format), and the names above so the startup note can report results. Read `profile/preferences.md` first: before setup is done, or when `search_status:` is paused or closed, suggest finishing setup or resuming the search first. Ask which ones they want (one question), and go ahead only on a clear yes for each.

## 2. Find out which app they're in

From this session (the Claude desktop app's Code tab, the Claude terminal, Codex in the ChatGPT desktop app, or the Codex terminal or editor); ask once if you can't tell. If they use both apps on this folder, set up each routine in one app only, so the same check doesn't run twice.

## 3. Set it up

**Claude desktop app (Code tab).** Needs Claude Desktop 1.1.5368 or later.
- If this session can create scheduled tasks (a tool for them is available), offer to make it: after the yes, create each one with the name, a one-line description, the instructions line from the table, its schedule, and this folder as the working folder, **not** in an isolated worktree, in Auto permission mode where the tool lets you choose. Then tell them to check those three settings on the routine's **Edit** page.
- Otherwise, walk them through it, one step at a time: **Routines** in the sidebar (or the sidebar's **More** menu) → **New routine** → **Local**. Fill in **Name** and **Description**, paste the instructions line into **Instructions**, pick **Auto** in the permission-mode picker under it (if Auto isn't offered, pick **Accept edits** and do the "Run now" step below carefully), choose **this folder** as the working folder, and leave the **isolated worktree** switch **off**. Pick the **Schedule**, then save.
- Why the worktree stays off: a worktree is a separate copy of the app without the user's own files (their tracker, profile and drafts are never copied into it), so the routine would find nothing and its results would vanish.
- Then **Run now** once and watch it. If it stops to ask permission for something, choose "always allow" so later runs don't stall (a run waiting for an answer just sits there until they come back). Each run appears under **Scheduled** in the sidebar with a desktop notification.
- It runs only while the Claude app is open and the computer is awake. A run missed while asleep happens once when the computer wakes (only the latest missed one). **Settings → This computer → System → Keep computer awake** prevents idle sleep; closing a laptop lid still sleeps it.

**Codex (ChatGPT desktop app).** Open **Scheduled** in the sidebar (or ask in a chat to schedule it) and create a task with the instructions line and schedule. Choose this folder's **local project**, **not** a new worktree (the same reason as above). The computer must stay on and the app running. Runs happen unattended with the default sandbox and no approval prompts, and results arrive in **Scheduled**, which works like an inbox. The Codex terminal and editor extension can't manage scheduled tasks: suggest the ChatGPT desktop app.

**Claude terminal.** There's no lasting scheduler here: a repeating task (`/loop`) only runs while that terminal session stays open, and stops after 7 days. Good for "watch for replies this afternoon" (for example `/loop 1h /sync-inbox`), not for every day; for daily checks, suggest the Claude desktop app on the same folder. Never suggest cloud routines (`/schedule`, claude.ai): they run on a fresh copy of a GitHub repository, can't see this folder's files, and would need the user's data on GitHub.

After setting up, add one line to `history/activity.md` (e.g. `Routine set up: morning scan, weekdays 8:00`) and tell the user what they'll see: a short note when they next open the app ("Your morning scan found 4 new leads"), and the results in the Job Inbox, Outbox or `interviews/`.

## Pause, change or delete

- **Claude desktop app:** **Routines** → click the routine → **Status** (Active / Paused), **Edit**, **Run now**, or **Delete** (tick **Also delete files on disk** to remove its saved instructions too). They can also ask Claude in any desktop session ("pause my morning scan").
- **Codex:** open the task in **Scheduled** to pause or remove it, or ask in a chat.
- Suggest pausing routines when the user pauses or wraps up their search (`my-data`), and when they move or rename this folder (a routine keeps pointing at the old place).

## How scheduled runs behave

Every routine follows `references/scheduled-mode.md` plus the "Scheduled mode" section of its own skill. Results are logged to `history/routines.md`; the startup note shows the last day's results.

## Certification reminder (scheduled mode)

Run only when the instructions say scheduled mode. Follow `references/scheduled-mode.md`. If today isn't the user's certification day by `benefits_cert_day:` (a weekday, or "every other <weekday> from YYYY-MM-DD"), log `not certification day` and stop. Otherwise, read only: count the benefit week(s) being certified the way `today` does (records in `jobs/tracker.csv`, `contacts/contacts.csv`, sent Outbox files and `jobs/work-search-log.csv`; no drafts), applications and other activities separately, against the agency's number in `.claude/skills/work-search-log/references/requirements.md`. Don't write to `jobs/work-search-log.csv`. Log e.g. `certify today; 3 of 3 activities recorded` or `certify today; 1 of 3 recorded, open the app and say "work search log"`. The user certifies on the agency's site themselves.
