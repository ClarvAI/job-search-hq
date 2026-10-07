#!/usr/bin/env bash
# Prints an HTML file to a throwaway PDF with Chrome or Edge (headless) and reports how many pages it takes.
# Usage: bash .claude/skills/tailor-resume/scripts/page-count.sh jobs/<folder>/resume.html
# Output: "pages: N", or "no-browser" if no Chrome/Edge/Chromium is installed, or "print-failed".
# To make the final PDF the user sends, use make-pdf.sh instead.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/pdf-common.sh"

html="${1:?usage: page-count.sh <file.html>}"
[ -f "$html" ] || { echo "not-found: $html"; exit 1; }
find_browser || { echo "no-browser"; exit 0; }

make_tmpdir
trap 'rm -rf "$tmpdir"' EXIT
print_html "$html" "$tmpdir/check.pdf" || { echo "print-failed"; exit 1; }
echo "pages: $(count_pages "$tmpdir/check.pdf")"
