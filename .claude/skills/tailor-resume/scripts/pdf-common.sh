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

# check_source <file> <folder>...: these scripts may run outside Codex's sandbox (.codex/rules), so they print only a
# plain file (not a link) inside one of the named workspace folders (e.g. jobs, profile/templates). Refused: an
# address (file://, https://...), a path with a ".." part, a link, or a file whose real folder (links followed) is
# anywhere else. Prints "refused: ..." and returns 1; returns 0 when the file may be printed.
check_source() {
  local f="$1" root real d up p
  shift
  case "$f" in
    *://*|[Ff][Ii][Ll][Ee]:*) echo "refused: $f is an address, not a file; give the path of a file in this folder (e.g. jobs/<folder>/resume.html)"; return 1 ;;
  esac
  case "/$(printf '%s' "$f" | tr '\\' '/')/" in
    */../*) echo "refused: $f has a \"..\" part; give the plain path of the file (e.g. jobs/<folder>/resume.html)"; return 1 ;;
  esac
  if [ -L "$f" ]; then echo "refused: $f is a link (shortcut); print the real file in its job folder instead"; return 1; fi
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." 2>/dev/null && pwd -P)" || { echo "refused: cannot find the workspace folder"; return 1; }
  real="$(cd "$(dirname "$f")" 2>/dev/null && pwd -P)" || { echo "refused: cannot open the folder of $f"; return 1; }
  # Walk up from the file's real folder; -ef (same folder) also matches a path typed in other capitals.
  d="$real"
  while :; do
    for p in "$@"; do
      if [ -d "$root/$p" ] && [ "$d" -ef "$root/$p" ]; then return 0; fi
    done
    up="$(dirname "$d")"; [ "$up" = "$d" ] && break; d="$up"
  done
  local places="" q
  for q in "$@"; do places="${places:+$places or }$q/"; done
  echo "refused: $f is not inside $places of this folder; these scripts only print files there"
  return 1
}

# Flags that keep a printed page from reaching the network: every request goes to a proxy that isn't there, except
# Google Fonts (the documents' Lato font loads from it); names don't resolve (no DNS lookups to leak through).
# Pages built from the app's templates need nothing else: their fonts ship in templates/assets/fonts/. JavaScript is
# turned off by the copy's content rules (PRINT_CSP), not by --blink-settings=scriptEnabled=false, which stops
# headless Chrome from printing at all.
LOCKDOWN_FLAGS=(--proxy-server=127.0.0.1:9 "--proxy-bypass-list=<-loopback>;fonts.googleapis.com;fonts.gstatic.com"
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com"
  --dns-prefetch-disable --disable-background-networking --disable-sync --disable-component-update --no-service-autorun)
# The page's content rules, set first thing in the printed copy: styles, fonts and images from files (or Google Fonts),
# nothing else. No frames or objects (a frame could show another file on this computer in the PDF), no scripts.
PRINT_CSP="default-src 'none'; style-src 'unsafe-inline' file: data: https://fonts.googleapis.com; font-src file: data: https://fonts.gstatic.com; img-src file: data:; script-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; connect-src 'none'; media-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'"

# print_copy <page.html> <copy.html> <folder address/>: writes the copy that is printed: the page with its own
# charset, a <base> pointing at the page's folder (so its fonts, styles and images load as before), and PRINT_CSP
# put before everything else; any <base> and <meta http-equiv="refresh"> (which could send the print to another
# file) are taken out. Needs perl or python3; returns 1 if neither could write it.
print_copy() {
  # shellcheck disable=SC2016  # Perl code, not shell
  local perl_copy='use strict; use warnings;
my ($in, $out, $base, $csp) = @ARGV;
open(my $fh, "<:raw", $in) or exit 1; local $/; my $s = <$fh>; close $fh;
$s =~ s/^\xEF\xBB\xBF//;
my $cs = ($s =~ /<meta\b[^>]*?charset\s*=\s*["\x27]?\s*([A-Za-z0-9._:-]+)/i) ? $1 : "utf-8";
$s =~ s/<meta\b[^>]*?http-equiv\s*=\s*["\x27]?\s*refresh\b[^>]*>//gi;
$s =~ s/<base\b[^>]*>//gi;
my $head = qq{<meta charset="$cs"><base href="$base"><meta http-equiv="Content-Security-Policy" content="$csp">};
if ($s =~ s/\A\s*(?:<!--.*?-->\s*)*<!doctype\b[^>]*>//is) { $s = "<!DOCTYPE html>" . $head . $s } else { $s = $head . $s }
open(my $o, ">:raw", $out) or exit 1; print $o $s; close $o or exit 1;'
  local py_copy='import re, sys
src, out, base, csp = sys.argv[1:5]
s = open(src, "rb").read().decode("latin-1")
if s.startswith("\xef\xbb\xbf"): s = s[3:]
m = re.search(r"<meta\b[^>]*?charset\s*=\s*[\"\x27]?\s*([A-Za-z0-9._:-]+)", s, re.I)
cs = m.group(1) if m else "utf-8"
s = re.sub(r"<meta\b[^>]*?http-equiv\s*=\s*[\"\x27]?\s*refresh\b[^>]*>", "", s, flags=re.I)
s = re.sub(r"<base\b[^>]*>", "", s, flags=re.I)
head = "<meta charset=\"%s\"><base href=\"%s\"><meta http-equiv=\"Content-Security-Policy\" content=\"%s\">" % (cs, base, csp)
s2, n = re.subn(r"\A\s*(?:<!--.*?-->\s*)*<!doctype\b[^>]*>", "", s, count=1, flags=re.I | re.S)
s = ("<!DOCTYPE html>" + head + s2) if n else (head + s)
open(out, "wb").write(s.encode("latin-1"))'
  rm -f "$2"
  if command -v perl >/dev/null 2>&1 && perl -e "$perl_copy" "$1" "$2" "$3" "$PRINT_CSP" 2>/dev/null && [ -s "$2" ]; then return 0; fi
  if command -v python3 >/dev/null 2>&1 && python3 -I -c "$py_copy" "$(native_path "$1")" "$(native_path "$2")" "$3" "$PRINT_CSP" 2>/dev/null && [ -s "$2" ]; then return 0; fi
  rm -f "$2"; return 1
}

# file_url <absolute path>: the file:// address of a path on this computer.
file_url() {
  if command -v cygpath >/dev/null 2>&1; then printf 'file:///%s' "$(file_url_path "$(cygpath -m "$1")")"; else printf 'file://%s' "$(file_url_path "$1")"; fi
}

# print_html <file.html> <out.pdf>: headless print with no header/footer, tagged (Chrome's default), with bookmarks
# made from the headings (--generate-pdf-document-outline, Chrome 121+; older browsers ignore the switch).
# Paper size and margins come from the page's own CSS @page rule. What is printed is a locked-down copy next to the
# PDF (print_copy: no scripts, frames or outside requests; the page itself if neither perl nor python3 exists), with
# LOCKDOWN_FLAGS.
# Returns non-zero if no PDF was produced within 60 seconds.
# (No separate --user-data-dir on purpose: on macOS a fresh profile makes headless Chrome write the PDF
# and then never exit. Headless runs alongside an open Chrome/Edge window without trouble.)
print_html() {
  local html="$1" pdf="$2" src url out pid i last size stable copy
  src="$(cd "$(dirname "$html")" && pwd -P)/$(basename "$html")"
  copy="${pdf%.pdf}.print.html"
  if print_copy "$src" "$copy" "$(file_url "$(dirname "$src")")/"; then url="$(file_url "$copy")"; else url="$(file_url "$src")"; fi
  out="$(native_path "$pdf")"
  rm -f "$pdf"
  "$browser" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-extensions \
    "${LOCKDOWN_FLAGS[@]}" \
    --no-pdf-header-footer --print-to-pdf-no-header --virtual-time-budget=3000 --generate-pdf-document-outline \
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
