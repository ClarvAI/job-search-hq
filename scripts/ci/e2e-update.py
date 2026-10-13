#!/usr/bin/env python3
"""End-to-end test of /update (update.sh and update.ps1): install, check, rollback and refusals.

Builds an "installed 1.0.0" workspace with user data (starter files, personal files with markers, a themed
template copy in profile/templates/, two app files the user edited), then a "1.0.1" release zip made by the
release's own scripts/build-manifest.sh --zip, plus hand-made bad zips. Every run happens on throwaway copies
in a temp folder; the real workspace is never touched.

    python3 scripts/ci/e2e-update.py [--impl sh|ps|both] [--keep]
"""
import sys; sys.dont_write_bytecode = True
import hashlib
import os
import re
import shutil
import time
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import (Run, parse_args, temp_dir, make_workspace, build_release_zip, sh, ps, run,  # noqa: E402
                        last_line, snapshot, read, write, keep_temps, find_node, find_bash, IS_WINDOWS)

OLDV, NEWV = "1.0.0", "1.0.1"
TOP = "job-search-hq-%s" % NEWV
UPD_SH = ".claude/skills/update/scripts/update.sh"
UPD_PS = ".claude/skills/update/scripts/update.ps1"

# What the 1.0.1 release changes (relative to 1.0.0).
REL_ADDED = ["docs/whats-new.md", "templates/blank/profile/goals.md", "templates/blank/jobs/notes.md",
             "migrations/000-old-note.md", "migrations/001-add-goals.md"]
REL_UPDATED = ["VERSION", "CHANGELOG.md", "HOW-IT-WORKS.md", "templates/resume-template.html",
               ".claude/settings.json", ".codex/hooks.json", UPD_SH, UPD_PS]
REL_REMOVED = ["scripts/ci/mock-github.py"]
EDITED_CHANGED = ".claude/skills/today/SKILL.md"       # user edited it, and the release changes it too
EDITED_REMOVED = "scripts/ci/summary-fixtures.sh"     # user edited it, and the release drops it
NEW_STARTER = "profile/goals.md"                      # new starter file the user doesn't have
CLASH_STARTER = "jobs/notes.md"                       # new starter file the user already has (must be kept)
THEMED = "profile/templates/resume-template.html"
THEMED_PREV = "profile/templates/resume-template.previous.html"
THEMED_OTHER = "profile/templates/cover-letter-template.html"

USER_PREFIXES = ("profile/", "jobs/", "contacts/", "outbox/", "interviews/", "history/", "imports/", "pages/",
                 "knowledge/field/")
USER_ALLOWED = {"profile/readme.md", "jobs/readme.md", "contacts/readme.md", "imports/readme.md",
                "pages/readme.md", "interviews/.gitkeep", "outbox/sent/.gitkeep", "outbox/discarded/.gitkeep"}

MAN_LINE = re.compile(r'^    "([^"]+)": "([0-9a-f]{64})",?$')


# ---------------------------------------------------------------- small helpers

def fp(data):
    return hashlib.sha256(data.replace(b"\r", b"")).hexdigest()


def rawsha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def J(root, rel):
    return os.path.join(root, *rel.split("/"))


def rb(path):
    with open(path, "rb") as f:
        return f.read()


def wb(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def append(path, text):
    """Appends a line, keeping the file's own line endings."""
    data = rb(path)
    nl = b"\r\n" if b"\r\n" in data else b"\n"
    if data and not data.endswith(b"\n"):
        data += nl
    wb(path, data + text.encode("utf-8") + nl)


def is_user(rel):
    l = rel.lower()
    if l in USER_ALLOWED:
        return False
    return l.startswith(USER_PREFIXES) or l.endswith(".local") or l == ".claude/settings.local.json"


def copy_ws(src, dst):
    shutil.copytree(src, dst, symlinks=True)
    return dst


def diff(a, b):
    """Paths added, removed or changed between two snapshots."""
    out = []
    for k in sorted(set(a) | set(b)):
        if k not in a:
            out.append("added: " + k)
        elif k not in b:
            out.append("removed: " + k)
        elif a[k] != b[k]:
            out.append("changed: " + k)
    return out


def without(snap, pred):
    return {k: v for k, v in snap.items() if not pred(k)}


def lines_with(out, prefix):
    return [l[len(prefix):] for l in out.splitlines() if l.startswith(prefix)]


def bash_arg(p):
    return p.replace("\\", "/")


def bash_abs(p):
    """A path build-manifest.sh treats as absolute (on Windows /c/... rather than C:/...)."""
    p = p.replace("\\", "/")
    if IS_WINDOWS and re.match(r"^[A-Za-z]:/", p):
        p = "/" + p[0].lower() + p[2:]
    return p


def path_without_node():
    keep = []
    for d in os.environ.get("PATH", "").split(os.pathsep):
        if d and not any(os.path.isfile(os.path.join(d, n)) for n in ("node", "node.exe")):
            keep.append(d)
    return os.pathsep.join(keep)


def upd(impl, ws, mode=None, src=None, sha=None, name=None, env=None):
    """Runs the workspace's own update script. mode: None (install), status, check, rollback."""
    e = {"JSHQ_REINSTALL": ""}
    if env:
        e.update(env)
    if impl == "sh":
        a = []
        if mode:
            a.append("--" + mode)
        if mode == "rollback" and name:
            a.append(name)
        if src is not None:
            a.append(src if src.startswith(("http://", "https://")) else bash_arg(src))
        if sha:
            a += ["--sha256", sha]
        return sh(bash_arg(J(ws, UPD_SH)), *a, cwd=ws, env=e, timeout=600)
    a = []
    if mode:
        a.append("-" + mode.capitalize())
    if mode == "rollback" and name:
        a += ["-Name", name]
    if src is not None:
        a += ["-Source", src]
    if sha:
        a += ["-Sha256", sha]
    return ps(J(ws, UPD_PS), *a, cwd=ws, env=e, timeout=600)


# ---------------------------------------------------------------- manifest editing for crafted releases

def man_edit(top, fn):
    p = J(top, "product-manifest.json")
    text = rb(p).decode("utf-8").replace("\r", "")
    wb(p, fn(text).encode("utf-8"))


def man_set(top, rel, data):
    """Writes a file into a release tree and lists it (or re-fingerprints it) in the manifest."""
    wb(J(top, rel), data)
    h = fp(data)

    def edit(text):
        lines = text.split("\n")
        for i, l in enumerate(lines):
            m = MAN_LINE.match(l)
            if m and m.group(1) == rel:
                lines[i] = l.replace(m.group(2), h)
                return "\n".join(lines)
        i = lines.index('  "files": {')
        lines.insert(i + 1, '    "%s": "%s",' % (rel, h))
        return "\n".join(lines)
    man_edit(top, edit)


def man_drop(top, rel):
    man_edit(top, lambda t: "\n".join(l for l in t.split("\n")
                                      if not (MAN_LINE.match(l) and MAN_LINE.match(l).group(1) == rel)))


def zip_tree(root, zpath, extra=()):
    """Zips every file under root (names relative to it), then the extra (ZipInfo, bytes) entries."""
    os.makedirs(os.path.dirname(zpath), exist_ok=True)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for dirpath, dirs, files in os.walk(root):
            dirs.sort()
            for f in sorted(files):
                p = os.path.join(dirpath, f)
                z.write(p, os.path.relpath(p, root).replace(os.sep, "/"))
        for info, data in extra:
            z.writestr(info, data)
    return zpath


def zinfo(name, mode=0o100644):
    i = zipfile.ZipInfo(name, date_time=(2026, 10, 12, 0, 0, 0))
    i.create_system = 3
    i.external_attr = mode << 16
    return i


# ---------------------------------------------------------------- building the fixtures

def build_base(t, r):
    base = make_workspace(t, "base")
    rc, out = sh(bash_arg(J(base, "scripts/build-manifest.sh")), cwd=base)
    if not r.ok("base copy: build-manifest.sh writes the 1.0.0 product-manifest.json",
                rc == 0 and "version 1.0.0" in out, out):
        r.finish()
    return base


def build_release(t, base, r):
    rel = copy_ws(base, os.path.join(t, "release build", "Job Search HQ"))
    v = J(rel, "VERSION")
    wb(v, rb(v).replace(b"version: 1.0.0", b"version: 1.0.1", 1))
    cl = J(rel, "CHANGELOG.md")
    wb(cl, rb(cl).replace(b"## 1.0.0", b"## 1.0.1 (2026-10-12)\n\n- E2E-CHANGELOG-101: test release.\n\n## 1.0.0", 1))
    append(J(rel, "HOW-IT-WORKS.md"), "E2E-APP-CHANGE-101")
    write(J(rel, "docs/whats-new.md"), "# What's new\n\nE2E-NEW-APP-FILE-101\n")
    for p in REL_REMOVED + [EDITED_REMOVED]:
        os.remove(J(rel, p))
    write(J(rel, "templates/blank/profile/goals.md"), "# Goals\n\nE2E-STARTER-GOALS-101\n")
    write(J(rel, "templates/blank/jobs/notes.md"), "# Notes\n\nE2E-STARTER-NOTES-101\n")
    tpl = J(rel, "templates/resume-template.html")
    data = rb(tpl)
    assert data.count(b"</body>") == 1
    wb(tpl, data.replace(b"</body>", b"<!-- E2E-TEMPLATE-101 -->\n</body>"))
    write(J(rel, "migrations/000-old-note.md"), "version: 1.0.0\n# An older note (must not be listed)\n")
    write(J(rel, "migrations/001-add-goals.md"), "version: 1.0.1\n# Add goals\n\nCheck first: n/a\n")
    append(J(rel, ".claude/settings.json"), "")
    append(J(rel, ".codex/hooks.json"), "")
    append(J(rel, EDITED_CHANGED), "E2E-TODAY-101")
    append(J(rel, UPD_SH), "# E2E 1.0.1")
    append(J(rel, UPD_PS), "# E2E 1.0.1")
    zpath = os.path.join(t, "zips", "job-search-hq-1.0.1.zip")
    os.makedirs(os.path.dirname(zpath))
    rc, out = build_release_zip(rel, bash_abs(zpath))
    if not r.ok("release 1.0.1: its own build-manifest.sh --zip builds the zip",
                rc == 0 and os.path.isfile(zpath) and "version 1.0.1" in out, out):
        r.finish()
    with zipfile.ZipFile(zpath) as z:
        names = z.namelist()
    r.ok("release zip has one top folder with the manifest and no user files",
         TOP + "/product-manifest.json" in names and all(n.startswith(TOP + "/") for n in names)
         and not any(is_user(n[len(TOP) + 1:]) for n in names if not n.endswith("/")),
         "\n".join(n for n in names if not n.startswith(TOP + "/") or
                   (is_user(n[len(TOP) + 1:]) and not n.endswith("/")))[:2000])
    return rel, zpath


def build_installed(t, base, r, have_node):
    """1.0.0 plus the user's data: starter files, marked personal files, a themed template, edited app files."""
    ws = copy_ws(base, os.path.join(t, "prepared", "Job Search HQ"))
    rc, out = sh(bash_arg(J(ws, ".claude/skills/start/scripts/init-data.sh")), cwd=ws)
    r.ok("installed 1.0.0: init-data.sh fills in the starter files",
         rc == 0 and "init: created" in out and os.path.isfile(J(ws, "profile/preferences.md")), out)
    append(J(ws, "profile/preferences.md"), "E2E-USER-PREFS")
    append(J(ws, "profile/master-resume.md"), "E2E-USER-RESUME Alex Rivera, Acme Corp")
    append(J(ws, "jobs/tracker.csv"), "Acme,Operations Analyst,applied,2026-10-01,E2E-USER-TRACKER")
    append(J(ws, "contacts/contacts.csv"), "Jane Doe,Globex,jane.doe@example.com,E2E-USER-CONTACT")
    append(J(ws, "history/activity.md"), "- 2026-10-06 14:05 · Claude · E2E-USER-ACTIVITY")
    append(J(ws, "knowledge/field/field-primer.md"), "E2E-USER-FIELD")
    write(J(ws, "jobs/acme-operations-analyst/posting.md"), "# Acme\n\nE2E-USER-POSTING\n")
    write(J(ws, "jobs/globex-analyst/notes (draft) \u00e9.md"), "E2E-USER-ODD-NAME Müller\n")
    write(J(ws, "outbox/2026-10-06-thanks.md"), "---\nstatus: draft\n---\nE2E-USER-OUTBOX\n")
    write(J(ws, "interviews/acme-notes.md"), "E2E-USER-INTERVIEW\n")
    write(J(ws, "imports/resume.txt"), "E2E-USER-IMPORT 555-0100\n")
    write(J(ws, CLASH_STARTER), "My own notes E2E-USER-NOTES (must survive the new starter file)\n")
    write(J(ws, ".claude/settings.local.json"), '{"e2e": "E2E-USER-LOCAL-SETTINGS"}\n')
    design = J(ws, "profile/design.md")
    d = rb(design)
    wb(design, d.replace(b"font: Arial", b"font: Georgia", 1).replace(b"accent: #111111", b"accent: #1f3a5f", 1))
    if have_node:
        rc, out = run([find_node(), J(ws, ".claude/skills/page-design/scripts/apply-theme.mjs")], cwd=ws)
        r.ok("installed 1.0.0: apply-theme.mjs makes the themed copies in profile/templates/",
             rc == 0 and os.path.isfile(J(ws, THEMED)) and os.path.isfile(J(ws, THEMED_OTHER)) and
             b"Georgia" in rb(J(ws, THEMED)), out)
    else:
        # The shape apply-theme.mjs would leave: the app template with another document theme block.
        src = rb(J(ws, "templates/resume-template.html"))
        wb(J(ws, THEMED), re.sub(rb"Arial", b"Georgia", src))
        src = rb(J(ws, "templates/cover-letter-template.html"))
        wb(J(ws, THEMED_OTHER), re.sub(rb"Arial", b"Georgia", src))
        r.ok("installed 1.0.0: themed copies crafted by hand (no Node)", os.path.isfile(J(ws, THEMED)))
    append(J(ws, EDITED_CHANGED), "E2E-USER-EDIT-TODAY")
    append(J(ws, EDITED_REMOVED), "# E2E-USER-EDIT-FIXTURES")
    return ws


def build_bad_zips(t, good_zip, sentinel):
    """{name: (zip path, text the error must contain)} for releases that must be refused."""
    stage = os.path.join(t, "stage", "good")
    with zipfile.ZipFile(good_zip) as z:
        z.extractall(stage)
    out = {}

    def crafted(name, mutate=None, extra=(), expect=""):
        d = os.path.join(t, "stage", name)
        shutil.copytree(stage, d)
        if mutate:
            mutate(os.path.join(d, TOP))
        out[name] = (zip_tree(d, os.path.join(t, "zips", name + ".zip"), extra), expect)

    crafted("user-path", lambda top: man_set(top, "profile/x.md", b"E2E-EVIL\n"),
            expect="one of your own files (profile/x.md)")
    crafted("user-path-case", lambda top: man_set(top, "Profile/Notes.md", b"E2E-EVIL\n"),
            expect="one of your own files (Profile/Notes.md)")
    crafted("local-settings", lambda top: man_set(top, ".claude/settings.local.json", b"{}\n"),
            expect="one of your own files (.claude/settings.local.json)")
    crafted("unsafe-manifest-path", lambda top: man_set(top, "docs/../profile/y.md", b"E2E-EVIL\n"),
            expect="unsafe path (docs/../profile/y.md)")

    def tamper(top):
        append(J(top, "HOW-IT-WORKS.md"), "E2E-TAMPERED")
    crafted("fingerprint", tamper, expect="HOW-IT-WORKS.md doesn't match its fingerprint")
    crafted("incomplete", lambda top: os.remove(J(top, "docs/whats-new.md")),
            expect="incomplete (docs/whats-new.md is missing)")
    crafted("no-update-script", lambda top: man_drop(top, UPD_SH), expect="missing " + UPD_SH)
    crafted("no-manifest", lambda top: os.remove(J(top, "product-manifest.json")),
            expect="not a Job Search HQ release")

    def disagree(top):
        man_edit(top, lambda s: s.replace('"version": "1.0.1"', '"version": "1.0.2"', 1))
    crafted("version-disagree", disagree, expect="version is unclear")

    def downgrade(top):
        man_set(top, "VERSION", rb(J(top, "VERSION")).replace(b"version: 1.0.1", b"version: 0.9.0"))
        man_edit(top, lambda s: s.replace('"version": "1.0.1"', '"version": "0.9.0"', 1))
    crafted("downgrade", downgrade, expect="older than the installed version")

    def two(top):
        shutil.copytree(top, os.path.join(os.path.dirname(top), "job-search-hq-1.0.2"))
    crafted("two-releases", two, expect="more than one release")
    crafted("traversal", extra=[(zinfo(TOP + "/../../e2e-evil.txt"), b"E2E-EVIL\n")], expect="unsafe path")
    abs_name = sentinel.replace("\\", "/")
    abs_name = ("/" + abs_name.lstrip("/")) if not IS_WINDOWS else "/e2e-abs-evil.txt"
    crafted("absolute", extra=[(zinfo(abs_name + "/abs-evil.txt" if not IS_WINDOWS else abs_name), b"E2E\n")],
            expect="unsafe path")
    crafted("drive-letter", extra=[(zinfo("C:/e2e-evil.txt"), b"E2E-EVIL\n")], expect="unsafe path")
    crafted("backslash", extra=[(zinfo(TOP + "\\..\\e2e-evil.txt"), b"E2E-EVIL\n")], expect="unsafe path")
    link_target = sentinel.replace("\\", "/")
    crafted("symlink", extra=[(zinfo(TOP + "/lnk", 0o120777), link_target.encode("utf-8"))],
            expect="contains links")
    # A link followed by a file "inside" it: must not write through the link (refused either way).
    crafted("symlink-write-through", extra=[(zinfo(TOP + "/lnk", 0o120777), link_target.encode("utf-8")),
                                            (zinfo(TOP + "/lnk/pwned.txt"), b"E2E-PWNED\n")],
            expect="(nothing was changed)")
    garbage = os.path.join(t, "zips", "garbage.zip")
    wb(garbage, b"this is not a zip file\n" * 200)
    out["garbage"] = (garbage, "not a readable zip")
    return out


# ---------------------------------------------------------------- the checks, per implementation

def check_refusal(r, tag, label, ws, rc, out, expect):
    before = r._snap
    after = snapshot(ws)
    ll = last_line(out)
    r.ok("[%s] refused: %s" % (tag, label),
         rc == 1 and ll.startswith("error:") and expect in ll, "rc=%s\n%s" % (rc, out))
    r.ok("[%s] refused: %s left the workspace byte-identical" % (tag, label), before == after,
         "\n".join(diff(before, after))[:3000])


def run_impl(impl, t, prepared, zpath, rel, bad, sentinel, have_node, r):
    tag = impl
    root = os.path.join(t, impl)
    ws = copy_ws(prepared, os.path.join(root, "Job Search HQ"))
    rel_snap = snapshot(rel)

    # ---- status
    r.section("%s: --status" % impl)
    s0 = snapshot(ws)
    rc, out = upd(impl, ws, "status")
    r.ok("[%s] --status prints version, update_source and 'status: done'" % tag,
         rc == 0 and "version: 1.0.0" in out.splitlines() and
         "update_source: set by the maintainer before publishing" in out and last_line(out) == "status: done"
         and "backup:" not in out, out)
    r.ok("[%s] --status changes nothing" % tag, snapshot(ws) == s0)

    # ---- check
    r.section("%s: --check" % impl)
    rc, out = upd(impl, ws, "check", zpath)
    s1 = snapshot(ws)
    r.ok("[%s] --check names both versions and counts adds/updates/removals/edits" % tag,
         rc == 0 and "installed: 1.0.0" in out and "available: 1.0.1" in out and
         last_line(out) == "update: check (%d to add, %d to update, %d to remove, 2 edited by you; nothing changed)"
         % (len(REL_ADDED), len(REL_UPDATED), len(REL_REMOVED)), out)
    keep = lines_with(out, "would keep your edited version: ")
    r.ok("[%s] --check lists both app files the user edited" % tag,
         sorted(keep) == sorted("%s (saved as %s.local)" % (p, p) for p in (EDITED_CHANGED, EDITED_REMOVED)), out)
    r.ok("[%s] --check reports hooks-changed for Claude and Codex and the themed copy to refresh" % tag,
         "hooks-changed: claude" in out.splitlines() and "hooks-changed: codex" in out.splitlines() and
         "would refresh your themed copy: %s" % THEMED in out and THEMED_OTHER not in out, out)
    r.ok("[%s] --check changes nothing (whole workspace byte-identical)" % tag, s1 == s0,
         "\n".join(diff(s0, s1))[:3000])

    # ---- refusals
    r.section("%s: refusals" % impl)
    r._snap = s0
    for name, (zp, expect) in sorted(bad.items()):
        if name == "symlink" and IS_WINDOWS and impl == "sh":
            # Git Bash's unzip may write a link entry as a plain file (no link support); that file is not in
            # the manifest, so it is never installed. Use --check so the workspace stays at 1.0.0 either way.
            rc, out = upd(impl, ws, "check", zp)
            r.ok("[%s] link entry: refused, or unpacked as a plain unlisted file (Windows, no links)" % tag,
                 (rc == 1 and expect in last_line(out)) or (rc == 0 and "update: check" in last_line(out)), out)
            r.ok("[%s] link entry left the workspace byte-identical" % tag, snapshot(ws) == s0)
            continue
        rc, out = upd(impl, ws, None, zp)
        check_refusal(r, tag, "bad release '%s'" % name, ws, rc, out, expect)
    r.ok("[%s] no file escaped the zip (traversal / absolute / symlink targets absent)" % tag,
         not os.listdir(sentinel) and not os.path.exists(os.path.join(t, "e2e-evil.txt")) and
         not os.path.exists(os.path.join(root, "e2e-evil.txt")), str(os.listdir(sentinel)))
    rc, out = upd(impl, ws, "check", bad["user-path"][0])
    check_refusal(r, tag, "--check of a release listing profile/x.md", ws, rc, out, "one of your own files")
    rc, out = upd(impl, ws, None, "http://example.com/job-search-hq-1.0.1.zip")
    check_refusal(r, tag, "non-https address", ws, rc, out, "only https://")
    rc, out = upd(impl, ws, None, None)
    check_refusal(r, tag, "no source and no update address set", ws, rc, out, "no update address is set yet")
    rc, out = upd(impl, ws, None, os.path.join(t, "zips", "missing.zip"))
    check_refusal(r, tag, "zip that doesn't exist", ws, rc, out, "file not found")
    rc, out = upd(impl, ws, None, zpath, sha="0" * 64)
    check_refusal(r, tag, "--sha256 that doesn't match", ws, rc, out, "SHA-256 doesn't match")
    rc, out = upd(impl, ws, "rollback")
    check_refusal(r, tag, "--rollback with no backup yet", ws, rc, out, "no update backup")

    # ---- install
    r.section("%s: install" % impl)
    rc, out = upd(impl, ws, None, zpath)
    s2 = snapshot(ws)
    r.ok("[%s] install ends with 'update: done 1.0.0 -> 1.0.1 (backup: .backup/1.0.0)'" % tag,
         rc == 0 and last_line(out) == "update: done 1.0.0 -> 1.0.1 (backup: .backup/1.0.0)", out)
    r.ok("[%s] install: added: lines are exactly the new app files" % tag,
         sorted(lines_with(out, "added: ")) == sorted(REL_ADDED), out)
    r.ok("[%s] install: updated: lines are exactly the changed unedited app files" % tag,
         sorted(lines_with(out, "updated: ")) == sorted(REL_UPDATED), out)
    r.ok("[%s] install: removed: lines are exactly the dropped unedited app files" % tag,
         sorted(lines_with(out, "removed: ")) == sorted(REL_REMOVED), out)
    r.ok("[%s] install: kept-local: lines for both user-edited app files" % tag,
         sorted(lines_with(out, "kept-local: ")) == sorted([
             "%s (your edited version is now %s.local)" % (EDITED_CHANGED, EDITED_CHANGED),
             "%s (no longer part of the app; your edited version is now %s.local)" % (EDITED_REMOVED, EDITED_REMOVED)]),
         out)
    r.ok("[%s] VERSION is now 1.0.1 and product-manifest.json is the release's" % tag,
         b"version: 1.0.1" in s2.get("VERSION", b"") and
         s2.get("product-manifest.json") == rel_snap.get("product-manifest.json"))
    app_new = without(s2, lambda k: is_user(k) or k.startswith(".backup/"))
    app_rel = without(rel_snap, lambda k: is_user(k))
    r.ok("[%s] every app file now matches the 1.0.1 release exactly (nothing extra, nothing missing)" % tag,
         app_new == app_rel, "\n".join(diff(app_rel, app_new))[:3000])
    u0 = without(s0, lambda k: not is_user(k))
    u2 = without(s2, lambda k: not is_user(k))
    expected_user_changes = {"added: " + NEW_STARTER, "added: " + EDITED_CHANGED + ".local",
                             "added: " + EDITED_REMOVED + ".local"}
    if have_node:
        expected_user_changes |= {"changed: " + THEMED, "added: " + THEMED_PREV,
                                  "changed: profile/templates/.generated.json"}
    r.ok("[%s] every user file is byte-identical (only the new starter file, the .local copies and the "
         "refreshed themed copy differ)" % tag,
         set(diff(u0, u2)) == expected_user_changes, "\n".join(sorted(set(diff(u0, u2)) ^ expected_user_changes)))
    r.ok("[%s] edited app file kept as .local (user's bytes) with the new version in place" % tag,
         s2.get(EDITED_CHANGED + ".local") == s0.get(EDITED_CHANGED) and
         s2.get(EDITED_CHANGED) == rel_snap.get(EDITED_CHANGED))
    r.ok("[%s] edited app file the release dropped: set aside as .local, original path gone" % tag,
         s2.get(EDITED_REMOVED + ".local") == s0.get(EDITED_REMOVED) and EDITED_REMOVED not in s2)
    bk = J(ws, ".backup/1.0.0")
    info = read(J(bk, "backup-info.txt")) if os.path.isfile(J(bk, "backup-info.txt")) else ""
    r.ok("[%s] .backup/1.0.0/backup-info.txt says from 1.0.0 to 1.0.1, complete" % tag,
         "from: 1.0.0" in info and "to: 1.0.1" in info and "complete: yes" in info, info)
    want_backup = REL_UPDATED + REL_REMOVED + [EDITED_CHANGED, EDITED_REMOVED, "product-manifest.json"]
    bad_copies = [p for p in want_backup if s2.get(".backup/1.0.0/files/" + p) != s0.get(p)]
    r.ok("[%s] .backup/1.0.0/files holds the old bytes of every replaced or removed file" % tag,
         not bad_copies, "\n".join(bad_copies))
    leaked = [k for k in s2 if k.startswith(".backup/1.0.0/files/") and is_user(k[len(".backup/1.0.0/files/"):])]
    r.ok("[%s] the backup holds no user files" % tag, not leaked, "\n".join(leaked))
    r.ok("[%s] new starter file reported and copied from templates/blank/" % tag,
         "new starter file: " + NEW_STARTER in out.splitlines() and
         s2.get(NEW_STARTER) == rel_snap.get("templates/blank/" + NEW_STARTER), out)
    r.ok("[%s] a starter file the user already had is never overwritten nor reported" % tag,
         s2.get(CLASH_STARTER) == s0.get(CLASH_STARTER) and ("new starter file: " + CLASH_STARTER) not in out)
    if have_node:
        t_lines = lines_with(out, "template: ")
        r.ok("[%s] themed copy refreshed: 'template:' line, new template change plus the user's theme" % tag,
             len(t_lines) == 1 and t_lines[0].startswith(THEMED) and
             b"E2E-TEMPLATE-101" in s2.get(THEMED, b"") and b"Georgia" in s2.get(THEMED, b"") and
             "has changes made by hand" not in t_lines[0], out)
        r.ok("[%s] the earlier themed copy is kept as .previous.html; the other copy is untouched" % tag,
             s2.get(THEMED_PREV) == s0.get(THEMED) and s2.get(THEMED_OTHER) == s0.get(THEMED_OTHER))
    else:
        r.ok("[%s] without Node: the documented note, and the themed copy left as it was" % tag,
             "Node isn't available to refresh your themed copy" in out and s2.get(THEMED) == s0.get(THEMED), out)
    r.ok("[%s] the 1.0.1 migration is listed and the 1.0.0 one is not" % tag,
         lines_with(out, "migration: ") == ["migrations/001-add-goals.md"], out)
    r.ok("[%s] install reports hooks-changed: claude and hooks-changed: codex" % tag,
         "hooks-changed: claude" in out.splitlines() and "hooks-changed: codex" in out.splitlines(), out)
    m = re.search(r"^changelog:\n(.*?)^end of changelog$", out, re.S | re.M)
    r.ok("[%s] changelog block shows the 1.0.1 entry only" % tag,
         bool(m) and "## 1.0.1" in m.group(1) and "E2E-CHANGELOG-101" in m.group(1) and "## 1.0.0" not in m.group(1),
         out)
    r.ok("[%s] no error: or note: lines in a clean install" % tag,
         not [l for l in out.splitlines() if l.startswith(("error:", "note:"))] or not have_node, out)

    # ---- again
    r.section("%s: same zip again" % impl)
    rc, out = upd(impl, ws, None, zpath)
    r.ok("[%s] same zip again: 'update: already up to date (1.0.1)'" % tag,
         rc == 0 and last_line(out) == "update: already up to date (1.0.1)", out)
    r.ok("[%s] same zip again changes nothing" % tag, snapshot(ws) == s2, "\n".join(diff(s2, snapshot(ws)))[:2000])
    rc, out = upd(impl, ws, "check", zpath)
    r.ok("[%s] --check after installing: nothing to add, update, remove or keep" % tag,
         rc == 0 and last_line(out) == "update: check (0 to add, 0 to update, 0 to remove, 0 edited by you; "
                                       "nothing changed)" and snapshot(ws) == s2, out)
    r._snap = s2
    rc, out = upd(impl, ws, None, bad["downgrade"][0])
    check_refusal(r, tag, "an older release after updating", ws, rc, out, "older than the installed version (1.0.1)")

    # ---- rollback
    r.section("%s: rollback" % impl)
    rc, out = upd(impl, ws, "rollback")
    s3 = snapshot(ws)
    r.ok("[%s] --rollback ends with 'rollback: done (1.0.1 -> 1.0.0)' and names hooks to reload" % tag,
         rc == 0 and last_line(out) == "rollback: done (1.0.1 -> 1.0.0)" and
         "hooks-changed: claude" in out.splitlines() and "hooks-changed: codex" in out.splitlines(), out)
    if have_node:
        r.ok("[%s] --rollback notes the refreshed themed copy and its .previous.html" % tag,
             ("note: that update refreshed your %s; your copy from before it is %s" % (THEMED, THEMED_PREV)) in out, out)
    expected_after_rb = {"added: " + NEW_STARTER}
    if have_node:
        expected_after_rb |= {"changed: " + THEMED, "added: " + THEMED_PREV,
                              "changed: profile/templates/.generated.json"}
    d03 = set(diff(without(s0, lambda k: k.startswith(".backup/")), without(s3, lambda k: k.startswith(".backup/"))))
    r.ok("[%s] after rollback every app file is back to 1.0.0 exactly (user's edited file back, .local gone)" % tag,
         d03 == expected_after_rb, "\n".join(sorted(d03 ^ expected_after_rb)))
    r.ok("[%s] after rollback the user files are still untouched" % tag,
         all(s3.get(k) == v for k, v in u0.items()
             if k not in (THEMED, "profile/templates/.generated.json") or not have_node))
    r.ok("[%s] the backup is marked rolled_back" % tag,
         "rolled_back:" in read(J(bk, "backup-info.txt")))
    r._snap = s3
    rc, out = upd(impl, ws, "rollback")
    check_refusal(r, tag, "--rollback again with nothing left to undo", ws, rc, out, "no update backup")
    rc, out = upd(impl, ws, "rollback", name="1.0.0")
    check_refusal(r, tag, "--rollback of an already rolled-back backup", ws, rc, out, "already rolled back")
    rc, out = upd(impl, ws, "rollback", name="../1.0.0")
    check_refusal(r, tag, "--rollback with a backup name that is a path", ws, rc, out, "must be a folder name")

    # ---- reinstall with the checksum (upper case), then roll that one back
    r.section("%s: install with --sha256, second rollback" % impl)
    rc, out = upd(impl, ws, None, zpath, sha=rawsha(zpath).upper())
    ll = last_line(out)
    m = re.match(r"^update: done 1\.0\.0 -> 1\.0\.1 \(backup: \.backup/(1\.0\.0-\d{8}-\d{6})\)$", ll)
    r.ok("[%s] --sha256 with the right hash (upper case) installs, into a new backup folder" % tag,
         rc == 0 and bool(m), out)
    second = m.group(1) if m else "?"
    s4 = snapshot(ws)
    r.ok("[%s] second install: app files match 1.0.1 again, user files untouched" % tag,
         without(s4, lambda k: is_user(k) or k.startswith(".backup/")) == app_rel and
         all(s4.get(k) == v for k, v in s3.items() if is_user(k) and not k.startswith(".backup/")
             and k not in (THEMED, THEMED_PREV, "profile/templates/.generated.json")))
    rc, out = upd(impl, ws, "status")
    backs = lines_with(out, "backup: ")
    r.ok("[%s] --status lists both backups (the first marked rolled back)" % tag,
         rc == 0 and len(backs) == 2 and any(b.startswith(".backup/1.0.0 (") and "rolled_back:" in b for b in backs)
         and any(b.startswith(".backup/%s (" % second) for b in backs) and "version: 1.0.1" in out, out)
    first_info = rb(J(bk, "backup-info.txt"))
    rc, out = upd(impl, ws, "rollback")
    s5 = snapshot(ws)
    r.ok("[%s] --rollback picks the newest backup not yet rolled back" % tag,
         rc == 0 and last_line(out) == "rollback: done (1.0.1 -> 1.0.0)" and
         "rolled_back:" in read(J(ws, ".backup/%s/backup-info.txt" % second)) and
         rb(J(bk, "backup-info.txt")) == first_info, out)
    d35 = diff(without(s3, lambda k: k.startswith(".backup/")), without(s5, lambda k: k.startswith(".backup/")))
    r.ok("[%s] after the second rollback the workspace equals the state after the first" % tag,
         not d35 or (have_node and set(d35) <= {"changed: " + THEMED, "changed: " + THEMED_PREV,
                                                 "changed: profile/templates/.generated.json"}), "\n".join(d35))

    # ---- without Node
    r.section("%s: themed copy without Node" % impl)
    s6 = snapshot(ws)
    rc, out = upd(impl, ws, None, zpath, env={"PATH": path_without_node()})
    s7 = snapshot(ws)
    r.ok("[%s] without Node: update finishes and prints the documented note" % tag,
         rc == 0 and last_line(out).startswith("update: done 1.0.0 -> 1.0.1") and
         "Node isn't available to refresh your themed copy in profile/templates/" in out, out)
    r.ok("[%s] without Node: the themed copy and its .previous.html are left alone" % tag,
         s7.get(THEMED) == s6.get(THEMED) and s7.get(THEMED_PREV) == s6.get(THEMED_PREV) and
         not lines_with(out, "template: "))
    rc, out = upd(impl, ws, "rollback")
    r.ok("[%s] and that update rolls back cleanly" % tag,
         rc == 0 and last_line(out) == "rollback: done (1.0.1 -> 1.0.0)" and
         without(snapshot(ws), lambda k: k.startswith(".backup/")) == without(s6, lambda k: k.startswith(".backup/")),
         out)

    # ---- a failure midway undoes itself
    r.section("%s: failure midway" % impl)
    if IS_WINDOWS:
        print("SKIP  [%s] failure midway (needs a read-only folder; POSIX only)" % tag)
        return
    ws2 = copy_ws(prepared, os.path.join(root, "Job Search HQ 2"))
    docs = J(ws2, "docs")
    os.chmod(docs, 0o555)
    try:
        if os.access(docs, os.W_OK):
            print("SKIP  [%s] failure midway (running as root: a read-only folder stays writable)" % tag)
            return
        f0 = snapshot(ws2)
        rc, out = upd(impl, ws2, None, zpath)
        f1 = snapshot(ws2)
        r.ok("[%s] a file that can't be written midway: error, 'everything was put back as it was'" % tag,
             rc == 1 and last_line(out).startswith("error:") and "everything was put back as it was" in last_line(out)
             and "updated: VERSION" in out, out)
        d = diff(without(f0, lambda k: k.startswith(".backup/")), without(f1, lambda k: k.startswith(".backup/")))
        r.ok("[%s] after the automatic undo the workspace is byte-identical (outside .backup/)" % tag, not d,
             "\n".join(d)[:3000])
        r.ok("[%s] the automatic undo is recorded in the backup" % tag,
             "(automatic)" in read(J(ws2, ".backup/1.0.0/backup-info.txt")))
    finally:
        os.chmod(docs, 0o755)
    # The same, but the file that can't be written is one being replaced (as when another program holds it
    # open on Windows). Nothing was changed in that file, so the undo must still report a full undo.
    ws3 = copy_ws(prepared, os.path.join(root, "Job Search HQ 3"))
    tdir = J(ws3, "templates")
    os.chmod(tdir, 0o555)
    try:
        g0 = snapshot(ws3)
        rc, out = upd(impl, ws3, None, zpath)
        g1 = snapshot(ws3)
        d = diff(without(g0, lambda k: k.startswith(".backup/")), without(g1, lambda k: k.startswith(".backup/")))
        r.ok("[%s] an app file that can't be replaced midway: workspace byte-identical after the undo" % tag,
             rc == 1 and not d, "\n".join(d)[:3000] + "\n" + out)
        r.ok("[%s] ... and the undo says 'everything was put back as it was' (not 'partly updated')" % tag,
             "everything was put back as it was" in last_line(out), out)
    finally:
        os.chmod(tdir, 0o755)
    rc, out = upd(impl, ws2, None, zpath)
    r.ok("[%s] once the folder is writable again the update installs" % tag,
         rc == 0 and re.match(r"^update: done 1\.0\.0 -> 1\.0\.1 \(backup: \.backup/1\.0\.0-\d{8}-\d{6}\)$",
                              last_line(out)) is not None, out)


def main():
    args = parse_args("End-to-end test of /update (install, check, rollback, refusals)")
    keep_temps(args.keep)
    r = Run("e2e-update (%s)" % args.impl)
    t = temp_dir("e2e-update")
    have_node = bool(find_node())
    print("bash: %s   node: %s" % (find_bash(), find_node() or "none (themed copies crafted by hand)"))
    r.section("fixtures")
    base = build_base(t, r)
    rel, zpath = build_release(t, base, r)
    prepared = build_installed(t, base, r, have_node)
    sentinel = os.path.join(t, "sentinel")
    os.makedirs(sentinel)
    bad = build_bad_zips(t, zpath, sentinel)
    for impl in args.impls:
        t0 = time.time()
        run_impl(impl, t, prepared, zpath, rel, bad, sentinel, have_node, r)
        print("\n(%s took %.0fs)" % (impl, time.time() - t0))
    r.finish()


if __name__ == "__main__":
    main()
