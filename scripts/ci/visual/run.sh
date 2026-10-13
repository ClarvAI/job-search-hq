#!/usr/bin/env bash
# Runs the visual, accessibility and print harness (scripts/ci/visual/visual.mjs). Maintainers only; manual.
# Needs Node 18+, npm (comes with Node), network access (Tailwind, fonts and the CDN scripts load from the web),
# and Google Chrome (or set CHROME=/path/to/chrome-or-chromium). pdfinfo, pdftoppm and qpdf are optional.
#
#   bash scripts/ci/visual/run.sh [--quick] [--out <folder>] [--themes default,brand] [--pages dashboard] [--no-docs]
#
# playwright-core and axe-core are installed once into $VISUAL_TOOLS (default: <tmp>/jshq-visual-tools), never
# into the repo. No browser is downloaded: Playwright drives the system Chrome (channel "chrome").
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
tools="${VISUAL_TOOLS:-${TMPDIR:-/tmp}/jshq-visual-tools}"
tools="${tools%/}"
export VISUAL_TOOLS="$tools"
if [ ! -f "$tools/node_modules/playwright-core/package.json" ] || [ ! -f "$tools/node_modules/axe-core/axe.min.js" ]; then
  mkdir -p "$tools"
  [ -f "$tools/package.json" ] || printf '{ "name": "jshq-visual-tools", "private": true }\n' > "$tools/package.json"
  echo "installing playwright-core and axe-core into $tools"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$tools" --no-audit --no-fund --loglevel=error \
    playwright-core@1.56.1 axe-core@4.11.0
fi
exec node "$here/visual.mjs" "$@"
