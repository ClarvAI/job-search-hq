---
name: health
description: "Check that the user's job-search workspace is set up and working: right folder, app version, safety checks, hooks, panels, Gmail and Calendar connections, Excel, optional tools (Chrome or Edge, Node.js, pdftotext), setup and starter files. Read-only: it changes nothing and offers fixes. Use when the user says something isn't working, the panels or the daily greeting are missing, a command does nothing, right after installing, moving or updating the folder, or asks \"is everything working\", \"check my setup\", \"health check\" or \"run a checkup\"."
---

# /health

A read-only checkup. Nothing is changed while checking. At the end, offer fixes; make a change only after the user says yes to that specific fix.

## 1. Run the script

From the workspace folder:

- Mac, Linux, or Windows with Git Bash: `bash .claude/skills/health/scripts/health.sh` (add `codex` at the end when running in Codex).
- Windows: also run `powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\health\scripts\health.ps1` (add `-App codex` in Codex). It has the Windows-only checks (Git Bash present, files Windows blocked as downloaded). If bash isn't available at all, run only this one.

The app may ask the user to allow the run; tell them that's expected and that the check only looks. Each line is `OK:`, `FIX:`, `NOTE:` (worth knowing, nothing broken) or `SKIP:` (not checked, and why). The last two lines are `summary:` and `most important:`.

## 2. Checks only you can do

Add these to the results yourself:

- **Panels (Claude Code only).** Look at your own tool list for `interview_start` (it may be listed as a deferred tool you can load, which counts). Present: the panels are loaded. Missing: they didn't load. The usual reasons, most likely first: the folder isn't trusted (reopen it and click Trust), the Claude Code version is too old (the script's version line; the desktop app needs 2.1.286 or later, and its version shows when the user types `/status` in a Code tab session), or it's a WSL or VS Code chat session, where panels never show. Say plainly that everything still works in the chat without them. In Codex, skip this: Codex has no panels.
- **Gmail and Google Calendar.** Look at your tool list for Gmail tools (names containing `Gmail` or `gmail`) and Calendar tools (`Calendar` or `calendar`). Report each as connected or not connected. Not connected is fine; it only means `/sync-inbox`, Gmail drafts and adding interviews to the calendar aren't available. Never call these tools as part of the check.
- **Hooks in this session.** If you saw the session-start greeting text (today's date and the pipeline summary) at the start of this conversation, hooks ran in this session; that settles the "hooks running" line even if the script reported it old. If you didn't see it and the script says FIX, believe the FIX.

## 3. Report

Plain English, short, no file paths unless they help, no code:

1. One line: "Everything important is working" or "N things need fixing".
2. The FIX items as a short list, each with the plain fix. Then any NOTE items worth mentioning (skip notes the user can do nothing about). Don't list OK and SKIP lines unless the user asks; mention a SKIP only when it hides something they care about.
3. **The one most important fix**, in one sentence, and offer to help with it. Rank: the folder isn't the workspace root > a safety check failed or hooks are off > Git Bash missing or files blocked (Windows) > setup not done or starter files missing > Excel has the tracker open > app too old for panels > the git push check is off > notes.

## 4. Offering fixes (only after a yes)

- **Setup not done or starter files missing:** offer `/start`. It puts back only missing files and never overwrites theirs.
- **Git push check off:** with a yes, run `git config core.hooksPath .githooks` in the workspace, then run the health script again to confirm.
- **Blocked files (Windows):** with a yes, run `Get-ChildItem -Recurse | Unblock-File` in PowerShell in the workspace folder, then check again.
- **Excel lock:** ask the user to save and close the sheet in Excel; don't delete the `~$` file yourself (Excel removes it when it closes).
- **Hooks off, wrong folder, app too old, Git Bash missing, connectors:** these are steps the user takes in the app or on their computer. Give the steps from the script line, one at a time.
- **Safety check failed, hook setup missing, files missing, script line endings:** don't try to repair product files by hand. Offer `/update` if the user has a release zip, or suggest downloading a fresh copy and moving their data over with `/my-data`. Until it's fixed, say not to connect Gmail.

Don't add a line to `history/activity.md` for a checkup; it changes nothing.
