# Security

## Reporting a problem

If you find a way to make the assistant send email, submit something, leak a user's personal data, or get around the safety checks described below, please report it privately:

- On GitHub, open this repository's **Security** tab and choose **Report a vulnerability** (private vulnerability reporting). Please don't open a public issue for it.
- Include the app and version (Claude Code or Codex, desktop or terminal), your operating system, the steps that reproduce it, and what happened.
- **Never include anyone's real personal data** (resumes, emails, contact lists). Use made-up examples.

We aim to reply within a week. This is a volunteer project, so there's no bug bounty.

Ordinary bugs go in a regular issue (see the bug report template).

## What protects the user

The main protection is the rules the assistant follows (`AGENTS.md`): it drafts and the user decides; it never sends email, submits applications, or posts anything unless the user turned on a mode that allows it and confirmed. Rules are followed by an AI model, so they can fail. Two technical layers sit underneath.

### 1. The guard (a hook that checks tool calls before they run)

`.claude/hooks/guard.sh` (and `guard.ps1` on Windows) runs before the assistant uses certain tools, in both apps. It blocks:

- **Email:** anything except reading, searching, and creating or updating drafts (no send, reply, forward, delete, label or archive). Any other connected app whose action sends, replies, forwards, trashes or deletes is blocked too.
- **Calendar and meeting tools** (Google Calendar, Outlook, Calendly, Zoom and similar): anything except reading and adding an event with no attendees, guests or invitees to the user's own calendar.
- **Browser and computer use:** sending an automated browser to Gmail, Outlook or LinkedIn. It sees addresses the assistant asks for; it can't see which site a tab the user already opened is showing.
- **Web fetches:** addresses that look like they carry personal data (an email address, the user's name or phone number, or a large block of data). This is a pattern check and can't catch every disguise.
- **Shell:** pushing this folder to a public GitHub repository, creating a public repository or gist, or making a repository public. `.githooks/pre-push` repeats the push check inside git when turned on.

If the guard script crashes or is missing, the hook command turns that into a block.

What it does **not** cover:

- **Time-outs fail open in both apps.** If the guard takes longer than its time limit, the app cancels it and the action goes ahead (Claude Code limit: 15 seconds as configured here; Codex: its default of 600 seconds). In practice the guard finishes in well under a second; only the `git push` check makes a web request (to ask GitHub whether the repository is public).
- **Codex:** hooks run only after the user reviews and trusts them, and again after any change to them; until then the guard does not run. Codex hosted tools such as its web search don't go through hooks at all, and OpenAI notes that some specialized tool paths can skip hooks ("a useful guardrail, not a complete enforcement boundary"). File edits (apply_patch) are not checked by the guard.
- **Claude Code:** the guard checks shell commands, web fetches, and connector/MCP tools (Gmail, Calendar, the built-in browser, Claude in Chrome, computer use). It also checks commands run through Claude Code's separate PowerShell tool on Windows. File edits and web searches are not checked by the guard. Project hooks run only after the user trusts the folder.
- It reads tool requests, not the screen. It can't stop the user from doing something themselves, and it can't stop a program the assistant runs from doing something the command line doesn't show.
- **The public-repository check reads the command line.** It follows git aliases, `-c` settings, URL rewrites and SSH host aliases for GitHub, and blocks commands that hide what they run (base64 or similar fed to a shell). It can't see inside a script saved in a file and run later. The optional `.githooks/pre-push` hook runs inside git and sees the real destination, so it covers that case; it is off until the user turns it on (`git config core.hooksPath .githooks`, offered by `/start` and `/health`, never enabled without their yes). Neither check knows hosts other than GitHub (GitLab, Bitbucket, self-hosted git, cloud drives): pushes there aren't checked at all. If GitHub can't be reached within a few seconds to confirm a repository is private, the push is blocked.
- **Browser destinations are matched by address.** Addresses are decoded first, so a search engine's `url?q=` link to a blocked site is caught, and well-known link shorteners are blocked; but a site that redirects on its own server to Gmail, Outlook or LinkedIn can't be seen in advance. What the assistant types into a page on any other site isn't checked: keeping coach mode read-only on employer sites is a rule, not a block.
- **Web-fetch checks are patterns,** not a guarantee: data split across a URL or encoded in an unusual way can get through.

### 2. App permissions (Claude Code)

`.claude/settings.json` asks before edits to the product's own instructions and settings (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.codex/`, `.githooks/`, `VERSION`, `product-manifest.json`; Claude Code already protects `.claude/`), before edits to the user's master resume and preferences, and before shell commands that name a path in `profile/` and could change it (redirects such as `>`, `cp`, `mv`, `rm`, `tee`, `sed`, `awk`, `perl`, `python`, `node`, `ruby`, `touch`, `ln`, `rsync`, `tar`, `unzip` and similar). It blocks `curl`, `wget`, `git push` and `rm -rf`. These rules match the command text the assistant writes: a command that reaches `profile/` without naming it (a script file, a variable, a `cd` first) isn't caught, and the Claude Code documentation is clear that they are not a security boundary around a program. Two further checks don't depend on them: the Outbox panel sends only after the user has confirmed send mode once inside the panel, and assisted mode is confirmed by the user in chat before the first form each session (a rule the assistant follows).

Codex uses its own approval and sandbox settings, which the user controls in Codex.

## Data handling

The project has no server and no telemetry. Data stays in the user's folder, except what goes to the AI provider and to any connectors or publishing the user turns on (see `DISCLAIMER.md`). User data files are kept out of git (`.gitignore`), and backups are made with `/my-data` as zip files the user keeps.
