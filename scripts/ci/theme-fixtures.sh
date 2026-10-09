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
[ "$n" -ge 17 ] && ok "--preview --layouts all wrote $n files" || bad "--preview --layouts: $out"
grep -q 'data-layout="bento"' "$W/pages/.preview/portfolio-bento.html" && ok "preview carries its layout" || bad "portfolio-bento preview wrong"
node "$AT" --root "$W" --preview --layouts nope >/dev/null 2>&1 && bad "unknown preview page accepted" || ok "unknown preview page rejected"
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
echo
[ "$fails" -eq 0 ] && { echo "theme fixtures: all passed"; exit 0; }
echo "theme fixtures: $fails failed"; exit 1
