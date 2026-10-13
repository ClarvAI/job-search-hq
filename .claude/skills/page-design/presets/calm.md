# Preset: Calm

A calm pastel look: soft blue-gray backgrounds, a muted periwinkle accent, rounded corners, roomy spacing, DM Sans throughout, gentle motion.

Precomputed and contrast-checked by `scripts/apply-theme.mjs --build-presets` (every text pair passes in light and dark mode). Use this file by hand only when Node isn't available; see "Without Node" in `.claude/skills/page-design/SKILL.md`. Don't edit it; rebuild it.

Fonts: DM Sans (headings), DM Sans (text), Source Code Pro (labels and numbers). Text size 100%, spacious spacing, 16px corners, motion reduced.

## 1. Fonts line (every page, and the designed resume template)

Replace the fonts line (the one `<link rel="stylesheet" ...>` whose address ends in `templates/assets/fonts/fonts.css`, starts with `https://fonts.googleapis.com/css2?`, or is `data:text/css,`) with the line below. It is written for a page in `pages/`; in `jobs/<folder>/interview-brief.html` and in the user's copy of the designed resume template, write `../../templates/assets/` instead of `../templates/assets/`.

```html
<link rel="stylesheet" href="../templates/assets/fonts/fonts.css" data-fallback="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&family=Source+Code+Pro:wght@400..600&display=swap" onerror="if(this.dataset.up){this.onerror=null;this.href=this.dataset.fallback}else{this.dataset.up=1;this.href='../'+this.getAttribute('href')}">
```

## 2. Page token block (pages/*.html and jobs/*/interview-brief.html)

Replace everything from the line starting `  /* ---- Design tokens` through the line `  /* ---- End design tokens ---- */` with:

```css
  /* ---- Design tokens (generated; see .claude/skills/page-design/SKILL.md) ----
     Primitives are role-based 12-step ramps (1 page bg … 9 solid fill … 11 low-contrast text, 12 high-contrast text),
     built in OKLCH: neutral (hue 255), accent "periwinkle" (268), success (152), warning (72), danger (27).
     Components use only the semantic --color-* tokens. Every text pair is measured >= 4.5:1 in both themes. */
  :root {
    color-scheme: light;
    --neutral-1: #fbfdff; --neutral-2: #f6f9fd; --neutral-3: #ecf1f8; --neutral-4: #e4e9f1; --neutral-5: #dbe2ea; --neutral-6: #d1d8e1; --neutral-7: #c1cad6; --neutral-8: #a9b4c2; --neutral-9: #647386; --neutral-10: #586678; --neutral-11: #525d6c; --neutral-12: #1c232d;
    --accent-1: #fdfdfd; --accent-2: #f8f9fa; --accent-3: #eff1f4; --accent-4: #e6e9ef; --accent-5: #dde1ea; --accent-6: #d2d7e4; --accent-7: #c1c9dc; --accent-8: #a6b2d0; --accent-9: #4c64ad; --accent-10: #3d56a5; --accent-11: #40579e; --accent-12: #1c2234;
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
    --color-bg-inset: var(--neutral-3); --color-bg-overlay: #1c232d73;
    --color-accent-gradient: linear-gradient(135deg, var(--accent-9), var(--accent-11));
    --shadow-overlay: 0 0 0 1px oklch(0 0 0 / 0.08), 0 8px 16px -8px oklch(0 0 0 / 0.16), 0 24px 48px -12px oklch(0 0 0 / 0.28);
    --chart-1: #4c64ad; --chart-2: #a04e2c; --chart-3: #47782d; --chart-4: #8d4d8b; --chart-5: #007784; --chart-track: var(--neutral-7);
    --avatar-bg: var(--color-accent-subtle); --avatar-fg: var(--color-accent-text);
    --radius-sm: 8px; --radius-md: 16px; --radius-lg: 24px;
    --radius-xl: 32px; --radius-full: 999px;
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
    --font-display: "DM Sans", "Segoe UI", system-ui, sans-serif;
    --font-body: "DM Sans", "Segoe UI", system-ui, sans-serif;
    --font-data: "Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --spacing: 0.28rem; --motion: reduced; font-size: 100%;
    --print-accent-text: #3d56a5; --print-accent-subtle: #eff1f4;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
    color-scheme: dark;
    --neutral-1: #0b0d0f; --neutral-2: #101316; --neutral-3: #181b20; --neutral-4: #1e2228; --neutral-5: #252a31; --neutral-6: #2e343c; --neutral-7: #3b434d; --neutral-8: #4f5a68; --neutral-9: #718297; --neutral-10: #657489; --neutral-11: #b6c4d6; --neutral-12: #e3eefc;
    --accent-1: #0b0d12; --accent-2: #0f121c; --accent-3: #141a2b; --accent-4: #192136; --accent-5: #1f2842; --accent-6: #263252; --accent-7: #31406a; --accent-8: #415590; --accent-9: #6175ad; --accent-10: #5167a4; --accent-11: #bac2d7; --accent-12: #ebedf0;
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
    --color-bg-inset: var(--neutral-1); --color-bg-overlay: #0b0d0fb3;
    --color-accent-gradient: linear-gradient(135deg, var(--accent-8), var(--accent-10));
    --shadow-overlay: 0 0 0 1px oklch(1 0 0 / 0.14), 0 24px 48px -12px oklch(0 0 0 / 0.8);
    --chart-1: #6175ad; --chart-2: #a4654c; --chart-3: #5e844d; --chart-4: #956492; --chart-5: #1f8693; --chart-track: var(--neutral-7);
    --avatar-bg: var(--color-accent-subtle); --avatar-fg: var(--color-accent-text);
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --neutral-1: #0b0d0f; --neutral-2: #101316; --neutral-3: #181b20; --neutral-4: #1e2228; --neutral-5: #252a31; --neutral-6: #2e343c; --neutral-7: #3b434d; --neutral-8: #4f5a68; --neutral-9: #718297; --neutral-10: #657489; --neutral-11: #b6c4d6; --neutral-12: #e3eefc;
    --accent-1: #0b0d12; --accent-2: #0f121c; --accent-3: #141a2b; --accent-4: #192136; --accent-5: #1f2842; --accent-6: #263252; --accent-7: #31406a; --accent-8: #415590; --accent-9: #6175ad; --accent-10: #5167a4; --accent-11: #bac2d7; --accent-12: #ebedf0;
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
    --color-bg-inset: var(--neutral-1); --color-bg-overlay: #0b0d0fb3;
    --color-accent-gradient: linear-gradient(135deg, var(--accent-8), var(--accent-10));
    --shadow-overlay: 0 0 0 1px oklch(1 0 0 / 0.14), 0 24px 48px -12px oklch(0 0 0 / 0.8);
    --chart-1: #6175ad; --chart-2: #a4654c; --chart-3: #5e844d; --chart-4: #956492; --chart-5: #1f8693; --chart-track: var(--neutral-7);
    --avatar-bg: var(--color-accent-subtle); --avatar-fg: var(--color-accent-text);
  }
  /* Motion: reduced (profile/design.md). Movement is off everywhere; color and fade changes stay. */
  *, ::before, ::after { animation: none !important; transition-property: color, background-color, border-color, outline-color, box-shadow, opacity !important; transition-delay: 0s !important; scroll-behavior: auto !important; }
  /* ---- End design tokens ---- */
```

## 3. Designed resume block (profile/templates/resume-designed-template.html)

The user's copy of the designed resume template lives in `profile/templates/`; if it isn't there yet, copy `templates/resume-designed-template.html` there first (never edit the app's copy in `templates/`). Replace everything from `  /* ---- Designed resume theme` through `  /* ---- End designed resume theme ---- */` with the block below. It uses Letter paper and standard spacing; for A4, change `size: Letter` to `size: A4`.

```css
  /* ---- Designed resume theme (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */
  :root {
    --r-ink: #1c232d; --r-muted: #525d6c; --r-line: #d1d8e1; --r-accent: #4c64ad; --r-accent-text: #40579e; --r-wash: #eff1f4;
    --font-display: "DM Sans", "Segoe UI", system-ui, sans-serif;
    --font-body: "DM Sans", "Segoe UI", system-ui, sans-serif;
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
