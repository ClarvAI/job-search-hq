# Type, layout and print details (read before changing fonts, sizes, spacing or a print template)

SKILL.md has the type table and tokens. This file is the reasoning and the numbers behind them.

## Type

- **Fonts:** two families plus a mono is the ceiling, set in `profile/design.md` (heading, body, mono). Pair for contrast (a display face with character over a plain text face, or one family using weight for contrast); never two similar text sans. Changing fonts is a user request, not a fix; only Google Fonts or system fonts, never a paid face. The font list and the exact weights each one loads live in `themes.mjs` (`FONTS`).
- **Load what you use.** If a weight or italic isn't in the Google Fonts link, the browser fakes it (smeared bold, slanted roman). Check the `FONTS` entry before using italic or a weight above 700; the pages use 400–700 and no italic headings.
- **Use CSS properties, not raw tags:** `font-weight: 650`, `font-optical-sizing: auto`, `font-variant-numeric: tabular-nums`. They still work if a fallback font renders; `font-variation-settings` / `font-feature-settings` don't.
- **Weight floor:** 400+ below 18px. Light weights (100–300) only at 28px+ display size.
- **Size floors:** body 16px (1rem), dense UI 14px, captions 13px, never below 12px (labels are 12px uppercase mono, that's the floor). Inputs are 16px on phones or iOS zooms the page.
- **Headings descend:** h1 > h2 > h3 in rendered size. A subheading never outweighs its parent; deep levels may share a size if weight or spacing separates them. Choose the tag for structure, then size it in CSS.
- **Line height:** headings ~1.1; body 1.5–1.6; anything that wraps to 3+ lines at least 1.4, even in a tight card. Unitless values.
- **Letter spacing:** slightly negative on big headings (−0.02em); +0.05–0.07em on small uppercase labels; none on body.
- **Measure:** 60–75 characters per line (about 36–40rem at our body size). Recheck if body size changes.
- **Wrapping:** `text-wrap: balance` on headings; `pretty` on short descriptions; neither on long paragraphs. `overflow-wrap: anywhere` on emails, URLs, job IDs. `white-space: nowrap` on badges and chips. Never `text-align: justify`.
- **Numbers that change** (counts, timers, dates in columns) get tabular figures so the layout doesn't jitter.
- **Truncation** (`truncate`, `line-clamp`) only when the full value stays reachable (expand, title, detail view). On print there is no hover, so print templates never truncate.
- **Write copy in normal case**, style case with `text-transform` (`.eyebrow` does this). Mono uppercase is for section kickers only (one `.eyebrow` per section); dates, places and counts are `.meta` (body font, small, secondary color, sentence case), so the page doesn't read as all metadata.
- **Smart punctuation** in rendered text: curly quotes (straight only in code), en dash for ranges (2025–2027), one ellipsis character (…), minus sign (−) for negatives, `&nbsp;` to keep "6 months" or "Jun 2027" together.
- **Links:** `text-underline-position: from-font; text-decoration-thickness: from-font; text-decoration-skip-ink: auto`. A dotted underline means "more info here" (abbreviations). Only the underline color animates reliably.
- `-webkit-font-smoothing: antialiased` once on the root, not per element. Keep text selectable; `user-select: none` only on drag surfaces (the flashcard swipe).

## Layout

- **Group with space first**, a surface (card) second, a line last. The gap *between* groups is at least 2× the gap *within* one (8px inside → 16px+ between; 24px between sections).
- **Controls look like controls:** a fill, an outline, an underline, or a fixed control row. A badge that looks like a button collects dead clicks; a button that looks like text is invisible.
- **Shared edges:** pick a few alignment lines and keep everything on them; one indent step (16px) per level. Text columns align to the start, numbers in tables to the end.
- **Order by importance:** what the user came for (the next due action, the interview time, the fit score) goes top and leading. Metadata and actions trail. If everything is prominent, nothing is.
- **Hidden content needs a cue:** a horizontal scroller lets the next card peek 16–32px; a collapsed section says what's inside ("Show 9 more jobs", not "More").
- **Space between targets:** ~12px between bordered/filled buttons; ~24px around borderless text or icon buttons. Expanded hit areas must never overlap.
- **Breakpoints come from the content:** collapse where the layout actually stops fitting, not at 768px by habit. Prefer `@container` for a component that lives in columns of different widths. Write breakpoints in `rem` so they respect a larger default font.
- **Let text grow:** no fixed width or height on anything holding text; use `max-width` and `min-height`. Buttons size from their label (padding), never a fixed width. Test with the longest real values (long company names, long job titles, long emails).
- **Units:** `rem` for font sizes, text widths, breakpoints, spacing that should scale with text; `px` for borders, hairlines, focus ring width/offset, shadow details.
- **Never park a key action where it can be clipped** (the bottom of a fixed-height panel); keep it in normal flow or a sticky bar with padding.
- **Reflow:** works at 320px wide and at 200% zoom with only vertical scrolling. Tables and boards scroll inside their own `overflow-x: auto` box.
- **Grid and containers:** 76rem max (dashboard), 64rem (portfolio, brief), 44rem (flashcards); gutters 16 / 24 / 32px at phone / 40rem / 64rem; 12 columns from 64rem, 6 from 40rem, one below. Rhythm on the 4px base: 12–16px inside a card, 16–24px between cards, 40–64px between sections (32px on a phone).
- **Layouts** (`data-layout` on `<html>`): each layout restyles the same markup and data; DOM order is the reading order in every one (a bento grid places tiles visually only), and every layout must pass every check here on its own. Scope layout CSS as `:root[data-layout="bento"] .x`; never fork the markup per layout unless the render script must.

## Surfaces and small polish

- **Concentric radii:** outer = inner + padding (16 = 8 + 8). Past ~24px of padding the layers are separate surfaces; choose radii independently.
- **Shadow vs border:** cards, buttons, raised panels use the layered `--shadow-surface` ring (it adapts to any background). Dividers, table lines and form-field outlines stay real borders.
- **Images** (the portfolio's optional photo and project shots) get `outline: 1px solid oklch(0 0 0 / 0.1)` in light, `oklch(1 0 0 / 0.1)` in dark, `outline-offset: -1px`. Pure black/white at 10%, never a tinted gray or the accent.
- **Icons:** one hidden sprite per page (`<svg hidden><symbol id="i-…">`, used with `<use href="#i-…">`), drawn on a 24×24 grid, `stroke="currentColor"`, stroke 1.75, round caps and joins, outline style, so one icon serves every state. Size ~1–1.25em next to text (12px inside chips, 48px in an empty state's accent-subtle circle). Check legibility at 16px. One icon style per page; no icon fonts, no icon CDNs, no brand logos.
- **Optical alignment:** a button with a trailing icon gets ~2px less padding on the icon side; play triangles nudge ~2px toward the point. Fix in the SVG when you can.

## Print (brief, resume, cover letter)

- Print is a separate design pass, not a screenshot. Light palette always; no shadows (use a hairline border if a box must show); no backgrounds the printer will drop.
- Resume body is 10.5pt at line height 1.2 (bullets are 1–2 lines). Never go below 10pt or squeeze leading to make it fit one page; cut or shorten a bullet instead. Paragraph text (cover letter, brief) gets 1.35+.
- Nothing hover-only, nothing truncated, nothing collapsed: print everything the reader needs. Status needs a word because grayscale printers erase hue.
- Links print as text the reader can type (show the URL or a short domain next to "portfolio").
- Keep sections together (`break-inside: avoid`) and check the one-page rule by printing to PDF after every change.
