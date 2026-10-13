# Privacy: where your information goes

Job Search HQ itself has no server, no account, no analytics and no telemetry. It's a folder of instructions, small scripts and pages on your computer. But it runs inside an AI app, and some features talk to outside services. This page lists every place your information can go, so you can decide what to turn on.

Checked against each company's own documentation on 2026-10-13. Companies change their terms; the links are there so you can check the current version.

## The short version

| Where it goes | What goes there | Can you avoid it? |
|---|---|---|
| **The AI company running the app** (Anthropic for Claude, OpenAI for Codex) | Everything the assistant reads or writes for you: your resume, tracker rows, contacts it looks up, drafts, postings, what you type or say | No: that's how the assistant works. You choose the plan and its privacy settings (below). |
| **Copies the app keeps on your computer, outside this folder** | Chat history (and, if turned on, the app's own memory notes) | Partly: see "Copies outside this folder" |
| **Gmail, Google Calendar or Microsoft 365** (only if you connect them) | Job emails it reads, drafts it makes, events it adds | Yes: they're off until you connect them |
| **Websites the assistant visits** (job boards, company sites, pay data) | The address it asks for and your IP address; web searches send the search words to the search provider | Mostly: it looks things up when a task needs it |
| **A built-in browser** (desktop apps) | The sites it opens, with whatever you sign in to there | Yes: it's used only to read pages that block normal fetching |
| **Published pages** (Claude only) | The page you publish, stored on your claude.ai account | Yes: nothing is published unless you ask |
| **Fonts and libraries for your pages** | Nothing, for most pages on your computer: they come with the app and work offline. Google Fonts or jsDelivr see the viewer's IP address only for the Lexend font (the High contrast look), the Lato resume font, a brand font the app doesn't include, and a published page or one moved out of this folder | Yes: pick another look or font. See "Your pages" |
| **A cloud-synced folder** (Dropbox, OneDrive, iCloud, Google Drive) | A copy of every file in this folder | Yes: keep the folder outside a synced folder, or accept that the service has a copy |
| **Voice** | Your spoken words, to the app's speech service | Yes: typing works everywhere |

What never leaves on its own: nothing is sent to employers, posted, or emailed by Job Search HQ. The assistant drafts; you send. Your files are never part of the app's download or its git history.

## The AI company

When the assistant opens a file to work on it, the contents go to the company running the model, like anything you paste into a chat. That includes what's in the file even if the assistant only needed one line. This is why setup asks you to remove your date of birth, ID numbers and bank details from your resume before you add it.

**Claude (Anthropic).** On the Free, Pro and Max plans you choose whether your chats, including Claude Code sessions, can be used to train future models; the setting is at claude.ai/settings/data-privacy-controls. With it on, Anthropic keeps the data for 5 years; with it off, for 30 days. On Team and Enterprise plans and with an API key, Anthropic doesn't train on it by default and keeps it for 30 days. Source: [Claude Code data usage](https://code.claude.com/docs/en/data-usage).

**Codex (OpenAI).** On ChatGPT plans for individuals (Free, Go, Plus, Pro), OpenAI may use your content, including Codex, to train its models unless you turn off **Improve the model for everyone** (ChatGPT → Settings → Data Controls) or choose "Do not train on my content" in OpenAI's privacy portal. Codex also has its own setting about training on whole environments, in Codex's settings, which that switch doesn't change. A thumbs up or down can still send that conversation for training. On ChatGPT Business, Enterprise and Edu, and with an API key, OpenAI doesn't train on it by default. Sources: [how your data is used](https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance) (read through search results; the page blocks automated reading), [Codex pricing](https://learn.chatgpt.com/docs/pricing), [API data](https://developers.openai.com/api/docs/guides/your-data).

If your job search is sensitive (for example, your current employer mustn't know), check that setting on whichever plan you use, and keep the training option off.

## Copies outside this folder

A backup (`/my-data`) and "delete everything" reach only this folder. These copies live elsewhere on your computer, under the app's own folder in your home directory:

- **Claude Code chat history.** Claude Code keeps a plain-text transcript of each session on your computer (in `~/.claude/projects/`) so you can resume it. It deletes them after 30 days by default; sessions from the Claude desktop app are kept longer by default. To remove them for this folder: `claude project purge` in a terminal opened in this folder (it asks first). Source: [data usage](https://code.claude.com/docs/en/data-usage), [Week 18 notes](https://code.claude.com/docs/en/whats-new/2026-w18).
- **Claude Code's memory.** Claude Code can write its own notes about a project (in `~/.claude/projects/<project>/memory/`). It's on by default in Claude Code, but this folder turns it off (`autoMemoryEnabled: false` in `.claude/settings.json`, honored once you trust the folder), so job-search details stay in your own files, where `/my-data` can back them up or delete them. Source: [How Claude remembers your project](https://code.claude.com/docs/en/memory).
- **Codex chat history.** Codex saves your sessions in its own folder (`~/.codex`, or the folder `CODEX_HOME` names), controlled by its `history` setting. Source: [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
- **Codex memories.** Codex's memories feature is off unless you turn it on, and keeps notes in `~/.codex/memories/`. This folder's Codex settings tell it not to make memories from your job-search chats even if you turn the feature on (they apply once you trust the folder). Source: [memories](https://learn.chatgpt.com/docs/customization/memories).

## Connections you turn on

- **Gmail.** If you connect it, the assistant reads job-related mail (a rule it follows; the connection itself can see your whole mailbox) and can make drafts. The safety check blocks the assistant from sending, replying, forwarding or deleting. The connection is between you and Google, under Google's terms and the app's connector terms.
- **Google Calendar.** Reads your schedule and, after you say yes, adds interviews to your own calendar with no guests.
- **Microsoft 365** (Claude, work or school accounts only). Reads Outlook mail and calendar, read-only unless you turn on its write tools (leave them off). Your organization's administrator approves it and can see that it's connected. Don't run a job search on your current employer's account.
- **Emails you paste or save** in `imports/` go to the AI company like any other file the assistant reads.
- **Automation services** (IFTTT, Zapier, n8n and similar) and any other connector you add to your app: whatever you connect can see what that service sees. Job Search HQ doesn't need any of them.

## Websites, searches and the browser

- **Web searches and page reads.** To find jobs, check a company or look up pay, the assistant searches the web and reads pages. The search words go to the app's search provider; each site it reads sees an ordinary visit. In Claude Code, each web address's site name is also checked against a safety list at Anthropic before it's fetched. In Claude, the safety check blocks web addresses that look like they carry your email, phone, name or a large block of data (a pattern check, not a guarantee).
- **The built-in browser** (Claude desktop app, ChatGPT desktop app). Used only to read job pages that block normal fetching, and to show you your pages. Anything you sign in to there is visible to the assistant while it uses that page. It's kept off Gmail, Outlook and LinkedIn.
- **Job boards and LinkedIn.** The assistant reads public postings. It never logs in to LinkedIn or automates it.

## Your pages

Your dashboard, flashcards, portfolio and interview briefs are files on your computer, and they open in your browser like any web page.

- **Fonts and libraries.** The fonts and the three small libraries the pages use (listed in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)) come with the app, in `templates/assets/`, so pages on your computer work offline and load nothing from the web. A few fonts don't come with the app, because their licenses don't allow the trimmed copies it ships: Lexend (used by the High contrast look), Lato (one of the resume fonts) and a brand font you bring that the app doesn't include. A page or resume using one of them fetches it from Google Fonts (offline, a similar built-in font shows instead). And if a page can't find the app's files (a page you moved somewhere else, or a published copy), it fetches the same fonts from Google Fonts and the same pinned, checked library files from jsDelivr. In those cases the service sees your IP address and the page address, like any website.
- **Flashcard progress** is saved in that browser only.
- **Publishing (Claude only).** If you ask Claude to publish a page, it goes up as a private link on your claude.ai account, stored by Anthropic; only you can open it until you share it. A published dashboard (your themed page or a Claude Dashboard) shows only your job list and counts: never your contacts, notes, pay or activity log. Your portfolio is the only page meant to be shared, and only when you decide to. Source: [Artifacts](https://code.claude.com/docs/en/artifacts).

## Voice and read-aloud

- **Talking to the assistant.** Claude Code's `/voice` and the desktop apps' microphone send your audio to the app's speech service. Your computer's own dictation (Mac Dictation, Windows Win + H) follows your computer's settings instead.
- **Read-aloud in mock interviews** is off until you turn it on. It uses your computer's own voice (`say` on a Mac, Windows speech), so the questions are spoken on your computer.

## Other places

- **Cloud-synced folders.** If this folder sits inside Dropbox, OneDrive, iCloud Drive or Google Drive, that service keeps a copy of every file, including old versions after you delete something. Deleting a file here may not delete those versions.
- **Updates.** `/update` uses the release zip you downloaded. If the app has a download address set, it fetches the zip from there; nothing else about you is sent.
- **The public-repository check.** When the assistant runs `git push`, the safety check asks GitHub whether the destination repository is public. Only the repository's name is sent.
- **Issues and bug reports.** Anything you post in the app's public repository is public. The templates ask you to leave out personal details.

## For maintainers

The end-to-end and journey tests in `scripts/ci/` (not in the release zip) run real Claude and Codex sessions on made-up sample data using the maintainer's own accounts. They never read a user's folder.
