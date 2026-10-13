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

Visual language (all pages): encourage, don't scold (a new week shows "Not started", never "Behind"; an empty page shows a labelled sample preview and one next step); one hero surface per page at most (the accent gradient); inline SVG line icons from the page's own sprite (24px grid, 1.75 stroke, `currentColor`, `aria-hidden` unless standalone); mono uppercase only for section kickers (`.eyebrow`, one per section), dates and counts in the body font (`.meta`); big numbers in the heading font with tabular figures; charts drawn with `--chart-*` (never status colors) and always with a text equivalent. Components and their rules are in `references/page-building.md`.

Read the matching file before you change anything, not after:
- Colors, contrast, a user's brand color, status colors: `references/color.md`.
- Fonts, sizes, spacing, layout, icons, print templates: `references/type-and-layout.md`.
- Anything that moves: `motion.md` (rules first, then recipes).
- Bringing in the user's brand or design system: `references/importing-a-design-system.md`.
- Changing a page's structure, markup, CSS, scripts or a print template (not just its theme or layout): `references/page-building.md` (page contract, color and type systems, Tailwind v4 pitfalls, components, layout, motion, interaction, print).
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

## Rules for every page (details in `references/page-building.md`)

- Never edit a page's token block or fonts line by hand; change `profile/design.md` and run `apply-theme.mjs`.
- To change content, rewrite only the page's JSON data block, with every `<` written as the six characters `\u003c` (the portfolio is plain HTML instead: edit text, escaping `<`, `>`, `&`). Never paste imported text into the page's HTML or script.
- Keep every CDN script's pinned version, `integrity` and `crossorigin` exactly as in the blank copy in `templates/blank/pages/`.
- Facts come only from the user's files; the portfolio is public: resume-level facts only, never NDA material.
- Bespoke CSS goes only in the `/* ---- Custom ---- */` region (see "Layouts").
- If you change a page's structure, read `references/page-building.md` first and apply the same change to its blank copy.
