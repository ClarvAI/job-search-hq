# Preset: Default

Friendly grotesque headings over a plain, readable sans, warm stone backgrounds, a deep teal accent.

Precomputed and contrast-checked by `scripts/apply-theme.mjs --build-presets` (every text pair passes in light and dark mode). Use this file by hand only when Node isn't available; see "Without Node" in `.claude/skills/page-design/SKILL.md`. Don't edit it; rebuild it.

Fonts: Bricolage Grotesque (headings), Source Sans 3 (text), Source Code Pro (labels and numbers). Text size 100%, comfortable spacing, 10px corners, motion full.

## 1. Fonts line (every page, and templates/resume-designed-template.html)

Replace the line that starts `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?` (or `href="data:text/css,`) with:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=Source+Sans+3:wght@400..700&family=Source+Code+Pro:wght@400..600&display=swap">
```

## 2. Page token block (pages/*.html and jobs/*/interview-brief.html)

Replace everything from the line starting `  /* ---- Design tokens` through the line `  /* ---- End design tokens ---- */` with:

```css
  /* ---- Design tokens (generated; see .claude/skills/page-design/SKILL.md) ----
     Primitives are role-based 12-step ramps (1 page bg … 9 solid fill … 11 low-contrast text, 12 high-contrast text),
     built in OKLCH: neutral (hue 75), accent "deep teal" (200), success (150), warning (72), danger (27).
     Components use only the semantic --color-* tokens. Every text pair is measured >= 4.5:1 in both themes. */
  :root {
    color-scheme: light;
    --neutral-1: #fefcfa; --neutral-2: #fbf8f5; --neutral-3: #f4f0ec; --neutral-4: #ece8e3; --neutral-5: #e5e0da; --neutral-6: #dbd6cf; --neutral-7: #cec8c0; --neutral-8: #b9b1a7; --neutral-9: #7a7062; --neutral-10: #6d6356; --neutral-11: #635b50; --neutral-12: #27221b;
    --accent-1: #fbfdfd; --accent-2: #f2fbfb; --accent-3: #dbf7f9; --accent-4: #c2f4f6; --accent-5: #a6f0f4; --accent-6: #7eecf2; --accent-7: #6edee3; --accent-8: #56c6cc; --accent-9: #187075; --accent-10: #146266; --accent-11: #25676b; --accent-12: #182626;
    --success-1: #fbfdfc; --success-2: #f3fbf5; --success-3: #dff9e3; --success-4: #c9f7d1; --success-5: #aff5bd; --success-6: #85f49f; --success-7: #6ee78e; --success-8: #56cf78; --success-9: #1a7d3d; --success-10: #166e35; --success-11: #256d3a; --success-12: #18271b;
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
    --radius-sm: 5px; --radius-md: 10px; --radius-lg: 18px;
    --ease-out: cubic-bezier(0.2, 0, 0, 1);
    --font-display: "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif;
    --font-body: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
    --font-data: "Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --spacing: 0.25rem; --motion: full; font-size: 100%;
    --print-accent-text: #146266; --print-accent-subtle: #dbf7f9;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
    color-scheme: dark;
    --neutral-1: #0e0d0b; --neutral-2: #141210; --neutral-3: #1d1b17; --neutral-4: #25221d; --neutral-5: #2d2924; --neutral-6: #37332d; --neutral-7: #464139; --neutral-8: #5f584e; --neutral-9: #8a7e6f; --neutral-10: #7c7162; --neutral-11: #cbc1b4; --neutral-12: #f3ece1;
    --accent-1: #0a0e0e; --accent-2: #0d1415; --accent-3: #111e1e; --accent-4: #152526; --accent-5: #192e2f; --accent-6: #1e383a; --accent-7: #26484a; --accent-8: #316264; --accent-9: #337f83; --accent-10: #2c7074; --accent-11: #6dd6db; --accent-12: #dbf2f3;
    --success-1: #0a0e0b; --success-2: #0d150e; --success-3: #111f14; --success-4: #152719; --success-5: #19301e; --success-6: #1e3b25; --success-7: #264b2f; --success-8: #31663f; --success-9: #3a9554; --success-10: #34864b; --success-11: #6ddf8a; --success-12: #def4e1;
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
    --neutral-1: #0e0d0b; --neutral-2: #141210; --neutral-3: #1d1b17; --neutral-4: #25221d; --neutral-5: #2d2924; --neutral-6: #37332d; --neutral-7: #464139; --neutral-8: #5f584e; --neutral-9: #8a7e6f; --neutral-10: #7c7162; --neutral-11: #cbc1b4; --neutral-12: #f3ece1;
    --accent-1: #0a0e0e; --accent-2: #0d1415; --accent-3: #111e1e; --accent-4: #152526; --accent-5: #192e2f; --accent-6: #1e383a; --accent-7: #26484a; --accent-8: #316264; --accent-9: #337f83; --accent-10: #2c7074; --accent-11: #6dd6db; --accent-12: #dbf2f3;
    --success-1: #0a0e0b; --success-2: #0d150e; --success-3: #111f14; --success-4: #152719; --success-5: #19301e; --success-6: #1e3b25; --success-7: #264b2f; --success-8: #31663f; --success-9: #3a9554; --success-10: #34864b; --success-11: #6ddf8a; --success-12: #def4e1;
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

## 3. Designed resume block (templates/resume-designed-template.html)

Replace everything from `  /* ---- Designed resume theme` through `  /* ---- End designed resume theme ---- */` with the block below. It uses Letter paper and standard spacing; for A4, change `size: Letter` to `size: A4`.

```css
  /* ---- Designed resume theme (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */
  :root {
    --r-ink: #27221b; --r-muted: #635b50; --r-line: #dbd6cf; --r-accent: #187075; --r-accent-text: #25676b; --r-wash: #dbf7f9;
    --font-display: "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif;
    --font-body: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
    --font-data: "Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --r-size: 10.5pt; --r-leading: 1.25;
  }
  @page { size: Letter; margin: 0.5in 0.55in; }
  /* ---- End designed resume theme ---- */
```
