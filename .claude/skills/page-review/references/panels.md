# Page review: panels (mods)

Loaded by `../SKILL.md` when reviewing a Claude Code panel. Severity and the always-HIGH list are in `../SKILL.md`; copy rules in `copy.md`.

Panels are the Claude Code mods in `.claude/skills/<mod>/hooks/register.tsx` (`register.ts` for due alerts): `outbox` (/outbox), `pipeline` (/pipeline and its one-line band), `contacts-board` (/contacts), `job-inbox` (/job-inbox), `apply-kit` (/apply-kit), `interview-room` (/interview-room), and `due-alerts` (the pop-up when a session opens), plus any new board or alert. They render in the terminal and in the Desktop app, on light and dark themes the user chose.

- **Copy:** the rules in `copy.md`. In a panel, point to Claude ("Ask Claude to draft a follow-up"), not "Type /x in Claude". Button labels short enough not to wrap at 80 columns.
- **Keyboard and focus:** every action works from the keyboard; the focused button is visibly different; there's a Close/dismiss button. After an action removes the focused button (a card leaves, a confirm row disappears), focus lands somewhere sensible, not nowhere. Confirm rows list the safe choice ("Cancel") and don't make the destructive one the default.
- **Hit areas:** buttons separated by at least one space or line, never touching; no one-letter labels; the primary action isn't the one easiest to hit by accident.
- **States:** each panel has (due alerts has no buttons and stays silent when nothing is due; check its wording, order and limit instead)
  - an **empty** state saying what goes here and the next step ("No drafts waiting. Ask Claude to draft a follow-up, thank-you note, or networking message.");
  - a **working** state that keeps the action's name ("Sending…", "Creating the Gmail draft…") and gives the buttons back if it fails;
  - an **error** state that starts with what didn't happen and says how to fix it ("Not done: …"), stays until the next action, and isn't only red;
  - a **broken input** state (a file it can't read) naming the file with a one-press fix ("Ask Claude to fix them").
- **Color in terminals:** named colors (`yellow`, `green`, `red`, `dimColor`) render differently per terminal theme; yellow and dim text are often unreadable on light backgrounds. Every colored message also carries a word ("Not done:", "Needs fixing", "Overdue"); dim is only for secondary info, never the only copy of something the user must read. Don't hard-code background colors. If you can, look at it in a light and a dark terminal theme; otherwise mark it "Not verified".
- **Limits and counts:** visible where they matter (LinkedIn note length vs 200), shown as a number, not only a color.
- **Then run** `claude plugin validate <folder>` and `claude plugin test <folder>` for every mod you changed.
