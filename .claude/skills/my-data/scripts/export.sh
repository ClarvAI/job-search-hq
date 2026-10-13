#!/usr/bin/env bash
# Makes a dated zip backup of the user's own job-search data in a folder OUTSIDE the workspace.
# Usage: bash .claude/skills/my-data/scripts/export.sh [destination-folder] [--include-imports] [--include-templates]
#   destination-folder  default: ~/Downloads (created if missing; must be outside the workspace)
# Includes: profile/ jobs/ contacts/ outbox/ interviews/ history/ knowledge/field/ pages/ (the user-owned paths), plus resume.json at the top
# if profile/resume.json exists (the assistant writes it just before exporting).
# Never includes .claude/ .agents/ .codex/ .git/; templates/ and imports/ only when asked.
# Links (shortcuts) are left out, each reported as "skipped link: <path>".
# Output: last line "saved: <path>" on success; "error: ..." and exit 1 otherwise.
set -u

die() { echo "error: $*"; exit 1; }

# The workspace root is four levels above this script; it must contain AGENTS.md.
here="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || die "cannot find the script folder"
ROOT="$(cd "$here/../../../.." 2>/dev/null && pwd -P)" || die "cannot find the workspace"
[ -f "$ROOT/AGENTS.md" ] || die "this script is not inside a Job Search HQ workspace ($ROOT)"
[ -d "$ROOT/profile" ] || die "there is nothing to back up yet (no profile folder; setup has not run)"

dest=""; with_imports=""; with_templates=""
for a in "$@"; do
  case "$a" in
    --include-imports) with_imports=1 ;;
    --include-templates) with_templates=1 ;;
    -*) die "unknown option $a" ;;
    *) dest="$a" ;;
  esac
done
[ -n "$dest" ] || dest="$HOME/Downloads"
# shellcheck disable=SC2088  # a literal "~" typed by the user, expanded on purpose
case "$dest" in "~"|"~/"*) dest="$HOME${dest#\~}" ;; esac
made=""; [ -d "$dest" ] || made=1
mkdir -p "$dest" 2>/dev/null || die "cannot create the folder $dest"
dest="$(cd "$dest" && pwd -P)" || die "cannot open the folder $dest"
# Inside the workspace? Compare each folder up from $dest with the workspace itself (-ef: same folder), so a
# path typed in other capitals on a Mac or Windows, or reached through a link, is caught too.
inside=""
case "$dest/" in "$ROOT/"*) inside=1 ;; esac
d="$dest"
while [ -z "$inside" ]; do
  [ "$d" -ef "$ROOT" ] && inside=1
  p="$(dirname "$d")"; [ "$p" = "$d" ] && break; d="$p"
done
if [ -n "$inside" ]; then
  [ -n "$made" ] && rmdir "$dest" 2>/dev/null
  die "the backup folder must be outside the workspace (pick e.g. Downloads or Documents)"
fi

stamp="$(date +%Y-%m-%d)"
name="job-search-backup-$stamp"
[ -e "$dest/$name.zip" ] && name="job-search-backup-$stamp-$(date +%H%M%S)"
out="$dest/$name.zip"

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t jshq)" || die "cannot make a temporary folder"
trap 'rm -rf "$tmp"' EXIT
stage="$tmp/$name"; mkdir -p "$stage" || die "cannot make a temporary folder"

dirs="profile jobs contacts outbox interviews history knowledge/field pages"
[ -n "$with_imports" ] && dirs="$dirs imports"
[ -n "$with_templates" ] && dirs="$dirs templates"
for d in $dirs; do
  # A parent folder that is a link (knowledge/ for knowledge/field) would copy whatever it points to.
  case "$d" in */*) if [ -L "$ROOT/${d%/*}" ]; then echo "skipped link: ${d%/*}"; continue; fi ;; esac
  if [ -e "$ROOT/$d" ] || [ -L "$ROOT/$d" ]; then
    mkdir -p "$(dirname "$stage/$d")" && cp -R "$ROOT/$d" "$stage/$d" || die "could not copy all of $d (nothing was saved)"
  fi
done
# Links (shortcuts) point outside the backup; leave them out rather than copy whatever they point to.
# (NUL-separated, so a name with a line break in it can't turn into another path.)
find "$stage" -type l -print0 | while IFS= read -r -d '' l; do echo "skipped link: ${l#"$stage"/}"; rm -f -- "$l"; done
# Leave out throwaway files: publish copies, theme previews, page-count PDFs, OS clutter.
rm -rf "$stage/pages/.publish" "$stage/pages/.preview"
find "$stage" \( -name '*.check.pdf' -o -name '.DS_Store' -o -name 'Thumbs.db' -o -name '~$*' \) -exec rm -f {} + 2>/dev/null
if [ -f "$ROOT/profile/resume.json" ] && [ ! -L "$ROOT/profile/resume.json" ] && [ ! -L "$ROOT/profile" ]; then
  cp "$ROOT/profile/resume.json" "$stage/resume.json" || die "could not copy profile/resume.json (nothing was saved)"
fi

{
  echo "Job search backup made $stamp."
  echo ""
  echo "profile/     your master resume, stories, preferences, writing style, references"
  echo "jobs/        tracker.csv (opens in Excel), leads.csv (openings found, not yet saved) and one folder per job"
  echo "contacts/    contacts.csv: people you met or wanted to meet"
  echo "outbox/      message drafts; sent/ holds what you sent"
  echo "interviews/  interview notes, mock-interview scorecards, weekly reviews"
  echo "history/     activity.md: what changed and when"
  echo "knowledge/field/  your field pack: primer, keywords, target employers, role questions, background"
  echo "pages/       dashboard, flashcards, portfolio (open in a browser)"
  [ -f "$stage/resume.json" ] && echo "resume.json  your resume in JSON Resume format (jsonresume.org), for tools that import it"
  echo ""
  echo "This backup holds other people's names and contact details (contacts, references, interviewers)."
  echo "Keep it private: don't post it or share it, and delete old copies you no longer need."
  echo "To restore, open the folder in the app and say 'restore my backup'."
} > "$stage/READ-ME.txt" || die "could not write the backup's READ-ME (nothing was saved)"

count="$(find "$stage" -type f -print0 | tr -dc '\000' | wc -c | tr -d ' ')"
# The zip must mark names like "Müller" as UTF-8, or Windows and other unzip tools show them garbled. Python's
# zipfile and Perl's IO::Compress::Zip (Efs) do; the Mac's zip and ditto don't, so zip is the last resort.
# On a Mac without the developer tools, /usr/bin/python3 is a stub that pops an install dialog: skip it there.
py=""
for c in python3 python; do
  p="$(command -v "$c" 2>/dev/null)" || continue
  if [ "$p" = /usr/bin/python3 ] && [ "$(uname -s)" = Darwin ] && ! xcode-select -p >/dev/null 2>&1; then continue; fi
  "$c" -c 1 >/dev/null 2>&1 && { py="$c"; break; }   # -c 1: also skips the Windows Store stub
done
# Python version: every file and folder under $name, links left out, every non-ASCII name flagged UTF-8 (0x800).
# Python 3.9's own "zipfile -c" (the Mac's built-in Python) leaves that flag off folder entries.
py_zip='import os, sys, zipfile
out, top = sys.argv[1], sys.argv[2]
def add(z, path, arc, folder):
    zi = zipfile.ZipInfo.from_file(path, arc)
    if any(ord(c) > 127 for c in arc):
        zi.flag_bits |= 0x800
    if folder:
        z.writestr(zi, b"")
        return
    zi.compress_type = zipfile.ZIP_DEFLATED
    with open(path, "rb") as f, z.open(zi, "w") as w:
        while True:
            b = f.read(1048576)
            if not b:
                break
            w.write(b)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for d, dirs, files in os.walk(top):
        dirs.sort()
        if not os.path.islink(d):
            add(z, d, d.replace(os.sep, "/") + "/", True)
        for n in sorted(files):
            p = os.path.join(d, n)
            if not os.path.islink(p):
                add(z, p, p.replace(os.sep, "/"), False)
'
# Perl version: every file and folder under $name, links left out, names flagged UTF-8 (Efs), read in 1 MB chunks.
# (No single quotes inside: it is one shell argument.)
# shellcheck disable=SC2016  # Perl code, not shell
perl_zip='use strict; use warnings; use File::Find; use IO::Compress::Zip qw($ZipError :zip_method);
my ($out, $name) = @ARGV; my @items;
find({ no_chdir => 1, wanted => sub { push @items, $File::Find::name unless -l $File::Find::name } }, $name);
my $z;
for my $p (sort @items) {
  my @st = stat $p; my $d = -d _; my $n = $d ? "$p/" : $p;
  my %o = (Name => $n, Efs => 1, Method => ($d ? ZIP_CM_STORE : ZIP_CM_DEFLATE), Time => $st[9],
           ExtAttr => ($st[2] << 16) | ($d ? 0x10 : 0), exTime => [@st[8, 9, 10]]);
  if ($z) { $z->newStream(%o) or die "zip: $ZipError\n" } else { $z = IO::Compress::Zip->new($out, %o) or die "zip: $ZipError\n" }
  next if $d;
  open(my $fh, "<:raw", $p) or die "cannot read $p\n"; my $buf;
  while (my $r = read($fh, $buf, 1048576)) { $z->print($buf) }
  close $fh;
}
$z->close or die "zip: $ZipError\n";'
if [ -n "$py" ]; then
  (cd "$tmp" && "$py" -I -c "$py_zip" "$out" "$name") || die "zip failed"
elif command -v perl >/dev/null 2>&1 && perl -MIO::Compress::Zip -e 1 >/dev/null 2>&1; then
  (cd "$tmp" && perl -e "$perl_zip" "$out" "$name") || die "zip failed"
elif command -v zip >/dev/null 2>&1; then
  (cd "$tmp" && zip -q -r -X "$out" "$name") || die "zip failed"
else
  die "no zip tool found (on Windows, use export.ps1 instead)"
fi
[ -s "$out" ] || die "the backup file was not created"
chmod 600 "$out" 2>/dev/null
size="$(du -h "$out" | cut -f1 | tr -d ' ')"
echo "files: $count"
echo "size: $size"
echo "saved: $out"
