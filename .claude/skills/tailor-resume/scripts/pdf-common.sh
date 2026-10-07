#!/usr/bin/env bash
# Shared helpers for page-count.sh and make-pdf.sh. Source it; don't run it.
# Works in macOS bash 3.2, Linux bash, and Git Bash on Windows.

# find_browser: sets $browser to a Chrome, Edge or Chromium executable, or "" if none.
find_browser() {
  browser=""
  local pf pf86 lad b c
  pf="$(printenv ProgramFiles 2>/dev/null || true)"
  pf86="$(printenv 'ProgramFiles(x86)' 2>/dev/null || true)"
  lad="$(printenv LOCALAPPDATA 2>/dev/null || true)"
  if command -v cygpath >/dev/null 2>&1; then
    [ -n "$pf" ] && pf="$(cygpath -u "$pf")"
    [ -n "$pf86" ] && pf86="$(cygpath -u "$pf86")"
    [ -n "$lad" ] && lad="$(cygpath -u "$lad")"
  fi
  local candidates=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
    "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "$HOME/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  )
  for b in "$pf" "$pf86" "/c/Program Files" "/c/Program Files (x86)"; do
    [ -n "$b" ] || continue
    candidates+=("$b/Google/Chrome/Application/chrome.exe" "$b/Microsoft/Edge/Application/msedge.exe")
  done
  [ -n "$lad" ] && candidates+=("$lad/Google/Chrome/Application/chrome.exe" "$lad/Microsoft/Edge/Application/msedge.exe")
  for b in "${candidates[@]}"; do
    [ -f "$b" ] && { browser="$b"; return 0; }
  done
  for c in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable chrome msedge; do
    command -v "$c" >/dev/null 2>&1 && { browser="$c"; return 0; }
  done
  return 1
}

# native_path <path>: path as the browser/Python on this OS expects it.
native_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }

# make_tmpdir: sets $tmpdir to a fresh temporary folder (outside Dropbox/OneDrive).
make_tmpdir() { tmpdir="$(mktemp -d 2>/dev/null || mktemp -d -t pdfjob)"; }

# file_url_path <path>: the path percent-encoded for a file:// address (spaces, #, %, [, accents...),
# keeping / and the : of a Windows drive. A folder named "Job Search #1" would otherwise break the address.
file_url_path() {
  local s="$1" out="" c i LC_ALL=C
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [A-Za-z0-9/._~:-]) out="$out$c" ;;
      *) out="$out$(printf '%%%02X' $(( $(printf '%d' "'$c") & 255 )))" ;;
    esac
  done
  printf '%s' "$out"
}

# print_html <file.html> <out.pdf>: headless print with no header/footer.
# Paper size and margins come from the page's own CSS @page rule.
# Returns non-zero if no PDF was produced within 60 seconds.
# (No separate --user-data-dir on purpose: on macOS a fresh profile makes headless Chrome write the PDF
# and then never exit. Headless runs alongside an open Chrome/Edge window without trouble.)
print_html() {
  local html="$1" pdf="$2" src url out pid i last size stable
  src="$(cd "$(dirname "$html")" && pwd)/$(basename "$html")"
  if command -v cygpath >/dev/null 2>&1; then url="file:///$(file_url_path "$(cygpath -m "$src")")"; else url="file://$(file_url_path "$src")"; fi
  out="$(native_path "$pdf")"
  rm -f "$pdf"
  "$browser" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-extensions \
    --no-pdf-header-footer --print-to-pdf-no-header --virtual-time-budget=3000 \
    --print-to-pdf="$out" "$url" >/dev/null 2>&1 &
  pid=$!
  # Wait for the browser to exit, or for the PDF to exist and stop growing; never hang.
  last=-1; stable=0; i=0
  while [ "$i" -lt 120 ]; do
    kill -0 "$pid" 2>/dev/null || break
    if [ -s "$pdf" ]; then
      size="$(wc -c <"$pdf" | tr -d ' ')"
      if [ "$size" = "$last" ]; then stable=$((stable + 1)); else stable=0; last="$size"; fi
      [ "$stable" -ge 4 ] && break
    fi
    sleep 0.5 2>/dev/null || sleep 1
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null; sleep 1; kill -9 "$pid" 2>/dev/null; fi
  wait "$pid" 2>/dev/null
  [ -s "$pdf" ]
}

# count_pages <file.pdf>: prints the number of pages.
count_pages() {
  local n=""
  if command -v pdfinfo >/dev/null 2>&1; then
    n="$(pdfinfo "$1" 2>/dev/null | awk '/^Pages:/ {print $2}')"
  fi
  [ -n "$n" ] || n="$(LC_ALL=C grep -a -o -E '/Type[[:space:]]*/Page([^s]|$)' "$1" | wc -l | tr -d ' ')"
  printf '%s\n' "$n"
}

# paper_size <file.pdf>: prints Letter, A4, or the size in points.
paper_size() {
  local box w h
  if command -v pdfinfo >/dev/null 2>&1; then
    box="$(pdfinfo "$1" 2>/dev/null | awk -F': *' '/^Page size:/ {print $2}')"
    w="$(printf '%s' "$box" | awk '{print int($1+0.5)}')"; h="$(printf '%s' "$box" | awk '{print int($3+0.5)}')"
  else
    box="$(LC_ALL=C grep -a -o -E '/MediaBox[[:space:]]*\[[^]]*\]' "$1" | head -1 | tr -d '[]/MediaBox')"
    w="$(printf '%s' "$box" | awk '{print int($3-$1+0.5)}')"; h="$(printf '%s' "$box" | awk '{print int($4-$2+0.5)}')"
  fi
  case "$w x $h" in
    "612 x 792") echo "Letter" ;;
    "595 x 842") echo "A4" ;;
    " x "|"0 x 0") echo "unknown" ;;
    *) echo "$w x $h pt" ;;
  esac
}
