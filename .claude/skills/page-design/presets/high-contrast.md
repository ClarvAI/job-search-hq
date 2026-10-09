# Preset: High contrast

Larger text, darker text and borders (7:1 contrast), fonts made for low vision, plain grays, motion off.

Precomputed and contrast-checked by `scripts/apply-theme.mjs --build-presets` (every text pair passes in light and dark mode). Use this file by hand only when Node isn't available; see "Without Node" in `.claude/skills/page-design/SKILL.md`. Don't edit it; rebuild it.

Fonts: Lexend (headings), Lexend (text), Source Code Pro (labels and numbers). Text size 112.5%, comfortable spacing, 8px corners, motion reduced.

## 1. Fonts line (every page, and the designed resume template)

Replace the line that starts `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?` (or `href="data:text/css,`) with:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@400..700&family=Source+Code+Pro:wght@400..600&display=swap">
```

## 2. Page token block (pages/*.html and jobs/*/interview-brief.html)

Replace everything from the line starting `  /* ---- Design tokens` through the line `  /* ---- End design tokens ---- */` with:

```css
  /* ---- Design tokens (generated; see .claude/skills/page-design/SKILL.md) ----
     Primitives are role-based 12-step ramps (1 page bg … 9 solid fill … 11 low-contrast text, 12 high-contrast text),
     built in OKLCH: neutral (hue 240), accent "strong blue" (240), success (152), warning (72), danger (27).
     Components use only the semantic --color-* tokens. Every text pair is measured >= 7:1 in both themes. */
  :root {
    color-scheme: light;
    --neutral-1: #fdfdfd; --neutral-2: #f9f9f9; --neutral-3: #f1f1f1; --neutral-4: #e9e9e9; --neutral-5: #e1e1e1; --neutral-6: #c4c4c4; --neutral-7: #ababab; --neutral-8: #808080; --neutral-9: #717171; --neutral-10: #656565; --neutral-11: #484848; --neutral-12: #121212;
    --accent-1: #fcfdfd; --accent-2: #f6f9fb; --accent-3: #eaf2f9; --accent-4: #ddebf6; --accent-5: #cfe4f4; --accent-6: #9ccbed; --accent-7: #66b4e8; --accent-8: #3a88ba; --accent-9: #105278; --accent-10: #0c4666; --accent-11: #1a4c6c; --accent-12: #0a1319;
    --success-1: #fbfdfc; --success-2: #f3fbf5; --success-3: #dff9e4; --success-4: #c8f7d3; --success-5: #aef5c0; --success-6: #72df94; --success-7: #5dc47e; --success-8: #3c955a; --success-9: #1a7d43; --success-10: #166e3a; --success-11: #1b552f; --success-12: #0b140d;
    --warning-1: #fdfdfc; --warning-2: #fbf8f5; --warning-3: #f9efe4; --warning-4: #f6e6d3; --warning-5: #f4ddc1; --warning-6: #edba79; --warning-7: #d79e54; --warning-8: #a57635; --warning-9: #d28e26; --warning-10: #c18222; --warning-11: #5f4117; --warning-12: #161009;
    --danger-1: #fdfcfc; --danger-2: #fbf8f7; --danger-3: #f9eeed; --danger-4: #f6e4e2; --danger-5: #f5dad6; --danger-6: #eeb4ac; --danger-7: #ea8e83; --danger-8: #db423c; --danger-9: #c01e20; --danger-10: #aa191b; --danger-11: #811e1b; --danger-12: #1e0c0a;
    
    --color-bg-page: var(--neutral-2); --color-bg-surface: var(--neutral-1); --color-bg-raised: var(--neutral-1); --color-bg-sunken: var(--neutral-3); --color-bg-hover: var(--neutral-4);
    --color-text-primary: var(--neutral-12); --color-text-secondary: var(--neutral-11); --color-text-disabled: var(--neutral-9); --color-text-on-accent: #ffffff;
    --color-border-subtle: var(--neutral-6); --color-border: var(--neutral-7); --color-border-strong: var(--neutral-8); --color-graphic-idle: var(--neutral-9);
    --color-accent-subtle: var(--accent-3); --color-accent-subtle-hover: var(--accent-4); --color-accent-border: var(--accent-7); --color-accent-solid: var(--accent-9); --color-accent-solid-hover: var(--accent-10); --color-accent-text: var(--accent-11); --color-focus: var(--accent-9);
    --color-success-subtle: var(--success-3); --color-success-solid: var(--success-9); --color-success-text: var(--success-11);
    --color-warning-subtle: var(--warning-3); --color-warning-solid: var(--warning-9); --color-warning-text: var(--warning-11);
    --color-danger-subtle: var(--danger-3); --color-danger-solid: var(--danger-9); --color-danger-text: var(--danger-11);
    --shadow-surface: 0 0 0 1px oklch(0 0 0 / 0.06), 0 1px 2px -1px oklch(0 0 0 / 0.06), 0 2px 4px 0 oklch(0 0 0 / 0.04);
    --shadow-raised: 0 0 0 1px oklch(0 0 0 / 0.07), 0 2px 4px -2px oklch(0 0 0 / 0.08), 0 16px 32px -16px oklch(0 0 0 / 0.22);
    --radius-sm: 4px; --radius-md: 8px; --radius-lg: 16px;
    --ease-out: cubic-bezier(0.2, 0, 0, 1);
    --font-display: "Lexend", "Segoe UI", system-ui, sans-serif;
    --font-body: "Lexend", "Segoe UI", system-ui, sans-serif;
    --font-data: "Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --spacing: 0.25rem; --motion: reduced; font-size: 112.5%;
    --print-accent-text: #0c4666; --print-accent-subtle: #eaf2f9;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
    color-scheme: dark;
    --neutral-1: #0d0d0d; --neutral-2: #131313; --neutral-3: #1b1b1b; --neutral-4: #222222; --neutral-5: #2a2a2a; --neutral-6: #484848; --neutral-7: #5d5d5d; --neutral-8: #808080; --neutral-9: #808080; --neutral-10: #737373; --neutral-11: #d7d7d7; --neutral-12: #f5f5f5;
    --accent-1: #0a0d10; --accent-2: #0d1419; --accent-3: #101d25; --accent-4: #14242f; --accent-5: #182c3a; --accent-6: #2b4c62; --accent-7: #376380; --accent-8: #4887b2; --accent-9: #2b6c96; --accent-10: #255f84; --accent-11: #bddcf3; --accent-12: #f2f6f9;
    --success-1: #0a0e0b; --success-2: #0d150f; --success-3: #111f15; --success-4: #15271a; --success-5: #192f1f; --success-6: #2c5137; --success-7: #396a47; --success-8: #4a9260; --success-9: #3a955a; --success-10: #348650; --success-11: #7ff5a4; --success-12: #edf9f0;
    --warning-1: #0f0c09; --warning-2: #17120c; --warning-3: #22190f; --warning-4: #2b2013; --warning-5: #342717; --warning-6: #594328; --warning-7: #745834; --warning-8: #a07843; --warning-9: #db9d47; --warning-10: #ca9041; --warning-11: #f4d1a7; --warning-12: #f9f4ef;
    --danger-1: #120b0a; --danger-2: #1d0e0c; --danger-3: #2c1210; --danger-4: #381714; --danger-5: #441b18; --danger-6: #72302a; --danger-7: #963d36; --danger-8: #d05047; --danger-9: #dc403a; --danger-10: #c63933; --danger-11: #f4cdc8; --danger-12: #f9f4f3;
    
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
    --neutral-1: #0d0d0d; --neutral-2: #131313; --neutral-3: #1b1b1b; --neutral-4: #222222; --neutral-5: #2a2a2a; --neutral-6: #484848; --neutral-7: #5d5d5d; --neutral-8: #808080; --neutral-9: #808080; --neutral-10: #737373; --neutral-11: #d7d7d7; --neutral-12: #f5f5f5;
    --accent-1: #0a0d10; --accent-2: #0d1419; --accent-3: #101d25; --accent-4: #14242f; --accent-5: #182c3a; --accent-6: #2b4c62; --accent-7: #376380; --accent-8: #4887b2; --accent-9: #2b6c96; --accent-10: #255f84; --accent-11: #bddcf3; --accent-12: #f2f6f9;
    --success-1: #0a0e0b; --success-2: #0d150f; --success-3: #111f15; --success-4: #15271a; --success-5: #192f1f; --success-6: #2c5137; --success-7: #396a47; --success-8: #4a9260; --success-9: #3a955a; --success-10: #348650; --success-11: #7ff5a4; --success-12: #edf9f0;
    --warning-1: #0f0c09; --warning-2: #17120c; --warning-3: #22190f; --warning-4: #2b2013; --warning-5: #342717; --warning-6: #594328; --warning-7: #745834; --warning-8: #a07843; --warning-9: #db9d47; --warning-10: #ca9041; --warning-11: #f4d1a7; --warning-12: #f9f4ef;
    --danger-1: #120b0a; --danger-2: #1d0e0c; --danger-3: #2c1210; --danger-4: #381714; --danger-5: #441b18; --danger-6: #72302a; --danger-7: #963d36; --danger-8: #d05047; --danger-9: #dc403a; --danger-10: #c63933; --danger-11: #f4cdc8; --danger-12: #f9f4f3;
    
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
  /* Motion: reduced (profile/design.md). Movement is off everywhere; color and fade changes stay. */
  *, ::before, ::after { animation: none !important; transition-property: color, background-color, border-color, outline-color, box-shadow, opacity !important; transition-delay: 0s !important; scroll-behavior: auto !important; }
  /* ---- End design tokens ---- */
```

## 3. Designed resume block (profile/templates/resume-designed-template.html)

The user's copy of the designed resume template lives in `profile/templates/`; if it isn't there yet, copy `templates/resume-designed-template.html` there first (never edit the app's copy in `templates/`). Replace everything from `  /* ---- Designed resume theme` through `  /* ---- End designed resume theme ---- */` with the block below. It uses Letter paper and standard spacing; for A4, change `size: Letter` to `size: A4`.

```css
  /* ---- Designed resume theme (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */
  :root {
    --r-ink: #121212; --r-muted: #484848; --r-line: #c4c4c4; --r-accent: #105278; --r-accent-text: #1a4c6c; --r-wash: #eaf2f9;
    --font-display: "Lexend", "Segoe UI", system-ui, sans-serif;
    --font-body: "Lexend", "Segoe UI", system-ui, sans-serif;
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
