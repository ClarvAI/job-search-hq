// Builds the CSS that themes the pages and print templates. Run it directly (`node tokens.mjs`)
// to print a preset's page token block (`node tokens.mjs [default|modern|minimal|high-contrast]`);
// scripts/apply-theme.mjs uses the exports.
import { fileURLToPath } from 'node:url'
import { buildRamps } from './palette.mjs'
import { FONTS, DOC_FONTS, DENSITY, DOC_DENSITY, PRESETS, resolveTheme, fixContrast } from './themes.mjs'
import { CANONICAL_BASE, DOC_FONTS_LOCAL, documentsCss, fontsLinkLocal, isLocalPageFont } from './assets.mjs'

export const MARK = {
  pageStart: '  /* ---- Design tokens', pageEnd: '  /* ---- End design tokens ---- */',
  docStart: '  /* ---- Document theme', docEnd: '  /* ---- End document theme ---- */',
  designedStart: '  /* ---- Designed resume theme', designedEnd: '  /* ---- End designed resume theme ---- */',
}
const FALLBACK = {
  serif: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  sans: '"Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}
const ROLE_KIND = { heading: 'sans', body: 'sans', mono: 'mono' }

export function fontStack(name, role) {
  const f = FONTS[name]
  if (f && f.stack) return f.stack
  return `"${name}", ${FALLBACK[f ? f.kind : ROLE_KIND[role]]}`
}
// The Google Fonts stylesheet for the page fonts (or only those in `names`), or an empty stylesheet when all are
// system fonts.
export function fontsHref(theme, names) {
  const fams = []
  for (const role of ['heading', 'body', 'mono']) {
    const name = theme.fonts[role], f = FONTS[name]
    if (names && !names.includes(name)) continue
    const q = f ? f.google : `${name.trim().replace(/\s+/g, '+')}:wght@400;700`
    if (q && !fams.includes(q)) fams.push(q)
  }
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.map(q => 'family=' + q).join('&')}&display=swap` : 'data:text/css,'
}
// The fonts line. Fonts the app ships (templates/assets/fonts/, see assets.mjs) load from there, relative to the file
// (`base`), with the Google Fonts stylesheet only as a fallback when that file can't be found (a published copy).
// Any other web font (Lexend, a brand font the app doesn't ship) loads from Google Fonts, in a second tag on the same
// line; all system fonts load nothing.
export function fontsLink(theme, base = CANONICAL_BASE.page) {
  const href = fontsHref(theme)
  if (href.startsWith('data:')) return `<link rel="stylesheet" href="${href}">`
  const names = [...new Set(['heading', 'body', 'mono'].map(r => theme.fonts[r]))]
  const web = names.filter(n => !(FONTS[n] && FONTS[n].stack))
  const local = web.filter(isLocalPageFont), remote = web.filter(n => !isLocalPageFont(n))
  if (!local.length) return `<link rel="stylesheet" href="${href}">`
  const first = fontsLinkLocal(base, fontsHref(theme, local))
  return remote.length ? `${first}<link rel="stylesheet" href="${fontsHref(theme, remote)}">` : first
}
// Matches the fonts line this system writes: the shipped fonts with a fallback (perhaps followed by a Google Fonts tag
// for the rest), Google Fonts alone, or the empty stylesheet.
export const FONTS_LINK_RE = /<link rel="stylesheet" href="[^"]*templates\/assets\/fonts\/fonts\.css"[^>]*>(?:<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*">)?|<link rel="stylesheet" href="(?:https:\/\/fonts\.googleapis\.com\/css2\?[^"]*|data:text\/css,[^"]*)">/

const pct = n => `${Math.round(n * 1000) / 1000}%`

// Theme-dependent extras (both themes): wells, the dialog dim, the one hero gradient, the overlay shadow,
// chart series and track (measured in palette.mjs), and the monogram colors.
function extraTokens(R, dark) {
  const k = dark ? 'dark' : 'light', x = R.extra[k], n = R[k].neutral
  const [g1, g2] = x.gradient
  return [
    `--color-bg-inset: var(--neutral-${dark ? 1 : 3}); --color-bg-overlay: ${dark ? n[0] + 'b3' : n[11] + '73'};`,
    `--color-accent-gradient: linear-gradient(135deg, var(--accent-${g1 + 1}), var(--accent-${g2 + 1}));`,
    `--shadow-overlay: ${dark ? '0 0 0 1px oklch(1 0 0 / 0.14), 0 24px 48px -12px oklch(0 0 0 / 0.8)' : '0 0 0 1px oklch(0 0 0 / 0.08), 0 8px 16px -8px oklch(0 0 0 / 0.16), 0 24px 48px -12px oklch(0 0 0 / 0.28)'};`,
    `${x.chart.map((c, i) => `--chart-${i + 1}: ${c};`).join(' ')} --chart-track: var(--neutral-${x.track + 1});`,
    `--avatar-bg: var(--color-accent-subtle); --avatar-fg: var(--color-accent-text);`,
  ].join('\n    ')
}
// Theme-independent scale: radii beyond md, spacing steps for plain CSS, the type scale, reading width.
const TYPE = [
  ['display', 'clamp(2.5rem, 6.5vw, 4.25rem)', '1.02', '-0.022em'],
  ['title', 'clamp(1.75rem, 3.6vw, 2.25rem)', '1.1', '-0.012em'],
  ['heading', '1.375rem', '1.25'],
  ['subheading', '1.125rem', '1.35'],
  ['body', '1rem', '1.55'],
  ['small', '0.875rem', '1.45'],
  ['label', '0.75rem', '1.3', '0.07em'],
]
function scaleTokens(lg) {
  const steps = [1, 2, 3, 4, 6, 8, 10, 12, 16, 24]
  return [
    `--radius-xl: ${lg ? lg + 8 : 0}px; --radius-full: 999px;`,
    steps.map((m, i) => `--space-${i + 1}: calc(var(--spacing) * ${m});`).join(' '),
    ...TYPE.map(([name, size, lh, ls]) => `--text-${name}: ${size}; --text-${name}--line-height: ${lh};${ls ? ` --text-${name}--letter-spacing: ${ls};` : ''}`),
    '--measure: 38rem;',
  ].join('\n    ')
}

export function tokenBlock(theme, R = buildRamps(theme.spec)) {
  const on = theme.spec.onAccent || { light: '#ffffff', dark: '#ffffff' }
  const prim = t => Object.entries(R[t]).map(([name, steps]) => steps.map((v, i) => `--${name}-${i + 1}: ${v};`).join(' ')).join('\n    ')
  const sem = dark => `
    --color-bg-page: var(--neutral-${dark ? 2 : 2}); --color-bg-surface: var(--neutral-${dark ? 3 : 1}); --color-bg-raised: var(--neutral-${dark ? 4 : 1}); --color-bg-sunken: var(--neutral-${dark ? 1 : 3}); --color-bg-hover: var(--neutral-${dark ? 5 : 4});
    --color-text-primary: var(--neutral-12); --color-text-secondary: var(--neutral-11); --color-text-disabled: var(--neutral-9); --color-text-on-accent: ${dark ? on.dark : on.light};
    --color-border-subtle: var(--neutral-6); --color-border: var(--neutral-7); --color-border-strong: var(--neutral-8); --color-graphic-idle: var(--neutral-9);
    --color-accent-subtle: var(--accent-3); --color-accent-subtle-hover: var(--accent-4); --color-accent-border: var(--accent-7); --color-accent-solid: var(--accent-9); --color-accent-solid-hover: var(--accent-10); --color-accent-text: var(--accent-11); --color-focus: var(--accent-${dark ? 11 : 9});
    --color-success-subtle: var(--success-3); --color-success-solid: var(--success-9); --color-success-text: var(--success-11);
    --color-warning-subtle: var(--warning-3); --color-warning-solid: var(--warning-9); --color-warning-text: var(--warning-11);
    --color-danger-subtle: var(--danger-3); --color-danger-solid: var(--danger-9); --color-danger-text: var(--danger-11);
    --shadow-surface: ${dark ? '0 0 0 1px oklch(1 0 0 / 0.08)' : '0 0 0 1px oklch(0 0 0 / 0.06), 0 1px 2px -1px oklch(0 0 0 / 0.06), 0 2px 4px 0 oklch(0 0 0 / 0.04)'};
    --shadow-raised: ${dark ? '0 0 0 1px oklch(1 0 0 / 0.12), 0 16px 32px -16px oklch(0 0 0 / 0.7)' : '0 0 0 1px oklch(0 0 0 / 0.07), 0 2px 4px -2px oklch(0 0 0 / 0.08), 0 16px 32px -16px oklch(0 0 0 / 0.22)'};
    ${extraTokens(R, dark)}`
  const h = theme.spec.hues, r = Math.round
  const md = theme.radius, sm = Math.round(md / 2), lg = md ? md + 8 : 0
  const high = theme.spec.contrast === 'high'
  const motionRule = theme.motion === 'reduced' ? `
  /* Motion: reduced (profile/design.md). Movement is off everywhere; color and fade changes stay. */
  *, ::before, ::after { animation: none !important; transition-property: color, background-color, border-color, outline-color, box-shadow, opacity !important; transition-delay: 0s !important; scroll-behavior: auto !important; }` : ''
  return `${MARK.pageStart} (generated; see .claude/skills/page-design/SKILL.md) ----
     Primitives are role-based 12-step ramps (1 page bg … 9 solid fill … 11 low-contrast text, 12 high-contrast text),
     built in OKLCH: neutral (hue ${r(h.neutral)}), accent${theme.accentName ? ` "${theme.accentName}"` : ''} (${r(h.accent)}), success (${r(h.success)}), warning (${r(h.warning)}), danger (${r(h.danger)}).
     Components use only the semantic --color-* tokens. Every text pair is measured >= ${high ? '7' : '4.5'}:1 in both themes. */
  :root {
    color-scheme: light;
    ${prim('light')}
    ${sem(false)}
    --radius-sm: ${sm}px; --radius-md: ${md}px; --radius-lg: ${lg}px;
    ${scaleTokens(lg)}
    --ease-out: cubic-bezier(0.2, 0, 0, 1);
    --font-display: ${fontStack(theme.fonts.heading, 'heading')};
    --font-body: ${fontStack(theme.fonts.body, 'body')};
    --font-data: ${fontStack(theme.fonts.mono, 'mono')};
    --spacing: ${DENSITY[theme.density]}rem; --motion: ${theme.motion}; font-size: ${pct(theme.baseSize)};
    --print-accent-text: ${R.light.accent[9]}; --print-accent-subtle: ${R.light.accent[2]};
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
    color-scheme: dark;
    ${prim('dark')}
    ${sem(true)}
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    ${prim('dark')}
    ${sem(true)}
  }${motionRule}
${MARK.pageEnd}`
}

// Designed resume: light colors only (it is printed), the page fonts, paper and margins.
export function designedBlock(theme, R = buildRamps(theme.spec)) {
  const n = R.light.neutral, a = R.light.accent
  const [size, lead, margin] = DOC_DENSITY.designed[theme.docs.density]
  return `${MARK.designedStart} (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */
  :root {
    --r-ink: ${n[11]}; --r-muted: ${n[10]}; --r-line: ${n[5]}; --r-accent: ${a[8]}; --r-accent-text: ${a[10]}; --r-wash: ${a[2]};
    --font-display: ${fontStack(theme.fonts.heading, 'heading')};
    --font-body: ${fontStack(theme.fonts.body, 'body')};
    --font-data: ${fontStack(theme.fonts.mono, 'mono')};
    --r-size: ${size}; --r-leading: ${lead};
  }
  @page { size: ${theme.docs.paper}; margin: ${margin}; }
${MARK.designedEnd}`
}

// ATS resume and cover letter: font from the safe list, accent for the name and rules only, paper, density.
// A font the app ships (static files, see assets.mjs) loads from templates/assets/fonts/documents.css, relative to the
// file (`base`); Lato still loads from Google Fonts; system fonts load nothing.
export function documentBlock(docs, kind, base = CANONICAL_BASE.doc) {
  const f = DOC_FONTS[docs.font] || DOC_FONTS.Arial
  const [size, lead, margin] = DOC_DENSITY[kind === 'letter' ? 'letter' : 'resume'][docs.density]
  const imp = DOC_FONTS_LOCAL[docs.font] ? `\n  @import url("${documentsCss(base)}");`
    : f.google ? `\n  @import url("https://fonts.googleapis.com/css2?family=${f.google}&display=swap");` : ''
  return `${MARK.docStart} (generated from profile/design.md; see .claude/skills/page-design/SKILL.md) ---- */${imp}
  :root { --doc-font: ${f.stack}; --doc-accent: ${docs.accent}; --doc-size: ${size}; --doc-leading: ${lead}; }
  @page { size: ${docs.paper}; margin: ${margin}; }
${MARK.docEnd}`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const name = process.argv[2] || 'default'
  if (!PRESETS[name]) { console.error(`unknown preset ${name}`); process.exit(2) }
  const t = resolveTheme({}, { preset: name }), f = fixContrast(t.spec)
  t.spec = f.spec
  process.stdout.write(tokenBlock(t, f.R))
}
