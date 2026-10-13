# Getting started with Job Search HQ

The full setup guide, in plain English. The short version is in the [README](../README.md); how everything fits together once you're set up is in [HOW-IT-WORKS.md](../HOW-IT-WORKS.md). Which apps it works in, and what each one can and can't do, is in [platforms.md](platforms.md).

**Before setup:** put your current resume (PDF, Word or text) in the `imports` folder. Setup reads it and turns it into your master resume. No resume yet? Setup can build one from a short conversation. Before adding any file, remove your date of birth, ID or passport numbers, bank details and passwords if it has them: the assistant won't keep them, and whatever it reads is sent to the AI company running it (see [privacy.md](privacy.md)).

> **Keep it private.** This folder will hold your resume, your contacts' details, references and offer terms. Those files are never part of the app's download or its git history, so back them up with `/my-data` (a dated zip), not git. If you ever do put this folder in git, use a **private** repository only, never a public fork. As a safety net, run this once in the folder: `git config core.hooksPath .githooks` (setup and `/health` offer to do it for you; it's off until you say yes), and git itself stops pushes to a public GitHub repository, even ones a script makes. It's not a lock: it doesn't cover other sites (GitLab, Bitbucket, cloud drives) or uploads made some other way.

---

## Open the folder (5 minutes), then a 15–20 minute setup chat

Using only one app? Follow just its section below.

**Got it as a zip?** Unzip first. Mac: double-click the zip. Windows: right-click it → **Properties** → tick **Unblock** → **OK**, then right-click → **Extract All** (just double-clicking only opens a preview). Move the folder somewhere you'll keep it, like Documents. Always open the folder that has `README.md`, `AGENTS.md` and `CLAUDE.md` directly inside it, never a folder inside it: opened one level down, the assistant doesn't get its rules and the safety checks don't run.

### With Claude (adds panels and read-aloud interviews in recent versions)

**You need:** a paid Claude plan (Pro works; see [Cost and plans](../README.md#cost-and-plans)) and the **Claude desktop app** (claude.ai/download), updated to the latest version (the panels need version 2.1.286 or later; the terminal version needs 2.1.287). **Windows only:** first install **Git for Windows** (git-scm.com/download/win; click Next through every screen), then restart. Claude needs it to run this folder's safety checks.

1. Open the Claude desktop app → **Code** tab → choose **Local** (not Cloud) → **Open folder** → pick this folder.
2. If Claude asks whether you trust this folder, click **Trust**. That turns on the safety rules and the daily greeting.
3. Type **`/start`** and press Enter.

> **Check:** when you type `/`, you should see `/start` in the list. If you don't, you opened the wrong folder.

> Prefer the terminal? Install Claude Code (claude.ai/code; on Windows, Git for Windows first, as above), then in this folder run `claude` and type `/start`.

Use the **Code** tab, not a regular Claude chat. A regular chat (even one with a folder attached) doesn't run this folder's safety checks or panels; see [platforms.md](platforms.md).

### With Codex (ChatGPT)

**You need:** a ChatGPT account (Codex is included in ChatGPT plans; Plus or higher recommended, see [Cost and plans](../README.md#cost-and-plans)), and the **ChatGPT desktop app** (Mac, Windows or Linux), updated to the latest version. Download it from OpenAI's [Codex quickstart](https://learn.chatgpt.com/docs/quickstart) and sign in with your ChatGPT account. On Windows the safety scripts run with PowerShell, so you don't need Git for Windows for Codex.

1. In the ChatGPT desktop app, switch to **Codex** and add this folder as a new local project. If the project has more than one folder, make this one the **primary** folder: Codex only reads the rules and settings of the primary folder.
2. If Codex asks whether to trust this folder, say yes. Without that, Codex skips this folder's settings and safety checks, and if you choose "don't trust" it skips the assistant's rules too.
3. When it says **Hooks need review**, choose **Trust all and continue**. Hooks are this folder's safety checks and daily greeting; without them, nothing blocks email sending.
4. Type **set me up** (or `$start`) and press Enter.

> **Check:** type `$` and you should see `start`, `today` and the other workflows in the list. If you don't, you opened the wrong folder.

> Prefer the terminal? Install the Codex CLI (linked from that quickstart), open a terminal in this folder, run `codex`, and follow steps 2 to 4.

### Using both

Both apps read the same files and follow the same rules, so you can switch any time: start a cover letter in one and finish it in the other. Each one leaves a short note in `history/activity.md` when it changes your tracker, contacts or drafts, so the other one knows what happened. Having both open is fine; each re-checks the files right before saving. Just don't have both (or one app and a Claude panel) change your tracker or contacts at the same moment, even for different jobs: finish in one, then switch.

After setup, do step 1 of your first-week plan (it takes two minutes), and take the **tour** (`/tour` in Claude, `$tour` in Codex) for a 10-minute hands-on walkthrough, then start each session with **today**.

---

## What you can do

Just type what you want in plain English ("find me operations analyst jobs near Austin", "help me prep for my Acme interview Thursday"), or use a shortcut. In Claude they start with `/`; in Codex, with `$` (so `/today` is `$today`).

| Type | What happens |
|---|---|
| `/today` | What's due, what's new, and three suggested moves |
| `/add-job` + links | Paste job links (Indeed, LinkedIn, Handshake, company sites). It saves every detail, adds them to your tracker, and gets the application ready for you to review |
| `/find-jobs` | Searches for new postings that fit you |
| `/evaluate-job` + a saved job | Re-check a job you already added: fit, gaps, red flags, apply or skip (new links go to `/add-job`) |
| `/tailor-resume` | A resume for that job (length and paper size suited to the job's country and your experience), fact-checked against your real experience and saved as a ready-to-send PDF in the job's folder |
| `/cover-letter` | Short, specific, sounds like you |
| `/apply` | The full application package and a checklist |
| `/network` | Who to talk to at a company, plus a message draft |
| `/follow-up` | Drafts every follow-up that's due |
| `/interview-prep` | Company brief, likely questions, your best stories, questions to ask |
| `/mock-interview` | Spoken practice interview with a timer and a scorecard |
| `/thank-you` | Debrief plus thank-you notes after a real interview |
| `/offer` | Compare and negotiate offers |
| `/linkedin`, `/import-linkedin` | Improve your profile; find contacts from your LinkedIn data export |
| `/sync-inbox` | Reads your job emails (Gmail, a work or school Microsoft 365 account in Claude, or emails you paste or save) and updates your tracker |
| `/weekly-review` | How it's going and what to change |
| `/career-fair` | Game plan for a career fair, then follow-ups |
| `/laid-off` | Lost your job? A dated first-week list (unemployment, health coverage, severance) and drafts to ask colleagues for references |
| `/work-search-log` | Claiming unemployment? Keeps the weekly record your state or Universal Credit asks for, in their order; you enter it yourself |
| `/my-data` | Back up everything, wrap up or pause your search, or start over |
| `/pages` | Your dashboard, flashcards, portfolio website, printable interview brief, opened in your browser (in Claude sessions that can publish pages, "publish my flashcards" also gives you a private link for your phone) |
| `/tour` | A hands-on walkthrough of how everything works |
| `/health` | Checks that everything is set up and working, changes nothing, and tells you the one thing to fix first |
| `/update` | Installs a new version of the app (see [Updating](../README.md#updating)) |
| `/menu` | Everything above |

Also built in: applications in other languages with each country's conventions, two-page federal resumes for USAJOBS, and help with take-home assignments and interview accommodation requests (just ask).

If your visa depends on having a job, `/today` can count the days left.

### Panels (Claude only)

- **`/outbox`**: every email or LinkedIn message Claude drafts for you waits here. Read it, then **Create Gmail draft…** (it lands in your Gmail drafts, formatted, and you send it from Gmail), **Copy**, **Mark sent**, **Ask Claude to edit**, or **Discard**.
- **`/pipeline`**: your live job board. Change a job's stage, next step, or due date, and it saves straight to your tracker. A one-line summary also sits above where you type.
- **`/job-inbox`**: openings `/find-jobs` found for you, as cards. **Save**, **Skip**, or **Not for me** (with a reason, so the next search gets better).
- **`/apply-kit`**: open it next to an application form. Every answer the form asks for, with a **Copy** button, then **Mark applied** when you've submitted.
- **`/contacts`**: your networking board. Record when you message someone, when they reply, when you talk, and when they refer you.
- **Due alerts**: when you open Claude, a short pop-up lists what's due today or tomorrow. Nothing to type.
- **`/interview-room`**: during `/mock-interview`, the interviewer's question appears here and is read out loud, a clock times your answer (you can turn the clock off), and a scorecard fills in.

In Codex the same things happen in the chat: say **show my board**, **show my outbox**, **show my contacts**, **show my job inbox**, **apply kit for Acme**, or **mock interview**. For mock interviews in the ChatGPT desktop app, start a voice chat and it interviews you out loud; in text mode it can still read questions aloud if you allow it the first time, and it times your answers.

### Talk instead of type

- **Claude desktop app:** click the microphone in the message box. **Claude terminal:** type `/voice` once, then hold **Space** while you talk.
- **Codex:** in the ChatGPT desktop app, start a **voice chat** for mock interviews (paid plans): it talks and listens like a real interviewer. The terminal doesn't have it. Otherwise use the app's microphone, or your computer's dictation (Mac: the Dictation shortcut set in **System Settings → Keyboard → Dictation**, often **Fn** twice or the microphone key; Windows: **Win + H**).
- **Mac tip (Claude):** the Interview Room reads questions in your computer's voice. If it sounds robotic: System Settings → Accessibility → **Read & Speak**, click the Info button (a small i in a circle) next to **System voice**, download a higher-quality English voice, then choose it as your System voice (Siri voices can't be used for this). On older macOS the section is called Spoken Content.

Mock interviews are much more useful out loud. That's how the real thing works. Ask for a **one-way video** practice round too: many big companies screen new grads with recorded video interviews.

---

## Make it yours

Your pages (dashboard, flashcards, portfolio, interview briefs) share one look, set in `profile/design.md`. Pick a preset (Default, Modern, Minimal, High contrast) or bring your own brand: colors and fonts from your website, a brand guide in `imports/`, Figma, or (in Claude) a design system you already have. Every page changes together, and text contrast is checked automatically. Resumes and cover letters stay safe for hiring software: only the font (from a safe list), a dark accent for your name, spacing and paper size change. If you work in a creative field, you can also get a designed resume alongside the plain one.

## Optional connections

In Claude: **Settings → Connectors**. In Codex: install the Gmail (or Google Calendar) plugin from the **Plugins** tab in the ChatGPT desktop app, or with `/plugins` in the terminal.

- **Gmail**: lets the assistant spot recruiter replies and put approved drafts into your Gmail. It never sends on its own.
- **Google Calendar**: lets the assistant check your schedule and add interviews (after you say yes).
- **Email that isn't Gmail**: in Claude, a work or school Microsoft 365 account can connect through the Microsoft 365 connector (read-only; leave its write tools off). Personal Outlook.com addresses can't connect that way; for those and any other inbox, paste job emails into the chat or save them in `imports/` and ask the assistant to read them. Don't use your current employer's account.
- **Browser**: the Claude desktop app and the ChatGPT desktop app (Codex) each have a built-in browser (nothing to set up; the terminal versions don't). The assistant uses it to read job pages that block normal fetching, like Handshake after you sign in there, and to show you your pages. Claude's browser pane starts without your saved sign-ins; to stay signed in between sessions, turn on **Keep cookies** in the pane's **⋮** menu. Claude in Chrome works too if you prefer. It's set up not to use a browser on your email or LinkedIn (a safety check blocks going to those sites).

Each connection shares data with that service; [privacy.md](privacy.md) lists what goes where.

Want the assistant to fill out application forms for you, or Claude's Outbox to send emails when you press Send? Both are off by default. Ask about "assisted mode" or "send mode," and it will explain the tradeoffs before you switch. Even when one is on, you confirm it again: Claude's Outbox asks you once in the panel before its first real send, and the assistant asks you in the chat before the first form it fills in each session. (Codex always makes drafts only.)

---

## Where your stuff lives

| Folder | What's in it |
|---|---|
| `profile/` | **Your master resume** (the source of truth), preferences, interview stories, writing style, references, a copy of your original resume, and `profile/templates/` (your resume and cover-letter templates in your chosen look, once you pick one) |
| `jobs/` | `tracker.csv` (opens in Excel), `leads.csv` (openings found for you and what you decided), and one folder per job with the posting, fit notes, resume, cover letter, and prep |
| `contacts/` | People you've met or want to meet |
| `outbox/` | Message drafts (sent ones move to `outbox/sent/`, discarded ones to `outbox/discarded/`) |
| `history/` | `activity.md`: what either app changed recently |
| `interviews/` | Mock interview scorecards, real interview debriefs, weekly reviews |
| `knowledge/` | The job-search playbook and interview question bank (part of the app), and `knowledge/field/`: your field pack built during setup (field primer, resume keywords, target employers, role-specific questions) |
| `pages/` | Visual pages you open in your browser: dashboard, flashcards, portfolio site, interview brief (your own copies, made from `templates/blank/pages/` the first time you open the folder) |
| `imports/` | Drop files here for the assistant (your resume, LinkedIn export, offer letters) |
| `templates/blank/` | Blank starting copies of your files; the first time you open the folder they're copied into place, never over anything you have |
| `VERSION`, `CHANGELOG.md` | Which version of the app you have, and what changed in each version |
| `DATA_CONTRACT.md` | Which files are yours (never shipped, never changed by an update) and which belong to the app |

**Opening the tracker in Excel:** keep dates as YYYY-MM-DD and save as **CSV UTF-8 (Comma delimited)**. In much of Europe, Excel expects semicolons: double-clicking shows everything in one column, and saving from Excel writes semicolons, which breaks the file. There, open it with **Data → From Text/CSV** (comma as the delimiter) just to look, and make changes on the board, by telling the assistant, or in Google Sheets. Dates the assistant can't read for sure show as "date unclear" until you confirm them. Details in [HOW-IT-WORKS.md](../HOW-IT-WORKS.md).

Keep a backup: say "back up my stuff" (`/my-data`) for a dated zip of everything, and keep a copy somewhere other than this computer. Your own files are never part of the app's download or its git history, so that zip is your backup.

---

## Ground rules the assistant follows

1. It never invents experience. Everything comes from your master resume or what you tell it. Add new true facts anytime ("add that I'm scuba certified").
2. You send and submit everything. Drafts go to the Outbox.
3. It doesn't automate LinkedIn. That gets accounts banned. It drafts; you paste.
4. It won't store your SSN or other ID numbers, bank info, or passwords. A real employer won't ask for bank details or money before a written offer.
5. Using AI to research and practice is normal. **Live interviews and online assessments are you alone** unless the employer says AI is allowed.

---

## If something looks off

- **Something not working?** Type `/health` (Codex: `$health`). It checks the folder, app version, safety checks, panels, Gmail and Calendar, and setup, changes nothing, and tells you the most important fix.
- **No panels or summary line above the message box in Claude?** Check that you opened the top folder and clicked **Trust**. Panels need a recent version of Claude Code, so updating may help, but you don't need them: say "show my board", "show my outbox" or "mock interview" and Claude does the same things in the chat.
- **Codex doesn't greet you with today's date and your pipeline?** Its hooks aren't on, and that also means its safety checks are off. Make sure you opened the top folder (the one with `AGENTS.md` in it, not a folder inside it; in the desktop app, the project's primary folder) and that you trusted it, then turn hooks on: type `/hooks` in Codex, trust them, and start a new chat. If you once told Codex not to trust the folder, it also skips the assistant's rules: trust it, then start a new chat.
- **The assistant asks before changing your master resume or preferences.** That's on purpose, so nothing changes your source of truth without you seeing it. In Claude, the app also asks you before any command that would copy over, move, delete or rewrite those files.
- **Your tracker shows "date unclear" or a damaged-file warning?** Excel changed the dates or saved it with semicolons. Ask the assistant to fix it; it shows you the repaired copy first.
- **Stuck?** Type "I'm lost, what should I do?" or ask for the menu.
