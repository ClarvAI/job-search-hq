# Preset: Minimal

Mostly black and white, IBM Plex type, small corners; color only for status.

Precomputed and contrast-checked by `scripts/apply-theme.mjs --build-presets` (every text pair passes in light and dark mode). Use this file by hand only when Node isn't available; see "Without Node" in `.claude/skills/page-design/SKILL.md`. Don't edit it; rebuild it.

Fonts: IBM Plex Serif (headings), IBM Plex Sans (text), IBM Plex Mono (labels and numbers). Text size 100%, comfortable spacing, 4px corners, motion full.

## 1. Fonts line (every page, and the designed resume template)

Replace the line that starts `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?` (or `href="data:text/css,`) with:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
```

## 2. Page token block (pages/*.html and jobs/*/interview-brief.html)

Replace everything from the line starting `  /* ---- Design tokens` through the line `  /* ---- End design tokens ---- */` with:

```css
  /* ---- Design tokens (generated; see .claude/skills/page-design/SKILL.md) ----
     Primitives are role-based 12-step ramps (1 page bg … 9 solid fill … 11 low-contrast text, 12 high-contrast text),
     built in OKLCH: neutral (hue 255), accent "graphite" (255), success (152), warning (72), danger (27).
     Components use only the semantic --color-* tokens. Every text pair is measured >= 4.5:1 in both themes. */
  :root {
    color-scheme: light;
    --neutral-1: #fdfdfd; --neutral-2: #f9f9f9; --neutral-3: #f1f1f1; --neutral-4: #e9e9e9; --neutral-5: #e1e1e1; --neutral-6: #d7d7d7; --neutral-7: #c9c9c9; --neutral-8: #b2b2b2; --neutral-9: #717171; --neutral-10: #656565; --neutral-11: #5c5c5c; --neutral-12: #232323;
    --accent-1: #fdfdfd; --accent-2: #f8f9f9; --accent-3: #f0f1f1; --accent-4: #e8e9ea; --accent-5: #e0e1e3; --accent-6: #d5d7da; --accent-7: #c7c9cd; --accent-8: #afb3b9; --accent-9: #2b2e32; --accent-10: #202327; --accent-11: #575d64; --accent-12: #222325;
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
    --radius-sm: 2px; --radius-md: 4px; --radius-lg: 12px;
    --ease-out: cubic-bezier(0.2, 0, 0, 1);
    --font-display: "IBM Plex Serif", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    --font-body: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
    --font-data: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --spacing: 0.25rem; --motion: full; font-size: 100%;
    --print-accent-text: #202327; --print-accent-subtle: #f0f1f1;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
    color-scheme: dark;
    --neutral-1: #0d0d0d; --neutral-2: #131313; --neutral-3: #1b1b1b; --neutral-4: #222222; --neutral-5: #2a2a2a; --neutral-6: #333333; --neutral-7: #424242; --neutral-8: #595959; --neutral-9: #808080; --neutral-10: #737373; --neutral-11: #c2c2c2; --neutral-12: #ededed;
    --accent-1: #0c0d0d; --accent-2: #121314; --accent-3: #1a1b1d; --accent-4: #212224; --accent-5: #282a2c; --accent-6: #313437; --accent-7: #3f4246; --accent-8: #55595f; --accent-9: #5e646b; --accent-10: #52575d; --accent-11: #c0c3c7; --accent-12: #eceded;
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
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --neutral-1: #0d0d0d; --neutral-2: #131313; --neutral-3: #1b1b1b; --neutral-4: #222222; --neutral-5: #2a2a2a; --neutral-6: #333333; --neutral-7: #424242; --neutral-8: #595959; --neutral-9: #808080; --neutral-10: #737373; --neutral-11: #c2c2c2; --neutral-12: #ededed;
    --accent-1: #0c0d0d; --accent-2: #121314; --accent-3: #1a1b1d; --accent-4: #212224; --accent-5: #282a2c; --accent-6: #313437; --accent-7: #3f4246; --accent-8: #55595f; --accent-9: #5e646b; --accent-10: #52575d; --accent-11: #c0c3c7; --accent-12: #eceded;
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
  }
  /* ---- End design tokens ---- */
```

## 3. Designed resume block (profile/templates/resume-designed-template.html)

The user's copy of the designed resume template lives in `profile/templates/`; if it isn't there yet, copy `templates/resume-designed-template.html` there first (never edit the app's copy in `templates/`). Replace everything from `  /* ---- Designed resume theme` through `  /* ---- End designed resume theme ---- */` with the block below. It uses Letter paper and standard spacing; for A4, change `size: Letter` to `size: A4`.

```css
  /* ---- Designed resume theme (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */
  :root {
    --r-ink: #232323; --r-muted: #5c5c5c; --r-line: #d7d7d7; --r-accent: #2b2e32; --r-accent-text: #575d64; --r-wash: #f0f1f1;
    --font-display: "IBM Plex Serif", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    --font-body: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
    --font-data: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
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
| Garamond | `"EB Garamond", Garamond, Georgia, serif` | `@import url("https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..700;1,400..700&display=swap");` |
| Lato | `Lato, Arial, sans-serif` | `@import url("https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;1,400&display=swap");` |
| Source Sans 3 | `"Source Sans 3", Arial, sans-serif` | `@import url("https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400..700;1,400..700&display=swap");` |
| Roboto | `Roboto, Arial, sans-serif` | `@import url("https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400..700;1,400..700&display=swap");` |
| Open Sans | `"Open Sans", Arial, sans-serif` | `@import url("https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400..700;1,400..700&display=swap");` |

- `--doc-size` / `--doc-leading` / `@page` margin by density:

| Density | Resume (size / leading / margin) | Cover letter (size / leading / margin) |
|---|---|---|
| compact | 10pt / 1.2 / 0.45in 0.55in | 10.5pt / 1.4 / 0.75in 0.9in |
| standard | 10.5pt / 1.2 / 0.5in 0.6in | 11pt / 1.45 / 0.9in 1in |
| roomy | 11pt / 1.25 / 0.6in 0.7in | 11.5pt / 1.5 / 1in 1.1in |

- `@page` `size:` is `Letter` or `A4` (the documents block's `paper`).
- `--doc-accent`: `#111111`, or a color from "Safe document accents" in `references/importing-a-design-system.md` (already measured on white). Without Node, never use another color here.
