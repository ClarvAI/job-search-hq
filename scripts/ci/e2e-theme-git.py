#!/usr/bin/env python3
"""End-to-end: a user who cloned the app with git, applied their own theme, then `git pull`s new app versions.

Proves the promise in DATA_CONTRACT.md ("Your look", "git pull") and the after-pull steps in
.claude/skills/update/SKILL.md ("If the folder is a git clone"):
  - applying a theme writes only git-ignored user paths (pages/, jobs/, profile/templates/), so the clone stays
    clean and the app's templates/*.html never change;
  - a pull of an app change to templates/resume-template.html, a skill and a blank page is a clean fast-forward
    that leaves the user's pages and themed copies byte for byte as they were;
  - the documented after-pull step (init-data, then apply-theme.mjs --regenerate for changed templates) rebuilds
    the themed copy from the new template with the user's theme, keeping <name>.previous.html;
  - a second theme change + pull cycle (with a hand-made Custom CSS tweak) stays clean too.

Everything runs in temp folders: the app is copied, committed as an "upstream" repo and cloned as the user's folder.
Git runs with -c flags only (identity, no signing, no hooks); the real repo's config is never touched.
It runs three times: LF checkout (core.autocrlf=false, core.eol=lf), CRLF checkout (core.eol=crlf, what a Windows
clone gets) and this machine's git defaults.

    python3 scripts/ci/e2e-theme-git.py [--keep]

--impl is accepted for the common interface and ignored (the theme engine is Node). Without node it prints a skip
line and exits 2.
"""
import sys; sys.dont_write_bytecode = True  # noqa: E702
import os
import re
import shutil
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import (Run, parse_args, temp_dir, make_workspace, keep_temps, find_node, find_git, find_bash,  # noqa: E402
                        find_powershell, run, sh, ps, read, write, snapshot, last_line)

TEMPLATES = ("resume-template.html", "cover-letter-template.html", "resume-designed-template.html")
APPLY = os.path.join(".claude", "skills", "page-design", "scripts", "apply-theme.mjs")
TOKENS_START = "  /* ---- Design tokens"
TOKENS_END = "  /* ---- End design tokens ---- */"
DOC_START = "  /* ---- Document theme"
DOC_END = "  /* ---- End document theme ---- */"
USER_AREAS = ("pages", "profile", "jobs")

MODES = (
    ("LF checkout", ["-c", "core.autocrlf=false", "-c", "core.eol=lf"], True),
    ("CRLF checkout", ["-c", "core.autocrlf=false", "-c", "core.eol=crlf"], True),
    ("this machine's git defaults", [], False),
)


def lf(text):
    return text.replace("\r\n", "\n")


def region(html, start, end):
    """The text from the start marker through the end marker (CRs removed), or None."""
    html = lf(html)
    i = html.find(start)
    if i < 0:
        return None
    j = html.find(end, i)
    return None if j < 0 else html[i:j + len(end)]


def preset_parts(workspace, name):
    """(fonts line, page token block) precomputed in presets/<name>.md."""
    md = lf(read(os.path.join(workspace, ".claude", "skills", "page-design", "presets", name + ".md")))
    fonts = re.search(r"## 1\. Fonts line.*?```html\n(.*?)\n```", md, re.S)
    block = re.search(r"## 2\. Page token block.*?```css\n(.*?)\n```", md, re.S)
    return (fonts.group(1) if fonts else None), (block.group(1) if block else None)


def set_design(path, design=None, documents=None):
    """Edits only the named "key: value" lines inside the ```design / ```documents blocks, the way page-design does."""
    text = read(path)
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(nl)
    block = None
    seen = set()
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("```"):
            block = (s[3:].strip() or None) if block is None else None
            continue
        want = design if block == "design" else documents if block == "documents" else None
        if want and ":" in line:
            key = line.split(":", 1)[0].strip()
            if key in want:
                lines[i] = "%s: %s" % (key, want[key])
                seen.add((block, key))
    missing = [k for k in (design or {}) if ("design", k) not in seen] + \
              [k for k in (documents or {}) if ("documents", k) not in seen]
    write(path, nl.join(lines))
    return missing


def insert_before_last(path, marker, addition):
    text = read(path)
    i = text.rfind(marker)
    if i < 0:
        return False
    write(path, text[:i] + addition + text[i:])
    return True


class Scenario:
    def __init__(self, r, base, mode_name, mode_flags, isolate, hooks_dir, empty_cfg):
        self.r = r
        self.mode = mode_name
        self.flags = ["-c", "user.name=E2E Maintainer", "-c", "user.email=e2e@example.com",
                      "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "core.hooksPath=" + hooks_dir,
                      "-c", "init.defaultBranch=main", "-c", "advice.detachedHead=false",
                      "-c", "protocol.file.allow=always"] + mode_flags
        self.env = {"GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"}
        if isolate:
            self.env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": empty_cfg})
        parent = temp_dir("e2e-theme-git")
        self.upstream = os.path.join(parent, "upstream app")
        shutil.copytree(base, self.upstream, symlinks=True)
        self.user = os.path.join(parent, "Job Search HQ")

    def label(self, text):
        return "%s [%s]" % (text, self.mode)

    def git(self, cwd, *args):
        return run([find_git()] + self.flags + list(args), cwd=cwd, env=self.env)

    def git_ok(self, cwd, *args):
        rc, out = self.git(cwd, *args)
        if rc != 0:
            raise RuntimeError("git %s failed in %s:\n%s" % (" ".join(args), cwd, out))
        return out

    def node(self, *args):
        return run([find_node(), os.path.join(self.user, APPLY)] + list(args), cwd=self.user)

    def init_data(self):
        script = os.path.join(self.user, ".claude", "skills", "start", "scripts", "init-data.sh")
        if find_bash():
            return sh(script.replace("\\", "/"), cwd=self.user)
        return ps(script[:-3] + ".ps1", cwd=self.user)

    def status(self):
        rc, out = self.git(self.user, "status", "--porcelain", "--untracked-files=all")
        return out.strip() if rc == 0 else "git status failed: " + out

    def tracked_changes(self):
        rc, out = self.git(self.user, "diff", "HEAD", "--stat")
        return out.strip() if rc == 0 else "git diff failed: " + out

    def user_snapshot(self):
        snap = {}
        for area in USER_AREAS:
            for rel, data in snapshot(os.path.join(self.user, area)).items():
                snap[area + "/" + rel] = data
        return snap

    def upstream_commit(self, msg):
        self.git_ok(self.upstream, "add", "-A")
        self.git_ok(self.upstream, "commit", "-q", "-m", msg)
        return self.git_ok(self.upstream, "rev-parse", "HEAD").strip()

    def tpl(self, name, mine=True):
        return os.path.join(self.user, "profile", "templates", name) if mine else os.path.join(self.user, "templates", name)

    # ------------------------------------------------------------------ checks
    def check_pages_theme(self, preset, layouts, step):
        """Every page (pages/*.html and the job's brief) has exactly the preset's token block and fonts line."""
        fonts, block = preset_parts(self.user, preset)
        files = sorted(os.path.join("pages", f) for f in os.listdir(os.path.join(self.user, "pages")) if f.endswith(".html"))
        files.append(os.path.join("jobs", "acme-operations-analyst", "interview-brief.html"))
        bad = []
        for rel in files:
            html = lf(read(os.path.join(self.user, rel)))
            if region(html, TOKENS_START, TOKENS_END) != block:
                bad.append("%s: token block is not the %s preset's" % (rel, preset))
            # The fonts line points at templates/assets/ relative to the file: one folder deeper in jobs/<folder>/.
            want = fonts.replace('href="../templates/assets/', 'href="../../templates/assets/') if rel.startswith("jobs") else fonts
            if want not in html:
                bad.append("%s: fonts line is not the %s preset's" % (rel, preset))
        for rel, want in layouts.items():
            html = read(os.path.join(self.user, rel))
            if '<html lang="en" data-layout="%s">' % want not in html:
                bad.append("%s: expected data-layout=%s" % (rel, want))
        self.r.ok(self.label("%s: every page carries the %s preset (token block, fonts) and the chosen layouts" % (step, preset)),
                  fonts and block and len(files) >= 5 and not bad, "\n".join(bad) or "preset blocks not found")

    def check_doc_theme(self, name, accent, font, paper, layout, extra_must=(), step=""):
        html = read(self.tpl(name))
        theme = region(html, DOC_START, DOC_END) or ""
        why = []
        if "--doc-accent: %s;" % accent not in theme:
            why.append("no --doc-accent: %s" % accent)
        if font not in theme:
            why.append("no %s font" % font)
        if "size: %s;" % paper not in theme:
            why.append("no paper %s" % paper)
        if 'data-layout="%s"' % layout not in html:
            why.append("no data-layout=%s" % layout)
        for m in extra_must:
            if m not in html:
                why.append("missing %r" % m)
        return why

    def check_app_templates_default(self, step):
        why = []
        for name in TEMPLATES:
            mine = read(self.tpl(name, mine=False))
            rc, out = self.git(self.user, "show", "HEAD:templates/" + name)
            app = out if rc == 0 else None
            if app is None or lf(mine) != lf(app):
                why.append("templates/%s differs from the committed app copy" % name)
        doc = region(read(self.tpl("resume-template.html", mine=False)), DOC_START, DOC_END) or ""
        if "--doc-accent: #111111;" not in doc:
            why.append("templates/resume-template.html no longer on the default document accent")
        self.r.ok(self.label("%s: the app's templates/*.html are untouched and still on the default look" % step), not why, "\n".join(why))

    def check_clean(self, step):
        st, diff = self.status(), self.tracked_changes()
        self.r.ok(self.label("%s: git status is clean and no tracked file changed" % step), st == "" and diff == "",
                  "status:\n%s\ndiff:\n%s" % (st, diff))

    def check_blank(self, step, themed=True):
        rc, out = self.node("--check-blank")
        self.r.ok(self.label("%s: apply-theme.mjs --check-blank passes in the user's clone%s"
                             % (step, " (their own theme in profile/design.md)" if themed else "")),
                  rc == 0 and last_line(out).startswith("result: checked"), out)
        if themed:
            # The same check with design.md out of the way: tells a real off-Default blank file apart from
            # --check-blank picking up the user's own layouts and documents block.
            rc, out = self.node("--check-blank", "--design", os.path.join(self.user, "no-such-design.md"))
            self.r.ok(self.label("%s: the pulled blank pages and app templates are on the Default look (design.md set aside)" % step),
                      rc == 0 and last_line(out).startswith("result: checked"), out)

    def check_theme_consistent(self, step):
        rc, out = self.node("--check")
        self.r.ok(self.label("%s: apply-theme.mjs --check finds nothing out of date" % step),
                  rc == 0 and "(0 differ" in last_line(out), out)

    def pull(self, step, expect_head, before_snap):
        old = self.git_ok(self.user, "rev-parse", "HEAD").strip()
        rc, out = self.git(self.user, "pull", "--ff-only")
        head = self.git_ok(self.user, "rev-parse", "HEAD").strip()
        self.r.ok(self.label("%s: git pull --ff-only succeeds without conflicts" % step),
                  rc == 0 and "CONFLICT" not in out and "error" not in out.lower() and head == expect_head, out)
        self.check_clean(step + " after pull")
        after = self.user_snapshot()
        changed = sorted(k for k in set(before_snap) | set(after) if before_snap.get(k) != after.get(k))
        self.r.ok(self.label("%s: the pull left pages/, jobs/ and profile/ (themed copies included) byte for byte as they were" % step),
                  not changed, "\n".join(changed))
        return old

    def after_pull(self, step, old):
        """The documented after-pull steps (update SKILL, 'If the folder is a git clone')."""
        changed = self.git_ok(self.user, "diff", "--name-only", old, "HEAD").split()
        names = [n.split("/", 1)[1] for n in changed
                 if n.startswith("templates/") and n.count("/") == 1 and n.split("/", 1)[1] in TEMPLATES
                 and os.path.isfile(self.tpl(n.split("/", 1)[1]))]
        rc, init_out = self.init_data()
        out = ""
        if names:
            rc2, out = self.node("--regenerate", ",".join(names))
            rc = rc or rc2
        return names, init_out, out, rc

    # ------------------------------------------------------------------ the journey
    def go(self):
        r = self.r
        r.section("Theme + git pull (%s)" % self.mode)
        t0 = time.time()
        # Upstream: the app committed as the maintainer's repo; the user clones it.
        self.git_ok(self.upstream, "init", "-q", "-b", "main")
        self.git_ok(self.upstream, "add", "-A")
        self.git_ok(self.upstream, "commit", "-q", "-m", "Job Search HQ 1.0.0")
        rc, out = self.git(os.path.dirname(self.user), "clone", "-q", "--no-hardlinks", self.upstream, self.user)
        if rc != 0:
            r.ok(self.label("clone the upstream app"), False, out)
            return
        if self.mode.startswith("CRLF"):
            sample = read(os.path.join(self.user, "templates", "resume-template.html"))
            r.ok(self.label("the clone really has CRLF line endings in text files"), "\r\n" in sample)

        # First run: starter files.
        rc, out = self.init_data()
        r.ok(self.label("init-data creates the starter files (design.md, pages)"),
             rc == 0 and os.path.isfile(os.path.join(self.user, "profile", "design.md"))
             and os.path.isfile(os.path.join(self.user, "pages", "dashboard.html")), out)
        self.check_clean("first run")
        self.check_blank("first run", themed=False)
        rc, out = self.node("--check")
        r.ok(self.label("first run: with the default design.md the starter pages and app templates already match (no copies needed)"),
             rc == 0 and "(0 differ" in last_line(out) and not os.path.exists(os.path.join(self.user, "profile", "templates")), out)
        os.makedirs(os.path.join(self.user, "jobs", "acme-operations-analyst"), exist_ok=True)
        shutil.copy2(os.path.join(self.user, "templates", "blank", "pages", "interview-brief.html"),
                     os.path.join(self.user, "jobs", "acme-operations-analyst", "interview-brief.html"))

        # Theme 1: Modern preset, layouts changed, a navy document accent in Georgia on A4, the modern resume layout.
        design = os.path.join(self.user, "profile", "design.md")
        missing = set_design(design,
                             {"preset": "modern", "layout_dashboard": "board", "layout_portfolio": "bento", "layout_brief": "detailed"},
                             {"font": "Georgia", "accent": "#1f3a5f", "paper": "A4", "layout_resume": "modern", "layout_designed": "headline"})
        rc, out = self.node()
        created = [l for l in out.splitlines() if l.startswith("created: profile/templates/")]
        r.ok(self.label("theme 1 applies and creates the six themed template copies in profile/templates/"),
             not missing and rc == 0 and last_line(out).startswith("result: done") and len(created) == 6,
             "missing keys: %s\n%s" % (missing, out))
        self.check_clean("theme 1")
        rc, out = self.git(self.user, "check-ignore", "-q", "profile/templates/resume-template.html")
        rc2, out2 = self.git(self.user, "check-ignore", "-q", "pages/portfolio.html")
        r.ok(self.label("theme 1: the themed copies and pages are git-ignored user paths"), rc == 0 and rc2 == 0, out + out2)
        self.check_app_templates_default("theme 1")
        self.check_pages_theme("modern", {"pages/dashboard.html": "board", "pages/portfolio.html": "bento",
                                          "jobs/acme-operations-analyst/interview-brief.html": "detailed"}, "theme 1")
        modern_fonts, _ = preset_parts(self.user, "modern")
        why = []
        for name in ("resume-template.html", "cover-letter-template.html"):
            why += ["%s: %s" % (name, w) for w in self.check_doc_theme(name, "#1f3a5f", "Georgia", "A4", "modern")]
        designed = read(self.tpl("resume-designed-template.html"))
        if modern_fonts.replace('href="../templates/assets/', 'href="../../templates/assets/') not in designed or 'data-layout="headline"' not in designed:
            why.append("resume-designed-template.html: not on the Modern fonts / headline layout")
        r.ok(self.label("theme 1: profile/templates copies carry the theme (navy #1f3a5f, Georgia, A4, layouts)"), not why, "\n".join(why))
        self.check_theme_consistent("theme 1")

        # Upstream release 1.0.1: the resume template, a skill and a blank page change; one new starter file.
        up = self.upstream
        ok1 = insert_before_last(os.path.join(up, "templates", "resume-template.html"), "</body>", "<!-- e2e app change 1.0.1 -->\n")
        with open(os.path.join(up, ".claude", "skills", "today", "SKILL.md"), "a", encoding="utf-8", newline="") as f:
            f.write("\n<!-- e2e skill change 1.0.1 -->\n")
        ok2 = insert_before_last(os.path.join(up, "templates", "blank", "pages", "dashboard.html"), "</html>", "<!-- e2e blank page change 1.0.1 -->\n")
        write(os.path.join(up, "templates", "blank", "profile", "e2e-new-starter.md"), "# A new starter file in 1.0.1\n")
        # The test's own release number, whatever version the repository is at.
        write(os.path.join(up, "VERSION"), re.sub(r"(?m)^version: .*$", "version: 1.0.1", lf(read(os.path.join(up, "VERSION"))), count=1))
        head1 = self.upstream_commit("Job Search HQ 1.0.1")
        if not (ok1 and ok2):
            r.ok(self.label("upstream change 1 prepared"), False, "markers </body> / </html> not found")
            return

        before = self.user_snapshot()
        old_copy = read(self.tpl("resume-template.html"))
        old = self.pull("pull 1", head1, before)
        ver = lf(read(os.path.join(self.user, "VERSION")))
        r.ok(self.label("pull 1: the app files arrived (VERSION 1.0.1, new resume template, skill, blank page)"),
             "version: 1.0.1" in ver and "e2e app change 1.0.1" in read(self.tpl("resume-template.html", mine=False))
             and "e2e skill change 1.0.1" in read(os.path.join(self.user, ".claude", "skills", "today", "SKILL.md"))
             and "e2e blank page change 1.0.1" in read(os.path.join(self.user, "templates", "blank", "pages", "dashboard.html"))
             and "e2e" not in read(os.path.join(self.user, "pages", "dashboard.html")))
        pages_before = snapshot(os.path.join(self.user, "pages"))
        names, init_out, regen_out, rc = self.after_pull("pull 1", old)
        r.ok(self.label("pull 1 after-steps: init-data adds only the new starter file"),
             "created: profile/e2e-new-starter.md" in init_out and init_out.count("created:") == 1, init_out)
        prev = self.tpl("resume-template.previous.html")
        refreshed = [l for l in regen_out.splitlines() if l.startswith("refreshed: profile/templates/resume-template.html")]
        new_copy = read(self.tpl("resume-template.html"))
        why = self.check_doc_theme("resume-template.html", "#1f3a5f", "Georgia", "A4", "modern", ["e2e app change 1.0.1"])
        r.ok(self.label("pull 1 after-steps: --regenerate rebuilds only the changed template with the theme kept"),
             rc == 0 and names == ["resume-template.html"] and len(refreshed) == 1 and "made by hand" not in regen_out and not why,
             "templates to regenerate: %s\n%s\n%s" % (names, "\n".join(why), regen_out))
        r.ok(self.label("pull 1 after-steps: the earlier copy is kept as resume-template.previous.html"),
             os.path.isfile(prev) and read(prev) == old_copy and "previous.html" in regen_out and new_copy != old_copy, regen_out)
        r.ok(self.label("pull 1 after-steps: pages are not touched by --regenerate"), snapshot(os.path.join(self.user, "pages")) == pages_before)
        self.check_clean("pull 1 after-steps")
        self.check_blank("pull 1")
        self.check_theme_consistent("pull 1")

        # Theme 2: Minimal preset, editorial portfolio, a dark red document accent; then a hand tweak in the Custom region.
        missing = set_design(design, {"preset": "minimal", "layout_portfolio": "editorial"},
                             {"accent": "#5a1a1a", "layout_resume": "compact"})
        rc, out = self.node()
        r.ok(self.label("theme 2 applies (Minimal preset, editorial portfolio, accent #5a1a1a)"),
             not missing and rc == 0 and last_line(out).startswith("result: done") and "created:" not in out,
             "missing keys: %s\n%s" % (missing, out))
        self.check_pages_theme("minimal", {"pages/portfolio.html": "editorial", "pages/dashboard.html": "board"}, "theme 2")
        why = self.check_doc_theme("resume-template.html", "#5a1a1a", "Georgia", "A4", "compact", ["e2e app change 1.0.1"])
        why += self.check_doc_theme("cover-letter-template.html", "#5a1a1a", "Georgia", "A4", "compact")
        r.ok(self.label("theme 2: the copies follow (regenerated resume keeps the 1.0.1 change)"), not why, "\n".join(why))
        letter = self.tpl("cover-letter-template.html")
        cur = read(letter)
        eol = "\r\n" if "\r\n" in cur else "\n"   # a hand edit keeps the file's own line endings
        tweaked = cur.replace("/* ---- Custom ---- */", "/* ---- Custom ---- */" + eol + "  .e2e-user-tweak { letter-spacing: 0.01em; }", 1)
        write(letter, tweaked)
        self.check_clean("theme 2")

        # Upstream release 1.0.2: the cover letter template, a skill and another blank page change.
        ok1 = insert_before_last(os.path.join(up, "templates", "cover-letter-template.html"), "</body>", "<!-- e2e app change 1.0.2 -->\n")
        with open(os.path.join(up, ".claude", "skills", "today", "SKILL.md"), "a", encoding="utf-8", newline="") as f:
            f.write("<!-- e2e skill change 1.0.2 -->\n")
        ok2 = insert_before_last(os.path.join(up, "templates", "blank", "pages", "portfolio.html"), "</html>", "<!-- e2e blank page change 1.0.2 -->\n")
        write(os.path.join(up, "VERSION"), lf(read(os.path.join(up, "VERSION"))).replace("version: 1.0.1", "version: 1.0.2"))
        head2 = self.upstream_commit("Job Search HQ 1.0.2")
        if not (ok1 and ok2):
            r.ok(self.label("upstream change 2 prepared"), False, "markers </body> / </html> not found")
            return
        before = self.user_snapshot()
        old = self.pull("pull 2", head2, before)
        names, init_out, regen_out, rc = self.after_pull("pull 2", old)
        new_letter = read(letter)
        why = self.check_doc_theme("cover-letter-template.html", "#5a1a1a", "Georgia", "A4", "compact",
                                   ["e2e app change 1.0.2", ".e2e-user-tweak"])
        r.ok(self.label("pull 2 after-steps: the cover letter is rebuilt with the theme, the hand-made Custom CSS carried over"),
             rc == 0 and names == ["cover-letter-template.html"] and "init: nothing to do" in init_out
             and "Custom CSS region was carried over" in regen_out and "changes made by hand" in regen_out and not why,
             "templates to regenerate: %s\n%s\n%s\n%s" % (names, "\n".join(why), init_out, regen_out))
        r.ok(self.label("pull 2 after-steps: the hand-tweaked copy is kept as cover-letter-template.previous.html; the resume copy is left alone"),
             read(self.tpl("cover-letter-template.previous.html")) == tweaked and new_letter != tweaked
             and "e2e app change 1.0.1" in read(self.tpl("resume-template.html")) and read(prev) == old_copy, regen_out)
        self.check_clean("pull 2 after-steps")
        self.check_blank("pull 2")
        self.check_theme_consistent("pull 2")
        print("(%s: %.1fs)" % (self.mode, time.time() - t0))


def main():
    args = parse_args("Theme + git pull end-to-end test (--impl is accepted and ignored: the theme engine is Node).")
    keep_temps(args.keep)
    if not find_node():
        print("skip: node not found (the theme engine needs it)")
        sys.exit(2)
    if not find_git():
        print("skip: git not found")
        sys.exit(2)
    if not find_bash() and not find_powershell():
        print("skip: neither bash nor PowerShell found to run init-data")
        sys.exit(2)
    r = Run("e2e theme + git pull")
    start = time.time()
    base_parent = temp_dir("e2e-theme-base")
    base = make_workspace(base_parent, "app")
    hooks_dir = os.path.join(base_parent, "no-hooks")
    os.makedirs(hooks_dir)
    empty_cfg = os.path.join(base_parent, "empty.gitconfig")
    write(empty_cfg, "")
    for name, flags, isolate in MODES:
        try:
            Scenario(r, base, name, flags, isolate, hooks_dir, empty_cfg).go()
        except RuntimeError as e:
            r.ok("%s: scenario ran to the end" % name, False, str(e))
    print("\nruntime: %.1fs" % (time.time() - start))
    r.finish()


if __name__ == "__main__":
    main()
