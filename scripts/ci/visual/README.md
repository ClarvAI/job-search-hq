# Visual, accessibility and print harness (maintainers)

Renders every page and document the way a user sees it, takes screenshots, and runs the automated parts of a
WCAG 2.2 AA review. It is manual (not in `run-all.sh` or CI): it needs network access for Tailwind, Google Fonts and
the pinned CDN scripts, takes 20 to 40 minutes for the full matrix, and its screenshots are meant to be looked at by a
person. The last full run is written up in `docs/maintainers/reviews/2026-10-12-design.md`.

```
bash scripts/ci/visual/run.sh                       # everything
bash scripts/ci/visual/run.sh --quick               # default + brand themes, 390 and 1440 px (a few minutes)
bash scripts/ci/visual/run.sh --themes brand --pages portfolio --no-docs --out /tmp/vis
```

Needs Node 18+ with npm, Google Chrome (or `CHROME=/path/to/chrome`), and optionally `pdfinfo`, `pdftoppm` and
`qpdf` (poppler and qpdf) for page counts, PDF previews and the PDF tag and outline check. `run.sh` installs
`playwright-core` and `axe-core` once into `$VISUAL_TOOLS` (default `<tmp>/jshq-visual-tools`), never into the repo,
and downloads no browser: Playwright drives the installed Chrome.

## What it covers

It copies the app's product files into `<out>/ws/Job Search HQ` (like `e2e_common.make_workspace`) and only ever runs
the copies there; the repo's pages and templates are never themed or written.

- **Pages:** `apply-theme.mjs --preview --layouts` renders dashboard `overview`/`board` (with the preview's sample data,
  and the brand-new-user state), flashcards `flip`/`list`, interview brief `sheet`/`detailed` and portfolio
  `profile`/`editorial`/`bento` (as shipped, and with the "Example" notes removed) in the `default`, `modern`,
  `minimal` and `high-contrast` presets and a brand accent (`#e4572e`), light and dark, at 320, 390, 768 and 1440 px.
  For each: full-page screenshots; axe-core with the WCAG 2.0/2.1/2.2 A and AA tags; no horizontal scroll at each
  width and at 640 px (200% zoom of a 1280 px window; 320 px is 400%); text spacing per 1.4.12 at 390 px (no scroll,
  no clipped text); target size 2.5.8 (24 px, with the spacing and inline-link exceptions); a Tab walk at 1440 and
  390 px (focus indicator present, its contrast at least 3:1 against what is behind it, the focused control not hidden
  behind sticky content or left off screen, no positive tabindex, places where focus jumps upward listed for review);
  reduced motion (no running animations, nothing left faded); forced colors (screenshots, focus still visible); text
  left below 60% opacity at rest; print to PDF on Letter and A4 (page count, the brief's one- or two-page limit, light
  colors under a dark device theme, a preview image of page 1).
- **Documents (48 + 8):** the resume (`classic`, `modern`, `compact`) and the cover letter, each in the three densities
  on Letter and A4, and the designed resume (`sidebar`, `headline`) in the three densities on both papers, filled with
  the Alex Rivera fixtures in `fixtures/` and printed with the workspace copy of `make-pdf.sh`; plus the designed
  resume in each other theme. Checks: paper, one page, `parse: ok`, the PDF is tagged, and its tag tree has a language and the H1 and section headings in reading order (read with `qpdf`).

## Output

`<out>/summary.md` (failures and the documents table), `<out>/results.json` (everything, including each Tab order and
every axe node), `<out>/shots/<theme>/<page>-<layout>[-state]/{light,dark}-<width>.png`, `forced-*.png`,
`light-zoom200.png`, `light-textspacing-390.png`, `print-{Letter,A4}.png`, `aria-snapshot.yml` (the accessibility tree a screen reader gets), `<out>/shots/docs/*.png` and the PDFs in
`<out>/pdf/`. Exit 0 when nothing failed, 1 when something did, 2 when it could not run.

## What it can't tell you

Look at the screenshots: layout, hierarchy, spacing, empty-state copy and anything that "looks off" are judgement
calls. Screen readers (VoiceOver, NVDA), real browser zoom, Windows High Contrast themes and touch are not automated
here. axe reports some contrast checks as "incomplete" (text on gradients or images); `results.json` lists how many.
