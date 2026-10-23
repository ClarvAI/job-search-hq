#!/usr/bin/env bash
# Makes the final PDF of a checked resume or cover letter, next to the source file, then reports
# paper size, page count and (if pdftotext is installed) a plain-text parse check.
#
# Usage:
#   bash .claude/skills/tailor-resume/scripts/make-pdf.sh jobs/<folder>/resume.html "First Last" "Company"
#   bash .claude/skills/tailor-resume/scripts/make-pdf.sh jobs/<folder>/cover-letter.html "First Last" "Company"
#   bash .claude/skills/tailor-resume/scripts/make-pdf.sh jobs/<folder>/resume.rendercv.yaml "First Last" "Company"
#
# .html  -> printed with headless Chrome/Edge/Chromium; paper size and margins come from the page's @page rule;
#           no header or footer.
# .yaml  -> rendered with RenderCV (only if `rendercv` is already installed).
# Output file: <First>-<Last>-Resume-<Company>.pdf, or <First>-<Last>-Cover-Letter-<Company>.pdf when the
# source file name contains "cover", or <First>-<Last>-Resume-<Company>-Designed.pdf when it contains "designed"
# (the optional designed resume, made from profile/templates/resume-designed-template.html or, if the user has no
# themed copy, templates/resume-designed-template.html).
#
# Output lines (first line is the status):
#   pdf: <path>            then  paper: Letter|A4|...  pages: N  parse: ...  (and maybe parse-note: ..., title-warning: ...
#                          when the page's <title> is empty or still the template's "Your Name", or layout-warning: ...
#                          when the last page holds only a few lines or a heading ends a page)
#   no-browser             no Chrome/Edge/Chromium found: fall back to the manual Print -> Save as PDF steps
#   no-rendercv            RenderCV isn't installed: use the .html route instead
#   print-failed           no PDF, or one that came out blank (no text) or without the name, email and phone; a
#                          bad PDF is saved as <final name>-CHECK.pdf (never under the final name) and a "check:" line
#                          says where
#   render-failed / not-found: <path> / usage: ...
#   refused: ...           (exit 2) the file isn't inside jobs/, is a link, has a ".." part, or is an address
#                          (file://...); nothing is printed. Pages are printed with JavaScript and outside requests
#                          off, and with no frames (pdf-common.sh print_html).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/pdf-common.sh"

src="${1:-}"; person="${2:-}"; company="${3:-}"
if [ -z "$src" ] || [ -z "$person" ] || [ -z "$company" ]; then
  echo 'usage: make-pdf.sh <resume.html|cover-letter.html|resume.rendercv.yaml> "First Last" "Company"'; exit 2
fi
[ -f "$src" ] || { echo "not-found: $src"; exit 1; }
# Only a file in a job folder (jobs/): this script may run outside Codex's sandbox and writes the PDF next to it.
check_source "$src" jobs || exit 2

# File-name pieces: letters (accented ones kept), digits and hyphens only ("Bluth & Sons Labs" -> "Bluth-Sons-Labs",
# "O'Neil" with a straight or curly apostrophe -> "O-Neil"), the same rule the Apply Kit panel uses to find the file
# (JavaScript: replace(/[^\p{L}\p{N}]+/gu, '-'), trimmed). perl knows Unicode letters; it ships with macOS, Linux
# and Git for Windows (python3 is the second choice). Without either, ASCII letters and digits plus any non-ASCII
# bytes are kept, which can differ from the panel for punctuation such as a curly apostrophe.
slug() {
  if command -v perl >/dev/null 2>&1; then
    printf '%s' "$1" | perl -CS -pe 's/[^\p{L}\p{N}]+/-/g; s/^-+|-+$//g'
  elif command -v python3 >/dev/null 2>&1 && python3 -c 1 >/dev/null 2>&1; then
    python3 -I -c 'import re,sys; print(re.sub(r"[\W_]+", "-", sys.argv[1]).strip("-"), end="")' "$1"
  else
    printf '%s' "$1" | LC_ALL=C tr -cs 'A-Za-z0-9\200-\377' '-' | LC_ALL=C sed -e 's/^-//' -e 's/-$//'
  fi
}
base="$(basename "$src")"
case "$(printf '%s' "$base" | tr 'A-Z' 'a-z')" in *cover*) kind="Cover-Letter" ;; *) kind="Resume" ;; esac
# The optional designed resume (resume-designed.html) gets its own name, so the ATS resume's name never changes.
suffix=""
case "$(printf '%s' "$base" | tr 'A-Z' 'a-z')" in *designed*) [ "$kind" = "Resume" ] && suffix="-Designed" ;; esac
dir="$(cd "$(dirname "$src")" && pwd)"
final="$dir/$(slug "$person")-$kind-$(slug "$company")$suffix.pdf"

make_tmpdir
trap 'rm -rf "$tmpdir"' EXIT
tmp_pdf="$tmpdir/out.pdf"

case "$(printf '%s' "$base" | tr 'A-Z' 'a-z')" in
  *.yaml|*.yml)
    command -v rendercv >/dev/null 2>&1 || { echo "no-rendercv"; exit 0; }
    rendercv render "$(native_path "$dir/$base")" -nomd -nohtml -nopng -q \
      --typst-path "$(native_path "$tmpdir/out.typ")" --pdf-path "$(native_path "$tmp_pdf")" >"$tmpdir/rendercv.log" 2>&1
    if [ ! -s "$tmp_pdf" ]; then
      echo "render-failed"; sed -n '1,25p' "$tmpdir/rendercv.log"; exit 1
    fi
    engine="rendercv" ;;
  *.html|*.htm)
    find_browser || { echo "no-browser"; exit 0; }
    print_html "$src" "$tmp_pdf" || { echo "print-failed"; exit 1; }
    engine="browser" ;;
  *) echo "unsupported: $base (use .html or .rendercv.yaml)"; exit 2 ;;
esac

# ---- Is it a real document? A blank page, or one without the person's name, email and phone, is never saved
# under the final name (the Apply Kit offers that name for uploads).
lower() { tr 'A-Z' 'a-z'; }
email="$(grep -o -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$src" 2>/dev/null | head -1)"
bad=""
# The text check needs pdftotext's output; without it (no pdftotext, one that failed, or one that wrote nothing) fall
# back to looking for a font in the PDF (make-pdf.ps1 does the same).
if command -v pdftotext >/dev/null 2>&1 && pdftotext -enc UTF-8 "$tmp_pdf" "$tmpdir/check.txt" 2>/dev/null \
   && [ -f "$tmpdir/check.txt" ]; then
  if [ -z "$(tr -d '[:space:]' < "$tmpdir/check.txt")" ]; then bad="it has no text"
  else
    seen=""
    lower < "$tmpdir/check.txt" | grep -q -F "$(printf '%s' "$person" | lower)" && seen=1
    [ -n "$email" ] && grep -q -i -F "$email" "$tmpdir/check.txt" && seen=1
    # Phone: the last 7 digits of the first phone-like number in the source, anywhere in the PDF's digits.
    ph="$(grep -o -E '\+?\(?[0-9][0-9 ().-]{7,}[0-9]' "$src" 2>/dev/null | head -1 | tr -cd '0-9')"
    [ "${#ph}" -ge 7 ] && tr -cd '0-9' < "$tmpdir/check.txt" | grep -q "${ph: -7}" && seen=1
    [ -n "$seen" ] || bad="the name, email and phone are all missing from its text"
  fi
elif ! LC_ALL=C grep -a -q '/Font' "$tmp_pdf"; then
  bad="it has no text"
fi
check_pdf="${final%.pdf}-CHECK.pdf"
if [ -n "$bad" ]; then
  mv -f "$tmp_pdf" "$check_pdf" 2>/dev/null || check_pdf=""
  echo "print-failed"
  [ -n "$check_pdf" ] && echo "check: $check_pdf ($bad; saved under this name so it can't be uploaded by mistake)"
  [ -f "$final" ] && echo "old: $final is from an earlier run and may not match the current file"
  exit 1
fi
rm -f "$check_pdf"

mv -f "$tmp_pdf" "$final" || { echo "save-failed: $final (is the PDF open in another app?)"; exit 1; }
paper="$(paper_size "$final")"
echo "pdf: $final"
echo "engine: $engine"
echo "paper: $paper"
echo "pages: $(count_pages "$final")"

# Paper size the source asked for, so a mismatch is caught.
want=""
if [ "$engine" = "browser" ]; then
  want="$(tr '\n' ' ' <"$src" | grep -o -i -E '@page[^}]*' | grep -o -i -E 'size:[[:space:]]*[a-z0-9]+' | head -1 | sed 's/.*:[[:space:]]*//')"
else
  want="$(grep -E '^[[:space:]]+size:' "$src" | head -1 | sed 's/.*size:[[:space:]]*//; s/[[:space:]#].*//')"
fi
case "$(printf '%s' "$want" | tr 'A-Z' 'a-z')" in
  letter|us-letter) want="Letter" ;; a4) want="A4" ;; *) want="" ;;
esac
[ -n "$want" ] && [ "$want" != "$paper" ] && echo "paper-warning: the file asks for $want but the PDF came out $paper"

# The <title> becomes the PDF's title (screen readers announce it); the template's placeholder must not survive.
if [ "$engine" = "browser" ]; then
  title="$(tr '\n' ' ' <"$src" | grep -o -i -E '<title>[^<]*</title>' | head -1 | sed -e 's/<[^>]*>//g' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  case "$title" in
    ""|*"Your Name"*) echo "title-warning: the page title is \"$title\"; set <title> to the person's name and \"Resume\" or \"Cover Letter\" (it becomes the PDF's title, which screen readers announce), then make the PDF again" ;;
  esac
fi
# A photo is never added by default (AGENTS.md ground rule 4): say so whenever the document has one.
if [ "$engine" = "browser" ] && awk '/<!--/{c=1} c{ if ($0 ~ /-->/) c=0; next } {print}' "$src" | grep -q -i '<img[[:space:]>]'; then
  echo "photo-note: this document includes a photo. Keep it only if the user chose to add one for this application; employers in the US, UK, Canada and Australia usually expect none."
fi

# ---- Parse check: does the PDF's text layer read back cleanly, in order? ----
if ! command -v pdftotext >/dev/null 2>&1; then echo "parse: skipped (pdftotext not installed)"; exit 0; fi
pdftotext -enc UTF-8 "$final" "$tmpdir/text.txt" 2>/dev/null || { echo "parse: failed (pdftotext could not read the PDF)"; exit 0; }
text="$tmpdir/text.txt"

# Visible source text (HTML: drop <head>, comments and the on-screen help box; YAML: as is).
if [ "$engine" = "browser" ]; then
  awk 'BEGIN{skip=0} /<head[ >]/{skip=1} /<\/head>/{skip=0; next} /<!--/{c=1} c{ if ($0 ~ /-->/) c=0; next }
       /class="screen-only"/{next} !skip{print}' "$src" \
    | sed -e 's/<[^>]*>/ /g' -e 's/&amp;/\&/g' -e 's/&nbsp;/ /g' >"$tmpdir/source.txt"
else
  cp "$src" "$tmpdir/source.txt"
fi
source_txt="$tmpdir/source.txt"
problems=""; good=""; note=""
add_problem() { problems="${problems:+$problems; }$1"; }
add_good() { good="${good:+$good, }$1"; }

# Name near the top.
if grep -v '^[[:space:]]*$' "$text" | head -3 | lower | grep -q -F "$(printf '%s' "$person" | lower)"; then add_good "name"
else add_problem "name not in the first lines"; fi

# Email (the first one in the visible text).
email="$(grep -o -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$source_txt" | head -1)"
if [ -z "$email" ]; then add_problem "no email in the file"
elif grep -q -i -F "$email" "$text"; then add_good "email"
else add_problem "email $email not readable"; fi

# Phone (compare the last 10 digits; formatting may change).
# First run of 9-15 digits written like a phone number (skips dates such as 2022-09 or 2022-2027).
digits=""
while IFS= read -r cand; do
  d="$(printf '%s' "$cand" | tr -cd '0-9')"
  if [ "${#d}" -ge 9 ] && [ "${#d}" -le 15 ]; then digits="$d"; break; fi
done <<EOF
$(grep -o -E '\+?\(?[0-9][0-9 ().-]{7,}[0-9]' "$source_txt")
EOF
[ "${#digits}" -gt 10 ] && digits="${digits: -10}"
if [ "${#digits}" -lt 7 ]; then add_problem "no phone in the file"
elif grep -v '^[[:space:]]*$' "$text" | head -12 | tr -cd '0-9' | grep -q "$digits"; then add_good "phone"
else add_problem "phone not readable near the top"; fi

# Section headings, in the same order as the source (resumes only).
if [ "$kind" = "Resume" ]; then
  if [ "$engine" = "browser" ]; then
    tr '\n' ' ' <"$src" | grep -o -i -E '<h2[^>]*>[^<]*</h2>' | sed -e 's/<[^>]*>//g' -e 's/&amp;/\&/g' >"$tmpdir/headings.txt"
  else
    awk '/^  sections:/{s=1; next} s && /^  [^ ]/{s=0} s && /^    [^ -][^:]*:[[:space:]]*$/{sub(/^ +/,""); sub(/:[[:space:]]*$/,""); gsub(/_/," "); print}' "$src" >"$tmpdir/headings.txt"
  fi
  nh="$(grep -c . "$tmpdir/headings.txt" | tr -d ' ')"
  if [ "$nh" -gt 0 ]; then
    # [[:space:]] also strips the form feed pdftotext puts before the first line of each new page (a heading at the
    # top of page 2 would otherwise never match).
    missing="$(awk 'function t(s){gsub(/^[[:space:]]+|[[:space:]]+$/,"",s); return tolower(s)}
      NR==FNR { if (t($0)!="") want[++n]=t($0); next }
      { line=t($0); if (i<n && line==want[i+1]) i++ }
      END { if (i<n) print want[i+1] }' "$tmpdir/headings.txt" "$text")"
    if [ -z "$missing" ]; then add_good "$nh headings in order"
    else add_problem "heading \"$missing\" missing or out of order"; fi
  else
    add_problem "no section headings found"
  fi
fi

# Dates: every year in the source shows up, in the same order.
src_years="$(grep -o -E '(^|[^0-9])(19|20)[0-9]{2}([^0-9]|$)' "$source_txt" | tr -cd '0-9\n' | grep -v '^$' | tr '\n' ' ')"
pdf_years="$(grep -o -E '(^|[^0-9])(19|20)[0-9]{2}([^0-9]|$)' "$text" | tr -cd '0-9\n' | grep -v '^$' | tr '\n' ' ')"
if [ -z "$src_years" ]; then add_problem "no dates found"
elif [ "$src_years" = "$pdf_years" ]; then add_good "dates in order"
else
  lost=""
  for y in $src_years; do printf '%s' " $pdf_years" | grep -q " $y " || lost="$y"; done
  if [ -n "$lost" ]; then add_problem "date $lost not readable"
  else
    # Every date is there, just read in another order: usually a year standing alone at the right of a line
    # (a project or award). Applicant tracking systems handle that; it is a note, not something to fix.
    add_good "dates readable"
    note="dates read in a slightly different order than on the page (usually a year on its own at the right of a line); that's fine, don't change the layout for it"
  fi
fi

# Characters with no readable text behind them: U+FFFD, the private-use area (where icon fonts put their symbols)
# and "(cid:" markers. An applicant tracking system reads them as garbage.
if LC_ALL=C grep -q -e "$(printf '\357\277\275')" -e "$(printf '\356')" -e "$(printf '\357[\200-\243]')" "$text" \
   || grep -q -F '(cid:' "$text"; then
  add_problem "unreadable characters in the text (usually an icon, or a font with no text behind it: use plain words such as \"Email:\")"
fi

if [ -z "$problems" ]; then echo "parse: ok ($good)"
else echo "parse: check these: $problems${good:+ (fine: $good)}"; fi
[ -n "$note" ] && echo "parse-note: $note"

# Layout: a last page with only a few lines, or a section heading left alone at the bottom of a page.
# pdftotext puts a form feed at the start of each new page's first line (and one after the last page).
[ -f "$tmpdir/headings.txt" ] || : >"$tmpdir/headings.txt"
layout="$(awk 'function t(s){gsub(/^[[:space:]]+|[[:space:]]+$/,"",s); return tolower(s)}
  FILENAME == ARGV[1] { x=$0; gsub(/^[[:space:]]+|[[:space:]]+$/,"",x); if (x!="") h[tolower(x)]=x; next }
  { while (index($0, "\f") == 1) { p++; n[p]=c; last[p]=l; c=0; l=""; $0=substr($0, 2) }
    if (t($0)!="") { c++; l=t($0) } }
  END { if (c>0) { p++; n[p]=c; last[p]=l }
    out=""
    for (i=1; i<p; i++) if (last[i] in h) out=out (out=="" ? "" : "; ") "heading \"" h[last[i]] "\" is the last line of page " i
    if (p>=2 && n[p]*5 < n[1]) out=out (out=="" ? "" : "; ") "the last page holds only " n[p] " lines of text (page 1 has " n[1] ")"
    print out }' "$tmpdir/headings.txt" "$text")"
[ -n "$layout" ] && echo "layout-warning: $layout"
exit 0
