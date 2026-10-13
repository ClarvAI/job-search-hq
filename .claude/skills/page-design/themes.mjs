// Themes: the presets, the font lists, the profile/design.md reader, and the contrast fixer.
// Used by tokens.mjs and scripts/apply-theme.mjs. No dependencies.

import { DEFAULT_SPEC, buildRamps, measure, hex, hexToOklch, maxChroma, wcag } from './palette.mjs'

// ---- Fonts -------------------------------------------------------------------------------------
// Google Fonts (css2 "family=" values, axes chosen so every weight the pages use is real) and system stacks.
// Anything else from a brand is tried as a Google font with weights 400 and 700, and reported.
const STACK = {
  serif: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  sans: '"Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}
export const FONTS = {
  'Bricolage Grotesque': { kind: 'sans', google: 'Bricolage+Grotesque:opsz,wght@12..96,400..700' },
  'Lexend': { kind: 'sans', google: 'Lexend:wght@400..700' },
  'Inter': { kind: 'sans', google: 'Inter:opsz,wght@14..32,400..700' },
  'JetBrains Mono': { kind: 'mono', google: 'JetBrains+Mono:wght@400..600' },
  'IBM Plex Sans': { kind: 'sans', google: 'IBM+Plex+Sans:wght@400;500;600;700' },
  'IBM Plex Serif': { kind: 'serif', google: 'IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400' },
  'IBM Plex Mono': { kind: 'mono', google: 'IBM+Plex+Mono:wght@400;500;600' },
  'Source Serif 4': { kind: 'serif', google: 'Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..600' },
  'Source Sans 3': { kind: 'sans', google: 'Source+Sans+3:wght@400..700' },
  'Source Code Pro': { kind: 'mono', google: 'Source+Code+Pro:wght@400..600' },
  'Lora': { kind: 'serif', google: 'Lora:ital,wght@0,400..700;1,400..600' },
  'Merriweather': { kind: 'serif', google: 'Merriweather:wght@400;700' },
  'Fraunces': { kind: 'serif', google: 'Fraunces:opsz,wght@9..144,400..700' },
  'Playfair Display': { kind: 'serif', google: 'Playfair+Display:wght@400..700' },
  'EB Garamond': { kind: 'serif', google: 'EB+Garamond:ital,wght@0,400..700;1,400..600' },
  'Noto Serif': { kind: 'serif', google: 'Noto+Serif:wght@400..700' },
  'DM Sans': { kind: 'sans', google: 'DM+Sans:opsz,wght@9..40,400..700' },
  'Work Sans': { kind: 'sans', google: 'Work+Sans:wght@400..700' },
  'Manrope': { kind: 'sans', google: 'Manrope:wght@400..700' },
  'Space Grotesk': { kind: 'sans', google: 'Space+Grotesk:wght@400..700' },
  'Public Sans': { kind: 'sans', google: 'Public+Sans:wght@400..700' },
  'Libre Franklin': { kind: 'sans', google: 'Libre+Franklin:wght@400..700' },
  'Roboto': { kind: 'sans', google: 'Roboto:wght@400..700' },
  'Open Sans': { kind: 'sans', google: 'Open+Sans:wght@400..700' },
  'Lato': { kind: 'sans', google: 'Lato:wght@400;700' },
  'Montserrat': { kind: 'sans', google: 'Montserrat:wght@400..700' },
  'Poppins': { kind: 'sans', google: 'Poppins:wght@400;500;600;700' },
  'Noto Sans': { kind: 'sans', google: 'Noto+Sans:wght@400..700' },
  'Roboto Mono': { kind: 'mono', google: 'Roboto+Mono:wght@400..600' },
  // System fonts: nothing to download.
  'system-ui': { kind: 'sans', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  'Georgia': { kind: 'serif', stack: 'Georgia, "Times New Roman", serif' },
  'Arial': { kind: 'sans', stack: 'Arial, Helvetica, "Liberation Sans", sans-serif' },
  'Helvetica': { kind: 'sans', stack: 'Helvetica, Arial, "Liberation Sans", sans-serif' },
  'ui-monospace': { kind: 'mono', stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
}
const findFont = name => Object.keys(FONTS).find(k => k.toLowerCase() === String(name || '').trim().toLowerCase())

// Resume and cover letter: fonts that every applicant tracking system reads well (real text, standard glyphs).
export const DOC_FONTS = {
  'Arial': { stack: 'Arial, Helvetica, "Liberation Sans", sans-serif' },
  'Helvetica': { stack: 'Helvetica, Arial, "Liberation Sans", sans-serif' },
  'Calibri': { stack: 'Calibri, Carlito, Arial, sans-serif' },
  'Cambria': { stack: 'Cambria, Caladea, Georgia, serif' },
  'Georgia': { stack: 'Georgia, "Times New Roman", serif' },
  'Times New Roman': { stack: '"Times New Roman", Times, "Liberation Serif", serif' },
  'Garamond': { stack: '"EB Garamond", Garamond, Georgia, serif', google: 'EB+Garamond:ital,wght@0,400..700;1,400..700' },
  'Lato': { stack: 'Lato, Arial, sans-serif', google: 'Lato:ital,wght@0,400;0,700;1,400' },
  'Source Sans 3': { stack: '"Source Sans 3", Arial, sans-serif', google: 'Source+Sans+3:ital,wght@0,400..700;1,400..700' },
  'Roboto': { stack: 'Roboto, Arial, sans-serif', google: 'Roboto:ital,wght@0,400..700;1,400..700' },
  'Open Sans': { stack: '"Open Sans", Arial, sans-serif', google: 'Open+Sans:ital,wght@0,400..700;1,400..700' },
}

// ---- Presets -----------------------------------------------------------------------------------
const STATUS = { success: 152, warning: 72, danger: 27 }
export const PRESETS = {
  default: {
    label: 'Default', accentName: 'deep teal',
    blurb: 'Friendly grotesque headings over a plain, readable sans, warm stone backgrounds, a deep teal accent.',
    spec: DEFAULT_SPEC,
    fonts: { heading: 'Bricolage Grotesque', body: 'Source Sans 3', mono: 'Source Code Pro' },
    baseSize: 100, density: 'comfortable', radius: 10, motion: 'full',
  },
  modern: {
    label: 'Modern', accentName: 'violet',
    blurb: 'Clean sans-serif throughout (Inter), a violet accent, softer corners.',
    spec: { ...DEFAULT_SPEC, hues: { accent: 285, accentDark: 285, neutral: 280, ...STATUS }, solid: { ...DEFAULT_SPEC.solid, accent: [0.5, 0.58] }, neutralTint: 0.8 },
    fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
    baseSize: 100, density: 'comfortable', radius: 12, motion: 'full',
  },
  minimal: {
    label: 'Minimal', accentName: 'graphite',
    blurb: 'Mostly black and white, IBM Plex type, small corners; color only for status.',
    spec: { ...DEFAULT_SPEC, hues: { accent: 255, accentDark: 255, neutral: 255, ...STATUS }, solid: { ...DEFAULT_SPEC.solid, accent: [0.3, 0.5] }, accentVivid: 0.1, neutralTint: 0 },
    fonts: { heading: 'IBM Plex Serif', body: 'IBM Plex Sans', mono: 'IBM Plex Mono' },
    baseSize: 100, density: 'comfortable', radius: 4, motion: 'full',
  },
  'high-contrast': {
    label: 'High contrast', accentName: 'strong blue',
    blurb: 'Larger text, darker text and borders (7:1 contrast), fonts made for low vision, plain grays, motion off.',
    spec: { ...DEFAULT_SPEC, hues: { accent: 240, accentDark: 240, neutral: 240, ...STATUS }, solid: { ...DEFAULT_SPEC.solid, accent: [0.42, 0.51] }, neutralTint: 0, contrast: 'high' },
    fonts: { heading: 'Lexend', body: 'Lexend', mono: 'Source Code Pro' },
    baseSize: 112.5, density: 'comfortable', radius: 8, motion: 'reduced',
  },
  editorial: {
    label: 'Editorial', accentName: 'plum',
    blurb: 'A warm editorial look: Fraunces headings over Source Serif 4 text on warm paper tones, a deep plum accent, small corners.',
    spec: { ...DEFAULT_SPEC, hues: { accent: 335, accentDark: 335, neutral: 70, ...STATUS }, solid: { ...DEFAULT_SPEC.solid, accent: [0.46, 0.58] }, accentVivid: 0.62, neutralTint: 1.9 },
    fonts: { heading: 'Fraunces', body: 'Source Serif 4', mono: 'Source Code Pro' },
    baseSize: 100, density: 'comfortable', radius: 6, motion: 'full',
  },
  calm: {
    label: 'Calm', accentName: 'periwinkle',
    blurb: 'A calm pastel look: soft blue-gray backgrounds, a muted periwinkle accent, rounded corners, roomy spacing, DM Sans throughout, gentle motion.',
    spec: { ...DEFAULT_SPEC, hues: { accent: 268, accentDark: 268, neutral: 255, ...STATUS }, solid: { ...DEFAULT_SPEC.solid, accent: [0.52, 0.57] }, accentVivid: 0.48, neutralTint: 1.7 },
    fonts: { heading: 'DM Sans', body: 'DM Sans', mono: 'Source Code Pro' },
    baseSize: 100, density: 'spacious', radius: 16, motion: 'reduced',
  },
  bold: {
    label: 'Bold', accentName: 'magenta',
    blurb: 'A bold creative look: Space Grotesk headings over Work Sans, a vivid magenta accent on cool near-neutral grays, sharp corners.',
    spec: { ...DEFAULT_SPEC, hues: { accent: 350, accentDark: 350, neutral: 290, ...STATUS }, solid: { ...DEFAULT_SPEC.solid, accent: [0.52, 0.59] }, accentVivid: 1, neutralTint: 0.6 },
    fonts: { heading: 'Space Grotesk', body: 'Work Sans', mono: 'JetBrains Mono' },
    baseSize: 100, density: 'comfortable', radius: 2, motion: 'full',
  },
}
export const PRESET_NAMES = Object.keys(PRESETS)

// ---- Layouts ------------------------------------------------------------------------------------
// One file per page; the layout is the data-layout attribute on its <html> tag. First value = default.
// key: [block in design.md, values, the files it applies to (basename; briefs also live in jobs/*/)]
export const LAYOUTS = {
  layout_dashboard: { block: 'design', values: ['overview', 'board', 'timeline'], files: ['dashboard.html'], page: 'dashboard' },
  layout_flashcards: { block: 'design', values: ['flip', 'list', 'cards'], files: ['flashcards.html'], page: 'flashcards' },
  layout_brief: { block: 'design', values: ['sheet', 'detailed'], files: ['interview-brief.html'], page: 'brief' },
  layout_portfolio: { block: 'design', values: ['profile', 'editorial', 'bento', 'column'], files: ['portfolio.html'], page: 'portfolio' },
  layout_resume: { block: 'documents', values: ['classic', 'modern', 'compact'], files: ['resume-template.html', 'cover-letter-template.html'], page: 'resume' },
  layout_designed: { block: 'documents', values: ['sidebar', 'headline', 'portrait'], files: ['resume-designed-template.html'], page: 'designed' },
}
export const DEFAULT_LAYOUTS = Object.fromEntries(Object.entries(LAYOUTS).map(([k, v]) => [k, v.values[0]]))
// The layout value for a file (by its name), or null when the file has no layouts.
export function layoutFor(layouts, fileName) {
  const base = String(fileName).split(/[\\/]/).pop()
  const key = Object.keys(LAYOUTS).find(k => LAYOUTS[k].files.includes(base))
  return key ? (layouts || DEFAULT_LAYOUTS)[key] : null
}
export const DENSITY = { compact: 0.225, comfortable: 0.25, spacious: 0.28 }
export const DOC_DENSITY = {
  resume: { compact: ['10pt', '1.2', '0.45in 0.55in'], standard: ['10.5pt', '1.2', '0.5in 0.6in'], roomy: ['11pt', '1.25', '0.6in 0.7in'] },
  letter: { compact: ['10.5pt', '1.4', '0.75in 0.9in'], standard: ['11pt', '1.45', '0.9in 1in'], roomy: ['11.5pt', '1.5', '1in 1.1in'] },
  designed: { compact: ['10pt', '1.2', '0.45in 0.5in'], standard: ['10.5pt', '1.25', '0.5in 0.55in'], roomy: ['11pt', '1.3', '0.6in 0.65in'] },
}

// ---- profile/design.md -------------------------------------------------------------------------
// Two fenced blocks: ```design (pages) and ```documents (resume and cover letter), each "key: value" lines.
export function parseDesign(text) {
  const block = name => {
    const m = String(text).match(new RegExp('```' + name + '[ \\t]*\\r?\\n([\\s\\S]*?)```'))
    if (!m) return null
    const out = {}
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i)
      if (kv && kv[2] !== '') out[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '')
    }
    return out
  }
  return { design: block('design'), documents: block('documents') }
}

const hueDist = (a, b) => { const d = Math.abs(((a - b) % 360) + 360) % 360; return Math.min(d, 360 - d) }

// ---- Status colors vs the accent -----------------------------------------------------------------------------------
// A brand accent near red (or amber, or green) made accent chips ("In 2 days") read like status chips ("1 day late").
// The measure is the OKLab difference (x100) between the accent's text color and the status text color in light mode
// (step 11, what chips and links are written in); the default teal vs its green is about 8, clearly different hues.
// Each status hue may move only inside its family band, to the nearest hue (from its preset value) that reaches
// STATUS_MIN_DE, keeping at least 15 degrees from the accent; when no hue in the band gets there, the one that differs most.
export const STATUS_BAND = { danger: [0, 40], warning: [55, 100], success: [125, 165] }
export const STATUS_MIN_DE = 8
const STATUS_WORD = { danger: '"problem" red', warning: '"warning" amber', success: '"good" green' }
function oklab(x) { const [L, C, h] = hexToOklch(x); return [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)] }
export function deltaE(a, b) { const p = oklab(a), q = oklab(b); return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) }
// How different each status text color is from the accent text color, light and dark (for --print and the fixtures).
export function statusDistance(R) {
  const out = {}
  for (const k of ['danger', 'warning', 'success']) out[k] = { light: deltaE(R.light.accent[10], R.light[k][10]), dark: deltaE(R.dark.accent[10], R.dark[k][10]) }
  return out
}
function separateStatus(spec, k) {
  const accents = [...new Set([spec.hues.accent, spec.hues.accentDark])]
  const de = h => { const R = buildRamps({ ...spec, hues: { ...spec.hues, [k]: h } }); return deltaE(R.light.accent[10], R.light[k][10]) }
  const okHue = h => accents.every(a => hueDist(h, a) >= 15)
  const start = spec.hues[k]
  const now = de(start)
  if (now >= STATUS_MIN_DE && okHue(start)) return { moved: false, de: now }
  const [lo, hi] = STATUS_BAND[k]
  const cands = []
  for (let h = lo; h <= hi; h++) if (okHue(h)) cands.push(h)
  cands.sort((a, b) => hueDist(a, start) - hueDist(b, start) || a - b)
  let best = null
  for (const h of cands) { const d = de(h); if (d >= STATUS_MIN_DE) { best = { h, d }; break } if (!best || d > best.d + 1e-9) best = { h, d } }
  if (!best) return { moved: false, de: now }
  if (best.d <= now && okHue(start)) return { moved: false, de: now }
  spec.hues[k] = round3(best.h)
  return { moved: true, de: best.d }
}
const round3 = x => Math.round(x * 1000) / 1000

// Resolve design.md values (or a preset name) into everything the generators need.
export function resolveTheme(parsed = {}, { preset: forcePreset } = {}) {
  const d = { ...(parsed.design || {}) }, docsIn = { ...(parsed.documents || {}) }
  const notes = [], errors = []
  let presetName = String(forcePreset || d.preset || 'default').toLowerCase().replace(/\s+/g, '-')
  const isBrand = presetName === 'brand' || presetName === 'custom'
  // "brand" starts from the base named by `based_on` (default: the Default preset) and applies the user's values.
  const baseName = isBrand ? String(d.based_on || 'default').toLowerCase().replace(/\s+/g, '-') : presetName
  if (!PRESETS[baseName]) { errors.push(`unknown preset "${isBrand ? d.based_on : d.preset}" (use ${PRESET_NAMES.join(', ')} or brand)`); return { errors } }
  const P = PRESETS[baseName]
  // Layouts are not part of the look: a forced preset keeps them.
  const layouts = { ...DEFAULT_LAYOUTS }
  for (const [k, L] of Object.entries(LAYOUTS)) {
    const v = (L.block === 'design' ? d : docsIn)[k]
    if (v == null) continue
    const want = String(v).toLowerCase().trim()
    if (L.values.includes(want)) layouts[k] = want
    else errors.push(`${k} "${v}" should be ${L.values.slice(0, -1).join(', ')} or ${L.values[L.values.length - 1]}`)
  }
  const custom = isBrand || (!forcePreset && ['accent', 'accent_dark', 'neutral', 'font_heading', 'font_body', 'font_mono', 'base_size', 'density', 'radius', 'motion'].some(k => d[k]))
  const spec = JSON.parse(JSON.stringify({ ...P.spec, onAccent: { light: '#ffffff', dark: '#ffffff' } }))
  if (forcePreset) Object.keys(d).forEach(k => { if (k !== 'preset' && k !== 'source') delete d[k] })

  // Accent: hue and button lightness from their color; vividness follows how saturated it is.
  if (d.accent) {
    const o = hexToOklch(d.accent)
    if (!o) errors.push(`accent "${d.accent}" isn't a hex color like #1a4fd6`)
    else {
      const [L, C, h] = o
      spec.hues.accent = round3(h); spec.hues.accentDark = round3(h)
      spec.accentVivid = Math.max(0.05, Math.min(1, C / (maxChroma(L, h) * 0.92 || 1)))
      if (C < 0.02) spec.hues.accent = spec.hues.accentDark = spec.hues.neutral // a gray brand color: keep it gray
      if (L >= 0.68 && wcag('#111111', d.accent) >= 4.5) {
        spec.onAccent.light = '#111111'; spec.solid.accent = [round3(L), round3(Math.min(0.85, L + 0.04))]
        notes.push(`Your accent ${d.accent} is light, so text on filled buttons is near-black instead of white.`)
        spec.onAccent.dark = '#111111'
      } else {
        spec.solid.accent = [round3(Math.max(0.25, Math.min(0.62, L))), round3(Math.max(0.45, Math.min(0.62, L + 0.09)))]
      }
    }
  }
  if (d.accent_dark) {
    const o = hexToOklch(d.accent_dark)
    if (!o) errors.push(`accent_dark "${d.accent_dark}" isn't a hex color`)
    else {
      spec.hues.accentDark = round3(o[2])
      if (o[0] >= 0.68 && wcag('#111111', d.accent_dark) >= 4.5) { spec.onAccent.dark = '#111111'; spec.solid.accent[1] = round3(o[0]) }
      else { spec.onAccent.dark = '#ffffff'; spec.solid.accent[1] = round3(Math.max(0.4, Math.min(0.62, o[0]))) }
    }
  }
  // Neutral: a hex (its hue and how tinted it is) or a hue number.
  if (d.neutral) {
    if (/^\d+(\.\d+)?$/.test(d.neutral)) { spec.hues.neutral = Number(d.neutral) % 360; spec.neutralTint = 1 }
    else {
      const o = hexToOklch(d.neutral)
      if (!o) errors.push(`neutral "${d.neutral}" isn't a hex color or a hue number`)
      else { spec.neutralTint = round3(Math.min(2.5, o[1] / 0.008)); if (o[1] > 0.002) spec.hues.neutral = round3(o[2]) }
    }
  }
  // Status colors keep their meaning beside the accent: each status hue stays inside its own family (red, amber, green)
  // and moves, the least it can, until its text color is clearly unlike the accent's (measured, see separateStatus).
  if (spec.accentVivid >= 0.2) { // a near-gray accent can't be confused with a status color
    for (const k of ['danger', 'warning', 'success']) {
      const before = spec.hues[k], r = separateStatus(spec, k)
      if (r.moved) notes.push(`Moved the ${STATUS_WORD[k]} a little (hue ${Math.round(before)}° → ${Math.round(spec.hues[k])}°) so it doesn't look like your accent (difference ${r.de.toFixed(1)}${r.de < STATUS_MIN_DE ? ', the most its color family allows; status chips always carry a word and an icon too' : ''}).`)
    }
  }

  // Fonts.
  const fonts = { ...P.fonts }
  for (const role of ['heading', 'body', 'mono']) {
    const v = d['font_' + role]
    if (!v) continue
    const known = findFont(v)
    if (known) fonts[role] = known
    else if (/^[A-Za-z0-9 ]{2,40}$/.test(v)) { fonts[role] = v.trim(); notes.push(`font-check: "${v.trim()}" isn't on the known font list; it is loaded from Google Fonts at weights 400 and 700. Open a page and check it shows.`) }
    else errors.push(`font_${role} "${v}" isn't a font name`)
  }

  // Size, density, corners, motion. Accessibility floors: base size never below 100%.
  let baseSize = P.baseSize
  if (d.base_size) {
    const v = String(d.base_size).toLowerCase()
    const named = { normal: 100, default: 100, large: 112.5, larger: 125, 'extra-large': 137.5 }
    let n = named[v] ?? (v.endsWith('px') ? (parseFloat(v) / 16) * 100 : parseFloat(v))
    if (!Number.isFinite(n)) errors.push(`base_size "${d.base_size}" should be like 100%, 18px or large`)
    else { if (n < 100) { notes.push('Text size kept at 100%: smaller text is below the readability floor.'); n = 100 } baseSize = Math.min(150, round3(n)) }
  }
  let density = P.density
  if (d.density) { if (DENSITY[d.density.toLowerCase()]) density = d.density.toLowerCase(); else errors.push(`density "${d.density}" should be compact, comfortable or spacious`) }
  let radius = P.radius
  if (d.radius) {
    const v = d.radius.toLowerCase(), named = { none: 0, square: 0, small: 4, medium: 8, large: 12, round: 16 }
    const n = named[v] ?? parseFloat(v)
    if (!Number.isFinite(n) || n < 0 || n > 24) errors.push(`radius "${d.radius}" should be none, small, medium, large or a px value up to 24`)
    else radius = n
  }
  let motion = P.motion
  if (d.motion) { const v = d.motion.toLowerCase(); if (v === 'full' || v === 'reduced') motion = v; else errors.push(`motion "${d.motion}" should be full or reduced`) }

  // Documents: only the safe parts.
  const docs = { font: 'Arial', accent: '#111111', density: 'standard', paper: 'Letter' }
  if (docsIn.font) { const k = Object.keys(DOC_FONTS).find(f => f.toLowerCase() === docsIn.font.toLowerCase()); if (k) docs.font = k; else notes.push(`Resume font "${docsIn.font}" isn't on the ATS-safe list (${Object.keys(DOC_FONTS).join(', ')}); kept Arial.`) }
  if (docsIn.density) { const v = docsIn.density.toLowerCase(); if (DOC_DENSITY.resume[v]) docs.density = v; else errors.push(`documents density "${docsIn.density}" should be compact, standard or roomy`) }
  if (docsIn.paper) { const v = docsIn.paper.toLowerCase(); if (v === 'a4') docs.paper = 'A4'; else if (v === 'letter') docs.paper = 'Letter'; else errors.push(`paper "${docsIn.paper}" should be Letter or A4`) }
  if (docsIn.accent) {
    const o = hexToOklch(docsIn.accent)
    if (!o) errors.push(`documents accent "${docsIn.accent}" isn't a hex color`)
    else {
      let [L, C, h] = o
      let s = docsIn.accent.trim().replace(/^#/, '').toLowerCase()
      if (s.length === 3) s = s.split('').map(c => c + c).join('')
      const want = '#' + s
      let x = want
      while (wcag(x, '#ffffff') < 4.5 && L > 0.05) { L -= 0.01; x = hex(L, C, h) }
      if (x !== want) notes.push(`Resume accent ${docsIn.accent} is too light on white paper; using ${x} for the name and rule lines (body text stays black).`)
      docs.accent = x
    }
  }

  return {
    errors, notes, preset: custom ? 'brand' : baseName, base: baseName, label: custom ? `Your own (based on ${P.label})` : P.label,
    accentName: custom && d.accent ? '' : P.accentName, source: d.source || 'preset',
    spec, fonts, baseSize, density, radius, motion, docs, layouts,
  }
}

// ---- Contrast fixer ----------------------------------------------------------------------------
// Adjust lightness (never hue) until every pair passes. Returns { R, spec, adjustments, fails }.
const L_BASE = {
  normal: { light: [0.993, 0.981, 0.957, 0.933, 0.909, 0.879, 0.836, 0.765, null, null, 0.475, 0.255], dark: [0.158, 0.185, 0.222, 0.252, 0.283, 0.322, 0.378, 0.463, null, null, 0.815, 0.945] },
  high: { light: [0.993, 0.981, 0.957, 0.933, 0.909, 0.82, 0.74, 0.6, null, null, 0.4, 0.18], dark: [0.158, 0.185, 0.222, 0.252, 0.283, 0.4, 0.48, 0.6, null, null, 0.88, 0.97] },
}
export function fixContrast(spec0) {
  const spec = JSON.parse(JSON.stringify(spec0))
  spec.lOver = spec.lOver || {}
  const high = spec.contrast === 'high'
  const startSolid = JSON.stringify(spec.solid.accent)
  let R, fails = [], guard = 0
  const touched = new Set()
  for (;;) {
    R = buildRamps(spec)
    const rows = measure(R, { high }).map(r => (r.label.startsWith('on-accent') && spec.onAccent[r.theme] !== '#ffffff') ? recheck(r, spec.onAccent[r.theme]) : r)
    fails = rows.filter(r => !r.ok)
    if (!fails.length || ++guard > 120) break
    // Derived colors (charts, track) are measured as they are built; only the text on the gradient can be fixed here.
    const fixable = fails.filter(r => r.ramp !== 'derived' || r.label.startsWith('on-accent'))
    if (!fixable.length) break
    const f = fixable[0], ti = f.theme === 'light' ? 0 : 1, sign = f.theme === 'light' ? -1 : 1
    if (f.label.startsWith('on-accent')) {
      const darkText = spec.onAccent[f.theme] !== '#ffffff'
      spec.solid.accent[ti] = round3(spec.solid.accent[ti] + (darkText ? 0.01 : -0.01))
    } else if (f.ramp === 'accent' && f.step === 8) {
      spec.solid.accent[ti] = round3(spec.solid.accent[ti] + sign * 0.01)
    } else {
      const lv = (spec.lOver[f.theme] = spec.lOver[f.theme] || {}), rv = (lv[f.ramp] = lv[f.ramp] || {})
      const cur = rv[f.step] ?? L_BASE[high ? 'high' : 'normal'][f.theme][f.step]
      rv[f.step] = round3(cur + sign * 0.01)
      touched.add(`${f.theme}:${f.ramp}`)
    }
    if (spec.solid.accent.some(v => v < 0.15 || v > 0.92)) break
  }
  const adjustments = []
  if (JSON.stringify(spec.solid.accent) !== startSolid) {
    const [a0, a1] = JSON.parse(startSolid)
    if (spec.solid.accent[0] !== a0) adjustments.push(`Filled buttons use a ${spec.solid.accent[0] < a0 ? 'deeper' : 'lighter'} shade of the accent in light mode (${R.light.accent[8]}) so they stand out and their text stays readable.`)
    if (spec.solid.accent[1] !== a1) adjustments.push(`Filled buttons use a ${spec.solid.accent[1] < a1 ? 'deeper' : 'lighter'} shade of the accent in dark mode (${R.dark.accent[8]}) so they stand out and their text stays readable.`)
  }
  for (const t of touched) { const [theme, ramp] = t.split(':'); adjustments.push(`Made the ${ramp === 'neutral' ? 'text and border grays' : ramp + ' text'} slightly ${theme === 'light' ? 'darker' : 'lighter'} in ${theme} mode to keep it readable.`) }
  return { R, spec, adjustments, fails }
}
function recheck(r, fg) {
  const w = wcag(fg, r.bg)
  return { ...r, fg, w, ok: w >= 4.5, note: false }
}
