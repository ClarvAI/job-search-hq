# How your Job Search HQ works

Five minutes of reading, and you'll know where everything lives, what happens on its own, and what's always your call. Prefer a hands-on walkthrough? Ask for the **tour** (`/tour` in Claude, `$tour` in Codex).

---

## The big idea

Everything about your search is kept in a few plain files in this folder. Your assistant (Claude, or Codex from ChatGPT; both work, and you can use both) reads and updates them; the panels and pages show them. When the assistant reads a file, it's sent to the company running it (Anthropic or OpenAI) to process, like any chat. Nothing is shared with employers or posted anywhere unless you do it.

```
              YOU  ── type, talk, or press buttons ──┐
                                                     ▼
   ┌──────────────────── Claude  and / or  Codex ────────────────────┐
   │ finds jobs · tailors resumes · drafts emails · preps interviews │
   └───────────────┬──────────────────────────────┬─────────────────┘
                   ▼                              ▼
     YOUR FILES (the source of truth)       PANELS (Claude) / CHAT (Codex)
     profile/master-resume.md  ← your facts      /pipeline   your job board (edit here)
     jobs/tracker.csv          ← every job       /outbox     drafts waiting for you
     contacts/contacts.csv     ← people          /contacts   your network (edit here)
                                                 /job-inbox  new openings to sort
                                                 /apply-kit  answers to copy into a form
                                                 /interview-room  mock interviews
     outbox/                   ← drafts
     history/activity.md       ← what changed, by which app
                   │
                   ▼
     PAGES (open in your browser, or as a private link)
     dashboard · flashcards · portfolio · interview brief
```

---

## The four things to remember

1. **Your master resume is the truth.** `profile/master-resume.md` holds every real fact about you. Every resume, letter, and answer is built from it; nothing is invented. The assistant asks before changing it.
2. **Your tracker is the scoreboard.** `jobs/tracker.csv` has one row per job: its stage, your next step, and when it's due. It opens in Excel.
3. **You send everything.** The assistant drafts; you decide. Emails and messages wait in your Outbox until you send them.
4. **Just ask.** You never need the commands. "What should I do today?" or "Help me prep for Acme on Thursday" works.

---

## What happens on its own vs. what you do

| On its own | Your call |
|---|---|
| When you open the app, it knows today's date, what's due, and anything changed since last time | Which jobs to apply to |
| In Claude, a one-line summary of your search sits above where you type | Submitting applications (on the company's site) |
| Moving a job to **Applied** on the board sets a follow-up 7 business days out | Sending any email or LinkedIn message |
| Every resume and letter is fact-checked against your real experience before you see it | Approving changes to your master resume and settings |
| Your tracker is kept updated as things happen | Sharing anything (like your portfolio) with other people |
| Published pages get refreshed when your data changes (Claude, where publishing is available) | Live interviews and online tests (those are you alone) |

---

## Your panels (inside Claude)

When you open Claude, a small pop-up tells you what's due today or tomorrow: interviews, offer and application deadlines, follow-ups, and Gmail drafts you haven't sent. Each one shows once a day. Type `/today` for the full list.

**`/apply-kit` is for filling in an application.** Open it next to the employer's form. It shows everything the form will ask for that job (your contact details, work authorization, start date, salary, school, each job you've had, and the job's own questions with answers Claude drafted), each with a **Copy** button, plus the file names to upload. Anything missing says "[not set] — ask Claude". After you press Submit on their site, press **Mark applied…** and your tracker and follow-up date update themselves.

**`/contacts` is your networking board.** Everyone you've met or want to meet, grouped by where things stand: to contact, waiting on a reply, replied, talked, referred you. After you send someone a message, press **Message sent…** and pick the day; when they write back, **They replied…**; after a call or coffee, **We talked…** (Claude offers a thank-you note); if they put in a word for you, **Referred me…**. Two messages with no reply? The card says stop here, and **Mark cold…** moves them out of the way. **Draft a message** asks Claude to write one for your Outbox. Every change saves to your contacts list, and Claude knows about it.

**`/job-inbox` is where new openings land.** When you run /find-jobs, each opening it finds shows up here as a card. Press **Save** to add it to your tracker, **Skip** to pass, or **Not for me…** and pick a reason (too senior, wrong location, and so on). Skipped jobs never come back, and your reasons make the next search better.

**`/pipeline` is your job board, and it's live.** Each job shows its stage and next step. Press **Update…** to change the stage, the next step, or its due date; **Mark next step done** when you've done it; **Push back a week** when something is waiting on someone else. Every change saves straight to your tracker, and Claude knows about it.

**`/outbox` is drafts waiting for you.** Read each one, then **Create Gmail draft** (it appears in your Gmail drafts, ready to send), **Copy** (for LinkedIn), **Mark sent**, **Ask Claude to edit**, or **Discard**. Nothing is sent unless you press the button.

**`/interview-room` is mock interviews.** During `/mock-interview`, questions appear here and are read aloud, a clock times your answer, and a scorecard fills in. Answer out loud: click the mic in the Desktop app (or type `/voice` once in the terminal, then hold Space).

> Don't see panels? They need a recent version of Claude Code and a trusted folder. Updating may help, but you don't need them: everything works in the chat (below).

### In Codex (or Claude without panels): the same things, in the chat

- **"Apply kit for Acme"** prints every answer for that application as copyable blocks. Say "I submitted it" when you're done and it marks it applied.
- **"Show my contacts"** lists everyone by status with follow-ups due. Tell it what happened ("I messaged Jane yesterday", "Pat replied") and it updates your contacts.
- **"Show my board"** lists every job by stage with what's due. Tell it what happened ("I applied to Acme yesterday", "Globex set up an interview for the 14th") and it updates your tracker.
- **"Show my outbox"** lists drafts by number. Say "read 2", "copy 2", "make a Gmail draft of 2", "I sent 2 yesterday", or "discard 2". Copying or making a Gmail draft never sends anything.
- **"Mock interview for Acme"** runs the interview in the chat. In Codex, turn on voice conversation for the most realistic practice: it asks questions out loud and listens to your answers. Otherwise it can read questions aloud (allow it the first time it asks), and it times your answers. Answer by typing or with dictation (Mac: the Dictation shortcut set in System Settings → Keyboard → Dictation, often Fn twice or the microphone key; Windows: Win + H).

---

## Using Claude and Codex together

You can use either app, switch between them, or have both open. They follow the same rules (`AGENTS.md`) and use the same files, so a job you add in one shows up in the other. Whenever one changes your tracker, contacts, or drafts, it adds a line to `history/activity.md`, and the other app reads the latest ones when it starts (ask "what changed?" any time). Before saving, each one re-reads the file so it doesn't overwrite the other's work (just don't ask both apps to change the same job at the same moment). The only thing to avoid: having `tracker.csv` open in Excel while either app is changing it.

---

## Your pages (in your browser)

These live in the `pages/` folder: your own copies, made from `templates/blank/pages/` the first time you open the folder. Double-click one to open it, or ask the assistant to open it.

| Page | What it's for | Can you edit it there? |
|---|---|---|
| **Dashboard** | A good-looking snapshot of your whole search | No. Change things on the board or just say what happened, then say "refresh my dashboard" |
| **Flashcards** | Practice your stories and technical answers. Tap to flip, swipe right if you nailed it | Your Nailed it / Practice again marks are saved in that browser |
| **Portfolio** | A one-page site about you to link from LinkedIn or your email signature | Ask the assistant to change it |
| **Interview brief** | One page to read and print before each interview | Ask for interview prep for that job |

**Want them on your phone?** Only in Claude sessions that can publish pages (ask "can you publish pages here?"; Codex can't). There, say "publish my flashcards" (or dashboard, or portfolio). Claude puts the page on your claude.ai account as a **private link** only you can open, keeps that same link, and updates it when your information changes. Only your portfolio is meant to be shared, and only when you decide to (from the page's Share menu).

---

## How it looks

`profile/design.md` sets how everything looks. Say "show me the looks", "use my brand colors", "bigger text" or "less motion" and your assistant updates it and every page at once. Your resume keeps a plain, recruiter-safe format whatever you choose.

## Where everything is

| Folder | What's in it |
|---|---|
| `profile/` | Master resume, preferences, interview stories, writing style, references, published-page links |
| `jobs/` | `tracker.csv`, `leads.csv` (openings found for you and what you decided), plus one folder per job (posting, fit notes, resume, cover letter, prep) |
| `contacts/` | People you've met or want to meet |
| `outbox/` | Message drafts (sent ones move to `outbox/sent/`, discarded ones to `outbox/discarded/`) |
| `history/` | `activity.md`: what either app changed recently |
| `interviews/` | Mock interview scorecards, real interview notes, weekly reviews |
| `pages/` | Dashboard, flashcards, portfolio, interview-brief template (your own copies) |
| `knowledge/` | The job-search playbook and interview question bank (part of the app), and `knowledge/field/`: your field pack built during setup (field primer, resume keywords, target employers, role-specific questions) |
| `imports/` | Drop files here for the assistant (your resume, your LinkedIn export, offer letters) |
| `templates/blank/` | Blank starting copies of your files; the first time you open the folder they're copied into place, never over anything you have |
| `VERSION`, `CHANGELOG.md` | Which version of the app you have, and what changed in each version |
| `DATA_CONTRACT.md` | Which files are yours (never shipped, never changed by an update) and which belong to the app |

You can open any of these yourself. They're ordinary files, and `tracker.csv` opens in Excel or Google Sheets. If you edit the tracker in Excel: don't rename the column headings, save it as **CSV UTF-8 (Comma delimited)** (not .xlsx), and **close Excel when you're done**. If Excel is still open while the assistant changes your tracker and you then press Save in Excel, Excel puts back its older copy and that change is lost. **Keep dates as YYYY-MM-DD** (like 2026-10-07): Excel turns them into your region's style when it opens the file (10/07/2026 or 07/10/2026) and saves them that way, and then the assistant can't always tell which is the day and which the month. Dates where it's clear (like 25/10/2026) are read fine; unclear ones (like 03/04/2026) show as "date unclear" until you confirm them. Before saving, select the date columns → Format Cells → Custom → type `yyyy-mm-dd` → OK. Easiest of all: change dates on the board or just tell the assistant ("move Acme's follow-up to the 14th").

---

## Your safety switches

In `profile/preferences.md` (the assistant will explain before changing either):

- **`outbox_mode: draft-only`** (default): approving an email makes a Gmail draft and you press Send in Gmail. `send` lets Claude's Outbox panel send it after you press Send and confirm. Codex always makes drafts only.
- **`autonomy: coach`** (default): you submit every application. `assisted` lets the assistant fill in application forms in the app's built-in browser, stopping before Submit unless you say "submit it".

---

## Resumes and cover letters

- **Applying abroad or in another language:** the assistant writes only in languages you've said you can check (set in your preferences); otherwise you get an English version alongside and a reminder to have a native speaker check it. It never adds a photo, birth date or marital status unless you choose to.
- **Take-home assignments:** tell the assistant when one arrives. It helps you pin down scope, time and AI rules, drafts any question to the recruiter, tracks the due date, and coaches you; the work itself is yours.
- **Interview accommodations:** whether and when to mention a disability is your call. The assistant can draft a short request (no diagnosis needed) and set up mock interviews the same way.

- **They come as PDFs.** After they're fact-checked, the assistant saves `Your-Name-Resume-Company.pdf` (and the cover letter) in the job's folder. Open it and look it over before you send it. If your computer has no Chrome or Edge, it walks you through Print → Save as PDF instead.

---

## If you've lost your job

Say **/laid-off** for a dated first-week list (unemployment, health coverage, severance) and drafts to ask colleagues for references. Claiming unemployment? **/work-search-log** keeps the weekly record your state or Universal Credit asks for, in their order; you enter it yourself. If your visa depends on having a job, `/today` can count the days left.

---

## Your data

- "Back up my stuff" saves a dated zip of everything to your Downloads folder (or another folder you pick). Keep one copy somewhere other than this computer. "I got the job, wrap up" or "pause my search" tidies your tracker. "Delete everything" wipes this folder back to blank, but only after you type "delete my data".
- Your own files are never part of the app's download or its git history, so that zip is your backup. If you ever put this folder in git anyway, use a **private** repository only: it holds other people's contact details, references and offer terms. As a safety net, run `git config core.hooksPath .githooks` once in the folder (setup offers to) and git stops ordinary pushes to a public GitHub repository. It's not a lock: it doesn't cover other sites or uploads made another way.
- **New version?** Download the release zip and say "update". Only the app's files change; your files are never touched. If you'd edited an app file, your version is kept next to it as `<file>.local`, and "undo the update" rolls back.

---

## If something seems off

- "What's in my tracker for Acme?" or "Show me my board."
- "What changed recently?" (it reads `history/activity.md`)
- "Undo that last change to my tracker." (The assistant can fix the file.)
- "Why did you suggest that?" It will show its reasoning and sources.
- "Check my setup" (`/health`) looks over the folder, safety checks, panels and connections, changes nothing, and tells you the one thing to fix first.
- Still stuck: ask for the menu or the tour.
- **Safety checks, honestly:** both apps have checks that block the assistant's own attempts, through its connections, to send, delete, or forward email or to invite people to calendar events, and that stop it navigating a browser to Gmail, Outlook or LinkedIn (they can't see what an already-open tab shows). In Claude, they also block web addresses that carry your email, phone, name or large blocks of data (a pattern check that can't catch every disguised form). In both apps they stop pushes to a public GitHub repository, including through an SSH alias for GitHub (other hosting sites aren't checked; keep any copy private). If a check crashes, the action is blocked; if it hangs past its time limit, the app lets the action go ahead. In Claude the checks run once you trust the folder (they cover shell commands, including PowerShell on Windows, but not file edits or web searches); in Codex they run only after you trust the hooks (`/hooks`), and again after they change. They only see the actions they recognize: not every script, not clicks in a browser tab that's already open, and not cleverly disguised data. They're a backstop. The main protection is that the assistant's rules say you send everything, and it follows them. None of this limits you: you can always do anything yourself. More in the README's "What the safety check covers".
