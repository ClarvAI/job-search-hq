---
name: page-review
description: "One-pass quality review of the user's visual pages and print templates (pages/*.html, jobs/*/interview-brief.html, templates/*.html) and of the Claude panels (Outbox, Pipeline, Contacts, Job Inbox, Apply Kit, Interview Room, due alerts), covering accessibility, layout, readability, color contrast, motion, print, and interface copy. Use after any change to how one of them looks or behaves, or when the user asks whether a page looks right."
user-invocable: false
---

# Page review

Review against `.claude/skills/page-design/SKILL.md` and its `references/` (the rules) and report evidence, not taste. A deliberate design choice you'd have made differently is not a finding; a failed check below is, even if a style rule allowed it. Read-only unless the user asked for fixes.

Scope: name exactly what you reviewed (which pages, which panel, which states). Cover the empty, loading, error and narrow-width states where they exist. At most 15 findings; blockers always come first and are never cut by the cap.

## Severity

- **HIGH** (blocker, fix before the user sees it): blocks a task, misleads, hides content or a control, risks losing data, or repeats across pages.
- **MEDIUM:** makes something meaningfully harder to read, use or keep consistent.
- **LOW:** isolated polish.

These are always HIGH:
- A control with no visible/accessible name, or text the same color as its background (check `@layer components`).
- Something reachable by mouse but not keyboard; no visible focus ring; focus lost after an action.
- Text below its contrast target (`.claude/skills/page-design/references/color.md`) in light **or** dark; state or meaning shown by color alone; a status color used against its meaning (danger red on a harmless button).
- Content cut off with no way to read it; horizontal page scroll at 320px or 200% zoom; content hidden past a scroll edge or in a collapsed section with no cue.
- Motion that ignores reduced-motion; content invisible until an animation runs; a change shown only by motion.
- A destructive action (discard, clear, send, delete) with no confirmation or undo.
- An error that doesn't say how to fix it; a button that does nothing.
- The brief printing on more than one page in the `sheet` layout (or more than two in `detailed`), or the resume running past the length `tailor-resume` set for it (one page by default).
- A resume or cover letter that breaks its ATS rules, or a designed resume made instead of (not alongside) the ATS one.
- A made-up fact about the user (run `truth-checker` on page text built from their files).

## Checks: pages and print templates

1. **Structure:** doctype, `lang`, viewport meta that doesn't block zoom, specific `<title>`, one `<main id="main">`, one `<h1>`, headings in order and descriptive, lists as lists. If header chrome comes before `<main>`, the first Tab stop is a "Skip to content" link.
2. **Native elements:** `<button>` for actions, `<a href>` for navigation (a "button" that goes somewhere is a link). No clickable `<div>`. No ARIA where a native element does the job; a `role` promises its full keyboard behavior.
3. **Keyboard and focus:**
   - Tab reaches every control in visual order; only `tabindex="0"` or `"-1"`, never positive.
   - `:focus-visible` ring (2px, offset 2px, `--color-focus`) visible against every color it crosses: card, page, filled button, chip. Never `outline: none` without that replacement.
   - Enter and Space activate buttons; Escape closes whatever opened last; arrows and Space aren't hijacked while a button or field has focus.
   - When an action hides the focused button (flip, dismiss, confirm), focus moves somewhere sensible: the next card, the result, or back to the trigger. A destructive confirmation focuses the safe choice.
4. **Names and announcements:**
   - Icon-only buttons have `aria-label`; the visible label text is part of the accessible name ("Copy" button isn't named "Duplicate text").
   - Decorative SVG gets `aria-hidden="true" focusable="false"`; never `aria-hidden` on anything focusable. Meaningful SVG gets `role="img"` + a label. Images: `alt=""` if decorative, the meaning if informative, the action if it's a link.
   - Live updates go in a `role="status"` element present from page load (empty), whose text changes. `role="alert"` only for urgent errors. Never move focus to a status message.
5. **Hit areas:** every target at least 24×24px; aim for 44×44 on touch, 40×40 on desktop. Small visuals extend with a `::after` on the button or label (not on the `<input>`). Expanded areas never overlap; ~12px between bordered buttons, ~24px around borderless ones. Decorative overlays (glows, grids, confetti canvas) have `pointer-events: none`. The whole visible control is clickable, including a checkbox's label. Hover styles sit behind `@media (hover: hover)` so they don't stick after a tap.
6. **Forms** (if any): a visible `<label>` for every field (a placeholder is an example, never the label); `autocomplete`, right `type`/`inputmode`; 16px text on phones; submit stays enabled, errors appear next to the field with `aria-invalid` + `aria-describedby`, and focus goes to the first bad field.
7. **Color:** the token block is the one `apply-theme.mjs` generates from `profile/design.md` (re-measured by `apply-theme.mjs --check`, or `--print` for the full table). Grep for stray color literals outside the token block. Check both themes and the actual background each text sits on.
8. **Type:** labels ≥ 12px, weight ≥ 400 below 18px, headings descend in size, wrapped text leading ≥ 1.4 (headings ~1.1), measure ≤ ~75 characters, tabular numbers on changing values, smart punctuation, long names/emails/URLs wrap.
9. **Layout:** 320–400px width and 200% zoom reflow; groups separated by space (between ≥ 2× within); most important thing first; no fixed heights on text; tables/boards scroll in their own box.
10. **Motion:** opt-in, resting state readable, one signature moment, `@supports` around scroll timelines, anything self-moving > 5s has a Stop, errors never auto-hide (`.claude/skills/page-design/motion.md`).
11. **Print:** print to PDF and count pages; dark mode still prints light; nothing truncated or hover-only; status readable in grayscale.
12. **Copy:** the rules below.
13. **Theme and audience** (the table in page-design, "Audience rules"):
    - `node .claude/skills/page-design/scripts/apply-theme.mjs --check` ends `contrast: ok` and lists no `differs:` file (a page out of step with `profile/design.md` is MEDIUM; a contrast `FAIL` is HIGH).
    - Every page: no theme color, font name or radius hard-coded outside the token block; text size not below 100%; motion off under both the device setting and `motion: reduced` (check scripts read `--motion`).
    - Resume and cover letter: one column, real text, standard headings, body text near-black, the accent only on the name, section headings and rules, the font from the ATS-safe list, `parse: ok` from `make-pdf`, in the layout set by `layout_resume` (the cover letter's letterhead matches the resume's). Anything else themed there is HIGH.
    - Designed resume: exists only next to an ATS version made from the same checked text; real selectable text, no images of text, no hidden, white or tiny text (< 9pt), all text ≥ 4.5:1 on white and on the sidebar/band wash, one reading order (the main column comes first in the file and the short sidebar after it, shown on the right in `sidebar`; its PDF text reads the main column, then the sidebar, and experience comes before education in both layouts), `parse: ok`. Breaking any of these is HIGH.
    - Portfolio: public, so contrast in both themes and resume-level facts only (run `truth-checker`); no NDA material.
14. **Layouts and the redesign checklist** (every page × every layout it has; preview them all with `apply-theme.mjs --preview --layouts all`, which changes nothing of the user's):
    - Tokens: no hex/rgb/oklch literal, font name, radius or shadow outside the token block and the Custom region (grep), except the ATS templates' fixed `#111` body text and print overrides. Charts use `--chart-*` (never status colors); empty tracks use `--chart-track`; at most one accent-gradient surface per page.
    - Structure: one file per page; `<html lang="…" data-layout="…">` holds a valid value for that page and every listed layout is complete (none half-styled); reading order = DOM order in every layout; data block schema unchanged, extra fields optional (remove one and reload: the page still renders); flashcards' storage keys, deck/card ids and the pinned ts-fsrs `<script>` with its `integrity` unchanged; every CDN script keeps its pinned version, `integrity` and `crossorigin`; custom classes in `@layer components`, none named after a utility.
    - Visual: one clear focal point top-left and one filled button per view; the empty/example state looks intentional (a labelled sample preview and one next step, no "Behind" in a new week, no wall of zeros); icons are inline SVG from the page's sprite, `currentColor`, `aria-hidden` or titled; it looks right in all presets (default, modern, minimal, high-contrast, and a brand color such as `#e4572e`) in light and dark.
    - Responsive and accessibility: 320, 390, 768 and 1440px wide (use real device emulation such as Playwright's viewport or CDP `setDeviceMetricsOverride`; headless Chrome's `--window-size` can't go below ~500px) with no horizontal page scroll (boards scroll in their own box); 200% zoom reflows; targets ≥ 24px (40px buttons); focus visible on every control; keyboard flows work (flashcards: Space, 1–4, arrows); axe-core (if available) shows no serious or critical issue; charts have a text equivalent; state never by color alone; in forced colors (Windows contrast themes; Chrome DevTools can emulate it) buttons, tabs and cards keep a border, the selected deck/mode shows in Highlight, and chart bars stay visible; single-character keyboard shortcuts (flashcards 1–4) work only while focus is in their area (WCAG 2.1.4).
    - Motion: everything moving is behind `prefers-reduced-motion: no-preference` and `--motion`; nothing starts below opacity 0.4, and scroll-linked reveals don't fade at all (content waiting below the fold is fully opaque); one signature moment per page.
    - Print: the brief prints on one page in `sheet` and at most two in `detailed` (Letter and A4) with the light palette and controls hidden; the portfolio prints cleanly with no gradients or shadows; the resume fits its length in all three layouts × three densities (`page-count.sh`) and `pdftotext` reads name, contact, headings in order and each date after its role; the designed resume parses in both layouts.
    - Tooling: `apply-theme.mjs --check` lists no `differs:`; maintainers: `--check-blank` passes (blank pages and app templates on the Default preset, default layouts, empty Custom region) and the product manifest is rebuilt.
15. **Data block safety** (dashboard, flashcards, interview briefs): the `<script type="application/json" id="data">` block is valid JSON and contains no `<` at all, so no `</script>` can end it early: every `<` in the data is written as the six characters backslash, u, 0, 0, 3, c (check with a search of the block for `</` and `<`; any hit is HIGH). Render scripts put data on the page with `textContent`, never `innerHTML`, and allow only `https:`/`mailto:` links from data. The portfolio has no data block; its text uses `&lt;`, `&gt;`, `&amp;`.

## Checks: panels (mods)

Panels are the Claude Code mods in `.claude/skills/<mod>/hooks/register.tsx` (`register.ts` for due alerts): `outbox` (/outbox), `pipeline` (/pipeline and its one-line band), `contacts-board` (/contacts), `job-inbox` (/job-inbox), `apply-kit` (/apply-kit), `interview-room` (/interview-room), and `due-alerts` (the pop-up when a session opens), plus any new board or alert. They render in the terminal and in the Desktop app, on light and dark themes the user chose.

- **Copy:** same rules as pages (below). In a panel, point to Claude ("Ask Claude to draft a follow-up"), not "Type /x in Claude". Button labels short enough not to wrap at 80 columns.
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

## Copy rules (pages and panels)

- **Buttons start with a verb and name the result:** "Create Gmail draft", "Mark as sent", "Show my notes". Never "OK", "Submit", a bare "Yes"/"No". A button that opens a confirmation ends with "…".
- **Confirmations repeat the consequence** so they can be answered without reading the sentence: "Discard "Follow-up to Globex"? It leaves your Outbox." → `Discard draft` / `Cancel`.
- **Errors say what happened and how to fix it**, next to where it broke: "Not done: Gmail isn't connected. Connect it in Settings → Connectors, then press Create Gmail draft again." No "Oops", no blame, no exclamation marks, no "Something went wrong" alone.
- **Tone follows the stakes:** a win or an empty state can be warm; routine actions are plain; errors, discards and anything about sending are calm and exact.
- **Empty states point forward:** what this place is, how it fills up, one next step. Don't keep important info only in an empty state (it vanishes once content exists).
- **One word per thing, everywhere:** the same status names on every page, panel and in the tracker ("Applied", "Heard back", "Interviewed"); the same verb for the same action ("Discard" in the button and in the notice, not "Delete" in one and "Remove" in the other).
- **Talk to the user as "you"**, and keep one perspective through a flow. Sentence case for every button, label and heading of the same kind.
- **Toggles and settings describe what happens when on** ("Send from my Gmail", not "Don't keep as draft").
- **Links say where they go** ("Open the posting", "My portfolio"), never "click here" or a bare "Learn more".
- **Counts are full sentences with correct plurals** ("1 draft waiting", "3 drafts waiting"), never "1 drafts" or a sentence stitched around a number.
- **Plain words a tired person gets on the first read;** cut every word that does no work. No idioms or jokes in errors.

## Fixing

Prefer the cheapest fix that works, in this order: delete (a line, an animation, an ARIA attribute the native element already covers) → use the platform (native element, browser focus ring) → reuse an existing token or shared class → correct a value → add something new. Fix the root cause (usually a token or shared class) once, then re-check every place it appears.

## Verifying in a browser (when available)

In the Claude Desktop app, the built-in browser is the easiest way to look: open the page there, take a screenshot, and check both light and dark mode. Some versions only open web addresses, not files on the computer; if a page won't open there, don't keep trying: use headless Chrome below, or give the user the file path to double-click (on a Mac, `open <file>`).

If Chrome is installed, Claude can render without opening a window, e.g. on a Mac:
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=6000 --window-size=1280,1400 --screenshot=out.png file:///path/to/page.html`
Add `--blink-settings=preferredColorScheme=0` for dark, or use `--no-pdf-header-footer --print-to-pdf=out.pdf` for print. Headless windows are at least ~500px wide, and animations may be captured mid-flight, which is a reason to keep resting states readable. Mark anything you couldn't check as "Not verified"; never report it as a finding or as passing.

## Report

Scope line (what you looked at, which states). Then one table, blockers first, one row per root cause listing every place it occurs: Severity · Where (file:line) · Problem · Fix. Then what you verified (the command or steps and the result) and what you couldn't. End with "Ready" (no HIGH left) or "Needs fixes". With nothing to report, say so and list what you checked.
