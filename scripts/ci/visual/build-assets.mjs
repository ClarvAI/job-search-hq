#!/usr/bin/env node
// Maintainers: fills templates/assets/ (the self-hosted page libraries and theme fonts) from the exact npm packages
// listed in .claude/skills/page-design/assets.mjs, and writes templates/assets/manifest.json (source, version,
// license, bytes and SHA-256 of every file). Pages then work offline and load nothing from the web.
//
//   node scripts/ci/visual/build-assets.mjs [--cache <folder>]   download (npm pack) and rebuild templates/assets/
//   node scripts/ci/visual/build-assets.mjs --check               no network: every file in the manifest is present
//                                                                  with its SHA-256, nothing extra, every theme font
//                                                                  and library listed (exit 1 otherwise)
// Downloads go to --cache (default <tmp>/jshq-assets-cache), never into the repo; only the files the pages need are
// copied. The libraries are checked against the integrity hashes the pages use for their CDN fallback.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(here, '..', '..', '..')
const A = await import(pathToFileURL(path.join(REPO, '.claude/skills/page-design/assets.mjs')).href)
const OUTDIR = path.join(REPO, A.ASSET_DIR)
const args = process.argv.slice(2)
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const say = s => process.stdout.write(s + '\n')
const die = s => { say('error: ' + s); process.exit(2) }
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex')
const sha384 = b => 'sha384-' + crypto.createHash('sha384').update(b).digest('base64')

// Every file the pages need: [published path under templates/assets, package spec, path inside the package, license].
function plan() {
  const files = []
  for (const L of Object.values(A.LIBS)) {
    files.push({ out: L.file, pkg: `${L.pkg}@${L.version}`, from: L.path, license: L.license, sri: L.sri })
    files.push({ out: `lib/LICENSE-${L.pkg.replace(/^@/, '').replace(/\//g, '-')}.txt`, pkg: `${L.pkg}@${L.version}`, from: 'LICENSE', license: L.license })
  }
  const faces = { 'fonts.css': [], 'documents.css': [] }
  const addFont = (family, F, sheet) => {
    const dir = `fonts/${F.id}`
    if (F.faces) { // complete files from the font's publisher, kept unmodified (names included)
      for (const face of F.faces) {
        const name = face.file.split('/').pop()
        files.push({ out: `${dir}/${name}`, pkg: `${F.pkg}@${F.version}`, from: face.file, license: 'OFL-1.1' })
        faces[sheet].push({ family, dir, name, pkg: `${F.pkg}@${F.version}`, F, official: face })
      }
      if (!files.some(f => f.out === `${dir}/OFL.txt`)) files.push({ out: `${dir}/OFL.txt`, pkg: `${F.pkg}@${F.version}`, from: F.license, license: 'OFL-1.1' })
      return
    }
    const variants = F.variable
      ? [['normal', `${F.variable}.css`, `${F.variable}-normal`], ...(F.italic ? [['italic', `${F.variable}-italic.css`, `${F.variable}-italic`]] : [])]
      : [...F.weights.map(w => ['normal', `${w}.css`, `${w}-normal`]), ...(F.italicWeights || []).map(w => ['italic', `${w}-italic.css`, `${w}-italic`])]
    for (const [style, css, tag] of variants) for (const sub of A.FONT_SUBSETS) {
      const name = `${F.id}-${sub}-${tag}.woff2`
      files.push({ out: `${dir}/${name}`, pkg: `${F.pkg}@${F.version}`, from: `files/${name}`, license: 'OFL-1.1' })
      faces[sheet].push({ family, style, css, sub, name, dir, pkg: `${F.pkg}@${F.version}`, F })
    }
    if (!files.some(f => f.out === `${dir}/OFL.txt`)) files.push({ out: `${dir}/OFL.txt`, pkg: `${F.pkg}@${F.version}`, from: 'LICENSE', license: 'OFL-1.1' })
  }
  for (const [family, F] of Object.entries(A.PAGE_FONTS)) addFont(family, F, 'fonts.css')
  for (const D of Object.values(A.DOC_FONTS_LOCAL)) addFont(D.family, { ...D, id: D.id }, 'documents.css')
  return { files, faces }
}

// The @font-face block for one file, taken from the package's own CSS (weight range and unicode-range as published).
function faceFrom(pkgDir, face) {
  if (face.official) {
    const o = face.official
    return `@font-face {\n  font-family: '${face.family}';\n  font-style: ${o.style};\n  font-display: swap;\n  font-weight: ${o.weight};\n  src: url(./${face.F.id}/${face.name}) format('${o.variable ? 'woff2-variations' : 'woff2'}');\n}`
  }
  const css = fs.readFileSync(path.join(pkgDir, face.css), 'utf8')
  const key = face.name.replace(/\.woff2$/, '')
  const m = new RegExp(`/\\* ${key.replace(/[.]/g, '\\.')} \\*/\\s*@font-face \\{([\\s\\S]*?)\\}`).exec(css)
  if (!m) die(`no @font-face for ${key} in ${face.pkg}/${face.css}`)
  const get = k => (new RegExp(`${k}:\\s*([^;]+);`).exec(m[1]) || [])[1]
  const variable = /woff2-variations/.test(m[1])
  return `@font-face {\n  font-family: '${face.family}';\n  font-style: ${get('font-style')};\n  font-display: swap;\n  font-weight: ${get('font-weight')};\n  src: url(./${face.F.id}/${face.name}) format('${variable ? 'woff2-variations' : 'woff2'}');\n  unicode-range: ${get('unicode-range')};\n}`
}

function check() {
  const mf = path.join(OUTDIR, 'manifest.json')
  if (!fs.existsSync(mf)) { say('FAIL  templates/assets/manifest.json is missing'); process.exit(1) }
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'))
  let bad = 0
  const listed = new Set(['manifest.json'])
  for (const f of m.files) {
    listed.add(f.path)
    const p = path.join(OUTDIR, f.path)
    if (!fs.existsSync(p)) { say(`FAIL  missing ${f.path}`); bad++; continue }
    const b = fs.readFileSync(p)
    // Text files are compared without CR so a Windows checkout (CRLF) passes too.
    const h = /\.(css|txt|js)$/.test(f.path) ? sha256(Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'))) : sha256(b)
    if (h !== f.sha256) { say(`FAIL  ${f.path} has changed (sha256 ${h.slice(0, 12)}…, manifest ${f.sha256.slice(0, 12)}…)`); bad++ }
  }
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(OUTDIR, path.join(d, e.name)).split(path.sep).join('/')])
  for (const f of walk(OUTDIR)) if (!listed.has(f) && !/(^|\/)\.DS_Store$/.test(f)) { say(`FAIL  ${f} is not in the manifest`); bad++ }
  const { files } = plan()
  for (const f of files) if (!m.files.some(x => x.path === f.out)) { say(`FAIL  ${f.out} (needed by assets.mjs) is not in the manifest; rebuild`); bad++ }
  for (const L of Object.values(A.LIBS)) {
    const p = path.join(OUTDIR, L.file)
    if (fs.existsSync(p) && sha384(fs.readFileSync(p)) !== L.sri) { say(`FAIL  ${L.file} does not match the integrity hash the pages use`); bad++ }
  }
  say(bad ? `assets: ${bad} problem(s)` : `assets: ok (${m.files.length} files, ${(m.files.reduce((n, f) => n + f.bytes, 0) / 1024 / 1024).toFixed(2)} MB)`)
  process.exit(bad ? 1 : 0)
}

if (args.includes('--check')) check()

const cache = path.resolve(opt('--cache') || path.join(os.tmpdir(), 'jshq-assets-cache'))
const rel = path.relative(REPO, cache)
if (!rel.startsWith('..') && !path.isAbsolute(rel)) die('--cache must be outside the repository')
fs.mkdirSync(cache, { recursive: true })
const { files, faces } = plan()
const pkgDirs = {}
for (const spec of [...new Set(files.map(f => f.pkg))]) {
  const slug = spec.replace(/^@/, '').replace(/[/@]/g, '-')
  const dir = path.join(cache, slug)
  if (!fs.existsSync(path.join(dir, 'package', 'package.json'))) {
    fs.mkdirSync(dir, { recursive: true })
    const r = spawnSync('npm', ['pack', spec, '--silent', '--pack-destination', dir], { encoding: 'utf8', shell: process.platform === 'win32' })
    if (r.status !== 0) die(`npm pack ${spec} failed: ${r.stderr || r.stdout}`)
    const tgz = fs.readdirSync(dir).find(f => f.endsWith('.tgz'))
    const t = spawnSync('tar', ['-xzf', path.join(dir, tgz), '-C', dir], { encoding: 'utf8' })
    if (t.status !== 0) die(`could not unpack ${tgz}: ${t.stderr}`)
  }
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package', 'package.json'), 'utf8'))
  if (`${pj.name}@${pj.version}` !== spec) die(`${spec}: got ${pj.name}@${pj.version}`)
  pkgDirs[spec] = path.join(dir, 'package')
  say(`package: ${spec} (${pj.license || '?'})`)
}
fs.rmSync(OUTDIR, { recursive: true, force: true })
const manifest = { note: 'Self-hosted assets for the pages; rebuilt by scripts/ci/visual/build-assets.mjs from the packages below. Do not edit.', built: new Date().toISOString().slice(0, 10), files: [] }
const put = (out, buf, meta) => {
  const p = path.join(OUTDIR, out)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, buf)
  manifest.files.push({ path: out, bytes: buf.length, sha256: sha256(buf), ...meta })
}
for (const f of files) {
  const src = path.join(pkgDirs[f.pkg], f.from)
  if (!fs.existsSync(src)) die(`${f.pkg} has no ${f.from}`)
  let buf = fs.readFileSync(src)
  if (/\.(txt|js)$/.test(f.out)) buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'))
  if (f.sri && sha384(buf) !== f.sri) die(`${f.pkg} ${f.from} does not match the integrity hash ${f.sri}`)
  const [name, version] = [f.pkg.slice(0, f.pkg.lastIndexOf('@')), f.pkg.slice(f.pkg.lastIndexOf('@') + 1)]
  put(f.out, buf, { source: `npm:${f.pkg}/${f.from}`, url: `https://www.npmjs.com/package/${name}/v/${version}`, license: f.license })
}
for (const [sheet, list] of Object.entries(faces)) {
  const head = sheet === 'fonts.css'
    ? '/* Theme fonts for the pages (variable where the family has one), self-hosted so pages work offline.\n   Generated by scripts/ci/visual/build-assets.mjs from Fontsource packages; each family folder holds its OFL.txt. Do not edit. */'
    : '/* Resume and cover-letter fonts (static 400 and 700, so a PDF embeds them as ordinary TrueType text), self-hosted.\n   Generated by scripts/ci/visual/build-assets.mjs from Fontsource packages; each family folder holds its OFL.txt. Do not edit. */'
  const css = head + '\n' + list.map(face => faceFrom(pkgDirs[face.pkg], face)).join('\n') + '\n'
  put(`fonts/${sheet}`, Buffer.from(css), { source: 'generated from the Fontsource CSS of the families listed', license: 'OFL-1.1 (fonts); this file: same as Job Search HQ' })
}
manifest.files.sort((a, b) => a.path.localeCompare(b.path))
fs.writeFileSync(path.join(OUTDIR, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
const total = manifest.files.reduce((n, f) => n + f.bytes, 0)
say(`result: ${manifest.files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB in ${A.ASSET_DIR}/`)
