// Self-hosted assets: the three page libraries and the theme fonts ship in templates/assets/, so pages work offline
// and load nothing from the web. Used by tokens.mjs and scripts/apply-theme.mjs (paths), the pages skill's publish copy
// (back to the pinned CDN files for a published page) and the maintainers' scripts/ci/visual/build-assets.mjs (which
// fills templates/assets/ from these lists). No dependencies.
//
// How a page refers to them (one line each, written by apply-theme; never by hand):
//   <link rel="stylesheet" href="../templates/assets/fonts/fonts.css" data-fallback="<Google Fonts URL>" onerror="...">
//   <script src="../templates/assets/lib/<file>" data-cdn="<jsDelivr URL>" data-sri="<sha384>" onerror="..."></script>
// The path is relative to the file (pages/ -> ../templates/assets/, jobs/<folder>/ -> ../../templates/assets/). If the
// local file is missing (a published copy, a page moved somewhere else), the onerror handler loads the same pinned file
// from the CDN with its integrity hash, so nothing runs unchecked. Local files carry no integrity attribute: browsers
// can't check one on file:// pages; the app's product manifest fingerprints them instead.

export const ASSET_DIR = 'templates/assets'
// Where each kind of file lives, relative to the workspace, so the canonical (shipped) path can be written:
// pages (and their blank copies) live in pages/; document templates are used from profile/templates/ and jobs/<folder>/.
export const CANONICAL_BASE = { page: '../templates/assets/', doc: '../../templates/assets/' }

export const LIBS = {
  tailwind: {
    file: 'lib/tailwindcss-browser-4.1.13.js', pkg: '@tailwindcss/browser', version: '4.1.13', path: 'dist/index.global.js', license: 'MIT',
    cdn: 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.13/dist/index.global.js',
    sri: 'sha384-P0V9YU7TFy919I0oVLXiqiUsdiJiaV+QKGysF4Lx+s901F1X9+zjFV0mc6pRKCKq',
  },
  fsrs: {
    file: 'lib/ts-fsrs-5.4.2.umd.js', pkg: 'ts-fsrs', version: '5.4.2', path: 'dist/index.umd.js', license: 'MIT',
    cdn: 'https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/dist/index.umd.js',
    sri: 'sha384-i45WWZuHT8d0SsGTvLVWyTzhdBv5HC8FV4XO+Lh5VBFpzLoqhoqwKFxc+Vqa/1SA',
  },
  confetti: {
    file: 'lib/canvas-confetti-1.9.3.js', pkg: 'canvas-confetti', version: '1.9.3', path: 'dist/confetti.browser.js', license: 'ISC',
    cdn: 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.js',
    sri: 'sha384-/Ko/tqVwPYurnBe+Mj8WWw+39WmyOZn/kU+neqXn4hRxGI575k07mB/hIekAT51+',
  },
}

// Theme fonts served from templates/assets/fonts/fonts.css. Two kinds of source:
//  - Fontsource packages (V variable, S static): the latin and latin-ext subsets Google Fonts publishes (other scripts
//    fall back to the system font in the stack). Only for families whose license reserves no font name: under the
//    SIL Open Font License a subset is a "Modified Version", which may not keep a Reserved Font Name (OFL FAQ 2.6).
//  - O: the complete, unmodified files from the font's own publisher (Adobe for the Source families, IBM for Plex),
//    which may keep their names. No unicode-range: they cover every script the font has.
// Lexend is not here (its license reserves "RevReading Lexend" and no unmodified web file is published on npm), so it
// still loads from Google Fonts, and so does any other font a brand brings.
// version = the exact package version the files were taken from (build-assets.mjs checks it).
const V = (id, axes, version, italic = false) => ({ id, pkg: `@fontsource-variable/${id}`, version, variable: axes, italic })
const S = (id, weights, version, italicWeights = []) => ({ id, pkg: `@fontsource/${id}`, version, weights, italicWeights })
// faces: [file inside the package, font-weight, font-style, variable?]; license = the package's license file.
const O = (id, pkg, version, license, faces) => ({ id, pkg, version, license, faces: faces.map(([file, weight, style = 'normal', variable = false]) => ({ file, weight, style, variable })) })
export const PAGE_FONTS = {
  'Bricolage Grotesque': V('bricolage-grotesque', 'opsz', '5.3.0'),
  'Source Sans 3': O('source-sans-3', 'source-sans', '3.52.0', 'LICENSE.md', [['WOFF2/VF/SourceSans3VF-Upright.ttf.woff2', '200 900', 'normal', true]]),
  'Source Code Pro': O('source-code-pro', 'source-code-pro', '2.42.0', 'LICENSE.md', [['WOFF2/VF/SourceCodeVF-Upright.ttf.woff2', '200 900', 'normal', true]]),
  'Inter': V('inter', 'opsz', '5.3.0'),
  'JetBrains Mono': V('jetbrains-mono', 'wght', '5.3.0'),
  'IBM Plex Sans': O('ibm-plex-sans', '@ibm/plex-sans', '1.1.0', 'LICENSE.txt', [400, 500, 600, 700].map(w => [`fonts/complete/woff2/IBMPlexSans-${{ 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' }[w]}.woff2`, String(w)])),
  'IBM Plex Serif': O('ibm-plex-serif', '@ibm/plex-serif', '2.0.0', 'LICENSE.txt', [...[400, 500, 600, 700].map(w => [`fonts/complete/woff2/IBMPlexSerif-${{ 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' }[w]}.woff2`, String(w)]), ['fonts/complete/woff2/IBMPlexSerif-Italic.woff2', '400', 'italic']]),
  'IBM Plex Mono': O('ibm-plex-mono', '@ibm/plex-mono', '2.5.0', 'LICENSE.txt', [400, 500, 600].map(w => [`fonts/complete/woff2/IBMPlexMono-${{ 400: 'Regular', 500: 'Medium', 600: 'SemiBold' }[w]}.woff2`, String(w)])),
  'Fraunces': V('fraunces', 'opsz', '5.3.0'),
  'Source Serif 4': V('source-serif-4', 'opsz', '5.3.1', true),
  'DM Sans': V('dm-sans', 'opsz', '5.3.0'),
  'Space Grotesk': V('space-grotesk', 'wght', '5.3.0'),
  'Work Sans': V('work-sans', 'wght', '5.3.0'),
}
// Resume and cover-letter fonts from the ATS-safe list, served from templates/assets/fonts/documents.css as static
// 400 and 700 files: Chrome embeds static fonts in a PDF as ordinary TrueType text (variable web fonts become Type 3).
// Lato is not here (its license reserves "Lato" and the web files are subsets), so it still loads from Google Fonts
// (offline, the stack falls back to Arial).
export const DOC_FONTS_LOCAL = {
  'Garamond': { family: 'EB Garamond', ...S('eb-garamond', [400, 700], '5.3.0') },
  'Source Sans 3': { family: 'Source Sans 3', ...O('source-sans-3', 'source-sans', '3.52.0', 'LICENSE.md', [['WOFF2/TTF/SourceSans3-Regular.ttf.woff2', '400'], ['WOFF2/TTF/SourceSans3-Bold.ttf.woff2', '700']]) },
  'Roboto': { family: 'Roboto', ...S('roboto', [400, 700], '5.3.0') },
  'Open Sans': { family: 'Open Sans', ...S('open-sans', [400, 700], '5.3.0') },
}
export const FONT_SUBSETS = ['latin', 'latin-ext']

export const isLocalPageFont = name => Object.prototype.hasOwnProperty.call(PAGE_FONTS, name)
export const fontsCss = base => `${base}fonts/fonts.css`
export const documentsCss = base => `${base}fonts/documents.css`

// One-line onerror handlers (inline, so a page needs no extra script to fall back). First they try one folder further
// up (a page copied one level deeper, such as pages/interview-brief.html copied to jobs/<folder>/, still finds the
// files offline), then the pinned CDN file with its integrity hash (a published copy).
const LINK_FALLBACK = "if(this.dataset.up){this.onerror=null;this.href=this.dataset.fallback}else{this.dataset.up=1;this.href='../'+this.getAttribute('href')}"
const SCRIPT_FALLBACK = "this.onerror=null;var d=this.dataset,s=document.createElement('script');if(d.up){s.src=d.cdn;s.integrity=d.sri;s.crossOrigin='anonymous'}else{s.src='../'+this.getAttribute('src');s.dataset.up=1;s.dataset.cdn=d.cdn;s.dataset.sri=d.sri;s.setAttribute('onerror',this.getAttribute('onerror'))}this.after(s)"
export function fontsLinkLocal(base, googleHref) {
  return `<link rel="stylesheet" href="${fontsCss(base)}" data-fallback="${googleHref}" onerror="${LINK_FALLBACK}">`
}
export function libScript(name, base) {
  const L = LIBS[name]
  return `<script src="${base}${L.file}" data-cdn="${L.cdn}" data-sri="${L.sri}" onerror="${SCRIPT_FALLBACK}"></script>`
}
// A library <script> line in either form (local with fallback, or the pinned CDN tag).
export const LIB_SCRIPT_RE = name => new RegExp(`<script src="(?:[^"]*?templates/assets/${LIBS[name].file.replace(/[.]/g, '\\.')}|${LIBS[name].cdn.replace(/[.?/]/g, m => '\\' + m)})"[^>]*></script>`)

// The relative base from a file's folder to <workspace>/templates/assets/ (forward slashes, ending in /).
export function baseFor(root, fileDir, pathMod) {
  const rel = pathMod.relative(fileDir, pathMod.join(root, ASSET_DIR)).split(pathMod.sep).join('/')
  return (rel ? rel.split('/').map(encodeURIComponent).join('/') : '.') + '/'
}
// Rewrite every templates/assets/ reference in a page or template to the given base.
export function rebase(html, base) {
  return html.replace(/((?:src|href|url)\s*[=(]\s*["']?)(?:[^"'()\s]*?\/)?templates\/assets\//g, (_, a) => a + base)
}

// For a published copy (claude.ai artifacts load scripts from cdn.jsdelivr.net and fonts from Google Fonts, and the
// relative files aren't there): every local library becomes its pinned CDN tag with integrity, the local fonts line
// becomes its Google Fonts line, and the documents stylesheet import is dropped (published pages are never documents).
export function toCdn(html) {
  let out = html
  for (const name of Object.keys(LIBS)) {
    const L = LIBS[name]
    out = out.replace(LIB_SCRIPT_RE(name), `<script src="${L.cdn}" integrity="${L.sri}" crossorigin="anonymous"></script>`)
  }
  out = out.replace(/<link rel="stylesheet" href="[^"]*templates\/assets\/fonts\/fonts\.css" data-fallback="([^"]*)"[^>]*>/g, (_, g) => `<link rel="stylesheet" href="${g}">`)
  return out
}
