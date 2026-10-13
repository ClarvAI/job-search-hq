#!/usr/bin/env bash
# Theme engine fixtures (needs node): every preset and some hard brand colors produce the full token block with
# passing contrast (charts, track, gradient included); layout_* keys are validated and written only to the
# data-layout attribute; the Custom CSS region and data blocks survive re-theming and --regenerate; --preview --layouts
# writes every layout. Works on a throwaway copy of the workspace; the repository is never written.
# Usage: bash scripts/ci/theme-fixtures.sh      Exits 1 on any failure.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
command -v node >/dev/null 2>&1 || { echo "skip: node not found"; exit 0; }
T="$(mktemp -d "${TMPDIR:-/tmp}/theme-fixtures.XXXXXX")" || exit 2
trap 'rm -rf "$T"' EXIT
fails=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; fails=$((fails + 1)); }
AT="$REPO/.claude/skills/page-design/scripts/apply-theme.mjs"

# 1. Token block for every preset and brand edge cases.
node --input-type=module - "$REPO" <<'JS' || fails=$((fails + 1))
const repo = process.argv[2]
const T = await import(repo + '/.claude/skills/page-design/themes.mjs')
const K = await import(repo + '/.claude/skills/page-design/tokens.mjs')
const P = await import(repo + '/.claude/skills/page-design/palette.mjs')
const need = ['--color-bg-inset', '--color-bg-overlay', '--color-accent-gradient', '--shadow-overlay', '--radius-xl', '--radius-full',
  '--space-1', '--space-10', '--chart-1', '--chart-5', '--chart-track', '--text-display', '--text-subheading', '--text-label--letter-spacing', '--measure', '--avatar-bg', '--avatar-fg']
const cases = [...T.PRESET_NAMES.map(p => [p, {}, p]), ...['#e4572e', '#f5c400', '#00e5ff', '#777777', '#1a1a1a', '#ff0000'].map(c => [`brand ${c}`, { design: { preset: 'brand', accent: c } }, undefined])]
let bad = 0
for (const [name, parsed, preset] of cases) {
  const t = T.resolveTheme(parsed, { preset })
  if (t.errors.length) { console.log(`FAIL  ${name}: ${t.errors.join('; ')}`); bad++; continue }
  const f = T.fixContrast(t.spec); t.spec = f.spec
  const block = K.tokenBlock(t, f.R)
  const missing = need.filter(n => !block.includes(n + ':'))
  const fails = f.fails.map(r => `${r.theme} ${r.label} ${r.w.toFixed(2)}`)
  const derived = P.measure(f.R, { high: t.spec.contrast === 'high' }).filter(r => r.ramp === 'derived')
  if (missing.length || fails.length || derived.length < 30) { console.log(`FAIL  ${name}: missing ${missing.join(' ') || '-'}; contrast ${fails.join(', ') || '-'}; derived rows ${derived.length}`); bad++ }
  else console.log(`ok    tokens ${name} (${derived.length} derived pairs measured)`)
}
// Layout validation
const good = T.resolveTheme({ design: { preset: 'default', layout_portfolio: 'Bento' }, documents: { layout_resume: 'compact' } })
if (good.errors.length || good.layouts.layout_portfolio !== 'bento' || good.layouts.layout_resume !== 'compact' || good.layouts.layout_dashboard !== 'overview') { console.log('FAIL  layout keys not read'); bad++ } else console.log('ok    layout keys read, defaults filled')
const wrong = T.resolveTheme({ design: { preset: 'default', layout_dashboard: 'grid' } })
if (!wrong.errors.some(e => e.includes('layout_dashboard'))) { console.log('FAIL  unknown layout accepted'); bad++ } else console.log('ok    unknown layout rejected')
// New layout values are accepted
const more = T.resolveTheme({ design: { preset: 'default', layout_dashboard: 'timeline', layout_flashcards: 'cards', layout_portfolio: 'column' }, documents: { layout_designed: 'portrait' } })
if (more.errors.length || more.layouts.layout_dashboard !== 'timeline' || more.layouts.layout_flashcards !== 'cards' || more.layouts.layout_portfolio !== 'column' || more.layouts.layout_designed !== 'portrait') { console.log('FAIL  timeline/cards/column/portrait layouts not read: ' + more.errors.join('; ')); bad++ } else console.log('ok    timeline, cards, column and portrait layouts read')
// Status colors stay unlike the accent: a red-orange brand moves the "problem" red inside the red family until the
// text colors differ by 8 (OKLab x100) in light mode; the presets' status hues don't move.
for (const [acc, want] of [['#e4572e', 8], ['#f97316', 8]]) {
  const t = T.resolveTheme({ design: { preset: 'brand', accent: acc } }), f = T.fixContrast(t.spec), dist = T.statusDistance(f.R)
  const inBand = t.spec.hues.danger >= 0 && t.spec.hues.danger <= 40
  if (dist.danger.light < want - 0.05 || !inBand || !t.notes.some(n => n.includes('"problem" red'))) { console.log(`FAIL  ${acc}: danger hue ${t.spec.hues.danger}, difference ${dist.danger.light.toFixed(1)}`); bad++ }
  else console.log(`ok    ${acc}: "problem" red moved to hue ${Math.round(t.spec.hues.danger)} (difference ${dist.danger.light.toFixed(1)} light, ${dist.danger.dark.toFixed(1)} dark)`)
}
for (const name of T.PRESET_NAMES) { const t = T.resolveTheme({}, { preset: name }); if (t.notes.some(n => n.startsWith('Moved the'))) { console.log(`FAIL  preset ${name} moves a status color`); bad++ } }
console.log('ok    no preset moves a status color')
// Fonts line: shipped fonts load from templates/assets/ with the Google stylesheet only as a fallback; Lexend
// (not shipped) gets its own Google tag; all-system fonts load nothing.
const fl = name => K.fontsLink(T.resolveTheme({}, { preset: name }), '../templates/assets/')
if (!/^<link rel="stylesheet" href="\.\.\/templates\/assets\/fonts\/fonts\.css" data-fallback="https:\/\/fonts\.googleapis\.com[^"]*" onerror="[^"]*">$/.test(fl('default'))) { console.log('FAIL  default fonts line: ' + fl('default')); bad++ } else console.log('ok    default fonts line is local with a Google fallback')
if (!/fonts\.css[^>]*><link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Lexend/.test(fl('high-contrast'))) { console.log('FAIL  high-contrast fonts line: ' + fl('high-contrast')); bad++ } else console.log('ok    high-contrast: shipped fonts local, Lexend from Google')
const sys = K.fontsLink(T.resolveTheme({ design: { preset: 'brand', font_heading: 'Georgia', font_body: 'Arial', font_mono: 'ui-monospace' } }))
if (sys !== '<link rel="stylesheet" href="data:text/css,">') { console.log('FAIL  system fonts line: ' + sys); bad++ } else console.log('ok    system fonts load nothing')
for (const f of ['Garamond', 'Roboto', 'Source Sans 3', 'Open Sans']) if (!K.documentBlock({ font: f, accent: '#111111', density: 'standard', paper: 'Letter' }, 'resume').includes('@import url("../../templates/assets/fonts/documents.css")')) { console.log(`FAIL  ${f} resume font not local`); bad++ }
console.log('ok    the four shipped resume fonts load from documents.css')
const forced = T.resolveTheme({ design: { preset: 'default', layout_brief: 'detailed' } }, { preset: 'modern' })
if (forced.layouts.layout_brief !== 'detailed') { console.log('FAIL  --preset dropped the layout'); bad++ } else console.log('ok    a forced preset keeps layouts')
process.exit(bad ? 1 : 0)
JS

# 2. A throwaway workspace: apply, layouts, custom region, data block, preview, regenerate.
W="$T/ws"
mkdir -p "$W/profile" "$W/pages" "$W/jobs/acme-analyst"
cp "$REPO/AGENTS.md" "$W/"
cp -R "$REPO/templates" "$W/"
cp "$W"/templates/blank/pages/*.html "$W/pages/"
cp "$W/templates/blank/pages/interview-brief.html" "$W/jobs/acme-analyst/"
sed -e 's/^layout_portfolio:.*$/layout_portfolio: editorial/' -e 's/^layout_dashboard:.*$/layout_dashboard: board/' \
    -e 's/^layout_brief:.*$/layout_brief: detailed/' -e 's/^layout_resume:.*$/layout_resume: compact/' \
    "$W/templates/blank/profile/design.md" > "$W/profile/design.md"
grep -q '^layout_portfolio: editorial' "$W/profile/design.md" && ok "blank design.md has the layout keys" || bad "blank design.md has no layout_portfolio key"
# Put some user CSS in the dashboard's Custom region (add the region if the page has none).
node -e '
const fs = require("fs"), f = process.argv[1]; let s = fs.readFileSync(f, "utf8")
if (s.includes("/* ---- Custom ---- */")) s = s.replace("/* ---- Custom ---- */", "/* ---- Custom ---- */\n  .fixture-custom { color: var(--chart-2); }")
else s = s.replace("  /* ---- End design tokens ---- */", "  /* ---- End design tokens ---- */\n  /* ---- Custom ---- */\n  .fixture-custom { color: var(--chart-2); }\n  /* ---- End custom ---- */")
fs.writeFileSync(f, s)' "$W/pages/dashboard.html"
data_before="$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const m=s.match(/id="data">([\s\S]*?)<\/script>/);process.stdout.write(m?m[1]:"")' "$W/pages/dashboard.html")"
out="$(node "$AT" --root "$W" 2>&1)"; echo "$out" | tail -1
echo "$out" | grep -q '^result: done' && ok "apply-theme ran" || bad "apply-theme: $out"
grep -q '<html lang="en" data-layout="board">' "$W/pages/dashboard.html" && ok "dashboard data-layout=board" || bad "dashboard layout not written"
grep -q '<html lang="en" data-layout="editorial">' "$W/pages/portfolio.html" && ok "portfolio data-layout=editorial" || bad "portfolio layout not written"
grep -q '<html lang="en" data-layout="detailed">' "$W/jobs/acme-analyst/interview-brief.html" && ok "job brief data-layout=detailed" || bad "job brief layout not written"
grep -q 'data-layout="compact"' "$W/profile/templates/resume-template.html" 2>/dev/null && grep -q 'data-layout="compact"' "$W/profile/templates/cover-letter-template.html" 2>/dev/null \
  && ok "resume and cover letter copies made with layout compact" || bad "resume/cover letter copies missing the compact layout"
grep -q 'fixture-custom' "$W/pages/dashboard.html" && ok "custom region kept" || bad "custom region lost"
data_after="$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const m=s.match(/id="data">([\s\S]*?)<\/script>/);process.stdout.write(m?m[1]:"")' "$W/pages/dashboard.html")"
[ "$data_before" = "$data_after" ] && ok "data block unchanged" || bad "data block changed"
grep -q -- '--chart-1:' "$W/pages/flashcards.html" && ok "new tokens written" || bad "new tokens missing from pages"
node "$AT" --root "$W" --check | grep -q '(0 differ' && ok "--check clean after apply" || bad "--check reports differences after apply"
cmp -s "$REPO/templates/resume-template.html" "$W/templates/resume-template.html" && ok "app template untouched" || bad "app template was written"
# Unknown layout: error, nothing changed
sed 's/^layout_portfolio: editorial/layout_portfolio: grid/' "$W/profile/design.md" > "$T/bad.md"
before="$(cat "$W/pages/portfolio.html")"
node "$AT" --root "$W" --design "$T/bad.md" >"$T/bad.out" 2>&1 && bad "unknown layout accepted" || { grep -q 'layout_portfolio "grid"' "$T/bad.out" && ok "unknown layout: error"; }
[ "$before" = "$(cat "$W/pages/portfolio.html")" ] && ok "nothing changed on error" || bad "a page changed on error"
# Layout previews
out="$(node "$AT" --root "$W" --preview --layouts all 2>&1)"
n=0; for f in "$W"/pages/.preview/*-*.html; do [ -f "$f" ] && n=$((n + 1)); done
[ "$n" -ge 24 ] && ok "--preview --layouts all wrote $n files" || bad "--preview --layouts: $out"
grep -q 'data-layout="bento"' "$W/pages/.preview/portfolio-bento.html" && ok "preview carries its layout" || bad "portfolio-bento preview wrong"
node "$AT" --root "$W" --preview --layouts nope >/dev/null 2>&1 && bad "unknown preview page accepted" || ok "unknown preview page rejected"
# Asset paths follow each file's folder; the publish copy goes back to the pinned CDN files.
grep -q 'src="../templates/assets/lib/tailwindcss-browser-4.1.13.js"' "$W/pages/dashboard.html" && ok "page in pages/ loads Tailwind from ../templates/assets/" || bad "pages/dashboard.html asset path"
grep -q 'src="../../templates/assets/lib/tailwindcss-browser-4.1.13.js"' "$W/jobs/acme-analyst/interview-brief.html" && ok "brief in jobs/<folder>/ loads Tailwind from ../../templates/assets/" || bad "job brief asset path"
grep -q 'fonts.googleapis.com/css2' "$W/pages/dashboard.html" && ! grep -q 'rel="preconnect"' "$W/pages/dashboard.html" && ok "Google Fonts only as data-fallback, no preconnect" || bad "dashboard still preconnects or lost its fallback"
for f in academic-cv federal-resume europass-cv designed-portrait flashcards-cards dashboard-timeline portfolio-column; do
  [ -f "$W/pages/.preview/$f.html" ] && ok "preview $f" || bad "no preview $f"
done
node --input-type=module -e '
const A = await import(process.argv[1] + "/.claude/skills/page-design/assets.mjs")
const fs = await import("node:fs")
const out = A.toCdn(fs.readFileSync(process.argv[2], "utf8"))
const okay = !out.includes("templates/assets/") && out.includes("integrity=\"sha384-P0V9YU7TFy919I0oVLXiqiUsdiJiaV+QKGysF4Lx+s901F1X9+zjFV0mc6pRKCKq\" crossorigin=\"anonymous\"") && out.includes("href=\"https://fonts.googleapis.com/css2")
process.exit(okay ? 0 : 1)' "$REPO" "$W/pages/flashcards.html" && ok "publish copy (toCdn) uses the pinned CDN files with integrity" || bad "toCdn left local paths or dropped integrity"
node "$REPO/scripts/ci/visual/build-assets.mjs" --check >"$T/assets.out" 2>&1 && ok "templates/assets matches its manifest ($(tail -1 "$T/assets.out"))" || bad "templates/assets: $(cat "$T/assets.out")"

# --regenerate keeps the user's Custom CSS
node -e '
const fs = require("fs"), f = process.argv[1]; let s = fs.readFileSync(f, "utf8")
if (!s.includes("/* ---- Custom ---- */")) process.exit(3)
fs.writeFileSync(f, s.replace("/* ---- Custom ---- */", "/* ---- Custom ---- */\n  .fixture-resume { letter-spacing: 0; }"))' "$W/profile/templates/resume-template.html"
if [ $? -eq 3 ]; then echo "skip  regenerate custom carry-over (resume template has no Custom region yet)"
else
  printf '\n<!-- new app version -->\n' >> "$W/templates/resume-template.html"
  node "$AT" --root "$W" --regenerate resume-template.html >/dev/null 2>&1
  grep -q 'fixture-resume' "$W/profile/templates/resume-template.html" && grep -q 'new app version' "$W/profile/templates/resume-template.html" \
    && ok "--regenerate carries the Custom region over" || bad "--regenerate lost the Custom region"
fi
# A second refresh never overwrites a .previous.html that differs (e.g. edited by hand): it moves to .previous-2.html.
P="$W/profile/templates"
if [ -f "$P/resume-template.previous.html" ]; then
  printf '\n<!-- hand edit in previous -->\n' >> "$P/resume-template.previous.html"
  before_regen="$(cat "$P/resume-template.html")"
  printf '\n<!-- newer app version -->\n' >> "$W/templates/resume-template.html"
  out="$(node "$AT" --root "$W" --regenerate resume-template.html 2>&1)"
  grep -q 'hand edit in previous' "$P/resume-template.previous-2.html" 2>/dev/null \
    && [ "$(cat "$P/resume-template.previous.html")" = "$before_regen" ] && echo "$out" | grep -q 'previous-2.html' \
    && ok "a second --regenerate keeps the edited .previous.html as .previous-2.html" || bad "second --regenerate overwrote .previous.html: $out"
  printf '\n<!-- newest app version -->\n' >> "$W/templates/resume-template.html"
  node "$AT" --root "$W" --regenerate resume-template.html >/dev/null 2>&1
  [ -f "$P/resume-template.previous-3.html" ] && grep -q 'hand edit in previous' "$P/resume-template.previous-2.html" \
    && ok "a third --regenerate uses .previous-3.html and leaves -2 alone" || bad "third --regenerate: numbering wrong"
else
  bad "no resume-template.previous.html after --regenerate"
fi
echo
[ "$fails" -eq 0 ] && { echo "theme fixtures: all passed"; exit 0; }
echo "theme fixtures: $fails failed"; exit 1
