# Which apps it works in

Job Search HQ is a folder of instructions, workflows ("skills"), safety checks and pages. Any AI assistant that can open a folder can read it, but how much of it works depends on the app. This page says, app by app, how to start, what works, what's missing, and how much of the safety story applies.

Researched against each app's own documentation on 2026-10-13 (links in each section). "Tested" means we ran it ourselves; "untested" means we only read the documentation.

## Summary

| App | Status | Safety check runs? | Panels | How to start |
|---|---|---|---|---|
| Claude Code in the Claude desktop app (Code tab, Local) | **Supported** | Yes, once you trust the folder | Yes (version 2.1.286 or later) | Code → Local → Open folder → Trust → `/start` |
| Claude Code in the terminal | **Supported** | Yes, once you trust the folder | Yes (version 2.1.287 or later) | `claude` in the folder → `/start` |
| Codex in the ChatGPT desktop app | **Supported** | Yes, once you trust the folder and its hooks | No: the same things happen in the chat | Add the folder as a local project → trust → `$start` |
| Codex in the terminal (CLI) | **Supported** | Yes, once you trust the folder and its hooks | No | `codex` in the folder → `$start` |
| Codex in an editor (VS Code and similar) | Supported, less tested | Not documented for the editor; untested. Run `$health` to check | No | Open the folder, open Codex → `$start` |
| Claude Code in VS Code or JetBrains | Works; untested by us | Yes, per Anthropic's docs ([VS Code](https://code.claude.com/docs/en/vs-code)) | VS Code: no (panels don't draw there, so use the chat versions); JetBrains: yes (it runs the terminal version) | Open the folder → `/start` |
| A regular Claude chat with a folder (Cowork) | **Not supported** | **No** | No | Use the Code tab instead |
| Claude Code on the web, Codex cloud, Jules, Copilot's cloud agent | **Not supported** | Not for your files | No | They need the folder on a website such as GitHub; don't put your job search there |
| Cursor, GitHub Copilot, Gemini CLI, Devin (formerly Windsurf), OpenCode, Amp, Factory | **Best effort** | **Don't count on it** | No | Open the folder and ask for "start" |

## Claude Code (terminal and desktop Code tab)

This is the main target: everything was built and tested here first.

**Start.** Desktop: open the Claude desktop app → **Code** tab → **Local** (not Cloud) → **Open folder** → pick this folder → **Trust** → type `/start`. Terminal: open a terminal in the folder, run `claude`, trust the folder, type `/start`. On Windows, install [Git for Windows](https://git-scm.com/download/win) first (below).

**What works.** All of it:
- the rules in `CLAUDE.md` and `AGENTS.md` (Claude Code reads `CLAUDE.md`, which pulls in `AGENTS.md`; it isn't loaded twice) ([memory docs](https://code.claude.com/docs/en/memory));
- every workflow (`/start`, `/today`, …) and the review agents ([skills](https://code.claude.com/docs/en/skills));
- the safety check, the start-of-session greeting and the summary line ([hooks](https://code.claude.com/docs/en/hooks));
- the folder's permission rules (ask before changing your master resume or preferences; email and calendar send actions switched off) ([permissions](https://code.claude.com/docs/en/permissions));
- the panels (Outbox, Pipeline, Contacts, Job Inbox, Apply Kit, Interview Room, due alerts), which load by themselves from the folder once it's trusted ([mods](https://code.claude.com/docs/en/plugins/mods/overview), [plugin loading](https://code.claude.com/docs/en/plugins/loading));
- voice: `/voice` in the terminal, the microphone button in the desktop app ([voice dictation](https://code.claude.com/docs/en/voice-dictation));
- in the desktop app, a built-in browser pane. It starts with a clean browser profile, without your saved sign-ins; you sign in inside the pane if a page needs it ([desktop docs](https://code.claude.com/docs/en/desktop));
- publishing pages as private claude.ai links, in sessions that have that tool.

**What's missing.** Nothing. The terminal has no built-in browser (Claude in Chrome works instead).

**Safety.** The safety check, the permission rules and the written rules all apply. The check runs only when you open the top folder and trust it. It doesn't check file edits or web searches, and it can't see clicks in a browser tab you already opened. Details: [SECURITY.md](../SECURITY.md).

**Windows.** Claude Code itself no longer needs Git for Windows: without it, it uses PowerShell ([Week 18 notes](https://code.claude.com/docs/en/whats-new/2026-w18)). This folder's safety check is a Bash script, though, so **Git for Windows is required here**. Without it the check can't run, and only the permission rules block the main email and calendar actions.

**Tested.** Terminal: yes, with our automated journey tests (real headless Claude Code sessions on a copy of the folder with made-up data, 2026-10-12): setup, adding jobs, a posting with hidden instructions, a scam posting, a tailored resume with no invented facts, follow-ups, an offer, a UK layoff, backup and restore, the health check, never submitting in coach mode, and auto mode. The panels have their own automated tests. Desktop Code tab: untested by us (it uses the same engine; the panels inside the desktop app have not been checked by a person yet).

## Codex (ChatGPT desktop app, terminal, editor)

**Start.** Desktop app: switch to **Codex**, add this folder as a local project (the **primary** folder if the project has several), trust it, choose **Trust all and continue** at **Hooks need review**, then type **set me up** (or `$start`). Terminal: run `codex` in the folder, trust it, approve the hooks with `/hooks`, then **set me up**. No Git for Windows needed: the safety scripts run with PowerShell on Windows.

**What works.**
- the rules in `AGENTS.md` (in a project with several folders, only the **primary** folder's) ([AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md));
- every workflow, from `.agents/skills` (type `$` to see them) ([skills](https://learn.chatgpt.com/docs/build-skills)), and the review agents in `.codex/agents` ([subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents));
- the folder's Codex settings in `.codex/config.toml`, once the folder is trusted: a bigger size limit so no rule is cut off, live web search (so closed postings don't show up), and no memories from your job-search chats ([config](https://learn.chatgpt.com/docs/config-file/config-basic));
- the safety check and the start-of-session greeting, once you trust the folder and its hooks ([hooks](https://learn.chatgpt.com/docs/hooks));
- the panels' flows, in the chat;
- in the desktop app: a built-in browser ([browser](https://learn.chatgpt.com/docs/browser)), voice chat on paid plans ([voice](https://learn.chatgpt.com/docs/features/voice)), and the Gmail plugin ([plugins](https://learn.chatgpt.com/docs/plugins)). The terminal has experimental `/voice` and a plugin browser; the editor extension has neither plugins nor a browser.

**What's missing.** The panels (the same flows happen in the chat: "show my board", "show my outbox", "apply kit for Acme"), the Interview Room's read-aloud panel (the desktop app's voice chat is better for mock interviews anyway), and publishing pages as links. The terminal and editor have no built-in browser. Codex always makes drafts only: there's no send mode.

**Safety.** The safety check runs only after you trust the folder **and** its hooks. Codex trusts hooks by their exact contents, so after an update that changes them it skips them until you approve them again with `/hooks` ([hooks](https://learn.chatgpt.com/docs/hooks)). Until then nothing blocks email sending except the written rules. Codex's built-in web search doesn't go through hooks, this folder's check doesn't look at file edits, and OpenAI calls hooks "a useful guardrail, not a complete enforcement boundary". Codex has no send mode here: it always makes drafts only. Ask-before-changing for your master resume and preferences is a written rule in Codex (Claude also has a permission rule for it); Codex's own approval and sandbox settings are yours to choose. If you mark the folder **untrusted**, Codex doesn't read `AGENTS.md` at all (we checked this with Codex CLI 0.160.1), so the assistant has none of its rules: trust the folder.

**Tested.** Terminal: yes, with our automated journey tests (real headless Codex sessions, 2026-10-12: adding a job, a posting with hidden instructions, follow-ups, the health check, and that the session reads only this folder), and we checked with Codex CLI 0.160.1 what it loads: the folder's settings load only when the folder is trusted; a folder you explicitly mark untrusted gets no `AGENTS.md` at all; rules past the size limit are cut silently (this folder raises the limit). Desktop app and editor: untested by us.

## A regular Claude chat with a folder (formerly Cowork)

**Not supported.** Use the Code tab of the same app instead.

Anthropic is merging Cowork into the regular Claude chat ([Help Center](https://support.claude.com/en/articles/15520349), read 2026-10-13). Since 2026-10-06, new Cowork tasks on Pro and Max run on Anthropic's servers, not on your computer: Claude reaches the folders you connect through the desktop app and fetches a copy of each file a task needs. Anthropic points people who need work to stay on their computer to Claude Code in the desktop app.

What that means for this folder, from Anthropic's documentation (untested by us):
- Cowork's skills, hooks and plugins come from your claude.ai account, not from the folder ([plugin platform support](https://claude.com/docs/plugins/platform-support), [Cowork overview](https://claude.com/docs/cowork/overview)). Nothing documents it reading this folder's `CLAUDE.md`, `AGENTS.md`, workflows, safety check or permission rules.
- Commands run in a sandbox, not on your computer, so the folder's scripts (PDFs, backups, updates, health check) wouldn't run as designed ([how Cowork works](https://support.claude.com/en/articles/14479288)).
- **No safety check and no permission rules.** If you used it anyway, the only protection would be whatever instructions it happened to read, and your files would be copied to Anthropic's servers for each task.

## Cloud versions (Claude Code on the web, Codex cloud, Jules, Copilot's cloud agent)

**Not supported.** These run in a virtual machine on the company's servers and work on a copy of a GitHub repository ([Claude Code cloud environments](https://code.claude.com/docs/en/cloud-environments), [Jules](https://jules.google/docs/), [Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)). Your job-search files are deliberately kept out of git, and putting them in a repository would copy your contacts, references and offers to that service. Use the desktop or terminal versions.

## Other assistants that read AGENTS.md

**Best effort.** These assistants read `AGENTS.md`, so they get the written rules. Some also find the workflows. None was built or tested for this folder, and **the safety check should be treated as not running**: where an app can run the folder's Claude hooks at all, a hook that fails lets the action go ahead, and we haven't tested whether our check works there. The written rules are then the only protection. If you connect Gmail, a calendar or another service to one of these apps, nothing in this folder can stop it from sending.

Two more things to expect:
- **Workflows may show twice.** This folder keeps its workflows in `.claude/skills` (for Claude) and short copies in `.agents/skills` (for Codex). Apps that read both, like Cursor and VS Code Copilot, may list every workflow twice; either copy works.
- **No panels, no greeting.** Ask for "my board" or "my outbox" in the chat instead.

| App | Reads the rules | Finds the workflows | Safety check | Start | Notes |
|---|---|---|---|---|---|
| **Cursor** (editor and CLI) | `AGENTS.md` and `CLAUDE.md`, both always applied ([rules](https://cursor.com/help/customization/rules)) | Yes, from `.agents/skills` and `.claude/skills` ([skills](https://cursor.com/docs/skills)); may show twice | Cursor loads Claude hooks from `.claude/settings.json` by default, but a hook that fails lets the action through ([third-party hooks](https://cursor.com/docs/reference/third-party-hooks)). Untested with our check | File → Open Folder, open the Agent chat, type "start" | |
| **GitHub Copilot in VS Code** (agent mode) | `AGENTS.md`, and `CLAUDE.md` if turned on ([instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)) | Yes, from `.github/skills`, `.claude/skills` and `.agents/skills` ([agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)); may show twice | Claude hooks only with `chat.useClaudeHooks` (off by default), and then without their filters, so every check runs for every action ([hooks](https://code.visualstudio.com/docs/copilot/customization/hooks)). Don't turn it on for this folder | Open the folder, trust it, pick Agent mode in Chat | Hooks are a preview feature |
| **GitHub Copilot CLI** | `AGENTS.md` and `CLAUDE.md`, combined ([instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)) | Yes; the `.agents/skills` copy wins over `.claude/skills` | Reads `.claude/settings.json` hooks; blocks on errors, lets the action through on time-outs ([hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration)). Untested with our check | `copilot` in the folder | |
| **Gemini CLI** | Only if `context.fileName` lists `AGENTS.md` ([GEMINI.md docs](https://geminicli.com/docs/cli/gemini-md)) | From `.agents/skills` ([skills](https://geminicli.com/docs/cli/skills)) | Its own hooks only; doesn't read Claude's ([hooks](https://geminicli.com/docs/hooks)) | `gemini` in the folder | Google moved free and Google AI Pro/Ultra users to Antigravity CLI on 2026-06-18 ([Google](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)); Antigravity reads `AGENTS.md` and `.agents/skills` ([migration](https://antigravity.google/docs/cli/gcli-migration/)) |
| **Devin Desktop** (formerly Windsurf) and Devin CLI | `AGENTS.md`; Devin CLI also reads `CLAUDE.md` ([AGENTS.md](https://docs.devin.ai/desktop/cascade/agents-md), [config](https://docs.devin.ai/cli/reference/configuration/read-config-from)) | `.agents/skills`, and `.claude/skills` when Claude config reading is on ([skills](https://docs.devin.ai/desktop/cascade/skills)) | Devin CLI loads `.claude/settings.json` hooks; errors don't block ([hooks](https://docs.devin.ai/cli/extensibility/hooks/overview)). Untested | Open the folder, start a Devin Local agent | Windsurf became Devin Desktop in 2026 ([changelog](https://docs.devin.ai/desktop/changelog)) |
| **OpenCode** | `AGENTS.md` (then ignores `CLAUDE.md`) ([rules](https://opencode.ai/docs/rules/)) | From `.claude/skills` and `.agents/skills`; it asks for unique names, so the two copies may clash ([skills](https://opencode.ai/docs/skills/)) | No: its own plugins only ([plugins](https://opencode.ai/docs/plugins/)) | `opencode` in the folder | |
| **Amp** | `AGENTS.md` ([AGENTS.md](https://ampcode.com/docs/customize/agents-md)) | `.agents/skills` wins over `.claude/skills` ([skills](https://ampcode.com/docs/customize/skills)) | No: its own plugins only. Runs tools without asking by default | `amp` in the folder (not in the cloud "Orbs") | |
| **Factory (Droid)** | `AGENTS.md`, up to 80,000 characters ([AGENTS.md](https://docs.factory.com/cli/configuration/agents-md)) | `.agents/skills` ([skills](https://docs.factory.com/cli/configuration/skills)) | Its own hooks; errors don't block ([hooks](https://docs.factory.com/reference/hooks-reference)) | `droid` in the folder | |

All rows read 2026-10-13; all untested by us. Scripts that need a shell (PDFs, backups, the health check) run only where the app can run commands on your computer.

## What changes between apps, in one place

| | Claude Code | Codex | Others |
|---|---|---|---|
| Rules (`AGENTS.md`) | Yes | Yes | Yes |
| Workflows | Yes (`/name`) | Yes (`$name`) | Some |
| Review agents (fact check, voice, recruiter) | Separate agents | Done as separate passes in the same chat | As passes, if the app follows the rules |
| Safety check | Yes | Yes, after trusting hooks | Treat as no |
| Permission rules (ask before changing your resume, send actions off) | Yes | Codex's own approval settings | No |
| Panels | Yes | Chat versions | Chat versions, if the app finds the workflows |
| Read-aloud mock interviews | Interview Room | Voice chat (desktop app) or read-aloud in chat | Chat only |
| Built-in browser | Desktop app | Desktop app | Varies |
| Publish pages as links | Where the session has the tool | No | No |
