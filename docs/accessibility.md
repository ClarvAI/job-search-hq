# Accessibility

We want everyone to be able to use Job Search HQ, including people who use a screen reader, a keyboard only, dictation, or larger text. We aim for **WCAG 2.2 level AA**. We don't claim full conformance yet, because not everything has been tested with real assistive technology.

The short version is in the [README](../README.md#accessibility).

## What has been checked (October 2026)

- **Panels (Claude):** we reviewed each panel's code and fixed what we found. Each panel has automated tests for it.
  - Every button works from the keyboard. Each panel says how to reach it (**Ctrl+X** then **Tab**) and how to leave it (**Esc**).
  - Warnings and errors always say what's wrong in words, not only in color.
  - Buttons that repeat on every card say which card they belong to.
  - The interview clock can be turned off, and you can ask for more time.
  - The pop-up that opens with Claude stays up long enough to read slowly, and `/today` shows the same list again.
- **The conversation:** we read the instructions the assistant follows. It asks one question at a time, you can always type your answer instead of picking from a list, and it avoids jargon. We found a few places to improve, and we're working on them.
- **Pages and PDFs:** every page, in every layout and look, light and dark, at phone to desktop widths, was checked with automated tests (axe) and keyboard walks: no automated failures, a visible focus ring on every control, nothing that needs side-scrolling at 400% zoom, nothing moving when your computer asks for reduced motion, and readable in Windows contrast themes. Resume and cover-letter PDFs are tagged, with headings in reading order.

## Known limits

- Panels run inside your terminal or the Claude desktop app. How well a screen reader reads them depends on that app, and we haven't yet tested them, the pages or the PDFs with VoiceOver or NVDA. Every panel has a chat version that does the same things in plain text. Say "show my board", "show my outbox" or "mock interview".
- Panels need a recent version of Claude Code. Codex has no panels; there, everything happens in the chat.
- Some terminal color themes make dim or yellow text hard to read. Switching to a high-contrast theme in your terminal helps.
- Mock interviews are silent unless you turn voice on (reading aloud can talk over a screen reader). If you turned it on, press **Turn off voice** in the Interview Room, or ask Claude to run the interview in the chat.
- The assistant can talk with you in your own language (setup asks), but the panels, the pages' built-in labels and these guides are in English.

## Need help, or found a barrier?

Tell the assistant what's in your way ("I use a screen reader", "I can't use the mouse", "please don't time me"), and it will adjust. To report a barrier so we can fix it, open an issue in this repository with the **Accessibility barrier** template. Say what you were doing, which app you use (Claude or Codex, terminal or desktop) and which assistive technology. Please leave out your personal details.

Last reviewed: 2026-10-13.
