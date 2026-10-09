// Generates role-based 12-step ramps (Radix model) in OKLCH, gamut-maps to sRGB,
// and measures every semantic pair with WCAG 2 and APCA (0.0.98G-4g). No dependencies.
//
// Run it directly (`node palette.mjs`) to print the Default preset's ramps and their measurements.
// tokens.mjs and scripts/apply-theme.mjs import it to build any theme from profile/design.md.

import { fileURLToPath } from 'node:url'

const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklchToLinRgb(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);
export function maxChroma(L, h) { let lo = 0, hi = 0.4; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; inGamut(oklchToLinRgb(L, mid, h)) ? (lo = mid) : (hi = mid); } return lo; }
export function hex(L, C, h) {
  const c = Math.min(C, maxChroma(L, h));
  return '#' + oklchToLinRgb(L, c, h).map(v => Math.round(Math.max(0, Math.min(1, toGam(Math.max(0, Math.min(1, v))))) * 255).toString(16).padStart(2, '0')).join('');
}
const rgbOf = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255);
const lum = x => { const [r, g, b] = rgbOf(x).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const wcag = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export function apca(txt, bg) {
  const Y = x => { const [r, g, b] = rgbOf(x).map(c => c ** 2.4); return 0.2126729 * r + 0.7151522 * g + 0.072175 * b; };
  let t = Y(txt), k = Y(bg); const clamp = y => (y > 0.022 ? y : y + (0.022 - y) ** 1.414);
  t = clamp(t); k = clamp(k);
  if (Math.abs(k - t) < 0.0005) return 0;
  let s;
  if (k > t) { s = (k ** 0.56 - t ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
  s = (k ** 0.65 - t ** 0.62) * 1.14; return s > -0.1 ? 0 : (s + 0.027) * 100;
}

// Hex (#rgb or #rrggbb) -> OKLCH [L, C, h]. Used to read a user's brand color.
export function hexToOklch(x) {
  let s = String(x).trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  const [r, g, b] = [0, 2, 4].map(i => toLin(parseInt(s.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q;
  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI; if (h < 0) h += 360;
  return [L, C, h];
}

// Role-defined lightness per step (1 page … 12 high-contrast text).
const L_LIGHT = [0.993, 0.981, 0.957, 0.933, 0.909, 0.879, 0.836, 0.765, null, null, 0.475, 0.255];
const L_DARK = [0.158, 0.185, 0.222, 0.252, 0.283, 0.322, 0.378, 0.463, null, null, 0.815, 0.945];
// High contrast: darker text and borders in light, brighter in dark; surfaces unchanged.
const L_LIGHT_HC = [0.993, 0.981, 0.957, 0.933, 0.909, 0.82, 0.74, 0.6, null, null, 0.4, 0.18];
const L_DARK_HC = [0.158, 0.185, 0.222, 0.252, 0.283, 0.4, 0.48, 0.6, null, null, 0.88, 0.97];
const VIVID = [0.25, 0.4, 0.55, 0.6, 0.64, 0.68, 0.72, 0.78, 0.92, 0.92, 0.82, 0.42]; // share of the hue's own max chroma
const NEUTRAL_C = [0.003, 0.004, 0.006, 0.007, 0.008, 0.009, 0.011, 0.014, 0.02, 0.02, 0.016, 0.012];

// lOver: { stepIndex: L } overrides (used by the contrast fixer). vivid: chroma multiplier (1 = full).
function ramp({ hue, solidL, solidLDark, neutral = false, dark = false, high = false, vivid = 1, tint = 1, lOver = {} }) {
  const Ls = (high ? (dark ? L_DARK_HC : L_LIGHT_HC) : (dark ? L_DARK : L_LIGHT)).slice();
  Ls[8] = dark ? solidLDark : solidL; Ls[9] = Ls[8] - 0.045;
  for (const [i, L] of Object.entries(lOver)) Ls[i] = L;
  return Ls.map((L, i) => {
    const C = neutral ? NEUTRAL_C[i] * (dark ? 1.1 : 1) * tint
      : maxChroma(L, hue) * VIVID[i] * (dark ? 0.86 : 1) * vivid;
    return hex(L, C, hue);
  });
}

// The Default theme: deep teal accent over warm stone neutrals; status hues 15°+ from the accent.
export const DEFAULT_SPEC = {
  hues: { accent: 200, accentDark: 200, neutral: 75, success: 150, warning: 72, danger: 27 },
  solid: { neutral: [0.55, 0.6], accent: [0.5, 0.55], success: [0.52, 0.6], warning: [0.7, 0.74], danger: [0.52, 0.6] },
  accentVivid: 1, neutralTint: 1.2, contrast: 'normal',
  lOver: {}, // { light: { accent: { 10: 0.45 } }, dark: { ... } }
};

export function buildRamps(spec = DEFAULT_SPEC) {
  const s = { ...DEFAULT_SPEC, ...spec, hues: { ...DEFAULT_SPEC.hues, ...(spec.hues || {}) }, solid: { ...DEFAULT_SPEC.solid, ...(spec.solid || {}) } };
  const high = s.contrast === 'high';
  const R = {};
  for (const dark of [false, true]) {
    const k = dark ? 'dark' : 'light';
    const ov = name => ((s.lOver || {})[k] || {})[name] || {};
    const mk = (name, extra = {}) => ramp({ hue: s.hues[name], solidL: s.solid[name][0], solidLDark: s.solid[name][1], dark, high, lOver: ov(name), ...extra });
    R[k] = {
      neutral: mk('neutral', { neutral: true, tint: s.neutralTint }),
      accent: mk('accent', { hue: dark ? (s.hues.accentDark ?? s.hues.accent) : s.hues.accent, vivid: s.accentVivid }),
      success: mk('success'),
      warning: mk('warning'),
      danger: mk('danger'),
    };
  }
  // Not ramps: derived colors the pages also need (chart series, chart track, accent gradient stops).
  // Kept outside R.light / R.dark so code that walks the ramps never sees them.
  Object.defineProperty(R, 'extra', { value: { light: extras(R.light, s, false), dark: extras(R.dark, s, true) }, enumerable: false });
  return R;
}

// OKLCH hues that turn mustard/olive at chart lightness (about L 0.5); chart series 2-5 skip them.
const MUDDY = [65, 130];
const hueDist = (a, b) => { const d = Math.abs(((a - b) % 360) + 360) % 360; return Math.min(d, 360 - d); };
// Surfaces a chart mark may sit on in each theme (surface, page, raised/inset).
export const chartGrounds = (n, dark) => (dark ? [n[2], n[1], n[3], n[0]] : [n[0], n[1], n[2]]);

// Chart series, chart track and gradient stops for one theme, all measured.
//  - chart 1 is the accent's solid fill; charts 2-5 turn its hue by 120, -120, 60, -60 (or 180) degrees at the same
//    lightness and chroma (clipped to sRGB), each nudged until it is 15+ degrees from every status hue, 25+ degrees
//    from the other series and outside the yellow/olive band (MUDDY: at chart lightness those hues read as mustard or
//    khaki), then darkened (light theme) or lightened (dark theme) until it is 3:1 or more against every surface it can
//    sit on. A near-gray accent (the Minimal look) gets an ordered ramp of its own hue instead: chart 1 is the accent,
//    charts 2-5 step evenly away from it (lighter or darker, whichever side has more room above 3:1), never alternating.
//  - the chart track is the first neutral step (4 and up) at 1.5:1 or more against the surface and page, so empty
//    tracks still show.
//  - gradient stops: light accent 9 -> 11, dark accent 8 -> 10, each falling back to the solid fill (or its hover)
//    when the text-on-accent color wouldn't reach 4.5:1 on it.
function extras(T, s, dark) {
  const n = T.neutral, a = T.accent;
  const grounds = chartGrounds(n, dark);
  const passes = (c, min) => grounds.every(g => wcag(c, g) >= min);
  const fit = (L, C, h) => { // move lightness away from the surface until 3:1
    let x = hex(L, C, h), guard = 0;
    while (!passes(x, 3) && guard++ < 90) { L += dark ? 0.01 : -0.01; x = hex(L, C, h); }
    return x;
  };
  const [L0, C0, h0] = hexToOklch(a[8]);
  const status = [s.hues.success, s.hues.warning, s.hues.danger];
  const chart = [passes(a[8], 3) ? a[8] : fit(L0, C0, h0)];
  if (C0 < 0.04) {
    // Monochrome: spread lightness over the range that still reaches 3:1 on the surfaces.
    let lo = dark ? 0.4 : 0.22, hi = dark ? 0.95 : 0.75;
    if (dark) { while (lo < 0.95 && !passes(hex(lo, C0, h0), 3)) lo += 0.01; } else { while (hi > 0.22 && !passes(hex(hi, C0, h0), 3)) hi -= 0.01; }
    // One direction only, so the series read as an ordered sequence (chart 1 -> 5 always lighter, or always darker).
    const end = hi - L0 >= L0 - lo ? hi : lo;
    for (const i of [1, 2, 3, 4]) chart.push(fit(L0 + ((end - L0) * i) / 4, C0, h0));
    while (chart.length < 5) chart.push(chart[chart.length - 1]);
  } else {
    const used = [h0];
    for (const off of [120, -120, 60, -60, 180]) {
      if (chart.length >= 5) break;
      const want = (((h0 + off) % 360) + 360) % 360;
      for (let d = 0; d <= 90; d++) {
        const cand = [want + d, want - d].map(h => ((h % 360) + 360) % 360).find(h => !(h >= MUDDY[0] && h <= MUDDY[1]) && status.every(x => hueDist(h, x) >= 15) && used.every(x => hueDist(h, x) >= 25));
        if (cand != null) { used.push(cand); chart.push(fit(L0, C0, cand)); break; }
      }
    }
    while (chart.length < 5) chart.push(fit(L0 + (dark ? 0.12 : -0.12) * (chart.length - 2), C0, h0));
  }
  let track = 3;
  while (track < 8 && !(wcag(n[track], grounds[0]) >= 1.5 && wcag(n[track], grounds[1]) >= 1.5)) track++;
  const on = (s.onAccent || {})[dark ? 'dark' : 'light'] || '#ffffff';
  const okOn = i => wcag(on, a[i]) >= 4.5;
  const gradient = dark ? [okOn(7) ? 7 : 8, okOn(9) ? 9 : 8] : [8, okOn(10) ? 10 : 9];
  return { chart, track, gradient, onAccent: on };
}

// Semantic pairs that the pages render (foreground on background), with the surfaces each theme really uses.
// kind 'text' must pass WCAG and APCA; kind 'ui' (rings, fills, borders) must pass WCAG, APCA is advisory.
export function pairs(t, { dark = false, high = false } = {}) {
  const n = t.neutral, a = t.accent;
  const page = n[1], surface = dark ? n[2] : n[0], sunken = dark ? n[0] : n[2];
  const focus = dark ? a[10] : a[8];
  const body = high ? [7, 90] : [4.5, 75], txt = high ? [7, 75] : [4.5, 60];
  return [
    ['text-primary on page', n[11], page, ...body, 'text', 'neutral', 11], ['text-primary on surface', n[11], surface, ...body, 'text', 'neutral', 11],
    ['text-secondary on page', n[10], page, ...txt, 'text', 'neutral', 10], ['text-secondary on surface', n[10], surface, ...txt, 'text', 'neutral', 10], ['text-secondary on sunken', n[10], sunken, ...txt, 'text', 'neutral', 10],
    ['accent-text on surface', a[10], surface, ...txt, 'text', 'accent', 10], ['accent-text on page', a[10], page, ...txt, 'text', 'accent', 10], ['accent-text on accent-subtle', a[10], a[2], ...txt, 'text', 'accent', 10],
    ['on-accent on accent-solid', '#ffffff', a[8], 4.5, 60, 'text', 'accent', 8], ['on-accent on accent-solid-hover', '#ffffff', a[9], 4.5, 60, 'text', 'accent', 8],
    ['success-text on surface', t.success[10], surface, ...txt, 'text', 'success', 10], ['warning-text on surface', t.warning[10], surface, ...txt, 'text', 'warning', 10], ['danger-text on surface', t.danger[10], surface, ...txt, 'text', 'danger', 10],
    ['success-text on success-subtle', t.success[10], t.success[2], ...txt, 'text', 'success', 10], ['warning-text on warning-subtle', t.warning[10], t.warning[2], ...txt, 'text', 'warning', 10], ['danger-text on danger-subtle', t.danger[10], t.danger[2], ...txt, 'text', 'danger', 10],
    ['focus ring vs page [UI 3:1]', focus, page, 3, 30, 'ui', 'accent', dark ? 10 : 8], ['focus ring vs surface [UI 3:1]', focus, surface, 3, 30, 'ui', 'accent', dark ? 10 : 8],
    ['accent-solid vs page [UI 3:1]', a[8], page, 3, 30, 'ui', 'accent', 8],
    ['border-strong (n8) vs surface [UI]', n[7], surface, 1.5, 15, 'ui', 'neutral', 7], ['idle graphic (n9) vs surface [UI 3:1]', n[8], surface, 3, 30, 'ui', 'neutral', 8],
  ];
}

// Measure every pair in both themes. Returns rows: { theme, label, fg, bg, w, lc, ok, note, kind, ramp, step }.
export function measure(R, { high = false } = {}) {
  const rows = [];
  for (const k of ['light', 'dark']) {
    for (const [label, fg, bg, min, lcMin, kind, rampName, step] of pairs(R[k], { dark: k === 'dark', high })) {
      const w = wcag(fg, bg), lc = Math.abs(apca(fg, bg));
      const wOk = w >= min - 1e-9, lOk = lc >= lcMin;
      rows.push({ theme: k, label, fg, bg, w, lc, ok: kind === 'ui' ? wOk : wOk && lOk, note: kind === 'ui' && wOk && !lOk, kind, ramp: rampName, step });
    }
    // Derived colors (charts, chart track, accent gradient): WCAG only (graphics 3:1, track 1.4:1, text on the gradient 4.5:1).
    const x = R.extra && R.extra[k];
    if (!x) continue;
    const n = R[k].neutral, a = R[k].accent, surface = k === 'dark' ? n[2] : n[0];
    const extra = [];
    x.chart.forEach((c, i) => chartGrounds(n, k === 'dark').forEach((g, j) => extra.push([`chart-${i + 1} vs ${['surface', 'page', k === 'dark' ? 'raised' : 'inset', 'inset'][j]} [UI 3:1]`, c, g, 3])));
    extra.push(['chart-track vs surface [UI 1.4:1]', n[x.track], surface, 1.4]);
    x.gradient.forEach((i, j) => extra.push([`on-accent on accent-gradient ${j ? 'end' : 'start'}`, x.onAccent, a[i], 4.5]));
    for (const [label, fg, bg, min] of extra) {
      const w = wcag(fg, bg), lc = Math.abs(apca(fg, bg));
      rows.push({ theme: k, label, fg, bg, w, lc, ok: w >= min - 1e-9, note: false, kind: 'derived', ramp: 'derived', step: -1 });
    }
  }
  return rows;
}

export function report(R, opts) {
  const lines = [];
  for (const k of ['light', 'dark']) {
    lines.push(`\n=== ${k}`);
    for (const [name, r] of Object.entries(R[k])) lines.push(name.padEnd(8) + ' ' + r.join(' '));
    for (const row of measure(R, opts).filter(r => r.theme === k)) {
      const tag = !row.ok ? 'FAIL' : row.note ? 'note' : 'ok  ';
      lines.push(`${tag} ${row.label.padEnd(42)} ${row.fg} on ${row.bg}  ${row.w.toFixed(2)}:1  Lc ${row.lc.toFixed(1)}`);
    }
  }
  return lines.join('\n');
}

// CLI: print the default ramps, their measurements and the JSON (tokens.mjs used to read this).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const R = buildRamps();
  console.log(report(R));
  console.log('\n"note" = a graphic passes WCAG 3:1 (required) but is under the APCA Lc 30 aim.');
  console.log('\nJSON=' + JSON.stringify(R));
}
