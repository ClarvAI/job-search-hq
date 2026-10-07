# Job Search HQ

A folder that turns an AI assistant into your job-search partner. It works with **Claude** (the Claude desktop app or Claude Code) and with **ChatGPT's Codex** (the Codex app or terminal), so use whichever you have, or both. It finds jobs that fit you, writes resumes and cover letters from your real experience, keeps track of every application, runs mock interviews, and drafts follow-ups. **You stay in control: nothing gets sent or submitted unless you do it yourself.**

Works for any field and any stage: students, new grads, experienced professionals, career changers, and people returning to work. Setup asks who you are and builds a starter kit for your field (a primer, resume keywords, and a list of employers to target).

**Before setup:** put your current resume (PDF, Word or text) in the `imports` folder. Setup reads it and turns it into your master resume. No resume yet? Setup can build one from a short conversation. Before adding any file, remove your date of birth, ID or passport numbers, bank details and passwords if it has them: the assistant won't keep them, and whatever it reads is sent to the AI company running it.

> **Keep it private.** This folder will hold your resume, your contacts' details, references and offer terms. If you back it up with git, use a **private** repository only, never a public fork. To have git stop ordinary pushes to a public GitHub repository, run this once in the folder: `git config core.hooksPath .githooks` (setup offers to do it for you). It's a safety net, not a lock: it doesn't cover other sites or uploads made some other way, so keeping the repository private is still up to you.

---

## Get started (5 minutes to open, then a 15–20 minute setup chat)

Using only one app? Follow just its section below.

**Got it as a zip?** Unzip first. Mac: double-click the zip. Windows: right-click it → **Properties** → tick **Unblock** → **OK**, then right-click → **Extract All** (just double-clicking only opens a preview). Move the folder somewhere you'll keep it, like Documents. Always open the folder that has `README.md`, `AGENTS.md` and `CLAUDE.md` directly inside it.

### With Claude (adds panels and read-aloud interviews in recent versions)

**You need:** a Claude subscription (Pro works; Max if you'll use it a lot) and the **Claude desktop app** (claude.ai/download), updated to the latest version. **Windows only:** first install **Git for Windows** (git-scm.com/download/win; click Next through every screen), then restart. Claude needs it to run this folder's safety checks.

1. Open the Claude desktop app → **Code** tab → choose **Local** (not Cloud) → **Open folder** → pick this folder.
2. If Claude asks whether you trust this folder, click **Trust**. That turns on the safety rules and the daily greeting.
3. Type **`/start`** and press Enter.

> **Check:** when you type `/`, you should see `/start` in the list. If you don't, you opened the wrong folder.

> Prefer the terminal? Install Claude Code (claude.ai/code), then in this folder run `claude` and type `/start`.

### With Codex (ChatGPT)

**You need:** a ChatGPT plan that includes Codex, and the **Codex app**, updated to the latest version. Install it from OpenAI's [Codex quickstart](https://developers.openai.com/codex/quickstart) (pick Mac or Windows) and sign in with your ChatGPT account. On Windows the safety scripts run with PowerShell, so you don't need Git Bash for Codex.

1. Open Codex and open this folder as your project.

> Prefer the terminal? Install the Codex CLI using the CLI instructions linked from that quickstart, open a terminal in this folder, and run `codex`.
2. If Codex asks whether to trust this folder, say yes. When it says **Hooks need review**, choose **Trust all and continue**. Hooks are this folder's safety checks and daily greeting; without them, nothing blocks email sending.
3. Type **set me up** (or `$start`) and press Enter.

> **Check:** type `$` and you should see `start`, `today` and the other workflows in the list. If you don't, you opened the wrong folder.

### Using both

Both apps read the same files and follow the same rules, so you can switch any time: start a cover letter in one and finish it in the other. Each one leaves a short note in `history/activity.md` when it changes your tracker, contacts or drafts, so the other one knows what happened. Having both open is fine; each re-checks the files right before saving. Just don't ask both to change the same job at the same moment.

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
| `/my-data` | Back up everything, wrap up or pause your search, or start over |
| `/pages` | Your dashboard, flashcards, portfolio website, printable interview brief, opened in your browser (in Claude sessions that can publish pages, "publish my flashcards" also gives you a private link for your phone) |
| `/tour` | A hands-on walkthrough of how everything works |
| `/menu` | Everything above |

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

Want the assistant to fill out application forms for you, or Claude's Outbox to send emails when you press Send? Both are off by default. Ask about "assisted mode" or "send mode," and it will explain the tradeoffs before you switch. (Codex always makes drafts only.)

---

## Where your stuff lives

| Folder | What's in it |
|---|---|
| `profile/` | **Your master resume** (the source of truth), preferences, interview stories, writing style, references, a copy of your original resume |
| `jobs/` | `tracker.csv` (opens in Excel), `leads.csv` (openings found for you and what you decided), and one folder per job with the posting, fit notes, resume, cover letter, and prep |
| `contacts/` | People you've met or want to meet |
| `outbox/` | Message drafts (sent ones move to `outbox/sent/`, discarded ones to `outbox/discarded/`) |
| `history/` | `activity.md`: what either app changed recently |
| `interviews/` | Mock interview scorecards, real interview debriefs, weekly reviews |
| `knowledge/` | Job-search playbook, interview questions, and a field pack built for you during setup (field primer, resume keywords, target employers) |
| `pages/` | Visual pages you open in your browser: dashboard, flashcards, portfolio site, interview brief |
| `imports/` | Drop files here for the assistant (your resume, LinkedIn export, offer letters) |

Keep a backup: say "back up my stuff" (`/my-data`) for a dated zip of everything, and keep a copy somewhere other than this computer. Or ask the assistant to set up git for you (private repository only).

---

## Your privacy

- Your files stay on your computer. When the assistant reads a file, its contents are sent to the company running it (Anthropic for Claude, OpenAI for Codex), the same as any chat.
- Gmail (if you connect it) is only read for job-related mail (a rule the assistant follows). The assistant makes drafts and is told never to send, reply, forward or delete; a safety check blocks those Gmail actions when either app tries them through its connection. The connection itself has broader permissions, and the check is a backstop, not a lock. You can of course still do anything yourself in Gmail.
- Pages you publish (Claude only, where your session supports publishing) are private links on your claude.ai account until you choose to share them.
- Never paste your SSN or other ID numbers, bank details, or passwords here. Be very wary of anyone asking for bank details or money before a written offer from a verified company. ID and right-to-work checks before an offer are normal in some countries; give those only through the employer's official process.
- If you ever put this folder on GitHub, keep it private: it holds other people's contact details. Run `git config core.hooksPath .githooks` once so git stops ordinary pushes to a public GitHub repository (a safety net, not a guarantee).

---

## Ground rules the assistant follows

1. It never invents experience. Everything comes from your master resume or what you tell it. Add new true facts anytime ("add that I'm scuba certified").
2. You send and submit everything. Drafts go to the Outbox.
3. It doesn't automate LinkedIn. That gets accounts banned. It drafts; you paste.
4. It won't store your SSN or other ID numbers, bank info, or passwords. A real employer won't ask for bank details or money before a written offer.
5. Using AI to research and practice is normal. **Live interviews and online assessments are you alone** unless the employer says AI is allowed.

---

## If something looks off

- **No panels or summary line above the message box in Claude?** Check that you opened the top folder and clicked **Trust**. Panels need a recent version of Claude Code, so updating may help, but you don't need them: say "show my board", "show my outbox" or "mock interview" and Claude does the same things in the chat.
- **Codex doesn't greet you with today's date and your pipeline?** Its hooks aren't on, and that also means its safety checks are off. Make sure you opened the top folder (the one with `AGENTS.md` in it, not a folder inside it), then turn hooks on: type `/hooks` in Codex, trust them, and start a new chat.
- **The assistant asks before changing your master resume or preferences.** That's on purpose, so nothing changes your source of truth without you seeing it.
- **Stuck?** Type "I'm lost, what should I do?" or ask for the menu.
