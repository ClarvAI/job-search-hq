# Use it from your phone (optional)

Read by `start` (question 15b) and whenever the user asks to use the workspace from their phone. The work still runs on their computer, in this folder: the phone is a remote screen and keyboard. So the computer must stay on, awake and online, with the app open. Give the steps for the app they're in, one at a time. Researched 2026-10 ([Claude Remote Control](https://code.claude.com/docs/en/remote-control), [Codex from anywhere](https://openai.com/index/work-with-codex-from-anywhere/), [ChatGPT help](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)); these features move fast, so if a step doesn't match what they see, say so and look it up.

Say first, in one line: "Anyone holding your unlocked phone could read your search (your resume, contacts, drafts), so keep a screen lock on it."

## Claude (the desktop app's Code tab, or Claude in the terminal)

- **Every new session, automatically (the desktop app):** **Settings → Claude Code → Connect new sessions to Remote Control**, on. **Terminal:** type `/config` and set **Enable Remote Control for all sessions** to true. This is the user's own setting: this folder can't turn it on for them, on purpose.
- **Just this session:** type `/remote-control` (or use the session's Remote Control switch in the desktop app).
- **On the phone:** the Claude app (iOS or Android), signed in to the same Claude account, then **Code**: the session is listed there (also at claude.ai/code in a phone browser).
- Needs Claude Code 2.1.283 or later in the terminal, 2.1.304 or later in the desktop app. On a Team or Enterprise plan, it's off until an owner turns it on in the organization's Claude Code settings.
- The panels (Pipeline, Outbox and the rest) may not show on the phone: everything works in the chat ("show my board", "show my outbox").

## Codex (the ChatGPT desktop app)

- In the ChatGPT desktop app: **Settings → Connections**, and pair the phone (it shows a code to scan with the ChatGPT phone app).
- **On the phone:** the ChatGPT app, signed in to the same account, then the **Remote** tab: chats with Codex on this computer are there.
- Still a preview: on some phones or on Windows it may not be offered yet, or the list may show empty; then use the computer for now. The Codex terminal and editor extension can't be reached from the phone.

## Either way

Nothing about sending changes: drafts still go to the Outbox and the user still sends everything. If the computer sleeps, the phone loses the session until it wakes (the desktop app's keep-awake setting helps: `routines`, step 3).
