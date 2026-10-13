# Preset: Editorial

A warm editorial look: Fraunces headings over Source Serif 4 text on warm paper tones, a deep plum accent, small corners.

Precomputed and contrast-checked by `scripts/apply-theme.mjs --build-presets` (every text pair passes in light and dark mode). Use this file by hand only when Node isn't available; see "Without Node" in `.claude/skills/page-design/SKILL.md`. Don't edit it; rebuild it.

Fonts: Fraunces (headings), Source Serif 4 (text), Source Code Pro (labels and numbers). Text size 100%, comfortable spacing, 6px corners, motion full.

## 1. Fonts line (every page, and the designed resume template)

Replace the fonts line (the one `<link rel="stylesheet" ...>` whose address ends in `templates/assets/fonts/fonts.css`, starts with `https://fonts.googleapis.com/css2?`, or is `data:text/css,`) with the line below. It is written for a page in `pages/`; in `jobs/<folder>/interview-brief.html` and in the user's copy of the designed resume template, write `../../templates/assets/` instead of `../templates/assets/`.

```html
<link rel="stylesheet" href="../templates/assets/fonts/fonts.css" data-fallback="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..600&family=Source+Code+Pro:wght@400..600&display=swap" onerror="if(this.dataset.up){this.onerror=null;this.href=this.dataset.fallback}else{this.dataset.up=1;this.href='../'+this.getAttribute('href')}">
```

## 2. Page token block (pages/*.html and jobs/*/interview-brief.html)

Replace everything from the line starting `  /* ---- Design tokens` through the line `  /* ---- End design tokens ---- */` with:

```css
  /* ---- Design tokens (generated; see .claude/skills/page-design/SKILL.md) ----
     Primitives are role-based 12-step ramps (1 page bg … 9 solid fill … 11 low-contrast text, 12 high-contrast text),
     built in OKLCH: neutral (hue 70), accent "plum" (335), success (152), warning (72), danger (27).
     Components use only the semantic --color-* tokens. Every text pair is measured >= 4.5:1 in both themes. */
  :root {
    color-scheme: light;
    --neutral-1: #fffcf9; --neutral-2: #fcf8f3; --neutral-3: #f6f0e9; --neutral-4: #efe7e0; --neutral-5: #e8dfd6; --neutral-6: #dfd5cb; --neutral-7: #d2c7bb; --neutral-8: #beb0a1; --neutral-9: #806e5a; --neutral-10: #73614d; --neutral-11: #685a4a; --neutral-12: #2a2117;
    --accent-1: #fdfcfd; --accent-2: #faf8fa; --accent-3: #f6eef4; --accent-4: #f1e4ee; --accent-5: #eddae8; --accent-6: #e9cee2; --accent-7: #e3bbd9; --accent-8: #db9acc; --accent-9: #7e3b72; --accent-10: #6d3262; --accent-11: #804274; --accent-12: #2c1d29;
    --success-1: #fbfdfc; --success-2: #f3fbf5; --success-3: #dff9e4; --success-4: #c8f7d3; --success-5: #aef5c0; --success-6: #82f4a5; --success-7: #6ee695; --success-8: #56cf7f; --success-9: #1a7d43; --success-10: #166e3a; --success-11: #256c3e; --success-12: #18271c;
    --warning-1: #fdfdfc; --warning-2: #fbf8f5; --warning-3: #f9efe4; --warning-4: #f6e6d3; --warning-5: #f4ddc1; --warning-6: #f3d1a8; --warning-7: #f1bf82; --warning-8: #e5a44d; --warning-9: #d28e26; --warning-10: #c18222; --warning-11: #795420; --warning-12: #2a2116;
    --danger-1: #fdfcfc; --danger-2: #fbf8f7; --danger-3: #f9eeed; --danger-4: #f6e4e2; --danger-5: #f5dad6; --danger-6: #f3cdc8; --danger-7: #f1bab3; --danger-8: #f0978d; --danger-9: #c01e20; --danger-10: #aa191b; --danger-11: #a32925; --danger-12: #351a17;
    
    --color-bg-page: var(--neutral-2); --color-bg-surface: var(--neutral-1); --color-bg-raised: var(--neutral-1); --color-bg-sunken: var(--neutral-3); --color-bg-hover: var(--neutral-4);
    --color-text-primary: var(--neutral-12); --color-text-secondary: var(--neutral-11); --color-text-disabled: var(--neutral-9); --color-text-on-accent: #ffffff;
    --color-border-subtle: var(--neutral-6); --color-border: var(--neutral-7); --color-border-strong: var(--neutral-8); --color-graphic-idle: var(--neutral-9);
    --color-accent-subtle: var(--accent-3); --color-accent-subtle-hover: var(--accent-4); --color-accent-border: var(--accent-7); --color-accent-solid: var(--accent-9); --color-accent-solid-hover: var(--accent-10); --color-accent-text: var(--accent-11); --color-focus: var(--accent-9);
    --color-success-subtle: var(--success-3); --color-success-solid: var(--success-9); --color-success-text: var(--success-11);
    --color-warning-subtle: var(--warning-3); --color-warning-solid: var(--warning-9); --color-warning-text: var(--warning-11);
    --color-danger-subtle: var(--danger-3); --color-danger-solid: var(--danger-9); --color-danger-text: var(--danger-11);
    --shadow-surface: 0 0 0 1px oklch(0 0 0 / 0.06), 0 1px 2px -1px oklch(0 0 0 / 0.06), 0 2px 4px 0 oklch(0 0 0 / 0.04);
    --shadow-raised: 0 0 0 1px oklch(0 0 0 / 0.07), 0 2px 4px -2px oklch(0 0 0 / 0.08), 0 16px 32px -16px oklch(0 0 0 / 0.22);
    --color-bg-inset: var(--neutral-3); --color-bg-overlay: #2a211773;
    --color-accent-gradient: linear-gradient(135deg, var(--accent-9), var(--accent-11));
    --shadow-overlay: 0 0 0 1px oklch(0 0 0 / 0.08), 0 8px 16px -8px oklch(0 0 0 / 0.16), 0 24px 48px -12px oklch(0 0 0 / 0.28);
    --chart-1: #7e3b72; --chart-2: #40640d; --chart-3: #006374; --chart-4: #8c3d19; --chart-5: #455098; --chart-track: var(--neutral-7);
    --avatar-bg: var(--color-accent-subtle); --avatar-fg: var(--color-accent-text);
    --radius-sm: 3px; --radius-md: 6px; --radius-lg: 14px;
    --radius-xl: 22px; --radius-full: 999px;
    --space-1: calc(var(--spacing) * 1); --space-2: calc(var(--spacing) * 2); --space-3: calc(var(--spacing) * 3); --space-4: calc(var(--spacing) * 4); --space-5: calc(var(--spacing) * 6); --space-6: calc(var(--spacing) * 8); --space-7: calc(var(--spacing) * 10); --space-8: calc(var(--spacing) * 12); --space-9: calc(var(--spacing) * 16); --space-10: calc(var(--spacing) * 24);
    --text-display: clamp(2.5rem, 6.5vw, 4.25rem); --text-display--line-height: 1.02; --text-display--letter-spacing: -0.022em;
    --text-title: clamp(1.75rem, 3.6vw, 2.25rem); --text-title--line-height: 1.1; --text-title--letter-spacing: -0.012em;
    --text-heading: 1.375rem; --text-heading--line-height: 1.25;
    --text-subheading: 1.125rem; --text-subheading--line-height: 1.35;
    --text-body: 1rem; --text-body--line-height: 1.55;
    --text-small: 0.875rem; --text-small--line-height: 1.45;
    --text-label: 0.75rem; --text-label--line-height: 1.3; --text-label--letter-spacing: 0.07em;
    --measure: 38rem;
    --ease-out: cubic-bezier(0.2, 0, 0, 1);
    --font-display: "Fraunces", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    --font-body: "Source Serif 4", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    --font-data: "Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --spacing: 0.25rem; --motion: full; font-size: 100%;
    --print-accent-text: #6d3262; --print-accent-subtle: #f6eef4;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
    color-scheme: dark;
    --neutral-1: #0f0c0a; --neutral-2: #15120f; --neutral-3: #1f1a15; --neutral-4: #27211b; --neutral-5: #2f2821; --neutral-6: #3a3229; --neutral-7: #4a4035; --neutral-8: #645647; --neutral-9: #917c65; --neutral-10: #836f59; --neutral-11: #d1bfac; --neutral-12: #f8eadb;
    --accent-1: #100b0e; --accent-2: #181016; --accent-3: #241620; --accent-4: #2d1b29; --accent-5: #372132; --accent-6: #44293e; --accent-7: #57344f; --accent-8: #76456c; --accent-9: #a75b98; --accent-10: #965188; --accent-11: #dfb3d4; --accent-12: #f1ebef;
    --success-1: #0a0e0b; --success-2: #0d150f; --success-3: #111f15; --success-4: #15271a; --success-5: #192f1f; --success-6: #1e3b27; --success-7: #264b31; --success-8: #316642; --success-9: #3a955a; --success-10: #348650; --success-11: #6dde91; --success-12: #def4e2;
    --warning-1: #0f0c09; --warning-2: #17120c; --warning-3: #22190f; --warning-4: #2b2013; --warning-5: #342717; --warning-6: #40301b; --warning-7: #523d23; --warning-8: #70532c; --warning-9: #db9d47; --warning-10: #ca9041; --warning-11: #eeb771; --warning-12: #f3ebe2;
    --danger-1: #120b0a; --danger-2: #1d0e0c; --danger-3: #2c1210; --danger-4: #381714; --danger-5: #441b18; --danger-6: #54211d; --danger-7: #6c2a25; --danger-8: #933630; --danger-9: #dc403a; --danger-10: #c63933; --danger-11: #efb1a9; --danger-12: #f3eae9;
    
    --color-bg-page: var(--neutral-2); --color-bg-surface: var(--neutral-3); --color-bg-raised: var(--neutral-4); --color-bg-sunken: var(--neutral-1); --color-bg-hover: var(--neutral-5);
    --color-text-primary: var(--neutral-12); --color-text-secondary: var(--neutral-11); --color-text-disabled: var(--neutral-9); --color-text-on-accent: #ffffff;
    --color-border-subtle: var(--neutral-6); --color-border: var(--neutral-7); --color-border-strong: var(--neutral-8); --color-graphic-idle: var(--neutral-9);
    --color-accent-subtle: var(--accent-3); --color-accent-subtle-hover: var(--accent-4); --color-accent-border: var(--accent-7); --color-accent-solid: var(--accent-9); --color-accent-solid-hover: var(--accent-10); --color-accent-text: var(--accent-11); --color-focus: var(--accent-11);
    --color-success-subtle: var(--success-3); --color-success-solid: var(--success-9); --color-success-text: var(--success-11);
    --color-warning-subtle: var(--warning-3); --color-warning-solid: var(--warning-9); --color-warning-text: var(--warning-11);
    --color-danger-subtle: var(--danger-3); --color-danger-solid: var(--danger-9); --color-danger-text: var(--danger-11);
    --shadow-surface: 0 0 0 1px oklch(1 0 0 / 0.08);
    --shadow-raised: 0 0 0 1px oklch(1 0 0 / 0.12), 0 16px 32px -16px oklch(0 0 0 / 0.7);
    --color-bg-inset: var(--neutral-1); --color-bg-overlay: #0f0c0ab3;
    --color-accent-gradient: linear-gradient(135deg, var(--accent-8), var(--accent-10));
    --shadow-overlay: 0 0 0 1px oklch(1 0 0 / 0.14), 0 24px 48px -12px oklch(0 0 0 / 0.8);
    --chart-1: #a75b98; --chart-2: #5f8931; --chart-3: #0089a0; --chart-4: #b75e38; --chart-5: #6572c4; --chart-track: var(--neutral-7);
    --avatar-bg: var(--color-accent-subtle); --avatar-fg: var(--color-accent-text);
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --neutral-1: #0f0c0a; --neutral-2: #15120f; --neutral-3: #1f1a15; --neutral-4: #27211b; --neutral-5: #2f2821; --neutral-6: #3a3229; --neutral-7: #4a4035; --neutral-8: #645647; --neutral-9: #917c65; --neutral-10: #836f59; --neutral-11: #d1bfac; --neutral-12: #f8eadb;
    --accent-1: #100b0e; --accent-2: #181016; --accent-3: #241620; --accent-4: #2d1b29; --accent-5: #372132; --accent-6: #44293e; --accent-7: #57344f; --accent-8: #76456c; --accent-9: #a75b98; --accent-10: #965188; --accent-11: #dfb3d4; --accent-12: #f1ebef;
    --success-1: #0a0e0b; --success-2: #0d150f; --success-3: #111f15; --success-4: #15271a; --success-5: #192f1f; --success-6: #1e3b27; --success-7: #264b31; --success-8: #316642; --success-9: #3a955a; --success-10: #348650; --success-11: #6dde91; --success-12: #def4e2;
    --warning-1: #0f0c09; --warning-2: #17120c; --warning-3: #22190f; --warning-4: #2b2013; --warning-5: #342717; --warning-6: #40301b; --warning-7: #523d23; --warning-8: #70532c; --warning-9: #db9d47; --warning-10: #ca9041; --warning-11: #eeb771; --warning-12: #f3ebe2;
    --danger-1: #120b0a; --danger-2: #1d0e0c; --danger-3: #2c1210; --danger-4: #381714; --danger-5: #441b18; --danger-6: #54211d; --danger-7: #6c2a25; --danger-8: #933630; --danger-9: #dc403a; --danger-10: #c63933; --danger-11: #efb1a9; --danger-12: #f3eae9;
    
    --color-bg-page: var(--neutral-2); --color-bg-surface: var(--neutral-3); --color-bg-raised: var(--neutral-4); --color-bg-sunken: var(--neutral-1); --color-bg-hover: var(--neutral-5);
    --color-text-primary: var(--neutral-12); --color-text-secondary: var(--neutral-11); --color-text-disabled: var(--neutral-9); --color-text-on-accent: #ffffff;
    --color-border-subtle: var(--neutral-6); --color-border: var(--neutral-7); --color-border-strong: var(--neutral-8); --color-graphic-idle: var(--neutral-9);
    --color-accent-subtle: var(--accent-3); --color-accent-subtle-hover: var(--accent-4); --color-accent-border: var(--accent-7); --color-accent-solid: var(--accent-9); --color-accent-solid-hover: var(--accent-10); --color-accent-text: var(--accent-11); --color-focus: var(--accent-11);
    --color-success-subtle: var(--success-3); --color-success-solid: var(--success-9); --color-success-text: var(--success-11);
    --color-warning-subtle: var(--warning-3); --color-warning-solid: var(--warning-9); --color-warning-text: var(--warning-11);
    --color-danger-subtle: var(--danger-3); --color-danger-solid: var(--danger-9); --color-danger-text: var(--danger-11);
    --shadow-surface: 0 0 0 1px oklch(1 0 0 / 0.08);
    --shadow-raised: 0 0 0 1px oklch(1 0 0 / 0.12), 0 16px 32px -16px oklch(0 0 0 / 0.7);
    --color-bg-inset: var(--neutral-1); --color-bg-overlay: #0f0c0ab3;
    --color-accent-gradient: linear-gradient(135deg, var(--accent-8), var(--accent-10));
    --shadow-overlay: 0 0 0 1px oklch(1 0 0 / 0.14), 0 24px 48px -12px oklch(0 0 0 / 0.8);
    --chart-1: #a75b98; --chart-2: #5f8931; --chart-3: #0089a0; --chart-4: #b75e38; --chart-5: #6572c4; --chart-track: var(--neutral-7);
    --avatar-bg: var(--color-accent-subtle); --avatar-fg: var(--color-accent-text);
  }
  /* ---- End design tokens ---- */
```

## 3. Designed resume block (profile/templates/resume-designed-template.html)

The user's copy of the designed resume template lives in `profile/templates/`; if it isn't there yet, copy `templates/resume-designed-template.html` there first (never edit the app's copy in `templates/`). Replace everything from `  /* ---- Designed resume theme` through `  /* ---- End designed resume theme ---- */` with the block below. It uses Letter paper and standard spacing; for A4, change `size: Letter` to `size: A4`.

```css
  /* ---- Designed resume theme (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */
  :root {
    --r-ink: #2a2117; --r-muted: #685a4a; --r-line: #dfd5cb; --r-accent: #7e3b72; --r-accent-text: #804274; --r-wash: #f6eef4;
    --font-display: "Fraunces", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    --font-body: "Source Serif 4", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    --font-data: "Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --r-size: 10.5pt; --r-leading: 1.25;
  }
  @page { size: Letter; margin: 0.5in 0.55in; }
  /* ---- End designed resume theme ---- */
```

## 4. Documents block (resume and cover letter; the same for every preset)

The ATS resume and cover letter take their look from the `documents` block of `profile/design.md`, not from the preset. Their themed copies live in `profile/templates/` (`resume-template.html`, `cover-letter-template.html`); if a copy isn't there yet, copy it from `templates/` first, and never edit the app's copies in `templates/`. Replace everything from `  /* ---- Document theme` through `  /* ---- End document theme ---- */` with the block below, then change its values to match the documents block, using the tables. The default (Arial, near-black, standard, Letter) for the resume:

```css
  /* ---- Document theme (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */
  :root { --doc-font: Arial, Helvetica, "Liberation Sans", sans-serif; --doc-accent: #111111; --doc-size: 10.5pt; --doc-leading: 1.2; }
  @page { size: Letter; margin: 0.5in 0.6in; }
  /* ---- End document theme ---- */
```

and for the cover letter:

```css
  /* ---- Document theme (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */
  :root { --doc-font: Arial, Helvetica, "Liberation Sans", sans-serif; --doc-accent: #111111; --doc-size: 11pt; --doc-leading: 1.45; }
  @page { size: Letter; margin: 0.9in 1in; }
  /* ---- End document theme ---- */
```

- `--doc-font`: the stack for the chosen font. Fonts with an `@import` line also need that line right after the block's first comment line (as the generator writes it); fonts without one have no `@import` line.

| Font | --doc-font | @import line |
|---|---|---|
| Arial | `Arial, Helvetica, "Liberation Sans", sans-serif` | none |
| Helvetica | `Helvetica, Arial, "Liberation Sans", sans-serif` | none |
| Calibri | `Calibri, Carlito, Arial, sans-serif` | none |
| Cambria | `Cambria, Caladea, Georgia, serif` | none |
| Georgia | `Georgia, "Times New Roman", serif` | none |
| Times New Roman | `"Times New Roman", Times, "Liberation Serif", serif` | none |
| Garamond | `"EB Garamond", Garamond, Georgia, serif` | `@import url("../../templates/assets/fonts/documents.css");` |
| Lato | `Lato, Arial, sans-serif` | `@import url("https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;1,400&display=swap");` |
| Source Sans 3 | `"Source Sans 3", Arial, sans-serif` | `@import url("../../templates/assets/fonts/documents.css");` |
| Roboto | `Roboto, Arial, sans-serif` | `@import url("../../templates/assets/fonts/documents.css");` |
| Open Sans | `"Open Sans", Arial, sans-serif` | `@import url("../../templates/assets/fonts/documents.css");` |

- `--doc-size` / `--doc-leading` / `@page` margin by density:

| Density | Resume (size / leading / margin) | Cover letter (size / leading / margin) |
|---|---|---|
| compact | 10pt / 1.2 / 0.45in 0.55in | 10.5pt / 1.4 / 0.75in 0.9in |
| standard | 10.5pt / 1.2 / 0.5in 0.6in | 11pt / 1.45 / 0.9in 1in |
| roomy | 11pt / 1.25 / 0.6in 0.7in | 11.5pt / 1.5 / 1in 1.1in |

- `@page` `size:` is `Letter` or `A4` (the documents block's `paper`).
- `--doc-accent`: `#111111`, or a color from "Safe document accents" in `references/importing-a-design-system.md` (already measured on white). Without Node, never use another color here.

## 5. Layouts and your own CSS (the same for every preset)

A layout is one attribute: `data-layout` on the page's `<html lang="en" data-layout="...">` tag. The look (this preset) and the layout are independent. Without Node, after setting the key in `profile/design.md`, change that one attribute by hand in each file it applies to (pages in `pages/`, every `jobs/*/interview-brief.html`, and the user's copies in `profile/templates/`; copy a template there from `templates/` first if it isn't there yet, and never edit `templates/`). Use exactly one of the listed values; the resume and cover letter take the same value.

| design.md key | Files | Values |
|---|---|---|
| `layout_dashboard` (design block) | `dashboard.html` | **overview** (default), board |
| `layout_flashcards` (design block) | `flashcards.html` | **flip** (default), list |
| `layout_brief` (design block) | `interview-brief.html` | **sheet** (default), detailed |
| `layout_portfolio` (design block) | `portfolio.html` | **profile** (default), editorial, bento |
| `layout_resume` (documents block) | `resume-template.html`, `cover-letter-template.html` | **classic** (default), modern, compact |
| `layout_designed` (documents block) | `resume-designed-template.html` | **sidebar** (default), headline |

A page made before layouts existed (its `<html>` tag has no `data-layout`) only has its one look; refresh it from `templates/blank/pages/` first (pages skill).

The user's own CSS goes between `  /* ---- Custom ---- */` and `  /* ---- End custom ---- */` (the last lines of the page's first `<style>`); it may use `:root[data-layout="..."]` to target one layout and only the tokens above, never raw colors. Re-theming never touches it.
