# How your pages and documents look

This file is the one place your look is set: the colors, fonts, text size, motion and layout of your dashboard, flashcards, portfolio site and interview briefs, and the few safe choices for your resume and cover letter. To change it, just ask ("switch to the Modern look", "use my brand colors", "bigger text", "less motion", "show me the portfolio layouts", "A4 paper"). Your assistant updates this file and then every page together, and checks that all text stays easy to read.

<!-- Assistant: the two fenced blocks below are read by .claude/skills/page-design/scripts/apply-theme.mjs.
     One "key: value" per line, no comments inside the blocks. A blank value means "use the preset's value".
     After any change here, apply it to the pages (page-design skill, "Change my theme"). -->

## Pages (dashboard, flashcards, portfolio site, interview briefs)

Presets: **default** (friendly headings, warm stone backgrounds, deep teal), **modern** (clean sans, violet), **minimal** (mostly black and white), **high-contrast** (larger text, stronger contrast, motion off), or **brand** (your own colors and fonts, from your brand or design system).

```design
preset: default
source: preset
based_on:
accent:
accent_dark:
neutral:
font_heading:
font_body:
font_mono:
base_size:
density:
radius:
motion:
layout_dashboard:
layout_flashcards:
layout_brief:
layout_portfolio:
```

- `source`: where the look came from: `preset`, `claude-design-system <link>`, `figma <link>`, `website <link>`, `brand-file <file>`, or `custom`.
- `based_on`: for `preset: brand` only, the preset that fills in anything your brand doesn't set (default: `default`).
- With any other preset, values filled in below change just those parts of it.
- `accent`: your main color as a hex code (buttons, links, highlights). `accent_dark`: the same color for dark mode, if your brand has one. `neutral`: a gray or tinted gray for backgrounds and text (hex), if your brand has one.
- Fonts: names from Google Fonts or a system font (`system-ui`, `Georgia`, `Arial`). Headings, body text, and labels/numbers.
- `base_size`: `100%` (default), `large` (112.5%), `larger` (125%), or a size like `18px`. Never smaller than 100%.
- `density`: `compact`, `comfortable` or `spacious`. `radius`: corner roundness, `none`, `small`, `medium`, `large` or a number of pixels. `motion`: `full` or `reduced` (your device's own "reduce motion" setting is always respected too).
- Layouts (blank means the first, the default; your assistant can show you a preview of each):
  - `layout_dashboard`: `overview` (today's to-dos first, then progress and the board) or `board` (your job board first, columns by stage).
  - `layout_flashcards`: `flip` (one big card at a time) or `list` (the whole deck as a study sheet).
  - `layout_brief`: `sheet` (one printable page) or `detailed` (longer, with a section menu; still prints as one page).
  - `layout_portfolio`: `profile` (a card with your name, contact buttons and highlights), `editorial` (no boxes, clean rows like a printed page) or `bento` (a grid of tiles).

## Documents (resume and cover letter)

Recruiters' application systems read these, so only safe choices: one font from the list below, an optional color for your name and the section lines (body text always stays black), spacing, and paper size.

```documents
font: Arial
accent: #111111
density: standard
paper: Letter
layout_resume:
layout_designed:
```

- `font`: Arial, Helvetica, Calibri, Cambria, Georgia, Times New Roman, Garamond, Lato, Source Sans 3, Roboto, or Open Sans.
- `accent`: a dark color as a hex code; if it's too light to read on white paper, your assistant uses a deeper shade of it.
- `density`: `compact`, `standard` or `roomy`. `paper`: `Letter` (US and Canada) or `A4` (most other countries).
- `layout_resume`: `classic` (the default), `modern` (name and headings in your accent color) or `compact` (tighter, for a full page). All three are equally readable by application systems; your cover letter matches it.
- `layout_designed`: for the designed resume, `sidebar` (the default) or `headline`.
- A designed (more visual) resume is available for creative fields; it uses your page look and always comes alongside the plain one, never instead of it.
