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
# (the optional designed resume, templates/resume-designed-template.html).
#
# Output lines (first line is the status):
#   pdf: <path>            then  paper: Letter|A4|...  pages: N  parse: ...
#   no-browser             no Chrome/Edge/Chromium found: fall back to the manual Print -> Save as PDF steps
#   no-rendercv            RenderCV isn't installed: use the .html route instead
#   print-failed / render-failed / not-found: <path> / usage: ...
set -u
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/pdf-common.sh"

src="${1:-}"; person="${2:-}"; company="${3:-}"
if [ -z "$src" ] || [ -z "$person" ] || [ -z "$company" ]; then
  echo 'usage: make-pdf.sh <resume.html|cover-letter.html|resume.rendercv.yaml> "First Last" "Company"'; exit 2
fi
[ -f "$src" ] || { echo "not-found: $src"; exit 1; }

# File-name pieces: letters (accented ones kept), digits and hyphens only ("Bluth & Sons Labs" -> "Bluth-Sons-Labs"),
# the same rule the Apply Kit panel uses to find the file.
slug() { printf '%s' "$1" | LC_ALL=C tr -cs 'A-Za-z0-9\200-\377' '-' | LC_ALL=C sed -e 's/^-//' -e 's/-$//'; }
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
problems=""; good=""
add_problem() { problems="${problems:+$problems; }$1"; }
add_good() { good="${good:+$good, }$1"; }
lower() { tr 'A-Z' 'a-z'; }

# Name near the top.
if grep -v '^[[:space:]]*$' "$text" | head -3 | lower | grep -q -F "$(printf '%s' "$person" | lower)"; then add_good "name"
else add_problem "name not in the first lines"; fi

# Email.
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
    missing="$(awk 'function t(s){gsub(/^[ \t]+|[ \t]+$/,"",s); return tolower(s)}
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
  else add_problem "dates read in a different order than on the page (check the PDF's text order)"; fi
fi

if [ -z "$problems" ]; then echo "parse: ok ($good)"
else echo "parse: check these: $problems${good:+ (fine: $good)}"; fi
exit 0
