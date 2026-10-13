#!/usr/bin/env node
// Visual, accessibility (WCAG 2.2 AA) and print harness for the pages and documents. Maintainers only; manual.
// Start it with scripts/ci/visual/run.sh (installs playwright-core and axe-core into a cache folder outside the repo).
//
// What it does, on a throwaway copy of the app (never the repo's files):
//   pages: dashboard overview|board (sample data and empty), flashcards flip|list, interview-brief sheet|detailed,
//          portfolio profile|editorial|bento, each in the default, modern, minimal and high-contrast presets and a brand
//          accent, light and dark, at 320/390/768/1440 px: full-page screenshots, axe-core (WCAG 2.0-2.2 A/AA tags),
//          reflow (no horizontal scroll at 320 px = 400% zoom, and at 640 px = 200% zoom), text spacing (1.4.12),
//          target size (2.5.8), a keyboard walk (focus visible, ring contrast, focus not obscured, order), reduced
//          motion, forced colors, content left below full opacity at rest, and print to PDF on Letter and A4 (page
//          count, light colors under a dark device theme).
//   documents: resume classic|modern|compact and cover letter x density compact|standard|roomy x paper Letter|A4,
//          designed resume sidebar|headline x density x paper (48), plus the designed resume in every preset; each
//          filled with the Alex Rivera fixture, printed with the workspace copy of make-pdf.sh; checks paper, one
//          page, parse: ok, tagged PDF with a language and H1/H2 tags in reading order.
//
// Options: --out <folder> (default: $VISUAL_OUT or <tmp>/jshq-visual), --quick (default + brand themes, 390 and 1440 px),
//          --themes a,b  --pages dashboard,flashcards,brief,portfolio  --no-pages  --no-docs  --jobs N (parallel pages)
// Output: <out>/shots/..., <out>/pdf/..., <out>/results.json, <out>/summary.md; exit 0 when nothing failed, 1 otherwise,
// 2 when it could not run.
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(here, '..', '..', '..')
const args = process.argv.slice(2)
const flag = f => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const say = s => process.stdout.write(s + '\n')
const die = (s, code = 2) => { say('error: ' + s); process.exit(code) }

const TOOLS = process.env.VISUAL_TOOLS || path.join(os.tmpdir(), 'jshq-visual-tools')
const req = createRequire(path.join(TOOLS, 'package.json'))
let chromium, axeSource
try { ({ chromium } = req('playwright-core')); axeSource = fs.readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8') }
catch (e) { die(`playwright-core and axe-core not found in ${TOOLS} (run scripts/ci/visual/run.sh): ${e.message}`) }

const OUT = path.resolve(opt('--out', process.env.VISUAL_OUT || path.join(os.tmpdir(), 'jshq-visual')))
const inside = (p, root) => { const r = path.relative(root, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) }
if (inside(fs.realpathSync(path.dirname(OUT)) + path.sep + path.basename(OUT), fs.realpathSync(REPO))) die(`--out must be outside the workspace: ${OUT}`)
const QUICK = flag('--quick')
const ALL_THEMES = ['default', 'modern', 'minimal', 'high-contrast', 'brand']
const THEMES = (opt('--themes') || (QUICK ? 'default,brand' : ALL_THEMES.join(','))).split(',').map(s => s.trim())
for (const t of THEMES) if (!ALL_THEMES.includes(t)) die(`unknown theme ${t} (use ${ALL_THEMES.join(', ')})`)
const PAGES = (opt('--pages') || 'dashboard,flashcards,brief,portfolio').split(',').map(s => s.trim())
const WIDTHS = QUICK ? [390, 1440] : [320, 390, 768, 1440]
const JOBS = Math.max(1, +opt('--jobs', 4))
const BRAND_ACCENT = '#e4572e'
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BRIEF_PAGES = { sheet: 1, detailed: 2 }
const have = cmd => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0
const HAVE = { pdfinfo: have('pdfinfo'), pdftoppm: have('pdftoppm'), pdffonts: have('pdffonts'), qpdf: have('qpdf'), bash: have('bash') }

// ---- Workspace copy (product files only, like scripts/ci/e2e_common.py make_workspace) -------------------------------
function makeWorkspace(dest) {
  const r = spawnSync('git', ['-C', REPO, 'ls-files', '-z', '-co', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  if (r.status !== 0) die('git ls-files failed: ' + r.stderr)
  fs.rmSync(dest, { recursive: true, force: true })
  for (const rel of new Set(r.stdout.split('\0').filter(Boolean))) {
    const src = path.join(REPO, rel)
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue
    const dst = path.join(dest, rel)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
    fs.chmodSync(dst, fs.statSync(src).mode)
  }
  return dest
}

function designFile(ws, name, { preset = 'default', accent = '', docs = {} } = {}) {
  let s = fs.readFileSync(path.join(ws, 'templates', 'blank', 'profile', 'design.md'), 'utf8')
  const set = (key, val) => { s = s.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${val}`.trimEnd()) }
  if (preset === 'brand') { set('preset', 'brand'); set('source', 'custom'); set('based_on', 'default'); set('accent', accent) }
  else set('preset', preset)
  s = s.replace(/```documents\n[\s\S]*?```/, block => { for (const [k, v] of Object.entries(docs)) block = block.replace(new RegExp(`^${k}:.*$`, 'm'), `${k}: ${v}`); return block })
  const f = path.join(OUT, 'design', `${name}.md`)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, s)
  return f
}

function applyTheme(ws, extra) {
  const r = spawnSync(process.execPath, [path.join(ws, '.claude/skills/page-design/scripts/apply-theme.mjs'), '--root', ws, ...extra], { encoding: 'utf8' })
  if (r.status !== 0) die(`apply-theme ${extra.join(' ')} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout
}
const themeArgs = (ws, theme) => theme === 'brand' ? ['--design', designFile(ws, 'brand', { preset: 'brand', accent: BRAND_ACCENT })] : ['--design', designFile(ws, theme, { preset: theme })]

// ---- In-page probes (run in the browser) ---------------------------------------------------------------------------
const PROBES = String.raw`
window.__v = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const bgOf = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0.5) return c } return rgba(getComputedStyle(document.body).backgroundColor)[3] > 0.5 ? rgba(getComputedStyle(document.body).backgroundColor) : [255, 255, 255, 1] }
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[inert]') }
  const desc = el => { const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 48); const id = el.id ? '#' + el.id : ''; const cls = (typeof el.className === 'string' && el.className.trim()) ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; return el.tagName.toLowerCase() + id + cls + (t ? ' "' + t + '"' : '') }
  const clipped = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true } return false }
  const reflow = () => {
    const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth
    const off = []
    if (sw > vw + 1) for (const el of document.body.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.right > vw + 1 && r.width > 0 && !clipped(el) && visible(el)) { off.push(desc(el) + ' right=' + Math.round(r.right)); if (off.length > 6) break } }
    return { vw, sw, ok: sw <= vw + 1, off }
  }
  const TARGETS = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=link],[role=checkbox],[role=radio],[tabindex]:not([tabindex="-1"])'
  const inlineLink = el => { if (el.tagName !== 'A') return false; const cs = getComputedStyle(el); if (!cs.display.startsWith('inline') || cs.display === 'inline-flex' || cs.display === 'inline-block') return false; const p = el.parentElement; const own = (el.textContent || '').trim().length; return p && (p.textContent || '').trim().length > own + 3 }
  const targets = () => {
    const els = [...document.querySelectorAll(TARGETS)].filter(visible).filter(el => !el.closest('.sr-only'))
    const rects = els.map(el => el.getBoundingClientRect())
    const small = [], ok = []
    els.forEach((el, i) => { const r = rects[i]; if (r.width >= 23.5 && r.height >= 23.5) return; if (inlineLink(el)) return; small.push(i) })
    const bad = []
    for (const i of small) {
      const r = rects[i], cx0 = r.left + r.width / 2, cy0 = r.top + r.height / 2
      let clash = false
      rects.forEach((o, j) => { if (j === i) return; if (els[j].contains(els[i]) || els[i].contains(els[j])) return
        if (small.includes(j)) { const dx = cx0 - (o.left + o.width / 2), dy = cy0 - (o.top + o.height / 2); if (Math.hypot(dx, dy) < 24) clash = true }
        else { const nx = Math.max(o.left, Math.min(cx0, o.right)), ny = Math.max(o.top, Math.min(cy0, o.bottom)); if (Math.hypot(cx0 - nx, cy0 - ny) < 12) clash = true } })
      if (clash) bad.push(desc(els[i]) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
    }
    return { count: els.length, undersized: small.length, bad }
  }
  const focusInfo = () => {
    const el = document.activeElement
    if (!el || el === document.body || el === document.documentElement) return null
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    const ow = parseFloat(cs.outlineWidth) || 0
    const outline = cs.outlineStyle !== 'none' && ow >= 1
    const shadow = cs.boxShadow && cs.boxShadow !== 'none'
    let ringRatio = null
    if (outline && cs.outlineStyle !== 'auto') ringRatio = ratio(rgba(cs.outlineColor), bgOf(el.parentElement || el))
    const pts = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy])
    let hits = 0, inView = 0
    for (const [x, y] of pts) { if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue; inView++; const h = document.elementFromPoint(x, y); if (h && (h === el || el.contains(h) || (el.labels && [...el.labels].some(l => l.contains(h))))) hits++ }
    const path = []; for (let e = el; e && e !== document.body; e = e.parentElement) path.unshift(e.tagName + ':' + [...(e.parentElement ? e.parentElement.children : [])].indexOf(e))
    return { key: path.join('/'), desc: desc(el), tabindex: el.getAttribute('tabindex'), top: Math.round(r.top + scrollY), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
      outline, ow, shadow: !!shadow, ringRatio: ringRatio && +ringRatio.toFixed(2), inView, hits, obscured: r.width > 0 && inView > 0 && hits === 0, partly: hits > 0 && hits < inView, offscreen: inView === 0 }
  }
  const restOpacity = () => {
    const out = []
    for (const el of document.body.querySelectorAll('h1,h2,h3,p,li,a,button,span,dd,dt,td,th,figcaption')) {
      if (!visible(el) || !(el.textContent || '').trim()) continue
      let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity)
      if (o < 0.6 && !el.closest('[aria-hidden="true"],.ghost,[data-ghost]')) { out.push(desc(el) + ' opacity ' + o.toFixed(2)); if (out.length > 8) break }
    }
    return out
  }
  const clippedText = () => {
    const out = []
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el); if (!/(hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue
      if (!visible(el) || el.closest('.sr-only') || el.getBoundingClientRect().width < 4) continue
      if (!(el.textContent || '').trim()) continue
      if (el.scrollHeight > el.clientHeight + 2 && /(hidden|clip)/.test(cs.overflowY + cs.overflow) && cs.textOverflow !== 'ellipsis') { out.push(desc(el) + ' ' + el.scrollHeight + '>' + el.clientHeight); if (out.length > 6) break }
    }
    return out
  }
  const printColors = () => { const b = bgOf(document.body); const h = document.querySelector('h1') || document.body; const c = rgba(getComputedStyle(h).color); return { bgLum: +lum(b).toFixed(3), textLum: +lum(c).toFixed(3), ratio: +ratio(b, c).toFixed(2) } }
  const structure = () => ({
    lang: document.documentElement.lang, title: document.title, mains: document.querySelectorAll('main').length, h1: document.querySelectorAll('h1').length,
    positiveTabindex: [...document.querySelectorAll('[tabindex]')].filter(e => +e.getAttribute('tabindex') > 0).map(desc),
    viewport: (document.querySelector('meta[name=viewport]') || {}).content || '',
    statusRegions: document.querySelectorAll('[role=status],[aria-live]').length,
  })
  const animations = () => document.getAnimations().filter(a => a.playState === 'running').map(a => (a.animationName || a.transitionProperty || 'anim') + ' on ' + desc(a.effect && a.effect.target || document.body)).slice(0, 8)
  return { reflow, targets, focusInfo, restOpacity, clippedText, printColors, structure, animations }
})()`

async function settle(page, ms = 900) {
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }) } catch {}
  await page.evaluate(() => document.fonts && document.fonts.ready)
  await page.waitForTimeout(ms)
}
async function loadPage(ctx, file) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message || e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 45000 })
  await settle(page)
  await page.addScriptTag({ content: PROBES })
  await page.addScriptTag({ content: axeSource })
  return { page, errors }
}
async function runAxe(page) {
  return page.evaluate(async tags => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] })
    const map = v => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags.filter(t => /^wcag\d/.test(t)), nodes: v.nodes.slice(0, 6).map(n => ({ target: n.target.join(' '), summary: (n.failureSummary || '').split('\n').slice(0, 3).join(' ') })), count: v.nodes.length })
    return { violations: r.violations.map(map), incomplete: r.incomplete.filter(v => v.id === 'color-contrast' || v.id === 'target-size').map(v => ({ id: v.id, count: v.nodes.length })) }
  }, AXE_TAGS)
}
async function keyboardWalk(page, max = 150) {
  // Smooth scrolling (the brief) only delays the scroll to the focused control; measure where it lands.
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' })
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0) })
  await page.mouse.click(1, 1).catch(() => {})
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur() })
  const seq = []
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    // Let a focus-ring color transition finish (the reduced-motion rule keeps color transitions).
    await page.waitForFunction(() => { const a = document.activeElement; return !a || !a.getAnimations || a.getAnimations().every(x => x.playState !== 'running') }, null, { timeout: 800 }).catch(() => {})
    const f = await page.evaluate(() => window.__v.focusInfo())
    if (!f) { if (seq.length) break; else continue }
    if (seq.length && f.key === seq[0].key) break
    seq.push(f)
  }
  const noRing = seq.filter(f => !f.outline && !f.shadow).map(f => f.desc)
  const weakRing = seq.filter(f => f.ringRatio !== null && f.ringRatio < 3).map(f => `${f.desc} ${f.ringRatio}:1`)
  const obscured = seq.filter(f => f.obscured).map(f => f.desc)
  const offscreen = seq.filter(f => f.offscreen).map(f => f.desc)
  const partly = seq.filter(f => f.partly).map(f => f.desc)
  const ups = []
  for (let i = 1; i < seq.length; i++) if (seq[i].top < seq[i - 1].top - 60) ups.push(`${seq[i - 1].desc} -> ${seq[i].desc}`)
  return { stops: seq.length, first: seq[0] && seq[0].desc, order: seq.map(f => f.desc), noRing, weakRing, obscured, offscreen, partly, ups, shadowOnly: seq.filter(f => !f.outline && f.shadow).map(f => f.desc) }
}
// Page-specific keyboard flows (page-review check 3): flashcards Space / 1-4 / arrows, the brief's pitch Stop button.
async function flows(page, v) {
  const r = {}
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0) })
  if (v.page === 'flashcards' && v.layout === 'flip') {
    const q0 = await page.evaluate(() => document.getElementById('q').textContent)
    await page.keyboard.press('Space'); await page.waitForTimeout(700)
    r['Space flips the card'] = await page.evaluate(() => !document.querySelector('.face.back').inert)
    r['focus moves to the flip button'] = await page.evaluate(() => document.activeElement && document.activeElement.id === 'flip')
    await page.keyboard.press('3'); await page.waitForTimeout(900)
    const q1 = await page.evaluate(() => document.getElementById('q').textContent)
    r['3 rates and deals the next card'] = q1 !== q0
    r['focus not lost after rating'] = await page.evaluate(() => document.activeElement && document.activeElement !== document.body)
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500)
    r['ArrowRight moves on'] = (await page.evaluate(() => document.getElementById('q').textContent)) !== q1
    await page.evaluate(() => { document.activeElement.blur() })
    await page.keyboard.press('Space'); await page.waitForTimeout(500)
    await page.evaluate(() => { document.activeElement.blur() })
    const q2 = await page.evaluate(() => document.getElementById('q').textContent)
    await page.keyboard.press('2'); await page.waitForTimeout(500)
    r['a number typed with focus outside the practice area does nothing (2.1.4)'] = (await page.evaluate(() => document.getElementById('q').textContent)) === q2
  }
  if (v.page === 'brief') {
    await page.focus('#practice'); await page.keyboard.press('Enter'); await page.waitForTimeout(400)
    r['pitch practice shows a Stop button (2.2.2)'] = await page.evaluate(() => /stop/i.test(document.getElementById('practice-label').textContent))
    r['practice announces itself in a status region'] = await page.evaluate(() => (document.getElementById('pitch-status') || {}).textContent !== '')
    await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    r['Stop ends practice'] = await page.evaluate(() => /practice/i.test(document.getElementById('practice-label').textContent))
  }
  return r
}

function pdfPages(file) {
  if (HAVE.pdfinfo) { const r = spawnSync('pdfinfo', [file], { encoding: 'utf8' }); const m = /Pages:\s+(\d+)/.exec(r.stdout); if (m) return +m[1] }
  return (fs.readFileSync(file, 'latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length
}
function pdfInfo(file) {
  if (!HAVE.pdfinfo) return {}
  const s = spawnSync('pdfinfo', [file], { encoding: 'utf8' }).stdout
  const g = k => (new RegExp(`^${k}:\\s+(.*)$`, 'm').exec(s) || [])[1]
  return { tagged: g('Tagged'), title: g('Title'), pages: +g('Pages'), size: g('Page size') }
}
function pdfFontTypes(file) {
  if (!HAVE.pdffonts) return null
  const out = spawnSync('pdffonts', [file], { encoding: 'utf8' }).stdout.split('\n').slice(2).filter(Boolean)
  return [...new Set(out.map(l => (/\s(Type 3|Type 1C?|CID TrueType|TrueType|CID Type 0C?)\s/.exec(l) || [])[1] || '?'))]
}
function pdfToPng(pdf, png, res = 60) {
  if (!HAVE.pdftoppm) return null
  fs.mkdirSync(path.dirname(png), { recursive: true })
  spawnSync('pdftoppm', ['-png', '-r', String(res), '-singlefile', '-f', '1', '-l', '1', pdf, png.replace(/\.png$/, '')])
  return fs.existsSync(png) ? png : null
}
// Headings outline (from --generate-pdf-document-outline) and tag-tree element order, read with qpdf --json.
function pdfStructure(file) {
  if (!HAVE.qpdf) return null
  const r = spawnSync('qpdf', ['--json', '--json-key=qpdf', file], { encoding: 'utf8', maxBuffer: 256 << 20 })
  let j; try { j = JSON.parse(r.stdout) } catch { return null }
  const objs = (j.qpdf && j.qpdf[1]) || {}
  const val = o => o && (o.value !== undefined ? o.value : o)
  const get = ref => typeof ref === 'string' && / R$/.test(ref) ? val(objs['obj:' + ref]) : ref
  const trailer = val(objs.trailer)
  const root = get(trailer && trailer['/Root'])
  const str = v => typeof v === 'string' ? v.replace(/^u:/, '').replace(/^b:/, '') : ''
  const outline = []
  const ol = get(root && root['/Outlines'])
  const walk = (node, depth) => { for (let n = get(node); n; n = get(n['/Next'])) { outline.push('  '.repeat(depth) + str(n['/Title'])); if (n['/First']) walk(n['/First'], depth + 1); if (outline.length > 60) return } }
  if (ol && ol['/First']) walk(ol['/First'], 0)
  const tags = []
  const st = get(root && root['/StructTreeRoot'])
  const visit = (k, d) => { const v = get(k); if (Array.isArray(v)) return v.forEach(x => visit(x, d)); if (!v || typeof v !== 'object') return; if (v['/S']) { const s = String(v['/S']).replace('/', ''); if (/^(H\d?|P|L|LI|Link|Table|Figure|Document|Sect|Strong)$/.test(s)) tags.push(s) } if (v['/K'] !== undefined && d < 40) visit(v['/K'], d + 1) }
  if (st) visit(st['/K'], 0)
  return { marked: !!(root && root['/MarkInfo']), lang: str(root && root['/Lang']), outline, headingTags: tags.filter(t => /^H/.test(t)), tagCount: tags.length }
}

// ---- Pages --------------------------------------------------------------------------------------------------------
const results = { started: new Date().toISOString(), out: OUT, tools: HAVE, pages: [], docs: [], failures: [] }
const fail = (where, what) => results.failures.push(`${where}: ${what}`)

async function checkPage(browser, v) {
  const id = `${v.theme}/${v.page}-${v.layout}${v.state ? '-' + v.state : ''}`
  const shotDir = path.join(OUT, 'shots', v.theme, `${v.page}-${v.layout}${v.state ? '-' + v.state : ''}`)
  fs.mkdirSync(shotDir, { recursive: true })
  const res = { id, ...v, schemes: {} }
  for (const scheme of ['light', 'dark']) {
    const R = res.schemes[scheme] = { widths: {}, axe: {} }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'no-preference' })
    const { page, errors } = await loadPage(ctx, v.file)
    if (v.strip) await page.evaluate(() => document.querySelectorAll('[data-example]').forEach(e => e.remove()))
    R.structure = await page.evaluate(() => window.__v.structure())
    // What a screen reader is given (roles, names, states), for review next to the screenshots.
    if (scheme === 'light') { try { fs.writeFileSync(path.join(shotDir, 'aria-snapshot.yml'), await page.locator('body').ariaSnapshot()) } catch {} }
    R.restOpacity = await page.evaluate(() => window.__v.restOpacity())
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w < 600 ? 820 : 900 })
      await page.waitForTimeout(350)
      const W = R.widths[w] = {}
      W.reflow = await page.evaluate(() => window.__v.reflow())
      W.targets = await page.evaluate(() => window.__v.targets())
      const ax = await runAxe(page)
      W.axe = ax.violations.map(x => `${x.id}(${x.impact})x${x.count}`)
      for (const x of ax.violations) { const k = x.id; R.axe[k] = R.axe[k] || { ...x, widths: [] }; R.axe[k].widths.push(w) }
      W.incomplete = ax.incomplete
      await page.screenshot({ path: path.join(shotDir, `${scheme}-${w}.png`), fullPage: true, animations: 'disabled' })
      if (!W.reflow.ok) fail(id, `${scheme} ${w}px horizontal scroll (${W.reflow.sw} > ${W.reflow.vw}): ${W.reflow.off.slice(0, 3).join('; ')}`)
      if (W.targets.bad.length) fail(id, `${scheme} ${w}px targets under 24px: ${W.targets.bad.slice(0, 4).join('; ')}`)
    }
    for (const x of Object.values(R.axe)) fail(id, `${scheme} axe ${x.id} (${x.impact}) at ${x.widths.join('/')}px: ${x.nodes.slice(0, 2).map(n => n.target).join(' | ')}`)
    // 200% zoom of a 1280 px window = 640 CSS px; text spacing (1.4.12) at 390 px.
    await page.setViewportSize({ width: 640, height: 800 }); await page.waitForTimeout(300)
    R.zoom200 = await page.evaluate(() => window.__v.reflow())
    if (!R.zoom200.ok) fail(id, `${scheme} 200% zoom (640px) horizontal scroll: ${R.zoom200.off.slice(0, 3).join('; ')}`)
    if (scheme === 'light') await page.screenshot({ path: path.join(shotDir, `light-zoom200.png`), fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 820 })
    const sp = await page.addStyleTag({ content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}' })
    await page.waitForTimeout(300)
    R.textSpacing = { reflow: await page.evaluate(() => window.__v.reflow()), clipped: await page.evaluate(() => window.__v.clippedText()) }
    if (scheme === 'light') await page.screenshot({ path: path.join(shotDir, `light-textspacing-390.png`), fullPage: true, animations: 'disabled' })
    await sp.evaluate(n => n.remove())
    if (!R.textSpacing.reflow.ok) fail(id, `${scheme} text spacing: horizontal scroll ${R.textSpacing.reflow.off.slice(0, 2).join('; ')}`)
    if (R.textSpacing.clipped.length) fail(id, `${scheme} text spacing clips text: ${R.textSpacing.clipped.slice(0, 3).join('; ')}`)
    // Keyboard: desktop and phone.
    for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: w < 600 ? 820 : 900 }); await page.waitForTimeout(250)
      const k = R['keyboard' + w] = await keyboardWalk(page)
      if (k.noRing.length) fail(id, `${scheme} ${w}px focus not visible on: ${k.noRing.slice(0, 4).join('; ')}`)
      if (k.weakRing.length) fail(id, `${scheme} ${w}px focus ring under 3:1: ${k.weakRing.slice(0, 4).join('; ')}`)
      if (k.obscured.length) fail(id, `${scheme} ${w}px focused control hidden behind other content: ${k.obscured.slice(0, 4).join('; ')}`)
      if (k.offscreen.length) fail(id, `${scheme} ${w}px focused control off screen: ${k.offscreen.slice(0, 4).join('; ')}`)
    }
    if (scheme === 'light') {
      R.flows = await flows(page, v)
      for (const [k, ok] of Object.entries(R.flows)) if (ok === false) fail(id, `keyboard flow failed: ${k}`)
    }
    if (R.structure.positiveTabindex.length) fail(id, `positive tabindex: ${R.structure.positiveTabindex.join('; ')}`)
    // Print: Letter and A4; colors must be light even with a dark device theme.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ media: 'print' })
    R.print = { colors: await page.evaluate(() => window.__v.printColors()) }
    await page.emulateMedia({ media: null })
    if (R.print.colors.bgLum < 0.8 || R.print.colors.ratio < 4.5) fail(id, `${scheme} prints dark or low contrast: ${JSON.stringify(R.print.colors)}`)
    for (const format of ['Letter', 'A4']) {
      const pdf = path.join(OUT, 'pdf', 'pages', v.theme, `${v.page}-${v.layout}${v.state ? '-' + v.state : ''}-${scheme}-${format}.pdf`)
      fs.mkdirSync(path.dirname(pdf), { recursive: true })
      await page.pdf({ path: pdf, format, printBackground: true, tagged: true, outline: true })
      const n = pdfPages(pdf)
      R.print[format] = n
      if (scheme === 'light') pdfToPng(pdf, path.join(shotDir, `print-${format}.png`), 50)
      if (v.page === 'brief' && n > BRIEF_PAGES[v.layout]) fail(id, `${scheme} brief prints on ${n} pages on ${format} (limit ${BRIEF_PAGES[v.layout]})`)
    }
    R.errors = errors.filter(e => !/favicon/i.test(e))
    if (R.errors.length) fail(id, `${scheme} script errors: ${R.errors.slice(0, 2).join(' | ')}`)
    await ctx.close()
  }
  // Reduced motion and forced colors (light only).
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' })
    const { page } = await loadPage(ctx, v.file)
    res.reducedMotion = { running: await page.evaluate(() => window.__v.animations()), restOpacity: await page.evaluate(() => window.__v.restOpacity()) }
    if (res.reducedMotion.running.length) fail(id, `animations running under reduced motion: ${res.reducedMotion.running.slice(0, 3).join('; ')}`)
    if (res.reducedMotion.restOpacity.length) fail(id, `content below full opacity under reduced motion: ${res.reducedMotion.restOpacity.slice(0, 3).join('; ')}`)
    await ctx.close()
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', forcedColors: 'active', reducedMotion: 'no-preference' })
    const { page } = await loadPage(ctx, v.file)
    await page.screenshot({ path: path.join(shotDir, `forced-1440.png`), fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 820 }); await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(shotDir, `forced-390.png`), fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 1440, height: 900 })
    const k = await keyboardWalk(page)
    res.forcedColors = { noRing: k.noRing, shadowOnly: k.shadowOnly }
    if (k.noRing.length) fail(id, `forced colors: focus not visible on ${k.noRing.slice(0, 4).join('; ')}`)
    await ctx.close()
  }
  for (const s of ['light', 'dark']) if (res.schemes[s].restOpacity.length) fail(id, `${s} content left below full opacity at rest (no scrolling): ${res.schemes[s].restOpacity.slice(0, 3).join('; ')}`)
  results.pages.push(res)
  say(`page: ${id} done`)
}

async function pool(items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it) } catch (e) { fail(it.id || it.file || 'item', 'harness error: ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join(' ')) } } }))
}

// ---- Documents ----------------------------------------------------------------------------------------------------
function fillMain(html, fixture) {
  const main = fs.readFileSync(path.join(here, 'fixtures', fixture), 'utf8').trim()
  if (!/<main>[\s\S]*<\/main>/.test(html)) die('template has no <main> block')
  return html.replace(/<main>[\s\S]*<\/main>/, main).replace(/<title>[^<]*<\/title>/, `<title>Alex Rivera ${fixture.startsWith('cover') ? 'Cover Letter' : 'Resume'}</title>`)
}
function runAsync(cmd, argv, opts) {
  return new Promise(resolve => { const p = spawn(cmd, argv, opts); let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.on('close', code => resolve({ code, out })) })
}
async function docs(ws) {
  const combos = []
  const prev = path.join(OUT, 'docs-src')
  for (const density of ['compact', 'standard', 'roomy']) for (const paper of ['Letter', 'A4']) {
    const dir = path.join(prev, `default-${density}-${paper}`)
    applyTheme(ws, ['--preview', dir, '--layouts', 'resume,cover-letter,designed', '--design', designFile(ws, `docs-${density}-${paper}`, { docs: { density, paper, accent: '#1f3a5f' } })])
    for (const l of ['classic', 'modern', 'compact']) {
      combos.push({ kind: 'resume', layout: l, density, paper, theme: 'default', src: path.join(dir, `resume-${l}.html`) })
      combos.push({ kind: 'cover-letter', layout: l, density, paper, theme: 'default', src: path.join(dir, `cover-letter-${l}.html`) })
    }
    for (const l of ['sidebar', 'headline']) combos.push({ kind: 'designed', layout: l, density, paper, theme: 'default', src: path.join(dir, `designed-${l}.html`) })
  }
  // Every font on the ATS-safe list (the Google ones load as web fonts), classic layout, standard, Letter.
  for (const font of ['Helvetica', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Garamond', 'Lato', 'Source Sans 3', 'Roboto', 'Open Sans']) {
    const slug = font.replace(/ /g, '')
    const dir = path.join(prev, `font-${slug}`)
    applyTheme(ws, ['--preview', dir, '--layouts', 'resume', '--design', designFile(ws, `docs-font-${slug}`, { docs: { font } })])
    combos.push({ kind: 'resume', layout: 'classic', density: 'standard', paper: 'Letter', theme: 'default', font: slug, src: path.join(dir, 'resume-classic.html'), extra: true })
  }
  for (const theme of THEMES.filter(t => t !== 'default')) {
    const dir = path.join(prev, `${theme}-standard-Letter`)
    applyTheme(ws, ['--preview', dir, '--layouts', 'designed', ...themeArgs(ws, theme)])
    for (const l of ['sidebar', 'headline']) combos.push({ kind: 'designed', layout: l, density: 'standard', paper: 'Letter', theme, src: path.join(dir, `designed-${l}.html`), extra: true })
  }
  const fixture = { resume: 'resume-main.html', 'cover-letter': 'cover-letter-main.html', designed: 'designed-main.html' }
  const fname = { resume: 'resume.html', 'cover-letter': 'cover-letter.html', designed: 'resume-designed.html' }
  const makePdf = path.join(ws, '.claude/skills/tailor-resume/scripts/make-pdf.sh')
  await pool(combos, Math.min(JOBS, 4), async c => {
    c.id = `${c.kind}-${c.layout}-${c.density}-${c.paper}${c.theme !== 'default' ? '-' + c.theme : ''}${c.font ? '-' + c.font : ''}`
    const dir = path.join(ws, 'jobs', `visual-${c.id}`)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, fname[c.kind])
    fs.writeFileSync(file, fillMain(fs.readFileSync(c.src, 'utf8'), fixture[c.kind]))
    const r = await runAsync('bash', [makePdf, file, 'Alex Rivera', 'Acme'], { cwd: ws })
    const line = k => (new RegExp(`^${k}: (.*)$`, 'm').exec(r.out) || [])[1]
    const pdf = line('pdf')
    const d = { ...c, out: r.out.trim().split('\n'), paperOut: line('paper'), pages: +line('pages') || 0, parse: line('parse') || '' }
    if (pdf && fs.existsSync(pdf)) {
      const dest = path.join(OUT, 'pdf', 'docs', `${c.id}.pdf`)
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(pdf, dest)
      d.pdf = dest; d.info = pdfInfo(dest); d.structure = pdfStructure(dest); d.fonts = pdfFontTypes(dest)
      d.png = pdfToPng(dest, path.join(OUT, 'shots', 'docs', `${c.id}.png`), 60)
    }
    results.docs.push(d)
    if (!pdf) fail(`doc ${c.id}`, `make-pdf did not produce a PDF: ${r.out.trim().split('\n').slice(0, 3).join(' | ')}`)
    else {
      if (d.paperOut !== c.paper) fail(`doc ${c.id}`, `paper ${d.paperOut}, wanted ${c.paper}`)
      if (d.pages !== 1) fail(`doc ${c.id}`, `${d.pages} pages, wanted 1`)
      if (!/^ok/.test(d.parse) && HAVE.bash) fail(`doc ${c.id}`, `parse: ${d.parse}`)
      if (d.info && d.info.tagged && d.info.tagged !== 'yes') fail(`doc ${c.id}`, 'PDF is not tagged')
      if (d.structure && (!d.structure.marked || !d.structure.lang || !d.structure.headingTags.includes('H1') || (c.kind !== 'cover-letter' && d.structure.headingTags.filter(t => t === 'H2').length < 3))) fail(`doc ${c.id}`, `PDF tags incomplete: ${JSON.stringify({ marked: d.structure.marked, lang: d.structure.lang, headings: d.structure.headingTags })}`)
    }
    say(`doc: ${c.id} ${d.pages}p ${d.paperOut} ${d.parse.slice(0, 40)}`)
  })
}

// ---- Main ---------------------------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true })
const WS = makeWorkspace(path.join(OUT, 'ws', 'Job Search HQ'))
say(`workspace copy: ${WS}`)
say(`output: ${OUT}`)
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' })
say(`browser: ${browser.version()}`)

if (!flag('--no-pages')) {
  const variants = []
  const blankDash = fs.readFileSync(path.join(WS, 'templates/blank/pages/dashboard.html'), 'utf8')
  const blankData = /<script type="application\/json" id="data">[\s\S]*?<\/script>/.exec(blankDash)[0]
  for (const theme of THEMES) {
    const dir = path.join(OUT, 'pages-src', theme)
    applyTheme(WS, ['--preview', dir, '--layouts', PAGES.join(','), ...themeArgs(WS, theme)])
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort()) {
      const [page, layout] = f.replace(/\.html$/, '').split('-')
      variants.push({ theme, page, layout, file: path.join(dir, f), state: page === 'dashboard' ? 'sample' : '' })
      if (page === 'dashboard') {
        const empty = path.join(dir, f.replace('.html', '-empty.html'))
        fs.writeFileSync(empty, fs.readFileSync(path.join(dir, f), 'utf8').replace(/<script type="application\/json" id="data">[\s\S]*?<\/script>/, () => blankData))
        variants.push({ theme, page, layout, file: empty, state: 'empty' })
      }
      if (page === 'portfolio') variants.push({ theme, page, layout, file: path.join(dir, f), state: 'filled', strip: true })
    }
  }
  say(`pages: ${variants.length} variants x light/dark x ${WIDTHS.join('/')} px`)
  await pool(variants, JOBS, v => checkPage(browser, v))
}
if (!flag('--no-docs')) {
  if (!HAVE.bash) say('docs: skipped (no bash)')
  else await docs(WS)
}
await browser.close()

// ---- Report -------------------------------------------------------------------------------------------------------
results.finished = new Date().toISOString()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const lines = [`# Visual harness results`, '', `Started ${results.started}, finished ${results.finished}. Output: ${OUT}`, '',
  `Pages checked: ${results.pages.length} variants. Documents: ${results.docs.length}.`, '']
if (results.docs.length) {
  lines.push('| Document | Paper | Pages | Tagged | Lang | Heading tags (reading order) | Font types | Parse |', '|---|---|---|---|---|---|---|---|')
  for (const d of results.docs.sort((a, b) => a.id.localeCompare(b.id))) lines.push(`| ${d.id} | ${d.paperOut || '-'} | ${d.pages} | ${(d.info && d.info.tagged) || '?'} | ${d.structure ? d.structure.lang : '?'} | ${d.structure ? d.structure.headingTags.join(' ') : '?'} | ${d.fonts ? d.fonts.join(', ') : '?'} | ${d.parse} |`)
  lines.push('')
}
lines.push(`## Failures (${results.failures.length})`, '', ...results.failures.map(f => '- ' + f))
fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n')
say(`\nresults: ${path.join(OUT, 'summary.md')}`)
say(`visual: ${results.pages.length} page variants, ${results.docs.length} documents, failures ${results.failures.length}`)
process.exit(results.failures.length ? 1 : 0)
