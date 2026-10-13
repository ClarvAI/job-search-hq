# Job Search HQ

A folder that turns an AI assistant into your job-search partner. It works with **Claude** (the Claude desktop app or Claude Code) and with **ChatGPT's Codex** (the Codex app or terminal), so use whichever you have, or both. It finds jobs that fit you, writes resumes and cover letters from your real experience, keeps track of every application, runs mock interviews, and drafts follow-ups. **You stay in control: nothing gets sent or submitted unless you do it yourself.**

Works for any field and any stage: students, new grads, experienced professionals, career changers, and people returning to work. Setup asks who you are and builds a starter kit for your field (a primer, resume keywords, and a list of employers to target).

**Before setup:** put your current resume (PDF, Word or text) in the `imports` folder. Setup reads it and turns it into your master resume. No resume yet? Setup can build one from a short conversation. Before adding any file, remove your date of birth, ID or passport numbers, bank details and passwords if it has them: the assistant won't keep them, and whatever it reads is sent to the AI company running it.

> **Keep it private.** This folder will hold your resume, your contacts' details, references and offer terms. Those files are never part of the app's download or its git history, so back them up with `/my-data` (a dated zip), not git. If you ever do put this folder in git, use a **private** repository only, never a public fork. As a safety net, run this once in the folder: `git config core.hooksPath .githooks` (setup and `/health` offer to do it for you; it's off until you say yes), and git itself stops pushes to a public GitHub repository, even ones a script makes. It's not a lock: it doesn't cover other sites (GitLab, Bitbucket, cloud drives) or uploads made some other way.

---

## Get started (5 minutes to open, then a 15–20 minute setup chat)

Using only one app? Follow just its section below.

**Got it as a zip?** Unzip first. Mac: double-click the zip. Windows: right-click it → **Properties** → tick **Unblock** → **OK**, then right-click → **Extract All** (just double-clicking only opens a preview). Move the folder somewhere you'll keep it, like Documents. Always open the folder that has `README.md`, `AGENTS.md` and `CLAUDE.md` directly inside it.

### With Claude (adds panels and read-aloud interviews in recent versions)

**You need:** a paid Claude plan (Pro works; see [Cost and plans](#cost-and-plans)) and the **Claude desktop app** (claude.ai/download), updated to the latest version. **Windows only:** first install **Git for Windows** (git-scm.com/download/win; click Next through every screen), then restart. Claude needs it to run this folder's safety checks.

1. Open the Claude desktop app → **Code** tab → choose **Local** (not Cloud) → **Open folder** → pick this folder.
2. If Claude asks whether you trust this folder, click **Trust**. That turns on the safety rules and the daily greeting.
3. Type **`/start`** and press Enter.

> **Check:** when you type `/`, you should see `/start` in the list. If you don't, you opened the wrong folder.

> Prefer the terminal? Install Claude Code (claude.ai/code), then in this folder run `claude` and type `/start`.

### With Codex (ChatGPT)

**You need:** a ChatGPT account (Codex is included in ChatGPT plans; Plus or higher recommended, see [Cost and plans](#cost-and-plans)), and the **Codex app**, updated to the latest version. Install it from OpenAI's [Codex quickstart](https://developers.openai.com/codex/quickstart) (pick Mac or Windows) and sign in with your ChatGPT account. On Windows the safety scripts run with PowerShell, so you don't need Git Bash for Codex.

1. Open Codex and open this folder as your project.

> Prefer the terminal? Install the Codex CLI using the CLI instructions linked from that quickstart, open a terminal in this folder, and run `codex`.
2. If Codex asks whether to trust this folder, say yes. When it says **Hooks need review**, choose **Trust all and continue**. Hooks are this folder's safety checks and daily greeting; without them, nothing blocks email sending.
3. Type **set me up** (or `$start`) and press Enter.

> **Check:** type `$` and you should see `start`, `today` and the other workflows in the list. If you don't, you opened the wrong folder.

### Using both

Both apps read the same files and follow the same rules, so you can switch any time: start a cover letter in one and finish it in the other. Each one leaves a short note in `history/activity.md` when it changes your tracker, contacts or drafts, so the other one knows what happened. Having both open is fine; each re-checks the files right before saving. Just don't have both (or one app and a Claude panel) change your tracker or contacts at the same moment, even for different jobs: finish in one, then switch.

After setup, do step 1 of your first-week plan (it takes two minutes), and take the **tour** (`/tour` in Claude, `$tour` in Codex) for a 10-minute hands-on walkthrough, then start each session with **today**.

How everything fits together, in plain English: **[HOW-IT-WORKS.md](HOW-IT-WORKS.md)**.

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
| `/sync-inbox` | Reads job emails in Gmail and updates your tracker |
| `/weekly-review` | How it's going and what to change |
| `/career-fair` | Game plan for a career fair, then follow-ups |
| `/laid-off` | Lost your job? A dated first-week list (unemployment, health coverage, severance) and drafts to ask colleagues for references |
| `/work-search-log` | Claiming unemployment? Keeps the weekly record your state or Universal Credit asks for, in their order; you enter it yourself |
| `/my-data` | Back up everything, wrap up or pause your search, or start over |
| `/pages` | Your dashboard, flashcards, portfolio website, printable interview brief, opened in your browser (in Claude sessions that can publish pages, "publish my flashcards" also gives you a private link for your phone) |
| `/tour` | A hands-on walkthrough of how everything works |
| `/health` | Checks that everything is set up and working, changes nothing, and tells you the one thing to fix first |
| `/update` | Installs a new version of the app (see [Updating](#updating)) |
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
- **`/interview-room`**: during `/mock-interview`, the interviewer's question appears here and is read out loud, a clock times your answer, and a scorecard fills in.

In Codex the same things happen in the chat: say **show my board**, **show my outbox**, **show my contacts**, **show my job inbox**, **apply kit for Acme**, or **mock interview**. For mock interviews, turn on Codex's voice conversation and it interviews you out loud; in text mode it can still read questions aloud if you allow it the first time, and it times your answers.

### Talk instead of type

- **Claude desktop app:** click the microphone in the message box. **Claude terminal:** type `/voice` once, then hold **Space** while you talk.
- **Codex:** turn on Codex's **voice conversation** for mock interviews: it talks and listens like a real interviewer. Otherwise use the app's microphone, or your computer's dictation (Mac: the Dictation shortcut set in **System Settings → Keyboard → Dictation**, often **Fn** twice or the microphone key; Windows: **Win + H**).
- **Mac tip (Claude):** the Interview Room reads questions in your computer's voice. If it sounds robotic: System Settings → Accessibility → **Read & Speak**, click the **ⓘ** button next to **System voice**, download a higher-quality English voice, then choose it as your System voice (Siri voices can't be used for this). On older macOS the section is called Spoken Content.

Mock interviews are much more useful out loud. That's how the real thing works. Ask for a **one-way video** practice round too: many big companies screen new grads with recorded video interviews.

---

## Make it yours

Your pages (dashboard, flashcards, portfolio, interview briefs) share one look, set in `profile/design.md`. Pick a preset (Default, Modern, Minimal, High contrast) or bring your own brand: colors and fonts from your website, a brand guide in `imports/`, Figma, or (in Claude) a design system you already have. Every page changes together, and text contrast is checked automatically. Resumes and cover letters stay safe for hiring software: only the font (from a safe list), a dark accent for your name, spacing and paper size change. If you work in a creative field, you can also get a designed resume alongside the plain one.

## Optional connections

In Claude: **Settings → Connectors**. In Codex: connect apps under **Apps** in Codex or ChatGPT settings.

- **Gmail**: lets Claude spot recruiter replies and put approved drafts into your Gmail. It never sends on its own.
- **Google Calendar**: lets Claude check your schedule and add interviews (after you say yes).
- **Browser**: the Claude and Codex desktop apps each have a built-in browser (nothing to set up). The assistant uses it to read job pages that block normal fetching, like Handshake after you sign in there once, and to show you your pages. Claude in Chrome works too if you prefer. It's set up not to use a browser on your email or LinkedIn (a safety check blocks going to those sites).

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

**Opening the tracker in Excel:** keep dates as YYYY-MM-DD and save as **CSV UTF-8 (Comma delimited)**. In much of Europe, Excel expects semicolons: double-clicking shows everything in one column, and saving from Excel writes semicolons, which breaks the file. There, open it with **Data → From Text/CSV** (comma as the delimiter) just to look, and make changes on the board, by telling the assistant, or in Google Sheets. Dates the assistant can't read for sure show as "date unclear" until you confirm them. Details in [HOW-IT-WORKS.md](HOW-IT-WORKS.md).

Keep a backup: say "back up my stuff" (`/my-data`) for a dated zip of everything, and keep a copy somewhere other than this computer. Your own files are never part of the app's download or its git history, so that zip is your backup.

---

## Updating

To get a new version, download the release zip and say "update" (`/update` in Claude, `$update` in Codex). Only the app's files change; your profile, jobs, contacts, drafts, notes and pages are never touched. If you'd edited one of the app's files, your version is kept next to it as `<file>.local`, and "undo the update" rolls back. If a new version changes the resume or cover-letter templates and you've picked a look, your copies in `profile/templates/` are rebuilt from the new templates in your look; the old copy is kept as `<name>.previous.html` and the update tells you, so any hand edits can be carried over. In Codex, re-approve the safety hooks (`/hooks`) if the update says they changed.

Got the app with git instead of a zip? `git pull` works too: your files and your look live outside the app's files, so they don't get in the way. Say "update" and the assistant does the pull and the follow-up steps with you.

---

## Cost and plans

- **Claude:** Claude Code needs a paid Claude plan: Pro, Max, Team or Enterprise (the free plan doesn't include it). Its usage comes out of the same allowance as your Claude chats.
- **Codex:** Codex is included in ChatGPT plans. Free and Go have tight limits; Plus or higher is recommended. You can also use an OpenAI API key and pay per use.
- **What uses the most:** `/start`, `/add-job` on a good-fit job (it builds the whole application), `/find-jobs`, `/interview-prep`, and long mock interviews. Lightest: `/today` and the panels. On Pro or Plus, do one or two big jobs per session.
- **Which model:** in Claude, the everyday Sonnet model is fine for most work; switch to Opus (the strongest model) for resumes, cover letters and interview prep if your plan allows. In Codex, the app's default model is fine.

Plans and limits change; check claude.com/pricing and OpenAI's Codex pricing page for the current details.

---

## Your privacy

Your job-search files stay in this folder on your computer. Job Search HQ has no server, no account and no telemetry. What you work on is sent to the AI provider you use (Anthropic for Claude Code, OpenAI for Codex) under that provider's terms and your plan's data settings. Gmail, Google Calendar, publishing pages, and a Dropbox/OneDrive/iCloud folder each share data with that service, and only if you turn them on. Pages load fonts and a few small libraries from public CDNs (listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). Your data files are kept out of git; back them up with `/my-data`. Details: [DISCLAIMER.md](DISCLAIMER.md) and [SECURITY.md](SECURITY.md).

- Gmail (if you connect it) is only read for job-related mail (a rule the assistant follows). The assistant makes drafts and never sends, replies, forwards or deletes (see the next section). You can of course still do anything yourself in Gmail.
- Pages you publish (Claude only, where your session supports publishing) are private links on your claude.ai account until you choose to share them.
- Never paste your SSN or other ID numbers, bank details, or passwords here. Be very wary of anyone asking for bank details or money before a written offer from a verified company. ID and right-to-work checks before an offer are normal in some countries; give those only through the employer's official process.

---

## What the safety check covers

Under the assistant's rules sits a safety check (a "hook") that looks at certain actions before they run, in both apps. It blocks:

- sending, replying to, forwarding or deleting email through the Gmail connection (or sending or deleting through any other connected app);
- inviting people to calendar events or meetings, or changing, cancelling or deleting them;
- sending an automated browser to Gmail, Outlook or LinkedIn;
- in Claude, web addresses that look like they carry your email, phone, name or large blocks of data (a pattern check that can't catch every disguise);
- pushing this folder to a public GitHub repository, or creating a public repository or gist, or making one public.

If the check crashes or is missing, the action is blocked. What it doesn't cover:

- **Claude:** it runs only after you trust the folder. It checks shell commands (including the PowerShell tool on Windows), web fetches and connections (Gmail, Calendar, the browser, computer use), but not file edits or web searches.
- **Codex:** it runs only after you trust the hooks (`/hooks`), and again after they change, for example after an update. It doesn't check file edits or Codex's built-in web search, and some Codex tool paths skip hooks.
- **Both:** if a check ever hangs past its time limit, the app lets the action go ahead (in practice it finishes in under a second). It sees the assistant's requests, not your screen: not clicks in a browser tab that's already open, and not everything a script does. It can't see inside a script saved in a file (the optional pre-push safety net above catches pushes from those inside git), and it only knows GitHub: other hosting sites aren't checked. A site that redirects on its own to Gmail, Outlook or LinkedIn, and what the assistant types into a form on any other site, aren't checked either; that part rests on the assistant's rules.

It's a backstop. The main protection is that the assistant drafts and you send. Full details: [SECURITY.md](SECURITY.md).

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
- **Codex doesn't greet you with today's date and your pipeline?** Its hooks aren't on, and that also means its safety checks are off. Make sure you opened the top folder (the one with `AGENTS.md` in it, not a folder inside it), then turn hooks on: type `/hooks` in Codex, trust them, and start a new chat.
- **The assistant asks before changing your master resume or preferences.** That's on purpose, so nothing changes your source of truth without you seeing it. In Claude, the app also asks you before any command that would copy over, move, delete or rewrite those files.
- **Your tracker shows "date unclear" or a damaged-file warning?** Excel changed the dates or saved it with semicolons. Ask the assistant to fix it; it shows you the repaired copy first.
- **Stuck?** Type "I'm lost, what should I do?" or ask for the menu.

---

## License and fine print

- [LICENSE](LICENSE): PolyForm Noncommercial 1.0.0. Free for your own job search and any other noncommercial use, and free for schools, career centers, charities and public bodies. You can change it and share it, as long as the license and its `Required Notice` line go with it. Selling it, building it into a paid product, or using it to serve paying clients (for example as a career coach) needs a commercial license from Sam Clarvit; ask through this repository. Because of that limit it is source-available rather than "open source".
- [DISCLAIMER.md](DISCLAIMER.md): not professional advice; AI output can be wrong; you're responsible for what you send.
- [SECURITY.md](SECURITY.md): what the safety checks do and don't cover, and how to report a problem privately.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): fonts, libraries and other outside pieces the pages use.
- [CONTRIBUTING.md](CONTRIBUTING.md): for people who want to improve the app itself.
