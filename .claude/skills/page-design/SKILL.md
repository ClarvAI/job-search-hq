---
name: page-design
description: "Change how the user's pages and documents look and move: their theme in profile/design.md (presets, or their own brand or design system), colors (measured), fonts, text size, layout, animation, and print. Use whenever the user asks to restyle, recolor, re-theme, change the look, use their brand or design system, or redesign their dashboard, flashcards, portfolio site, interview brief, or the resume/cover-letter templates (e.g. \"make it navy and gold\", \"use my brand\", \"switch to the minimal look\", \"bigger text\", \"less motion\"). Not for the wording of resumes, cover letters, or emails; those follow profile/voice.md."
---

# Page design

All the user's pages share one system so they read as a set, and **one file sets its look: `profile/design.md`**. It has a `design` block (pages) and a `documents` block (resume and cover letter). The resume and cover-letter templates the user's look applies to are their own copies in `profile/templates/`; the app's `templates/*.html` always stay on the default look and are never edited (so app updates and `git pull` never clash with a theme). Pages only ever read CSS custom properties from their token block; applying a theme rewrites that block and the fonts line, never the page's structure or data. Change the theme, not individual elements.

Each page has one job, shown top-left, and a few **layouts** (one file per page; the layout is the `data-layout` attribute on its `<html>` tag, set from `profile/design.md`; see "Layouts" below):
- **Dashboard**, "what do I do today": `overview` (default: a Today hero card with the next due items and one suggested move, KPI tiles with sparklines, weekly-goal rings beside the funnel, a compact board) or `board` (kanban columns first, slim KPI strip, the due list as a side rail).
- **Flashcards**, "practice this card": `flip` (default: one big centered card, deck as a segmented control, a session bar, rating row with intervals, an end-of-session summary) or `list` (a study sheet: the deck as an accordion with inline rating; good for skimming and print).
- **Interview brief**, "what to say": `sheet` (default: header band with who/when/where chips and interviewer monograms, two columns, prints on one page) or `detailed` (long-form screen read with a sticky section nav; prints as the same one-page sheet).
- **Portfolio**, "who is this and how do I reach them": `profile` (default: hero card with monogram and contact buttons, highlight tiles, experience as a timeline), `editorial` (no cards: big name, "label | content" rows, most print-like) or `bento` (a grid of mixed tiles; phone shows them in reading order).
- **Resume and cover letter** (ATS): `classic` (default), `modern`, `compact`; the cover letter's letterhead follows the resume's layout. **Designed resume:** `sidebar` (default) or `headline`.

Visual language (all pages): encourage, don't scold (a new week shows "Not started", never "Behind"; an empty page shows a labelled sample preview and one next step); one hero surface per page at most (the accent gradient); inline SVG line icons from the page's own sprite (24px grid, 1.75 stroke, `currentColor`, `aria-hidden` unless standalone); mono uppercase only for section kickers (`.eyebrow`, one per section), dates and counts in the body font (`.meta`); big numbers in the heading font with tabular figures; charts drawn with `--chart-*` (never status colors) and always with a text equivalent. Components and their rules are in "Components" below.

Read the matching file before you change anything, not after:
- Colors, contrast, a user's brand color, status colors: `references/color.md`.
- Fonts, sizes, spacing, layout, icons, print templates: `references/type-and-layout.md`.
- Anything that moves: `motion.md` (rules first, then recipes).
- Bringing in the user's brand or design system: `references/importing-a-design-system.md`.
- When you're done: run `page-review` (`.claude/skills/page-review/SKILL.md`).

## The theme (`profile/design.md`)

- **Presets** (each a measured token set): `default` (Bricolage Grotesque headings over Source Sans 3, warm stone neutrals, deep teal accent, 10px corners), `modern` (Inter throughout, violet, softer corners), `minimal` (IBM Plex, near-monochrome; color only for status), `high-contrast` (112.5% text, 7:1 text contrast, Lexend for headings and text, a font built for reading ease, plain grays, motion off), and `brand` (the user's own values, filled in from `based_on`, default `default`). A fresh install and `templates/blank/` use `default`.
- **Values** in the `design` block override the preset: `accent`, `accent_dark`, `neutral` (hex), `font_heading` / `font_body` / `font_mono` (Google Fonts or system fonts only), `base_size` (never below 100%), `density` (`compact` / `comfortable` / `spacious`, which scales Tailwind's spacing), `radius`, `motion` (`full` / `reduced`). `source` records where the look came from. Blank means "the preset's value". When switching presets, clear the override lines unless the user wants to keep them.
- **Documents block**: `font` (ATS-safe list only), `accent` (name, section headings and rules only; darkened automatically until it reads on white), `density` (`compact` / `standard` / `roomy`), `paper` (`Letter` or `A4`, from the user's country; `tailor-resume` still follows the job's country per application).
- **Layout keys** (blank = the default, listed first): design block `layout_dashboard` (`overview` / `board`), `layout_flashcards` (`flip` / `list`), `layout_brief` (`sheet` / `detailed`), `layout_portfolio` (`profile` / `editorial` / `bento`); documents block `layout_resume` (`classic` / `modern` / `compact`; the cover letter follows it) and `layout_designed` (`sidebar` / `headline`). A layout is independent of the preset: switching presets keeps the layouts. An unknown value stops apply-theme with an `error:` naming the allowed values.

## Layouts (switch a page's layout)

"Switch my portfolio to bento", "make the dashboard a board", "a more compact resume":
1. If they haven't seen the options, preview them first: `node .claude/skills/page-design/scripts/apply-theme.mjs --preview --layouts portfolio` (or `dashboard`, `flashcards`, `brief`, `resume`, `cover-letter`, `designed`, several comma-separated, or `all`) writes `pages/.preview/<page>-<layout>.html` for every layout of that page, with sample content in their current theme, and prints the paths; their pages don't change. Open them as in step 5 of "Change my theme" below. Describe each in one line (the list above).
2. Show the one-line change (`layout_portfolio: bento`) in `profile/design.md` and get an OK; edit only that line.
3. Run `apply-theme.mjs`. It rewrites only the `data-layout` attribute (with the token block) in `pages/*.html`, every `jobs/*/interview-brief.html` (briefs share `layout_brief`), and the user's template copies in `profile/templates/` (created from `templates/` the first time a layout or theme makes them differ). Resumes and letters already made for a job keep their layout; new ones copy the template and inherit it.
4. Run `page-review` on that page in the new layout (light and dark, phone and desktop width; resumes: page count and `parse: ok`), then republish it if it's published (pages skill).
- A page made before layouts existed has no `data-layout` on its `<html>` tag and only one look: offer to bring it up to date first (pages skill, "Bring a page up to date").
- **Bespoke tweaks** ("make the hero taller only on my portfolio"): never edit the page's own CSS or the token block. Put the rule between `  /* ---- Custom ---- */` and `  /* ---- End custom ---- */` (the end of the page's first `<style>`; templates have the same region), scoped with `:root[data-layout="bento"]` when it's for one layout, using tokens only (no raw colors, fonts or sizes). apply-theme and `--regenerate` keep that region as it is; a page refresh from `templates/blank/` must copy it over by hand.

## Change my theme / use my brand (any time)

1. Ask what they want in one question if it isn't clear: a preset ("show me the looks"), a tweak ("bigger text", "navy accent"), or their brand ("use my brand / design system / website colors"). For a brand, follow `references/importing-a-design-system.md`.
   - **Two colors named** ("navy and gold"): the system has one accent color (buttons, links, highlights), so the meaning of color stays clear. Use the first color (or the one they choose) as `accent`, and say in one line what happens to the other: "Pages use one accent color, so I used navy; gold isn't used." Never drop a color silently, and never invent a second accent.
2. Show the user the exact lines you'll change in `profile/design.md` and get an OK (it's their profile). Then edit only those lines.
3. **Apply it:** `node .claude/skills/page-design/scripts/apply-theme.mjs`. It resolves the theme, measures every text pair in light and dark (and the print colors on white), fixes failing colors by adjusting **lightness only**, then rewrites the token block, fonts line and `data-layout` attribute in `pages/*.html` and every `jobs/*/interview-brief.html`, and the theme block of the user's template copies in `profile/templates/` (the two ATS templates' document block, the designed resume's block and fonts line). The first time the theme makes a template differ from the app's copy, it creates the user's copy there (`created:` line); a template that already matches the app's copy needs none. It never touches `templates/` (the app's copies and `templates/blank/`), data blocks, or resumes already made for a job; only this skill re-themes pages (an app update never does).
   - `adjusted:` / `note:` lines: tell the user in one plain line ("Your orange was too light for white button text, so buttons use a deeper orange.").
   - `error:` (nothing was changed): fix the value it names in `profile/design.md` and run it again.
   - `--check` compares without writing; `--print` shows the contrast table and block; `--preset <name>` tries a preset without editing design.md.
4. Run `page-review` on one page in light and dark, then tell the user what changed and that every page follows it. Republish published pages (pages skill).
5. Preview before choosing: `node .claude/skills/page-design/scripts/apply-theme.mjs --preview` writes a sample dashboard (sample data, not theirs) in every preset, and theirs, to `pages/.preview/` and prints the paths. Their pages and templates don't change. Show them: if the built-in browser can open files from the computer, open them there; if it can't (some versions only open web addresses), don't keep trying: give the user the paths to double-click, or on a Mac run `open <file>`. The previews can be deleted afterwards. Without Node, describe the presets in one line each instead.

**Without Node** (`node` not found, e.g. Codex on Windows): never ask the user to install anything.
- Presets still work: each `presets/<name>.md` holds the precomputed, contrast-checked fonts line, page token block and designed resume block. Replace the matching regions in each page (from `  /* ---- Design tokens` through `  /* ---- End design tokens ---- */`, and the fonts `<link>` line) with your file-editing tool, then set `preset:` in design.md.
- Fonts, `base_size`, `density`, `radius` and `motion` can be edited by hand in the token block's last lines (`--font-*`, `font-size`, `--spacing` 0.225/0.25/0.28rem, `--radius-*` sm = md/2, lg = md + 8, xl = lg + 8 (all 0 for no corners), `--motion`; for reduced motion also copy the "Motion: reduced" rule from `presets/high-contrast.md`). Fonts also need the `<link>` line (build it like the presets' links).
- **Layouts without Node:** set the key in design.md, then change the one `data-layout="..."` attribute on the `<html lang="en" data-layout="...">` tag of each file it applies to: the page in `pages/` (and every `jobs/*/interview-brief.html` for `layout_brief`); for documents, the user's copies `profile/templates/resume-template.html` and `cover-letter-template.html` (`classic` / `modern` / `compact`, the same value in both) and `profile/templates/resume-designed-template.html` (`sidebar` / `headline`), copying them from `templates/` first if they aren't there yet. Section 5 of any `presets/<name>.md` has the table.
- **Custom colors need the generator.** Keep the closest preset's palette, save their colors in design.md anyway, and tell the user in one line that their exact colors will be applied (and contrast-checked) the next time this runs where Node is available. Never hand-pick page colors without measuring them.
- **Resume and cover-letter look without Node:** section 4 of any `presets/<name>.md` has the documents block for both templates and the values for every safe font, density and paper size. Edit the user's copies in `profile/templates/` (copy a template there from `templates/` first if it isn't there yet; never edit `templates/`): replace the region from `  /* ---- Document theme` to `  /* ---- End document theme ---- */` with the block filled in from the documents block of design.md. The designed resume's block is section 3. Documents accent without Node: use only a pre-measured dark color from `references/importing-a-design-system.md` ("Safe document accents").

## Audience rules (who sees what)

| Output | Audience | What the theme may change | Always enforced |
|---|---|---|---|
| Resume, cover letter (the user's copies `profile/templates/*-template.html`, made from `templates/`) | Applicant tracking systems, recruiters | Documents block only: font from the ATS-safe list, accent on the name, section headings and rules, density, paper, layout (`classic` / `modern` / `compact`) | One column, real text, standard headings, body text near-black (#111), no images/icons/tables, length set by `tailor-resume`, PDF parse check |
| Designed resume (`profile/templates/resume-designed-template.html`, made from `templates/`) | A person (emailed, shared), creative fields | The full page theme, printed light; layout `sidebar` or `headline` | Always alongside the ATS version, never instead; same checked text; real selectable text; no images of text, no hidden or tiny text; text ≥ 4.5:1 on white; parse check passes |
| Portfolio (`pages/portfolio.html`) | Public: their personal brand | Everything | Contrast floors in both themes, reduced motion respected, resume-level facts only, no NDA material |
| Dashboard, flashcards, interview brief | Private | Everything | Contrast floors, text never below 100%, reduced motion respected (device setting or `motion: reduced`), the brief prints in light colors on one page (`sheet`) or two (`detailed`) |
| Panels (Outbox, Pipeline, …) | Terminal | Nothing: they follow the user's terminal theme | page-review's panel checks |

## Page contract (every page)

- One self-contained `.html` file: `<!doctype html><html lang="en">`, charset and viewport metas, `<title>` (a short name), the fonts `<link>` line, the Tailwind v4 browser build as exactly `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.13/dist/index.global.js" integrity="sha384-P0V9YU7TFy919I0oVLXiqiUsdiJiaV+QKGysF4Lx+s901F1X9+zjFV0mc6pRKCKq" crossorigin="anonymous"></script>`, inline CSS and JS. Every CDN script keeps its pinned version, `integrity` and `crossorigin` attributes exactly as in the page's blank copy in `templates/blank/pages/`; never switch to an unpinned or `@latest` URL or drop the integrity hash (a changed file would then run unchecked). Adding a new CDN library needs a pinned version and its own `integrity` hash. Works opened by double-click and when published as a claude.ai artifact.
- **Theme region:** the first thing in the first `<style>` is the generated token block, from `  /* ---- Design tokens` to `  /* ---- End design tokens ---- */`. Nothing outside it may hard-code a theme color, font name, radius, shadow, type size or spacing scale; use tokens. Scripts that animate read `--motion` as well as the device setting (`motion.md`).
- **Layout:** `<html lang="en" data-layout="<default>">` exactly (lang first, nothing else on the tag); CSS scopes variants with `:root[data-layout="board"] …`, and the render script reads `document.documentElement.dataset.layout` and branches only where markup differs. Every layout is complete and polished, uses the same data block, and keeps reading order = DOM order (grid placement is visual only).
- **Custom region:** the last lines of the first `<style>` are `  /* ---- Custom ---- */` and `  /* ---- End custom ---- */`, empty in the shipped copies; the user's own tweaks go there (see "Layouts").
- **Content lives in `<script type="application/json" id="data">`** (dashboard, flashcards, interview brief; the portfolio is the exception: its content is plain HTML, edited as text with `&lt;`, `&gt;`, `&amp;`). The render script reads it. To update content, rewrite only that block, as valid JSON with every `<` written as the six characters `\u003c` (backslash, u, 0, 0, 3, c; in code `JSON.stringify(data).replace(/</g, '\\u003c')`), so no `</script>` in someone's text can end the block; afterwards the block contains no `<` at all. Render scripts put data on the page with `textContent` (or text nodes), never `innerHTML` with data in it, and allow only `https:`/`mailto:` links from data. Example data sets `"example": true`, which shows a visible "Example" note.
- Facts come only from the user's files. The portfolio is public-facing: resume-level facts only, never NDA material.
- When you change a page's structure (not its theme), apply the same change to its blank copy in `templates/blank/pages/` (structure and styling only, none of the user's data, and still on the `default` preset), so a reset by `my-data` keeps it. (Maintainers changing a page for everyone: change `templates/blank/pages/` and add a `migrations/` note, since updates never touch the user's own `pages/`. Then `apply-theme.mjs --write-blank` puts the blank pages and `templates/*.html` back on the Default preset and default layouts, `--check-blank` confirms it (CI runs it), and `--build-presets` rebuilds `presets/*.md` after any change to the token engine.)

## Color system (generated, measured)

- **Primitives:** five role-based 12-step ramps in OKLCH (Radix model: 1 page bg, 2 subtle bg, 3 component bg, 4 hover, 5 selected, 6 subtle border, 7 border, 8 strong border, 9 solid fill, 10 solid hover, 11 low-contrast text, 12 high-contrast text): `--neutral-*`, `--accent-*`, `--success-*`, `--warning-*`, `--danger-*`. Light and dark are separate ramps, not a mirror: dark is less vivid and its solid hover darkens so button text still passes.
- **Semantic tier** (the only thing components use), `--color-{role}-{variant}`: `bg-page/surface/raised/sunken/hover/inset/overlay`, `text-primary/secondary/disabled/on-accent`, `border-subtle/border/border-strong`, `graphic-idle`, `accent-subtle/subtle-hover/border/solid/solid-hover/text`, `accent-gradient`, `focus` (accent 9 light, accent 11 dark), `success|warning|danger-subtle/solid/text`, `shadow-surface/raised/overlay`, plus `--print-accent-text/subtle` (light values the brief uses when printing).
- **Derived tokens** (generated for every preset and brand, so a brand import needs no extra keys):
  - `--color-bg-inset`: wells inside cards (board columns, chips' wells); neutral 3 light, neutral 1 dark. `--color-bg-overlay`: the dim behind a dialog.
  - `--color-accent-gradient`: a full `linear-gradient(...)` value (light accent 9 → 11, dark 8 → 10, each stop measured with `--color-text-on-accent` at 4.5:1 and swapped for the solid fill if it fails). **One hero surface per page at most** (portfolio hero, brief header band, dashboard Today card); text on it is `--color-text-on-accent`. Print drops it (`--print-accent-*` on white).
  - `--chart-1` … `--chart-5`: chart series. Chart 1 is the accent's solid fill; 2–5 turn its hue by ±120° and ±60° at the same lightness and chroma, kept 15°+ from every status hue, 25°+ apart and outside the yellow/olive band (hue 65–130), then darkened (light) or lightened (dark) until each is 3:1 on surface, page, inset and raised. A near-gray accent (Minimal) gets an ordered lightness ramp instead (one direction, no alternating). A single-series chart (the funnel) uses one hue, `--chart-1`, with lightness or opacity steps, not one color per stage. Status colors are never chart colors. `--chart-track`: empty progress tracks, the first neutral step at 1.5:1 on surface and page.
  - `--avatar-bg` / `--avatar-fg`: initials monograms (accent subtle / accent text).
  - Scale: `--radius-xl` (lg + 8, hero cards), `--radius-full` (chips, avatars, bars), `--space-1` … `--space-10` (`--spacing` × 1, 2, 3, 4, 6, 8, 10, 12, 16, 24; for plain CSS such as print and flashcard faces; scales with density), the type scale `--text-{display,title,heading,subheading,body,small,label}` with `--text-*--line-height` (and `--letter-spacing` for display, title, label), `--measure` (38rem reading width).
- **Tailwind names** (mapped with `@theme inline`): `bg-page`, `bg-surface`, `bg-sunken`, `bg-hover`, `text-fg`, `text-fg-muted`, `text-fg-faint`, `bg-line*`, `bg-accent`, `bg-accent-hover`, `text-accent-ink`, `bg-accent-wash`, `outline-ring`, `bg-ok|warn|bad`, `text-ok-ink|warn-ink|bad-ink`, `bg-ok-wash|warn-wash|bad-wash`, and where a page maps them `bg-inset`, `bg-chart-1`…`5`, `bg-track`, `bg-avatar`, `text-avatar-ink`. `font-serif` means the heading font, whatever it is.
- **Measured:** every text pair ≥ 4.5:1 (WCAG) and APCA Lc ≥ 60 (body ≥ 75) in both themes (7:1 in High contrast); graphics ≥ 3:1, including every chart color on every surface; the chart track ≥ 1.4:1; text on both gradient stops ≥ 4.5:1 (`apply-theme.mjs --print` lists them all).
- **Dark mode:** surfaces get lighter as they rise (page < surface < raised); shadows become rings; the gradient uses accent 8 → 10; chart colors are re-measured on the dark surfaces; images get a 10% white outline; never pure black or white.
- One meaning per color: accent = interactive or emphasis; status colors only for status, always with a word or icon too. One filled (accent) button per view.
- Radii are concentric: `--radius-sm` (half of md) chips, `--radius-md` cards and buttons, `--radius-lg` = md + 8 for a container holding cards with 8px padding. Surfaces use `--shadow-surface` (layered ring) instead of borders; borders only for dividers.

## Type system

Before changing fonts, sizes or spacing, read `references/type-and-layout.md`.

| Role | Tailwind | Face | Size / leading |
|---|---|---|---|
| Display (portfolio name) | `font-serif text-display` | heading font, 700 | clamp 2.5–4.25rem / 1.02, −0.022em |
| Title (page h1) | `font-serif text-title` | heading font, 600–700 | clamp 1.75–2.25rem / 1.1 |
| Heading (sections) | `font-serif text-heading` | heading font, 600 | 1.375rem / 1.25 |
| Subheading (card titles) | `font-serif text-subheading` | heading font, 600 | 1.125rem / 1.35 |
| Body | `text-body` | body font, 400 | 1rem / 1.55 |
| Small | `text-small` | body font, 400–600 | 0.875rem / 1.45 |
| Eyebrow (section kicker) | `.eyebrow` | mono, 500, uppercase | 0.75rem, +0.07em; one per section at most |
| Meta (dates, places, counts) | `.meta` | body font, small, secondary color, sentence case | 0.875rem |

- The scale lives in the token block (`--text-*`), so a preset or brand can tune it; each page's `@theme inline` only references it (`--text-title: var(--text-title);` and the same for `--line-height` / `--letter-spacing`). Sizes are in rem, so `base_size` scales everything.
- Big numbers: heading font, 600–700, `lining-nums tabular-nums` (`.num`), title size or larger; a unit or suffix at 60% size in the secondary color.
- Rhythm on the 4px base: 12–16px inside a card, 16–24px between cards, 40–64px between sections on desktop (32px on a phone).
- Weight ≥ 400 below 18px.

## Tailwind v4 specifics (bugs we already hit)

- Map tokens with `@theme inline { --color-accent: var(--accent); ... }` so utilities follow the theme. Density works because the token block sets `--spacing`, which every spacing utility multiplies.
- **Custom classes go inside `@layer components { ... }`.** Unlayered custom classes beat utilities; that once made the flashcards' main button white-on-white.
- Don't name custom classes after utilities (`grow`, `flex`, `hidden`, `ring`, `outline`, `shadow`, `fill`, `track`...). `.grow` once broke every bar.
- Shared pieces live in `@layer components`: `.eyebrow`, `.meta`, `.panel`, `.btn`, `.btn-primary` and the components below.
- Writing whole files with an editor tool has turned the `\u003c` escape in a data block into a literal `<` and dropped whitespace-only lines from the token block (which then fails `--check-blank`); after writing a page, check both. Body background, fonts and focus ring are set in the plain (unlayered) `<style>` so an artifact wrapper can't override them.

## Type details

- `text-wrap: balance` on headings, `pretty` on paragraphs; reading width about 36–40rem (60–75 characters).
- Smart punctuation in rendered copy (’ “ ” – … −). Never truncate content without a way to see it; wrap emails and URLs with `[overflow-wrap:anywhere]`.

## Components (all in `@layer components`, tokens only)

- **Card** `.panel` (surface, `--shadow-surface`, `--radius-md`, padding 20–24px); `.panel-hero` (`--radius-xl`, may use the accent gradient with on-accent text; one per page); `.well` (`--color-bg-inset`, `--radius-lg`, 8px padding, so corners stay concentric).
- **Stat tile:** eyebrow, big number, a delta or context line, optional 40px sparkline or progress bar. Status by word and icon, never color alone.
- **Progress:** bar (8px, `--radius-full`, track `--chart-track`), ring (SVG, 48–64px, weekly goals), segmented (fit 1–5).
- **Funnel:** one series, one hue (`--chart-1`; stage emphasis by opacity steps that keep 3:1); a horizontal bar per stage with the stage-to-stage conversion between rows; with no data it draws ghost bars (100/60/30/15/5%) in `--chart-track` under a "Sample" eyebrow.
- **Timeline:** a vertical `--color-border-subtle` rule with 10px dots (accent for the current one), dates in `.meta`.
- **Chip/badge:** `--radius-full`, small, 600, a leading 12px icon; neutral, accent, success, warning, danger (subtle background, text color). Chips never look clickable; filter chips are buttons with `aria-pressed`.
- **Buttons:** primary (one per view), secondary (surface + ring), ghost (text, hover background), icon button (40px target, `aria-label`). Press to `scale: 0.96`.
- **Tabs / segmented control:** one row; active = a surface pill on an inset well, not an accent fill. `role="tablist"` for decks, `aria-pressed` for mode toggles.
- **Empty state:** 48px line icon in an accent-subtle circle, a one-sentence title, one sentence and one action ("Ask your assistant to…"), optionally a ghost preview behind.
- **Avatar/monogram:** initials in `--avatar-bg` / `--avatar-fg`, `--radius-full`; no photos by default (the portfolio takes an optional one).
- **Callout:** icon + accent-subtle background (the "Example" note). **Kbd:** mono, inset background, 1px subtle border. **Rows:** 44px min height, subtle dividers, numbers end-aligned.
- **Icons:** one hidden `<svg>` sprite of `<symbol id="i-…">` per page, drawn on a 24×24 grid, `stroke="currentColor"`, stroke 1.75, round caps and joins, outline style; `aria-hidden="true"` unless standalone (then a `<title>`). No icon fonts, no icon CDNs, no brand logos (LinkedIn is a generic "in" monogram).

## Layout

Before changing spacing, grouping or breakpoints, read the Layout section of `references/type-and-layout.md`.

- Containers: max width 76rem (dashboard), 64rem (portfolio, brief), 44rem (flashcards); gutters 16px on phones, 24px from 40rem, 32px from 64rem. A 12-column grid from 64rem (gap 24px), 6 columns from 40rem, one column below; breakpoints in rem; `@container` for cards that sit at different widths.
- Boards and rails scroll in their own box with a 24px peek of the next column and snap points.
- One outer wrapper with side padding ≥ 16px; `gap` for spacing; stack to one column at phone width; nothing wider than the screen except tables or boards inside their own `overflow-x: auto`.
- Space groups first, surfaces second, lines last. Logical properties (`ps-`, `pe-`, `text-start`).
- `<main id="main">`, one `<h1>`, headings in order, lists as `<ul>/<ol>`.

## Motion (see motion.md for recipes)

- Motion is **opt-in**: wrap it in `@media (prefers-reduced-motion: no-preference)`; under reduce, swap movement for an instant change or a crossfade. `motion: reduced` in design.md does the same for every page, on any device.
- **The page is complete at rest.** Anything that animates in starts partly visible (opacity ≥ 0.4), and the final values are in the markup. A screenshot or link preview mid-animation must still read.
- Scroll-linked effects only inside `@supports (animation-timeline: view())` (set `animation-duration: 1ms` for Firefox); without support, everything simply shows.
- Animate `transform`, `translate`, `scale`, `opacity`, `width` of bars only. Name transition properties, never `transition: all`. Buttons press to `scale: 0.96` in 150ms. Hover lifts only under `@media (hover: hover)`.
- One signature moment per page (dashboard counters and funnel bars growing, flashcards flip and deal, brief teleprompter, portfolio hero fade-up and highlight counters). Everything else is a color or opacity change of 150ms or less. Confetti only for an accepted offer. Don't stack effects.

## Interaction and copy

The full wording rules (buttons, errors, empty states, confirmations) and the keyboard/focus checks are in `page-review`; follow them while writing, not only when reviewing.

- Real `<button>` and `<a href>`; visible `:focus-visible` ring (2px accent, offset 2px); every control reachable by keyboard; don't hijack Space or arrows while a control has focus; move focus deliberately after actions that hide the focused button.
- State never by color alone: add a word, icon, shape, or count. Live updates go in a stable `role="status"` element.
- Buttons start with a verb and say what happens ("Show my notes", "Reset progress…" → "Reset progress" / "Keep progress"). Destructive or irreversible actions get an in-page confirmation (no `confirm()`; it doesn't work in artifacts).
- Empty states point forward ("Nothing lined up. Ask your assistant to find jobs."). Pages are read by Claude and Codex users alike, so say "your assistant" and name the action in plain words rather than "Type /x in Claude".
- Copy buttons: `navigator.clipboard.writeText` in the click handler; on failure select the text and say "Press Ctrl+C or Cmd+C".

## Print (brief, resumes, cover letter)

Before editing a print template, read the Print section of `references/type-and-layout.md`.

- `@page { size: Letter; margin: ~0.5in }` (A4 where the user's country uses it; in the templates `@page` sits in the theme block and comes from `paper:`; the resume follows the country norms in `tailor-resume`); force the light palette with a selector strong enough to beat dark mode (`html:root, html:root[data-theme], html:root:not([data-theme="light"])`); scale type by setting `font-size` on that root; hide screen-only controls; `break-inside: avoid` on sections.
- Brief: **one page** in `sheet`, up to **two** in `detailed` (Letter and A4), light palette, hairline borders instead of shadows, the header band as accent text on white, two columns kept, controls hidden, URLs printed. Portfolio: 1–2 clean pages (the hero becomes a plain header, grids become 2 columns, no gradients or shadows). Dashboard prints the KPIs and due list; flashcards print every card as a Q/A list.
- The brief must print on **one page** in `sheet` (up to two in `detailed`), and the resume must stay within the length `tailor-resume` set for it (one page by default). Check by printing to PDF after any change (`make-pdf.sh` / `page-count.sh`), in every documents density you change.
- Resume template stays ATS-safe in all three layouts: one column, real text, standard headings, no icons, images or tables; dates are inline spans after their role so `pdftotext` reads left text then date on the same line; no italics. The designed resume's `sidebar` layout puts its short sidebar first in the file so its PDF text reads sidebar then main column, never interleaved. The designed resume is the only place the full theme reaches a resume, and it never replaces the ATS one.
