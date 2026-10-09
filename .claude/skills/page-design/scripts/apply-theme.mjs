#!/usr/bin/env node
// Applies the theme in profile/design.md to every page and to the user's copies of the print templates, deterministically.
//
// Usage (from the workspace folder):
//   node .claude/skills/page-design/scripts/apply-theme.mjs            check contrast, then update the files below
//   node .claude/skills/page-design/scripts/apply-theme.mjs --check    check and compare only; changes nothing
//   node .claude/skills/page-design/scripts/apply-theme.mjs --print    show the resolved theme, contrast table and token block
//   node .claude/skills/page-design/scripts/apply-theme.mjs --check-blank   confirm templates/blank/pages/ and templates/*.html
//        are still on the Default preset (maintainers, CI)
//   node .claude/skills/page-design/scripts/apply-theme.mjs --preview [folder]
//        write a sample dashboard in every preset (and the user's own theme) to pages/.preview/ (or [folder]);
//        changes nothing else
//   node .claude/skills/page-design/scripts/apply-theme.mjs --preview [folder] --layouts [page,...|all]
//        write every layout of a page (dashboard, flashcards, brief, portfolio, resume, cover-letter, designed) with
//        sample content in the current theme to pages/.preview/<page>-<layout>.html; changes nothing else
//   node .claude/skills/page-design/scripts/apply-theme.mjs --regenerate <name,...|all>
//        after an update changed an app template: rebuild profile/templates/<name> from the new templates/<name>
//        plus the theme, keeping the old copy as profile/templates/<name minus .html>.previous.html. Pages are not touched.
// Options: --preset <default|modern|minimal|high-contrast> (use a preset instead of the design block),
//          --design <file> (read another design file), --root <folder> (another workspace; used by tests).
// Maintainers: --build-presets rewrites presets/<name>.md (the precomputed blocks used when Node is missing);
//              --write-blank puts templates/blank/pages/*.html and templates/*.html on the Default preset and the default
//              layouts (token/theme block, fonts line, data-layout only), so --check-blank passes.
//
// Layouts: the layout_* keys in profile/design.md (design block: layout_dashboard, layout_flashcards, layout_brief,
// layout_portfolio; documents block: layout_resume, also used by the cover letter, and layout_designed) set only the
// data-layout attribute of each file's <html lang="..."> tag. Unknown values are an error. The user's own CSS lives in
// an optional "/* ---- Custom ---- */ ... /* ---- End custom ---- */" region, which this script never changes
// (--regenerate carries it over to the new template).
//
// Files it themes: pages/*.html and jobs/*/interview-brief.html (the token block between
// "/* ---- Design tokens" and "/* ---- End design tokens ---- */", plus the Google Fonts line), and the user's
// template copies in profile/templates/: resume-template.html and cover-letter-template.html (the document theme
// block only) and resume-designed-template.html (the designed resume block and the fonts line).
// The app's own templates/*.html are never written (they stay on the Default look, so git pull and /update never
// meet a changed app file). When the theme makes a template differ from the app's copy and the user has no copy yet,
// the themed copy is created in profile/templates/. tailor-resume and cover-letter use profile/templates/<name>
// when it exists, else templates/<name>. profile/templates/.generated.json remembers what this script last wrote,
// so --regenerate can tell whether the user changed a copy by hand.
// Never touches templates/ (including templates/blank/), data blocks, or resumes already made for a job.
// The workspace may have no pages/ or jobs/ yet (a fresh download before the first run).
//
// Output: "theme: ...", "contrast: ok ..." or FAIL lines, "adjusted: ..." / "note: ...", one line per file
// ("updated:", "created:", "refreshed:", "unchanged:", "differs:", "skipped:"), and a last line "result: ..." or "error: ...".
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wcag, report } from '../palette.mjs'
import { parseDesign, resolveTheme, fixContrast, PRESETS, PRESET_NAMES, DOC_FONTS, DOC_DENSITY, LAYOUTS, DEFAULT_LAYOUTS, layoutFor } from '../themes.mjs'
import { tokenBlock, designedBlock, documentBlock, fontsLink, FONTS_LINK_RE, MARK } from '../tokens.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = f => args.includes(f)
const opt = f => { const i = args.indexOf(f); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }
process.stdout.on('error', () => {}) // a reader that stops early (| head) must not crash a write in progress
const out = s => process.stdout.write(s + '\n')
const die = s => { out('error: ' + s); process.exit(1) }

const ROOT = path.resolve(opt('--root') || path.join(here, '..', '..', '..', '..'))
if (!fs.existsSync(path.join(ROOT, 'AGENTS.md'))) die(`${ROOT} is not a Job Search HQ workspace (no AGENTS.md)`)
const rel = p => path.relative(ROOT, p).split(path.sep).join('/')

// ---- Resolve the theme -------------------------------------------------------------------------
function loadTheme(presetOverride) {
  const designFile = opt('--design') ? path.resolve(opt('--design')) : path.join(ROOT, 'profile', 'design.md')
  let parsed = {}
  const notes = []
  if (fs.existsSync(designFile)) {
    parsed = parseDesign(fs.readFileSync(designFile, 'utf8'))
    if (!parsed.design) notes.push(`${rel(designFile)} has no \`\`\`design block; using the Default preset.`)
  } else notes.push('profile/design.md not found; using the Default preset (setup or page-design creates it).')
  const t = resolveTheme(parsed, { preset: presetOverride || undefined })
  if (t.errors.length) die(t.errors.join('; ') + ' (in profile/design.md; nothing was changed)')
  const f = fixContrast(t.spec)
  t.spec = f.spec
  t.notes = notes.concat(t.notes)
  return { t, R: f.R, adjustments: f.adjustments, fails: f.fails }
}

function contrastLines({ t, R, fails }) {
  const lines = []
  if (fails.length) {
    for (const r of fails) lines.push(`FAIL ${r.theme} ${r.label}: ${r.fg} on ${r.bg} ${r.w.toFixed(2)}:1, Lc ${r.lc.toFixed(0)}`)
  }
  // Print colors: designed resume text on white paper, and the documents accent.
  const n = R.light.neutral, a = R.light.accent
  const paper = [['designed resume text', n[11]], ['designed resume secondary text', n[10]], ['designed resume accent text', a[10]], ['resume/cover letter accent', t.docs.accent]]
  const paperFails = paper.filter(([, c]) => wcag(c, '#ffffff') < 4.5)
  for (const [label, c] of paperFails) lines.push(`FAIL print ${label}: ${c} on #ffffff ${wcag(c, '#ffffff').toFixed(2)}:1`)
  return { lines, ok: !fails.length && !paperFails.length }
}

// ---- Edit helpers ------------------------------------------------------------------------------
function replaceRegion(html, start, end, block, legacyEnd) {
  const i = html.indexOf(start)
  if (i < 0) return null
  let j = html.indexOf(end, i)
  if (j >= 0) j += end.length
  else if (legacyEnd) j = legacyEnd(html, i)
  if (j < 0 || j == null) return null
  return html.slice(0, i) + block + html.slice(j)
}
// Pages made before the end marker existed: the block ends with the closing brace of the :root[data-theme="dark"] rule.
function legacyPageEnd(html, i) {
  const k = html.indexOf('\n  :root[data-theme="dark"] {', i)
  if (k < 0) return -1
  const e = html.indexOf('\n  }', k + 5)
  return e < 0 ? -1 : e + 4
}
const dataBlock = html => { const m = html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/); return m ? m[1] : null }
// The user's own CSS: "/* ---- Custom ---- */ ... /* ---- End custom ---- */" after the token block. Never changed here.
const CUSTOM_RE = /\/\* ---- Custom ---- \*\/([\s\S]*?)\/\* ---- End custom ---- \*\//
const customRegion = html => { const m = html.match(CUSTOM_RE); return m ? m[1] : null }
// The layout: only the data-layout attribute of the <html lang="..."> tag. A page without that exact tag
// (made before layouts existed and edited by hand) keeps its tag as it is.
const HTML_TAG_RE = /<html lang="([^"]*)"( data-layout="[^"]*")?>/
function setLayout(html, value) {
  if (!value || !HTML_TAG_RE.test(html)) return html
  return html.replace(HTML_TAG_RE, (_, lang) => `<html lang="${lang}" data-layout="${value}">`)
}
const layoutOf = html => { const m = html.match(HTML_TAG_RE); return m && m[2] ? m[2].slice(14, -1) : null }
// Shipped copies: the Custom region is there and empty, so a user's own CSS has a home and none ships by default.
function blankProblem(html) {
  const c = customRegion(html)
  if (c == null) return 'no "/* ---- Custom ---- */ ... /* ---- End custom ---- */" region'
  if (c.trim()) return 'the Custom region should ship empty'
  return null
}
function blankReasons(html, themed, name, tokenMsg) {
  const want = layoutFor(DEFAULT_LAYOUTS, name), why = []
  if (want && layoutOf(html) !== want) why.push(`<html lang="..."> should carry data-layout="${want}"`)
  if (setLayout(html, want) !== themed) why.push(tokenMsg)
  return why.join('; ')
}
function guard(html, next) {
  if (dataBlock(next) !== dataBlock(html)) return { skip: 'data block would change (refused)' }
  if (customRegion(next) !== customRegion(html)) return { skip: 'your custom CSS region would change (refused)' }
  return { html: next }
}

function themePage(html, t, R, file) {
  const block = tokenBlock(t, R)
  let next = replaceRegion(html, MARK.pageStart, MARK.pageEnd, block, legacyPageEnd)
  if (next == null) return { skip: 'no design-token block found' }
  if (FONTS_LINK_RE.test(next)) next = next.replace(FONTS_LINK_RE, fontsLink(t))
  else return { skip: 'no fonts line found' }
  next = setLayout(next, file ? layoutFor(t.layouts, file) : null)
  return guard(html, next)
}
function themeDoc(html, t, kind, file) {
  let next = replaceRegion(html, MARK.docStart, MARK.docEnd, documentBlock(t.docs, kind))
  if (next == null) return { skip: 'no document theme block found' }
  next = setLayout(next, file ? layoutFor(t.layouts, file) : null)
  return guard(html, next)
}
function themeDesigned(html, t, R, file) {
  let next = replaceRegion(html, MARK.designedStart, MARK.designedEnd, designedBlock(t, R))
  if (next == null) return { skip: 'no designed resume block found' }
  if (FONTS_LINK_RE.test(next)) next = next.replace(FONTS_LINK_RE, fontsLink(t))
  next = setLayout(next, file ? layoutFor(t.layouts, file) : null)
  return guard(html, next)
}

function targets() {
  const list = []
  const pagesDir = path.join(ROOT, 'pages')
  if (fs.existsSync(pagesDir)) for (const f of fs.readdirSync(pagesDir).sort()) if (f.endsWith('.html')) list.push({ file: path.join(pagesDir, f), kind: 'page' })
  const jobsDir = path.join(ROOT, 'jobs')
  if (fs.existsSync(jobsDir)) for (const d of fs.readdirSync(jobsDir).sort()) {
    const f = path.join(jobsDir, d, 'interview-brief.html')
    if (fs.existsSync(f) && !fs.lstatSync(path.join(jobsDir, d)).isSymbolicLink()) list.push({ file: f, kind: 'page' })
  }
  return list
}

function apply({ t, R }, { write }) {
  let updated = 0, same = 0, differs = 0, skipped = 0
  for (const { file, kind } of targets()) {
    if (fs.lstatSync(file).isSymbolicLink()) { out(`skipped: ${rel(file)} (a link; only real files are changed)`); skipped++; continue }
    const html = fs.readFileSync(file, 'utf8')
    const r = themePage(html, t, R, file)
    if (r.skip) { out(`skipped: ${rel(file)} (${r.skip})`); skipped++; continue }
    if (r.html === html) { out(`unchanged: ${rel(file)}`); same++; continue }
    if (!write) { out(`differs: ${rel(file)}`); differs++; continue }
    fs.writeFileSync(file, r.html)
    out(`updated: ${rel(file)}`); updated++
  }
  const tr = applyTemplates({ t, R }, { write })
  return { updated: updated + tr.updated, same: same + tr.same, differs: differs + tr.differs, skipped: skipped + tr.skipped }
}

// ---- Print templates: the app's copy (templates/) stays as shipped; the user's themed copy lives in profile/templates/ ----
const TEMPLATES = [['resume-template.html', 'resume'], ['cover-letter-template.html', 'letter'], ['resume-designed-template.html', 'designed']]
const USER_TPL = path.join(ROOT, 'profile', 'templates')
const RECORD = path.join(USER_TPL, '.generated.json')
const sha = s => crypto.createHash('sha256').update(s.replace(/\r/g, '')).digest('hex')
const previousName = name => name.replace(/\.html$/, '.previous.html')
function readRecord() { try { const r = JSON.parse(fs.readFileSync(RECORD, 'utf8')); return r && typeof r === 'object' ? r : {} } catch { return {} } }
function writeRecord(r) { fs.writeFileSync(RECORD, JSON.stringify(r, null, 2) + '\n') }
function themeTemplate(html, kind, t, R, name) { return kind === 'designed' ? themeDesigned(html, t, R, name) : themeDoc(html, t, kind, name) }
function isLink(f) { try { return fs.lstatSync(f).isSymbolicLink() } catch { return false } }
function userTemplatesOk() {
  if (isLink(path.join(ROOT, 'profile')) || isLink(USER_TPL)) { out('skipped: profile/templates/ (a link; only real folders are changed)'); return false }
  return true
}

function applyTemplates({ t, R }, { write }) {
  let updated = 0, same = 0, differs = 0, skipped = 0
  if (!userTemplatesOk()) return { updated, same, differs, skipped: 1 }
  const record = readRecord()
  let recordChanged = false
  for (const [name, kind] of TEMPLATES) {
    const product = path.join(ROOT, 'templates', name), mine = path.join(USER_TPL, name)
    if (fs.existsSync(mine)) {
      if (isLink(mine)) { out(`skipped: ${rel(mine)} (a link; only real files are changed)`); skipped++; continue }
      const html = fs.readFileSync(mine, 'utf8')
      const r = themeTemplate(html, kind, t, R, name)
      if (r.skip) { out(`skipped: ${rel(mine)} (${r.skip})`); skipped++; continue }
      if (r.html === html) { out(`unchanged: ${rel(mine)}`); same++; continue }
      if (!write) { out(`differs: ${rel(mine)}`); differs++; continue }
      fs.writeFileSync(mine, r.html)
      // Only a copy this script made and nobody changed since stays "as generated"; a hand-edited one keeps its old record.
      if (record[name] === sha(html)) { record[name] = sha(r.html); recordChanged = true }
      out(`updated: ${rel(mine)}`); updated++
      continue
    }
    if (!fs.existsSync(product)) { out(`skipped: templates/${name} (missing; restore the app's files with /update or a fresh download)`); skipped++; continue }
    const base = fs.readFileSync(product, 'utf8')
    const r = themeTemplate(base, kind, t, R, name)
    if (r.skip) { out(`skipped: templates/${name} (${r.skip})`); skipped++; continue }
    if (r.html === base) { out(`unchanged: templates/${name} (the app's copy already has this look; no copy of your own needed)`); same++; continue }
    if (!write) { out(`differs: ${rel(mine)} (not made yet; applying the theme creates it from templates/${name})`); differs++; continue }
    fs.mkdirSync(USER_TPL, { recursive: true })
    fs.writeFileSync(mine, r.html)
    record[name] = sha(r.html); recordChanged = true
    out(`created: ${rel(mine)} (templates/${name} with your theme)`); updated++
  }
  if (write && recordChanged) writeRecord(record)
  return { updated, same, differs, skipped }
}

// After an update changed templates/<name>: rebuild the user's copy from the new app template plus the theme.
function regenerate({ t, R }, which) {
  const names = which === 'all' ? TEMPLATES.map(x => x[0]) : which.split(',').map(s => s.trim().replace(/^.*\//, '')).filter(Boolean)
  for (const n of names) if (!TEMPLATES.some(x => x[0] === n)) die(`--regenerate: unknown template "${n}" (use ${TEMPLATES.map(x => x[0]).join(', ')} or all)`)
  if (!userTemplatesOk()) die('profile/templates/ is a link; nothing was changed')
  const record = readRecord()
  let n = 0, kept = 0
  for (const [name, kind] of TEMPLATES) {
    if (!names.includes(name)) continue
    const product = path.join(ROOT, 'templates', name), mine = path.join(USER_TPL, name)
    if (!fs.existsSync(product)) { out(`skipped: templates/${name} (missing)`); continue }
    const r = themeTemplate(fs.readFileSync(product, 'utf8'), kind, t, R, name)
    if (r.skip) { out(`skipped: templates/${name} (${r.skip})`); continue }
    if (!fs.existsSync(mine)) {
      // No copy of their own: the app's template is used as is, unless the theme now makes it differ.
      if (r.html === fs.readFileSync(product, 'utf8')) { out(`unchanged: templates/${name} (no copy of your own needed)`); continue }
      fs.mkdirSync(USER_TPL, { recursive: true })
      fs.writeFileSync(mine, r.html); record[name] = sha(r.html); n++
      out(`created: ${rel(mine)} (the new templates/${name} with your theme)`)
      continue
    }
    if (isLink(mine)) { out(`skipped: ${rel(mine)} (a link; only real files are changed)`); continue }
    const old = fs.readFileSync(mine, 'utf8')
    // The user's own CSS (the Custom region) moves over to the new version.
    const oldCustom = customRegion(old)
    const carried = oldCustom != null && oldCustom.trim() && customRegion(r.html) != null
    if (carried) r.html = r.html.replace(CUSTOM_RE, () => `/* ---- Custom ---- */${oldCustom}/* ---- End custom ---- */`)
    if (old === r.html) { out(`unchanged: ${rel(mine)}`); continue }
    const handEdited = record[name] !== sha(old)
    const prev = path.join(USER_TPL, previousName(name))
    fs.writeFileSync(prev, old)
    fs.writeFileSync(mine, r.html)
    record[name] = sha(r.html); n++
    if (handEdited) kept++
    out(`refreshed: ${rel(mine)} (the new version of the app's template, with your theme; the earlier copy is ${rel(prev)}${carried ? '; your Custom CSS region was carried over' : ''}${handEdited ? '; it has changes made by hand, so offer to carry the rest over' : ''})`)
  }
  writeRecord(record)
  return { n, kept }
}

// ---- Preview -----------------------------------------------------------------------------------
function sampleData() {
  const d = new Date(), iso = x => new Date(d.getTime() + x * 86400000).toISOString().slice(0, 10)
  return {
    example: false, generated: iso(0), owner: 'Theme preview (sample data)',
    goals: { applications: 5, conversations: 3, mocks: 1 }, week: { start: iso(-((d.getDay() + 6) % 7)), applications: 3, conversations: 1, mocks: 1 },
    history: [[2, 0, 0], [3, 1, 0], [1, 1, 1], [4, 2, 0], [3, 1, 1], [5, 2, 1], [2, 3, 0], [3, 1, 1]].map(([applications, conversations, mocks], i) => ({ week: iso(-7 * (8 - i) - ((d.getDay() + 6) % 7)), applications, conversations, mocks })),
    streak: 4,
    jobs: [
      { company: 'Example Labs', role: 'Product Marketing Manager', status: 'interviewing', fit: 5, priority: 'A', next: 'Prepare for the panel interview', due: iso(1), location: 'Remote' },
      { company: 'Sample Health', role: 'Senior Product Marketer', status: 'applied', fit: 4, priority: 'B', next: 'Follow up with the recruiter', due: iso(-1), location: 'Hybrid', applied: iso(-9) },
      { company: 'Demo Systems', role: 'Growth Marketing Manager', status: 'interested', fit: 3, priority: 'B', next: 'Tailor the resume', due: iso(0), deadline: iso(4), location: 'On site' },
      { company: 'Placeholder Inc.', role: 'Content Marketing Lead', status: 'rejected', fit: 2, priority: 'C', location: 'Remote', heard: true },
    ],
    contacts: [{ name: 'A. Sample', company: 'Example Labs', next: 'Thank-you note', due: iso(2) }],
  }
}
// Layout previews: each layout of a page (or document) with sample content, in the current theme.
const PREVIEW_SOURCES = {
  dashboard: ['templates/blank/pages/dashboard.html', 'page'],
  flashcards: ['templates/blank/pages/flashcards.html', 'page'],
  brief: ['templates/blank/pages/interview-brief.html', 'page'],
  portfolio: ['templates/blank/pages/portfolio.html', 'page'],
  resume: ['templates/resume-template.html', 'resume'],
  'cover-letter': ['templates/cover-letter-template.html', 'letter'],
  designed: ['templates/resume-designed-template.html', 'designed'],
}
const PAGE_ALIASES = { 'interview-brief': 'brief', 'resume-designed': 'designed', cover: 'cover-letter', letter: 'cover-letter' }
function previewLayouts(dir, which, th) {
  const want = String(which || 'all').toLowerCase().split(',').map(x => PAGE_ALIASES[x.trim()] || x.trim()).filter(Boolean)
  const names = want.includes('all') ? Object.keys(PREVIEW_SOURCES) : want
  for (const n of names) if (!PREVIEW_SOURCES[n]) die(`--layouts: unknown page "${n}" (use ${Object.keys(PREVIEW_SOURCES).join(', ')} or all)`)
  fs.mkdirSync(dir, { recursive: true })
  const made = []
  for (const name of names) {
    const [src, kind] = PREVIEW_SOURCES[name]
    const file = path.join(ROOT, src)
    if (!fs.existsSync(file)) die(`${src} is missing`)
    let base = fs.readFileSync(file, 'utf8')
    if (name === 'dashboard') {
      const json = JSON.stringify(sampleData(), null, 2).replace(/</g, '\\u003c')
      base = base.replace(/(<script type="application\/json" id="data">)[\s\S]*?(<\/script>)/, (_, a, b) => `${a}\n${json}\n${b}`)
    }
    const key = Object.keys(LAYOUTS).find(k => LAYOUTS[k].files.includes(path.basename(src)))
    const current = th.t.layouts[key]
    for (const layout of LAYOUTS[key].values) {
      const t = { ...th.t, layouts: { ...th.t.layouts, [key]: layout } }
      const r = kind === 'page' ? themePage(base, t, th.R, src) : themeTemplate(base, kind, t, th.R, path.basename(src))
      if (r.skip) die(`preview failed for ${src}: ${r.skip}`)
      const label = `${name} ${layout} layout${layout === current ? ' (your current one)' : ''}`
      const outFile = path.join(dir, `${name}-${layout}.html`)
      fs.writeFileSync(outFile, r.html.replace(/<title>[^<]*<\/title>/, `<title>Preview: ${label}</title>`))
      made.push(outFile); out(`preview: ${label}: ${outFile}`)
    }
  }
  return made
}
function preview(dir) {
  const src = path.join(ROOT, 'templates', 'blank', 'pages', 'dashboard.html')
  if (!fs.existsSync(src)) die('templates/blank/pages/dashboard.html is missing')
  const base = fs.readFileSync(src, 'utf8')
  const json = JSON.stringify(sampleData(), null, 2).replace(/</g, '\\u003c')
  const withData = base.replace(/(<script type="application\/json" id="data">)[\s\S]*?(<\/script>)/, (_, a, b) => `${a}\n${json}\n${b}`)
  fs.mkdirSync(dir, { recursive: true })
  const made = []
  const one = (name, theme) => {
    const r = themePage(withData, theme.t, theme.R, 'dashboard.html')
    if (r.skip) die(`preview failed: ${r.skip}`)
    const label = theme.t.label
    const file = path.join(dir, `theme-preview-${name}.html`)
    fs.writeFileSync(file, r.html.replace(/<title>[^<]*<\/title>/, `<title>${label} theme preview</title>`))
    made.push(file); out(`preview: ${label}: ${file}`)
  }
  for (const p of PRESET_NAMES) one(p, loadTheme(p))
  const mine = loadTheme(null)
  if (mine.t.preset === 'brand') one('yours', mine)
  return made
}

// ---- Precomputed presets (for the no-Node fallback) --------------------------------------------
// The documents block (ATS resume and cover letter) doesn't depend on the preset; it comes from design.md's documents block.
function docsSection() {
  const docs = { font: 'Arial', accent: '#111111', density: 'standard', paper: 'Letter' }
  const fonts = Object.entries(DOC_FONTS).map(([n, f]) => `| ${n} | \`${f.stack}\` | ${f.google ? `\`@import url("https://fonts.googleapis.com/css2?family=${f.google}&display=swap");\`` : 'none'} |`).join('\n')
  const dens = ['compact', 'standard', 'roomy'].map(d => `| ${d} | ${DOC_DENSITY.resume[d].join(' / ')} | ${DOC_DENSITY.letter[d].join(' / ')} |`).join('\n')
  return `## 4. Documents block (resume and cover letter; the same for every preset)

The ATS resume and cover letter take their look from the \`documents\` block of \`profile/design.md\`, not from the preset. Their themed copies live in \`profile/templates/\` (\`resume-template.html\`, \`cover-letter-template.html\`); if a copy isn't there yet, copy it from \`templates/\` first, and never edit the app's copies in \`templates/\`. Replace everything from \`  /* ---- Document theme\` through \`  /* ---- End document theme ---- */\` with the block below, then change its values to match the documents block, using the tables. The default (Arial, near-black, standard, Letter) for the resume:

\`\`\`css
${documentBlock(docs, 'resume')}
\`\`\`

and for the cover letter:

\`\`\`css
${documentBlock(docs, 'letter')}
\`\`\`

- \`--doc-font\`: the stack for the chosen font. Fonts with an \`@import\` line also need that line right after the block's first comment line (as the generator writes it); fonts without one have no \`@import\` line.

| Font | --doc-font | @import line |
|---|---|---|
${fonts}

- \`--doc-size\` / \`--doc-leading\` / \`@page\` margin by density:

| Density | Resume (size / leading / margin) | Cover letter (size / leading / margin) |
|---|---|---|
${dens}

- \`@page\` \`size:\` is \`Letter\` or \`A4\` (the documents block's \`paper\`).
- \`--doc-accent\`: \`#111111\`, or a color from "Safe document accents" in \`references/importing-a-design-system.md\` (already measured on white). Without Node, never use another color here.
`
}
function layoutsSection() {
  const rows = Object.entries(LAYOUTS).map(([k, L]) => `| \`${k}\` (${L.block} block) | ${L.files.map(f => `\`${f}\``).join(', ')} | ${L.values.map((v, i) => i ? v : `**${v}** (default)`).join(', ')} |`).join('\n')
  return `## 5. Layouts and your own CSS (the same for every preset)

A layout is one attribute: \`data-layout\` on the page's \`<html lang="en" data-layout="...">\` tag. The look (this preset) and the layout are independent. Without Node, after setting the key in \`profile/design.md\`, change that one attribute by hand in each file it applies to (pages in \`pages/\`, every \`jobs/*/interview-brief.html\`, and the user's copies in \`profile/templates/\`; copy a template there from \`templates/\` first if it isn't there yet, and never edit \`templates/\`). Use exactly one of the listed values; the resume and cover letter take the same value.

| design.md key | Files | Values |
|---|---|---|
${rows}

A page made before layouts existed (its \`<html>\` tag has no \`data-layout\`) only has its one look; refresh it from \`templates/blank/pages/\` first (pages skill).

The user's own CSS goes between \`  /* ---- Custom ---- */\` and \`  /* ---- End custom ---- */\` (the last lines of the page's first \`<style>\`); it may use \`:root[data-layout="..."]\` to target one layout and only the tokens above, never raw colors. Re-theming never touches it.
`
}
function buildPresets() {
  const dir = path.join(here, '..', 'presets')
  fs.mkdirSync(dir, { recursive: true })
  for (const name of PRESET_NAMES) {
    const th = loadTheme(name)
    const { lines, ok } = contrastLines(th)
    if (!ok) die(`preset ${name} fails contrast: ${lines.join('; ')}`)
    const P = PRESETS[name]
    const md = `# Preset: ${P.label}

${P.blurb}

Precomputed and contrast-checked by \`scripts/apply-theme.mjs --build-presets\` (every text pair passes in light and dark mode). Use this file by hand only when Node isn't available; see "Without Node" in \`.claude/skills/page-design/SKILL.md\`. Don't edit it; rebuild it.

Fonts: ${th.t.fonts.heading} (headings), ${th.t.fonts.body} (text), ${th.t.fonts.mono} (labels and numbers). Text size ${th.t.baseSize}%, ${th.t.density} spacing, ${th.t.radius}px corners, motion ${th.t.motion}.

## 1. Fonts line (every page, and the designed resume template)

Replace the line that starts \`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?\` (or \`href="data:text/css,\`) with:

\`\`\`html
${fontsLink(th.t)}
\`\`\`

## 2. Page token block (pages/*.html and jobs/*/interview-brief.html)

Replace everything from the line starting \`  /* ---- Design tokens\` through the line \`  /* ---- End design tokens ---- */\` with:

\`\`\`css
${tokenBlock(th.t, th.R)}
\`\`\`

## 3. Designed resume block (profile/templates/resume-designed-template.html)

The user's copy of the designed resume template lives in \`profile/templates/\`; if it isn't there yet, copy \`templates/resume-designed-template.html\` there first (never edit the app's copy in \`templates/\`). Replace everything from \`  /* ---- Designed resume theme\` through \`  /* ---- End designed resume theme ---- */\` with the block below. It uses Letter paper and standard spacing; for A4, change \`size: Letter\` to \`size: A4\`.

\`\`\`css
${designedBlock({ ...th.t, docs: { ...th.t.docs, paper: 'Letter', density: 'standard' } }, th.R)}
\`\`\`

${docsSection()}
${layoutsSection()}`
    fs.writeFileSync(path.join(dir, `${name}.md`), md)
    out(`preset: presets/${name}.md`)
  }
  out('result: presets rebuilt')
}

// ---- Main --------------------------------------------------------------------------------------
if (flag('--build-presets')) { buildPresets(); process.exit(0) }
if (flag('--preview')) {
  // Inside the workspace (pages/.preview/ is the user's own, git-ignored, and removed by a reset), so the
  // built-in browser and the user can open the files; the pages themselves and the templates don't change.
  const dir = path.resolve(opt('--preview') || path.join(ROOT, 'pages', '.preview'))
  const made = args.includes('--layouts') ? previewLayouts(dir, opt('--layouts'), loadTheme(opt('--preset'))) : preview(dir)
  out(`result: ${made.length} previews written to ${rel(dir) || dir} (your pages and templates did not change)`)
  process.exit(0)
}
if (flag('--write-blank')) {
  // Maintainers only: put templates/blank/pages/*.html and templates/*.html on the Default preset, the default layout
  // (the token block, fonts line and data-layout attribute; nothing else), so --check-blank passes.
  const th0 = loadTheme('default')
  const dir = path.join(ROOT, 'templates', 'blank', 'pages')
  if (!fs.existsSync(dir)) die('templates/blank/pages/ is missing')
  let n = 0
  const put = (file, r, html) => {
    if (r.skip) { out(`skipped: ${rel(file)} (${r.skip})`); return }
    if (r.html === html) { out(`unchanged: ${rel(file)}`); return }
    fs.writeFileSync(file, r.html); n++; out(`updated: ${rel(file)}`)
  }
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.html')) continue
    const file = path.join(dir, f), html = fs.readFileSync(file, 'utf8')
    put(file, themePage(html, th0.t, th0.R, f), html)
  }
  for (const [name, kind] of TEMPLATES) {
    const file = path.join(ROOT, 'templates', name)
    if (!fs.existsSync(file)) { out(`skipped: templates/${name} (missing)`); continue }
    const html = fs.readFileSync(file, 'utf8')
    put(file, themeTemplate(html, kind, th0.t, th0.R, name), html)
  }
  out(`result: ${n} blank page(s) and app template(s) rewritten to the Default preset (run --check-blank next; rebuild the product manifest)`)
  process.exit(0)
}
if (flag('--check-blank')) {
  // Maintainers and CI: the blank page copies (and templates/blank/profile/design.md's look) must stay on the Default preset.
  const th0 = loadTheme('default')
  const dir = path.join(ROOT, 'templates', 'blank', 'pages')
  if (!fs.existsSync(dir)) die('templates/blank/pages/ is missing')
  let bad = 0, good = 0
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.html')) continue
    const file = path.join(dir, f), html = fs.readFileSync(file, 'utf8')
    const r = themePage(html, th0.t, th0.R, f), problem = blankProblem(html, f)
    if (r.skip) { out(`differs: ${rel(file)} (${r.skip})`); bad++ }
    else if (r.html !== html) { out(`differs: ${rel(file)} (${blankReasons(html, r.html, f, 'not on the Default preset')})`); bad++ }
    else if (problem) { out(`differs: ${rel(file)} (${problem})`); bad++ }
    else { out(`unchanged: ${rel(file)}`); good++ }
  }
  // The app's print templates ship on the Default look too; a user's theme only ever goes in profile/templates/.
  for (const [name, kind] of TEMPLATES) {
    const file = path.join(ROOT, 'templates', name)
    if (!fs.existsSync(file)) { out(`differs: templates/${name} (missing)`); bad++; continue }
    const html = fs.readFileSync(file, 'utf8'), r = themeTemplate(html, kind, th0.t, th0.R, name), problem = blankProblem(html, name)
    if (r.skip) { out(`differs: templates/${name} (${r.skip})`); bad++ }
    else if (r.html !== html) { out(`differs: templates/${name} (${blankReasons(html, r.html, name, "theme block not on the Default look; a user's theme belongs in profile/templates/")})`); bad++ }
    else if (problem) { out(`differs: templates/${name} (${problem})`); bad++ }
    else { out(`unchanged: templates/${name}`); good++ }
  }
  if (bad) die(`${bad} blank page(s) or app template(s) are not on the Default preset with the default layout and an empty Custom region; maintainers: run apply-theme.mjs --write-blank`)
  out(`result: checked (${good} blank page(s) and app template(s) on the Default preset; nothing changed)`)
  process.exit(0)
}
const presetArg = opt('--preset')
if (presetArg && !PRESETS[presetArg]) die(`unknown preset "${presetArg}" (use ${PRESET_NAMES.join(', ')})`)
const th = loadTheme(presetArg)
const { t } = th
out(`theme: ${t.label} (source: ${t.source})`)
out(`fonts: ${t.fonts.heading} / ${t.fonts.body} / ${t.fonts.mono}; text ${t.baseSize}%; ${t.density}; corners ${t.radius}px; motion ${t.motion}`)
out(`documents: ${t.docs.font}, accent ${t.docs.accent}, ${t.docs.density}, ${t.docs.paper}`)
out(`layouts: ${Object.entries(t.layouts).map(([k, v]) => `${LAYOUTS[k].page} ${v}`).join(', ')}`)
for (const n of t.notes) out(`note: ${n}`)
for (const a of th.adjustments) out(`adjusted: ${a}`)
const c = contrastLines(th)
for (const l of c.lines) out(l)
if (!c.ok) die('some colors fail their contrast target; nothing was changed. Adjust the lightness of the colors named above in profile/design.md (or pick a preset) and run again.')
out(`contrast: ok (every text pair in light and dark mode${t.spec.contrast === 'high' ? ' at 7:1' : ''}, and the print colors on white)`)
if (flag('--print')) {
  out(report(th.R, { high: t.spec.contrast === 'high' }))
  out('\n' + tokenBlock(t, th.R))
  out('result: printed (nothing changed)')
  process.exit(0)
}
if (args.includes('--regenerate')) {
  const which = opt('--regenerate')
  if (!which) die('--regenerate needs a template name list (e.g. resume-template.html) or all')
  const g = regenerate(th, which)
  out(`result: templates refreshed (${g.n} changed${g.kept ? `, ${g.kept} had changes made by hand` : ''}; pages not touched)`)
  process.exit(0)
}
const write = !flag('--check')
const r = apply(th, { write })
out(write
  ? `result: done (${r.updated} updated, ${r.same} unchanged${r.skipped ? `, ${r.skipped} skipped` : ''})`
  : `result: checked (${r.differs} differ from the theme, ${r.same} match${r.skipped ? `, ${r.skipped} skipped` : ''}; nothing changed)`)
