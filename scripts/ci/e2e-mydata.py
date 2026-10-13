#!/usr/bin/env python3
"""End-to-end test of /my-data: backup (export), delete everything (reset) and bring back a backup
(restore), on throwaway copies of the app in a temp folder whose path has spaces. The real workspace
is never touched.

    python3 scripts/ci/e2e-mydata.py [--impl sh|ps|both] [--keep]

sh drives export.sh / reset.sh / restore.sh / init-data.sh; ps drives their .ps1 twins (PowerShell
from $PS_EXE). Restore follows .claude/skills/my-data/references/restore.md the way an agent on that
platform would: unzip -n (sh) or Expand-Archive without -Force (ps) into a new empty folder outside the
workspace, then restore --dry-run, restore, and the first-run script.
"""
import sys; sys.dont_write_bytecode = True  # noqa: E702
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import (IS_WINDOWS, Run, find_bash, find_powershell, keep_temps, last_line,  # noqa: E402
                        make_workspace, parse_args, ps, run, sh, temp_dir)

import json  # noqa: E402
import re  # noqa: E402
import shutil  # noqa: E402
import time  # noqa: E402
import zipfile  # noqa: E402

# ---------------------------------------------------------------- what the data contract says

PERSONAL = ("profile", "jobs", "contacts", "outbox", "interviews", "history", "imports", "pages",
            "knowledge/field")
BACKED_UP = ("profile", "jobs", "contacts", "outbox", "interviews", "history", "knowledge/field", "pages")
GUIDES = ("profile/README.md", "jobs/README.md", "contacts/README.md", "imports/README.md",
          "pages/README.md", "interviews/.gitkeep", "outbox/sent/.gitkeep", "outbox/discarded/.gitkeep")
LOCAL_ONLY = (".backup", ".claude/settings.local.json", ".claude/.health")
# reset.sh clear_dir calls: folder -> names kept
CLEAR = (("profile", {"README.md"}), ("jobs", {"README.md"}), ("contacts", {"README.md"}),
         ("outbox", {"sent", "discarded"}), ("outbox/sent", {".gitkeep"}),
         ("outbox/discarded", {".gitkeep"}), ("interviews", {".gitkeep"}), ("imports", {"README.md"}),
         ("history", set()), ("pages", {"README.md"}))

# ---------------------------------------------------------------- fixture data (no personal data)

LONG_NAME = "a-very-long-note-name-" + "x" * (80 if IS_WINDOWS else 170) + ".md"
ODD = (  # label, path, content
    ("a name with spaces", "jobs/globex senior analyst/posting.md", b"Globex posting\n"),
    ("a name with an apostrophe, ampersand and brackets", "jobs/initech o'brien & co/notes (draft).md",
     b"Initech notes\n"),
    ("a name with non-ASCII letters (Müller, José)", "jobs/Müller GmbH/José résumé.md",
     "Notes for Müller GmbH, José\n".encode("utf-8")),
    ("a name with a leading dash", "jobs/-leading-dash/-n.md", b"-n is also an echo option\n"),
    ("a very long name", "outbox/" + LONG_NAME, b"long name\n"),
    ("a name with shell characters ($, backticks, [ ], { })", "contacts/odd $HOME `whoami` [1] {a,b}.txt",
     b"not expanded\n"),
    ("a name with an en dash", "interviews/2026-10-02 acme – panel.md",
     "Panel – Acme\n".encode("utf-8")),
    ("a dot-file name", "profile/.hidden-note.md", b"hidden\n"),
    ("a name starting with two dots", "jobs/..double-dot-file", b"two dots\n"),
    ("an empty file", "jobs/empty.txt", b""),
    ("a file with Windows line endings and binary bytes", "jobs/acme-operations-analyst/Alex-Rivera-Resume-Acme.pdf",
     b"%PDF-1.4\r\n" + bytes(range(256)) * 8 + b"\r\n%%EOF\r\n"),
)
RESUME_JSON = json.dumps({
    "$schema": "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json",
    "basics": {"name": "Alex Rivera", "email": "alex.rivera@example.com", "phone": "555-0100"},
    "work": [{"name": "Northwind", "position": "Operations Analyst", "startDate": "2023-01"}],
    "meta": {"version": "v1.0.0", "lastModified": "2026-10-06T14:05:00"},
}, indent=2).encode("utf-8") + b"\n"
EXTRA = {
    "profile/resume.json": RESUME_JSON,
    "profile/signature.txt": b"Alex Rivera\nalex.rivera@example.com | 555-0100\n",
    "profile/resume-original.pdf": b"%PDF-1.7\n" + bytes(range(255, -1, -1)) * 4,
    "profile/templates/resume-template.html": b"<!doctype html><title>Themed resume</title>\n",
    "jobs/acme-operations-analyst/posting.md": b"---\ncompany: Acme\nrole: Operations Analyst\n---\nPosting.\n",
    "jobs/acme-operations-analyst/resume.md": b"# Alex Rivera\n",
    "jobs/acme-operations-analyst/crlf-notes.txt": b"line one\r\nline two\r\n",
    "jobs/work-search/2026-W40.csv": b"date,employer\n2026-10-01,Acme\n",
    "jobs/notes.local": b"a user's own file that happens to end in .local\n",
    "outbox/2026-10-06-thank-you-acme.md": b"---\nchannel: email\nstatus: draft\n---\nThanks.\n",
    "outbox/sent/2026-10-01-intro-globex.md": b"---\nstatus: sent\nsent: 2026-10-01\n---\nHello.\n",
    "outbox/discarded/2026-09-30-old-note.md": b"---\nstatus: discarded\n---\nOld.\n",
    "interviews/2026-10-02-acme-debrief.md": b"# Acme debrief\n",
    "knowledge/field/notes/extra-field-notes.md": b"extra field notes\n",
    "pages/my-own-page.html": b"<!doctype html><title>Mine</title>\n",
    "imports/Alex Rivera LinkedIn export.zip": b"PK\x03\x04 not really a zip\n",
    "imports/offer letter.pdf": b"%PDF-1.4 offer\n",
}
STARTER_EDITS = ("profile/master-resume.md", "profile/story-bank.md", "profile/voice.md",
                 "profile/references.md", "profile/published-pages.md", "profile/design.md",
                 "jobs/tracker.csv", "jobs/leads.csv", "contacts/contacts.csv", "history/activity.md",
                 "pages/dashboard.html", "knowledge/field/field-primer.md", "knowledge/field/background.md")
THROWAWAY = ("jobs/acme-operations-analyst/resume.check.pdf", "jobs/.DS_Store", "outbox/.DS_Store",
             "pages/Thumbs.db", "pages/.publish/dashboard.html", "pages/.preview/dashboard-ocean.html")
LOCKS = ("jobs/~$tracker.csv", "jobs/acme-operations-analyst/~$cover-letter.docx")
LOCAL_FILES = (".backup/1.4.0/AGENTS.md", ".claude/settings.local.json", ".claude/.health/last-check",
               "AGENTS.md.local", ".claude/hooks/guard.sh.local", "templates/resume-template.html.local")
GIT_FILES = (".git/HEAD", ".git/config.local", ".git/~$index")
SECRET_FILE = b"OUTSIDE-SECRET-FILE\n"
SECRET_DIR = b"OUTSIDE-SECRET-FOLDER\n"


# ---------------------------------------------------------------- small helpers

def rel(root, p):
    return os.path.relpath(p, root).replace(os.sep, "/")


def under(r, prefixes):
    return any(r == x or r.startswith(x + "/") for x in prefixes)


def J(root, r):
    return os.path.join(root, *r.split("/"))


def wbytes(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def rbytes(path):
    with open(path, "rb") as f:
        return f.read()


def bpath(p):
    """Path for a bash argument (Git Bash takes C:/... on Windows)."""
    return p.replace("\\", "/") if IS_WINDOWS else p


def native(p):
    """Path printed by bash, as a native path."""
    if IS_WINDOWS and p.startswith("/"):
        rc, out = run([find_bash(), "-c", 'cygpath -w "$1"', "_", p])
        if rc == 0:
            return out.strip()
    return p


def same_path(a, b):
    return os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(b))


def psq(s):
    return s.replace("'", "''")


def snap(root):
    """{relative path: ("file", bytes) | ("link", target)} without following links."""
    s = {}
    if not os.path.isdir(root):
        return s
    for dp, dn, fn in os.walk(root):
        for d in list(dn):
            p = os.path.join(dp, d)
            if os.path.islink(p):
                s[rel(root, p)] = ("link", os.readlink(p))
                dn.remove(d)
        for f in fn:
            p = os.path.join(dp, f)
            s[rel(root, p)] = ("link", os.readlink(p)) if os.path.islink(p) else ("file", rbytes(p))
    return s


def diff(a, b, limit=15):
    added = sorted(set(b) - set(a))
    removed = sorted(set(a) - set(b))
    changed = sorted(k for k in set(a) & set(b) if a[k] != b[k])
    lines = []
    for title, items in (("added", added), ("removed", removed), ("changed", changed)):
        if items:
            lines.append("%s (%d): %s" % (title, len(items), ", ".join(items[:limit])))
    return "\n".join(lines) or "(no differences)"


def app_part(s):
    return {k: v for k, v in s.items()
            if not under(k, PERSONAL) and not under(k, LOCAL_ONLY) and not under(k, (".git",))
            and not k.endswith(".local")}


def user_part(s):
    return {k: v for k, v in s.items() if under(k, PERSONAL)}


def zips_in(root):
    found = set()
    for dp, _dn, fn in os.walk(root):
        for f in fn:
            if f.endswith(".zip"):
                found.add(os.path.join(dp, f))
    return found


def can_symlink(base):
    probe = os.path.join(base, "link-probe")
    try:
        os.symlink(base, probe, target_is_directory=True)
        os.unlink(probe)
        return True
    except (OSError, NotImplementedError, AttributeError):
        return False


def case_insensitive(base):
    probe = os.path.join(base, "CaseProbe")
    wbytes(probe, b"x")
    try:
        return os.path.exists(os.path.join(base, "caseprobe"))
    finally:
        os.remove(probe)


def clone(src, parent, name="Job Search HQ"):
    dest = os.path.join(parent, name)
    shutil.copytree(src, dest, symlinks=True)
    return dest


# ---------------------------------------------------------------- driving the scripts

SCRIPT_DIRS = {"export": "my-data", "reset": "my-data", "restore": "my-data", "init-data": "start"}
PS_FLAGS = {"--dry-run": "-DryRun", "--yes-delete": "-YesDelete", "--include-imports": "-IncludeImports",
            "--include-templates": "-IncludeTemplates", "--quiet": "-Quiet", "--add-only": "-AddOnly"}


def script_path(impl, ws, name):
    return os.path.join(ws, ".claude", "skills", SCRIPT_DIRS[name], "scripts",
                        name + (".sh" if impl == "sh" else ".ps1"))


def drive(impl, ws, name, args=(), env=None, script=None):
    """Runs a my-data or start script of the workspace from the workspace root. args use the sh
    spelling; for ps they become the .ps1 parameters (a folder becomes -Destination)."""
    script = script or script_path(impl, ws, name)
    if impl == "sh":
        a = [x if x.startswith("-") or x.startswith("~") else bpath(x) for x in args]
        return sh(bpath(script), *a, cwd=ws, env=env)
    a = []
    for x in args:
        if x in PS_FLAGS:
            a.append(PS_FLAGS[x])
        elif x.startswith("--"):
            a.append("-" + "".join(w.title() for w in x[2:].split("-")))
        else:
            a += ["-From" if name == "restore" else "-Destination", x]
    return ps(script, *a, cwd=ws, env=env)


def saved_path(out):
    m = re.match(r"^saved: (.+)$", last_line(out))
    return native(m.group(1).strip()) if m else None


# ---------------------------------------------------------------- fixtures

def populate(ws, outside, links_ok, locks=True):
    p = J(ws, "profile/preferences.md")
    text = rbytes(p).replace(b"SETUP: not done", b"SETUP: done 2026-10-01", 1)
    wbytes(p, text + b"\nE2E-MARKER-PREFERENCES name: Alex Rivera\n")
    for r in STARTER_EDITS:
        f = J(ws, r)
        if r.endswith(".csv"):
            add = b"Acme Corp,Operations Analyst,applied,2026-10-01\r\n"
        elif r == "history/activity.md":
            add = "- 2026-10-01 09:00 · Claude · Acme Operations Analyst: applied\n".encode("utf-8")
        else:
            add = ("\nE2E-MARKER %s · Alex Rivera\n" % r).encode("utf-8")
        wbytes(f, rbytes(f) + add)
    for _label, r, data in ODD:
        wbytes(J(ws, r), data)
    for r, data in EXTRA.items():
        wbytes(J(ws, r), data)
    for r in THROWAWAY:
        wbytes(J(ws, r), b"throwaway\n")
    if locks:
        for r in LOCKS:
            wbytes(J(ws, r), b"\x00lock")
    for r in LOCAL_FILES:
        wbytes(J(ws, r), ("local-only %s\n" % r).encode("utf-8"))
    wbytes(J(ws, ".git/HEAD"), b"ref: refs/heads/main\n")
    wbytes(J(ws, ".git/config.local"), b"[e2e]\n")
    wbytes(J(ws, ".git/~$index"), b"lock inside .git\n")
    if not os.path.exists(os.path.join(outside, "secret.txt")):
        wbytes(os.path.join(outside, "secret.txt"), SECRET_FILE)
        wbytes(os.path.join(outside, "secret folder", "inner.txt"), SECRET_DIR)
    if links_ok:
        os.symlink(os.path.join(outside, "secret.txt"), J(ws, "jobs/link-to-secret.txt"))
        os.symlink(os.path.join(outside, "secret folder"), J(ws, "jobs/acme-operations-analyst/linked-folder"),
                   target_is_directory=True)
        os.symlink(os.path.join(outside, "missing.md"), J(ws, "profile/broken-link.md"))
        os.symlink("dashboard.html", J(ws, "pages/latest.html"))


LINKS = ("jobs/link-to-secret.txt", "jobs/acme-operations-analyst/linked-folder", "profile/broken-link.md",
         "pages/latest.html")


def expected_export(ws, extra_dirs=()):
    """The files a backup must hold: every regular file in the backed-up folders, minus links,
    pages/.publish and pages/.preview, *.check.pdf, .DS_Store, Thumbs.db and ~$ lock files; plus
    resume.json at the top when profile/resume.json is a regular file."""
    exp = {}
    for d in BACKED_UP + tuple(extra_dirs):
        top = J(ws, d)
        if os.path.islink(top) or not os.path.isdir(top):
            continue
        for dp, dn, fn in os.walk(top):
            dn[:] = [x for x in dn if not os.path.islink(os.path.join(dp, x))
                     and rel(ws, os.path.join(dp, x)) not in ("pages/.publish", "pages/.preview")]
            for f in fn:
                p = os.path.join(dp, f)
                if (os.path.islink(p) or f in (".DS_Store", "Thumbs.db") or f.endswith(".check.pdf")
                        or f.startswith("~$")):
                    continue
                exp[rel(ws, p)] = rbytes(p)
    rj = J(ws, "profile/resume.json")
    if os.path.isfile(rj) and not os.path.islink(rj):
        exp["resume.json"] = rbytes(rj)
    return exp


def expected_deletes(ws):
    out = set()
    for d, keep in CLEAR:
        p = J(ws, d)
        if os.path.isdir(p) and not os.path.islink(p):
            out.update(d + "/" + n for n in os.listdir(p) if n not in keep)
    for x in ("knowledge/field",) + LOCAL_ONLY:
        if os.path.lexists(J(ws, x)):
            out.add(x)
    for dp, dn, fn in os.walk(ws):
        dn[:] = [x for x in dn if not under(rel(ws, os.path.join(dp, x)), (".git", ".backup") + PERSONAL)]
        for name in fn + [x for x in dn if os.path.islink(os.path.join(dp, x))]:
            if name.endswith(".local"):
                out.add(rel(ws, os.path.join(dp, name)))
        dn[:] = [x for x in dn if not os.path.islink(os.path.join(dp, x))]
    return out


def read_zip(path):
    info = {"tops": set(), "files": {}, "no_utf8": [], "backslash": [], "error": None}
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:  # noqa: BLE001
        info["error"] = "cannot open: %s" % e
        return info
    with z:
        bad = z.testzip()
        if bad:
            info["error"] = "damaged entry: %s" % bad
        for i in z.infolist():
            name = i.filename
            if not (i.flag_bits & 0x800):
                try:
                    fixed = name.encode("cp437").decode("utf-8")
                except (UnicodeEncodeError, UnicodeDecodeError):
                    fixed = name
                if any(ord(c) > 127 for c in fixed):
                    info["no_utf8"].append(fixed)
                name = fixed
            if "\\" in name:
                info["backslash"].append(name)
                name = name.replace("\\", "/")
            top, _, rest = name.partition("/")
            info["tops"].add(top)
            if not rest or name.endswith("/"):
                continue
            info["files"][rest] = z.read(i)
    return info


def files_under(root):
    """{relative path: bytes} of regular files under root (links reported as None)."""
    out = {}
    for k, v in snap(root).items():
        out[k] = v[1] if v[0] == "file" else None
    return out


# ---------------------------------------------------------------- the checks

def check_zip_contents(R, tag, z, exp, what):
    files = dict(z["files"])
    readme = files.pop("READ-ME.txt", None)
    R.ok("%s %s: READ-ME.txt is in it, asks to keep the backup private, says to restore through the app" % (tag, what),
         readme is not None and b"Keep it private" in readme and b"say 'restore my backup'" in readme
         and b"copy the folders back" not in readme, readme)
    missing = sorted(set(exp) - set(files))
    extra = sorted(set(files) - set(exp))
    R.ok("%s %s: holds exactly the expected files (no more, no fewer)" % (tag, what),
         not missing and not extra,
         "missing (%d): %s\nextra (%d): %s" % (len(missing), missing[:15], len(extra), extra[:15]))
    changed = sorted(k for k in set(exp) & set(files) if exp[k] != files[k])
    R.ok("%s %s: every file is byte-identical to the workspace copy" % (tag, what), not changed,
         "changed: %s" % changed[:15])
    return files


def export_ok(R, tag, what, rc, out, dest):
    zp = saved_path(out)
    good = rc == 0 and zp is not None and os.path.isfile(zp) and same_path(os.path.dirname(zp), dest)
    R.ok("%s %s: exit 0, last line 'saved: <path>', zip is in the folder asked for" % (tag, what), good,
         "rc=%s\n%s" % (rc, out))
    return zp if good else None


def scenario_main(R, impl, base, pristine, outside, links_ok, blank):
    tag = "[%s]" % impl
    R.section("%s backup, delete everything, bring back (main journey)" % impl)
    ws = clone(pristine, os.path.join(base, "main journey"))
    populate(ws, outside, links_ok)
    s0 = snap(ws)
    out0 = snap(outside)
    today = time.strftime("%Y-%m-%d")

    # ---- export, default options
    dest1 = os.path.join(base, "Backups Müller & Co")
    rc, out = drive(impl, ws, "export", [dest1])
    zp1 = export_ok(R, tag, "export", rc, out, dest1)
    R.ok("%s export creates the backup folder when it doesn't exist" % tag, os.path.isdir(dest1))
    R.ok("%s export changes nothing in the workspace or outside it" % tag,
         snap(ws) == s0 and snap(outside) == out0, diff(s0, snap(ws)))
    z1 = read_zip(zp1) if zp1 else {"tops": set(), "files": {}, "no_utf8": [], "backslash": [],
                                    "error": "no zip"}
    R.ok("%s backup zip opens and every entry passes its CRC check" % tag, z1["error"] is None, z1["error"])
    top1 = os.path.basename(zp1)[:-4] if zp1 else ""
    R.ok("%s backup is named job-search-backup-<today>.zip with one top folder of the same name" % tag,
         top1 == "job-search-backup-" + today and z1["tops"] == {top1}, "zip=%s tops=%s" % (zp1, z1["tops"]))
    R.ok("%s zip entry names use / (any unzip tool rebuilds the folders)" % tag, not z1["backslash"],
         z1["backslash"][:5])
    R.ok("%s zip marks non-ASCII names as UTF-8 (they unpack correctly on Windows and in Python)" % tag,
         not z1["no_utf8"],
         "entries without the UTF-8 flag (shown decoded): %s" % z1["no_utf8"][:5])
    exp1 = expected_export(ws)
    files1 = check_zip_contents(R, tag, z1, exp1, "backup")
    for d in ("profile", "jobs", "contacts", "outbox", "outbox/sent", "outbox/discarded", "interviews",
              "history", "knowledge/field", "pages"):
        R.ok("%s backup includes %s/" % (tag, d), any(k.startswith(d + "/") for k in files1))
    R.ok("%s backup includes your themed templates (profile/templates/)" % tag,
         "profile/templates/resume-template.html" in files1)
    for label, r, data in ODD:
        R.ok("%s %s round-trips through the zip exactly" % (tag, label), files1.get(r) == data,
             "%s present=%s" % (r, r in files1))
    app = [k for k in files1 if under(k, (".claude", ".agents", ".codex", ".git", ".githooks", "scripts",
                                          "migrations")) or k in ("AGENTS.md", "CLAUDE.md", "VERSION")
           or k.startswith("knowledge/job-search-playbook") or k.startswith("knowledge/interview-questions")]
    R.ok("%s backup has none of the app's files (.claude, .agents, .codex, .git, AGENTS.md, playbook)" % tag,
         not app, app[:10])
    R.ok("%s backup leaves out imports/ and templates/ by default" % tag,
         not any(under(k, ("imports", "templates")) for k in files1))
    junk = [k for k in files1 if k.startswith(("pages/.publish/", "pages/.preview/"))
            or k.endswith((".check.pdf", ".DS_Store", "Thumbs.db"))]
    R.ok("%s backup leaves out throwaway files (.publish, .preview, .check.pdf, .DS_Store, Thumbs.db)" % tag,
         not junk, junk)
    R.ok("%s backup leaves out Office lock files (~$...)" % tag,
         not any(os.path.basename(k).startswith("~$") for k in files1))
    R.ok("%s backup has resume.json at the top, identical to profile/resume.json" % tag,
         files1.get("resume.json") == RESUME_JSON)
    m = re.search(r"^files: (\d+)$", out, re.M)
    R.ok("%s 'files: N' matches the number of files in the zip" % tag,
         m is not None and int(m.group(1)) == len(z1["files"]), "line=%s zip=%d" % (m and m.group(0),
                                                                                       len(z1["files"])))
    if impl == "sh" and not IS_WINDOWS and zp1:
        R.ok("%s backup zip is readable only by the user (mode 600)" % tag,
             (os.stat(zp1).st_mode & 0o777) == 0o600, oct(os.stat(zp1).st_mode & 0o777))
    if links_ok:
        skipped = set(l.replace("\\", "/") for l in re.findall(r"^skipped link: (.+)$", out, re.M))
        R.ok("%s every link (shortcut) is reported as 'skipped link:'" % tag, skipped == set(LINKS),
             "reported=%s" % sorted(skipped))
        leaked = [k for k in z1["files"] if under(k, LINKS)]
        secret = [k for k, v in z1["files"].items() if b"OUTSIDE-SECRET" in v]
        R.ok("%s nothing a link points to is in the backup (files outside the workspace stay out)" % tag,
             not leaked and not secret, "entries=%s secret in=%s" % (leaked, secret))

    # ---- export again into the same folder, with imports
    time.sleep(1.1)
    zp1_bytes = rbytes(zp1) if zp1 else b""
    rc, out = drive(impl, ws, "export", [dest1, "--include-imports"])
    zp2 = export_ok(R, tag, "second export (with imports) into the same folder", rc, out, dest1)
    R.ok("%s second export on the same day gets a new name and leaves the first backup as it was" % tag,
         zp2 is not None and zp1 is not None and not same_path(zp1, zp2)
         and re.match(r"^job-search-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip$", os.path.basename(zp2))
         and rbytes(zp1) == zp1_bytes, "first=%s second=%s" % (zp1, zp2))
    z2 = read_zip(zp2) if zp2 else {"files": {}, "tops": set(), "no_utf8": [], "backslash": [], "error": "x"}
    exp2 = expected_export(ws, ("imports",))
    files2 = check_zip_contents(R, tag, z2, exp2, "backup with --include-imports")
    R.ok("%s --include-imports adds imports/ but still not templates/" % tag,
         "imports/offer letter.pdf" in files2 and not any(under(k, ("templates",)) for k in files2))

    # ---- export with templates
    dest3 = os.path.join(base, "Backups with templates")
    rc, out = drive(impl, ws, "export", [dest3, "--include-templates"])
    zp3 = export_ok(R, tag, "export with templates", rc, out, dest3)
    z3 = read_zip(zp3) if zp3 else {"files": {}, "tops": set(), "no_utf8": [], "backslash": [], "error": "x"}
    files3 = check_zip_contents(R, tag, z3, expected_export(ws, ("templates",)), "backup with --include-templates")
    R.ok("%s --include-templates adds templates/ (incl. templates/blank) but not imports/" % tag,
         "templates/blank/profile/preferences.md" in files3 and not any(under(k, ("imports",)) for k in files3))

    # ---- unknown option
    before_dest = set(os.listdir(dest3))
    rc, out = drive(impl, ws, "export", [dest3, "--bogus"])
    R.ok("%s export with an unknown option fails and saves nothing" % tag,
         rc != 0 and set(os.listdir(dest3)) == before_dest and snap(ws) == s0, "rc=%s\n%s" % (rc, out))

    # ---- reset preview
    rc, out = drive(impl, ws, "reset", ["--dry-run"])
    o = out.replace("\\", "/")
    R.ok("%s reset --dry-run ends with 'reset: dry-run (nothing changed)'" % tag,
         rc == 0 and last_line(o) == "reset: dry-run (nothing changed)", "rc=%s\n%s" % (rc, out))
    R.ok("%s reset --dry-run changes nothing anywhere (whole workspace and the outside folder)" % tag,
         snap(ws) == s0 and snap(outside) == out0, diff(s0, snap(ws)))
    listed = set(re.findall(r"^delete: (.+)$", o, re.M))
    want = expected_deletes(ws)
    R.ok("%s reset --dry-run lists exactly the personal and local-only items" % tag, listed == want,
         "missing: %s\nunexpected: %s" % (sorted(want - listed)[:15], sorted(listed - want)[:15]))
    appish = [x for x in listed if not under(x, PERSONAL) and not under(x, LOCAL_ONLY)
              and not x.endswith(".local")]
    R.ok("%s reset --dry-run lists no app file and no folder guide" % tag,
         not appish and not (listed & set(GUIDES)), appish[:10])
    R.ok("%s reset --dry-run lists every starter file it would put back" % tag,
         set(re.findall(r"^reset: (?!dry-run)(.+)$", o, re.M)) == set(blank))
    m = re.search(r"^would delete: (\d+) item", o, re.M)
    R.ok("%s 'would delete: N' matches the delete: lines" % tag, m is not None and int(m.group(1)) == len(listed),
         m and m.group(0))
    opened = set(re.findall(r"^open: (.+)$", o, re.M))
    R.ok("%s reset --dry-run shows each Office lock file as 'open:' and warns the real reset will refuse" % tag,
         opened == set(LOCKS) and "will refuse" in o, "open lines: %s" % sorted(opened))
    R.ok("%s a ~$ file inside .git is not treated as an open document" % tag, ".git/~$index" not in opened)

    # ---- reset refuses while a lock file is there
    rc, out = drive(impl, ws, "reset", ["--yes-delete"])
    R.ok("%s reset --yes-delete refuses while a ~$ lock file exists" % tag,
         rc != 0 and last_line(out).startswith("error:") and "open in Excel or Word" in out
         and "open: jobs/~$tracker.csv" in out.replace("\\", "/"), "rc=%s\n%s" % (rc, out))
    R.ok("%s ...and nothing was changed" % tag, snap(ws) == s0 and snap(outside) == out0, diff(s0, snap(ws)))

    # ---- the real reset
    for r in LOCKS:
        os.remove(J(ws, r))
    s1 = snap(ws)
    want = expected_deletes(ws)
    rc, out = drive(impl, ws, "reset", ["--yes-delete"])
    R.ok("%s reset --yes-delete ends with 'reset: done'" % tag,
         rc == 0 and last_line(out) == "reset: done" and "error:" not in out, "rc=%s\n%s" % (rc, out))
    m = re.search(r"^deleted: (\d+) item\(s\); reset: (\d+) file\(s\)$", out, re.M)
    R.ok("%s 'deleted: N; reset: M' counts every item deleted and every starter file put back" % tag,
         m is not None and int(m.group(1)) == len(want) and int(m.group(2)) == len(blank),
         "%s (expected %d and %d)" % (m and m.group(0), len(want), len(blank)))
    s2 = snap(ws)
    users = user_part(s2)
    expect_set = set(blank) | set(GUIDES)
    R.ok("%s after reset the personal folders hold only the starter files and folder guides" % tag,
         set(users) == expect_set,
         "left over: %s\nmissing: %s" % (sorted(set(users) - expect_set)[:15], sorted(expect_set - set(users))))
    wrong = [r for r in blank if r != "history/activity.md" and users.get(r) != ("file", rbytes(J(ws, "templates/blank/" + r)))]
    R.ok("%s every starter file is byte-identical to templates/blank" % tag, not wrong, wrong)
    act = users.get("history/activity.md", ("", b""))[1]
    bl = rbytes(J(ws, "templates/blank/history/activity.md"))
    R.ok("%s activity log is the blank one plus one 'Reset' line" % tag,
         act.startswith(bl) and re.match(
             r"^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} · Reset · Personal data cleared; workspace back to blank\.\n$",
             act[len(bl):].decode("utf-8", "replace")) is not None, act[len(bl):])
    R.ok("%s preferences say SETUP: not done" % tag,
         b"\nSETUP: not done" in users.get("profile/preferences.md", ("", b""))[1])
    R.ok("%s folder guides (README.md, .gitkeep) are kept byte-identical" % tag,
         all(s2.get(g) == s1.get(g) for g in GUIDES), [g for g in GUIDES if s2.get(g) != s1.get(g)])
    R.ok("%s .backup/ (update copies) is removed" % tag, not os.path.lexists(J(ws, ".backup")))
    R.ok("%s .claude/settings.local.json and .claude/.health/ are removed" % tag,
         not os.path.lexists(J(ws, ".claude/settings.local.json")) and not os.path.lexists(J(ws, ".claude/.health")))
    left_local = [k for k in s2 if k.endswith(".local") and not k.startswith(".git/")]
    R.ok("%s every *.local file outside .git is removed" % tag, not left_local, left_local)
    R.ok("%s .git is left alone (its files, incl. a *.local and a ~$ file)" % tag,
         all(s2.get(g) == s1.get(g) for g in GIT_FILES))
    R.ok("%s every app file is byte-identical to before the reset" % tag, app_part(s2) == app_part(s1),
         diff(app_part(s1), app_part(s2)))
    if links_ok:
        R.ok("%s links inside personal folders are removed" % tag,
             not any(os.path.lexists(J(ws, l)) for l in LINKS), [l for l in LINKS if os.path.lexists(J(ws, l))])
        R.ok("%s files and folders the links pointed to OUTSIDE the workspace are untouched" % tag,
             snap(outside) == out0, diff(out0, snap(outside)))
    rc, out = drive(impl, ws, "init-data")
    R.ok("%s after reset the first-run script has nothing to do (like a fresh download after first run)" % tag,
         rc == 0 and last_line(out) == "init: nothing to do", out)

    # ---- bring the backup back (my-data references/restore.md)
    unpack_dir = None
    if zp2:
        unpack_dir = restore_after_reset(R, impl, base, ws, zp2, exp2, blank, outside, out0, links_ok)
    return zp2, exp2, unpack_dir


def unpack(R, impl, tag, zp, unpack_parent, what):
    """my-data references/restore.md steps 1 and 3. Returns the unpacked folder (the new folder), or None."""
    z = read_zip(zp)
    top = next(iter(z["tops"])) if len(z["tops"]) == 1 else ""
    R.ok("%s %s step 1: the zip is one job-search-backup-<date>/ folder with READ-ME.txt, profile/, jobs/" % (tag, what),
         re.match(r"^job-search-backup-\d{4}-\d{2}-\d{2}(-\d{6})?$", top) is not None
         and "READ-ME.txt" in z["files"] and any(k.startswith("profile/") for k in z["files"])
         and any(k.startswith("jobs/") for k in z["files"]), "tops=%s" % z["tops"])
    unpack_dir = os.path.join(unpack_parent, "job-search-restore-" + time.strftime("%Y-%m-%d"))
    os.makedirs(unpack_dir)  # a new, empty folder outside the workspace
    if impl == "sh":
        rc, out = run([find_bash(), "-c", 'command -v unzip >/dev/null || exit 99; unzip -n "$1" -d "$2"', "_",
                       bpath(zp), bpath(unpack_dir)])
        if rc == 99:
            print("NOTE  %s %s not run: no unzip in this bash" % (tag, what))
            return None
        how = "unzip -n"
    else:
        rc, out = run([find_powershell(), "-NoProfile", "-NonInteractive", "-Command",
                       "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; "
                       "Expand-Archive -LiteralPath '%s' -DestinationPath '%s'" % (psq(zp), psq(unpack_dir))])
        how = "Expand-Archive (no -Force)"
    R.ok("%s %s step 3: %s into a new empty folder outside the workspace works" % (tag, what, how), rc == 0, out)
    got = files_under(os.path.join(unpack_dir, top))
    R.ok("%s %s: the unpacked folder holds exactly the zip's files, names and bytes" % (tag, what),
         got == z["files"], diff({k: ("file", v) for k, v in z["files"].items()},
                                 {k: ("file", v) for k, v in got.items()}))
    return unpack_dir


def restore(R, impl, tag, ws, unpack_dir, what, extra=()):
    """my-data references/restore.md step 4 (preview, then run) and step 5. Returns the restore output."""
    s0 = snap(ws)
    rc, out = drive(impl, ws, "restore", ["--dry-run"] + list(extra) + [unpack_dir])
    R.ok("%s %s step 4 preview: ends 'restore: dry-run (...; nothing changed)' and changes nothing" % (tag, what),
         rc == 0 and re.match(r"^restore: dry-run \(.*; nothing changed\)$", last_line(out)) is not None
         and snap(ws) == s0, "rc=%s\n%s\n%s" % (rc, out, diff(s0, snap(ws))))
    preview = out
    rc, out = drive(impl, ws, "restore", list(extra) + [unpack_dir])
    R.ok("%s %s step 4: ends 'restore: done (...)' and lists the same actions as the preview" % (tag, what),
         rc == 0 and last_line(out).startswith("restore: done (")
         and action_lines(out) == action_lines(preview), "rc=%s\n%s" % (rc, out))
    rc2, out2 = drive(impl, ws, "init-data")
    R.ok("%s %s step 5: the first-run script runs cleanly afterwards" % (tag, what),
         rc2 == 0 and "error:" not in out2, out2)
    return out


def action_lines(out):
    return sorted(l for l in out.replace("\\", "/").splitlines()
                  if re.match(r"^(restored|replaced starter|merged|differs|skipped link|ignored): ", l))


def counts(out):
    m = re.match(r"^restore: (?:done|dry-run) \((\d+) restored, (\d+) replaced starter, (\d+) merged, (\d+) differ",
                 last_line(out))
    return tuple(int(x) for x in m.groups()) if m else None


def restore_after_reset(R, impl, base, ws, zp, exp, blank, outside, out0, links_ok):
    tag = "[%s]" % impl
    s_reset = snap(ws)
    unpack_dir = unpack(R, impl, tag, zp, os.path.join(base, "restore área"), "restore")
    if not unpack_dir:
        return
    out = restore(R, impl, tag, ws, unpack_dir, "restore")
    s3 = snap(ws)
    users = {k: (v[1] if v[0] == "file" else None) for k, v in user_part(s3).items()}
    want = {k: v for k, v in exp.items() if k != "resume.json"}
    starters = set(blank)
    plain = sorted(k for k in want if k not in starters)
    bad_plain = [k for k in plain if users.get(k) != want[k]]
    R.ok("%s restore brings back every backed-up file that has no starter copy, byte-identical" % tag,
         not bad_plain, "%d of %d wrong: %s" % (len(bad_plain), len(plain), bad_plain[:15]))
    coll = sorted(k for k in want if k in starters and k != "history/activity.md")
    bad_coll = [k for k in coll if users.get(k) != want[k]]
    R.ok("%s restore after a reset brings back preferences, master resume, tracker, contacts, field pack and pages "
         "(files that also have a starter copy)" % tag, not bad_coll,
         "%d of %d still hold the blank starter instead of the backup: %s" % (len(bad_coll), len(coll), bad_coll))
    reset_log = s_reset["history/activity.md"][1]
    bl = rbytes(J(ws, "templates/blank/history/activity.md"))
    act = users.get("history/activity.md") or b""
    R.ok("%s restored activity log is the backup's log followed by the reset line" % tag,
         act == want["history/activity.md"] + reset_log[len(bl):], act[-300:])
    n_rest = len([k for k in want if k not in s_reset])
    n_rep = len([k for k in coll if s_reset.get(k) != ("file", want[k])])
    R.ok("%s restore counts: every missing file restored, every changed starter replaced, the log merged, 0 differ" % tag,
         counts(out) == (n_rest, n_rep, 1, 0), "%s (expected %s)" % (last_line(out), (n_rest, n_rep, 1, 0)))
    extra = sorted(set(users) - set(want))
    R.ok("%s after restore the personal folders hold nothing that wasn't in the backup" % tag, not extra, extra[:15])
    R.ok("%s restore copies no app file (everything outside the personal folders is unchanged)" % tag,
         {k: v for k, v in s3.items() if not under(k, PERSONAL)} ==
         {k: v for k, v in s_reset.items() if not under(k, PERSONAL)},
         diff({k: v for k, v in s_reset.items() if not under(k, PERSONAL)},
              {k: v for k, v in s3.items() if not under(k, PERSONAL)}))
    R.ok("%s restore brings back imports/ from a backup made with --include-imports" % tag,
         users.get("imports/offer letter.pdf") == EXTRA["imports/offer letter.pdf"])
    if links_ok:
        R.ok("%s restore brings back no link, and the outside files are still untouched" % tag,
             not any(os.path.lexists(J(ws, l)) for l in LINKS) and snap(outside) == out0)
    return unpack_dir


def scenario_restore_more(R, impl, base, pristine, zp, exp, unpack_dir, outside, links_ok):
    tag = "[%s]" % impl
    want = {k: v for k, v in exp.items() if k != "resume.json"}

    R.section("%s restore into a fresh download after its first run (a new computer)" % impl)
    ws = clone(pristine, os.path.join(base, "fresh download"))
    out = restore(R, impl, tag, ws, unpack_dir, "fresh-download restore")
    users = {k: (v[1] if v[0] == "file" else None) for k, v in user_part(snap(ws)).items()}
    bad = sorted(k for k in set(want) | set(users) if users.get(k) != want.get(k))
    R.ok("%s every personal file is byte-identical to the backup (starters replaced, log merged)" % tag, not bad,
         bad[:15])
    R.ok("%s ...and nothing was reported as 'differs'" % tag, counts(out) is not None and counts(out)[3] == 0,
         last_line(out))

    R.section("%s restore into a workspace that has its own data" % impl)
    ws = clone(pristine, os.path.join(base, "has data"))
    p = J(ws, "profile/preferences.md")
    wbytes(p, rbytes(p).replace(b"SETUP: not done", b"SETUP: done 2026-10-10", 1) + b"\nLOCAL-EDIT\n")
    wbytes(J(ws, "jobs/tracker.csv"), rbytes(J(ws, "jobs/tracker.csv")) + b"Initech,Analyst,applied,2026-10-09\r\n")
    wbytes(J(ws, "jobs/initech-analyst/posting.md"), b"local job\n")
    before = user_part(snap(ws))
    out = restore(R, impl, tag, ws, unpack_dir, "replace restore")
    after = user_part(snap(ws))
    o = out.replace("\\", "/")
    R.ok("%s files changed here (preferences, tracker) are reported 'differs:' and left as they are" % tag,
         "differs: profile/preferences.md" in o and "differs: jobs/tracker.csv" in o
         and after["profile/preferences.md"] == before["profile/preferences.md"]
         and after["jobs/tracker.csv"] == before["jobs/tracker.csv"], out)
    R.ok("%s starter files that weren't changed here are replaced by the backup's" % tag,
         "replaced starter: profile/master-resume.md" in o
         and after.get("profile/master-resume.md") == ("file", want["profile/master-resume.md"]), out)
    R.ok("%s a file only this workspace has is kept" % tag,
         after.get("jobs/initech-analyst/posting.md") == ("file", b"local job\n"))
    m = re.search(r"^differs: ", o, re.M)
    R.ok("%s the 'differs' count matches the differs: lines" % tag,
         counts(out) is not None and counts(out)[3] == len(re.findall(r"^differs: ", o, re.M)) and m is not None)

    R.section("%s restore with 'Only add what's missing' (--add-only)" % impl)
    ws = clone(pristine, os.path.join(base, "add only"))
    p = J(ws, "profile/preferences.md")
    wbytes(p, rbytes(p).replace(b"SETUP: not done", b"SETUP: done 2026-10-10", 1) + b"\nLOCAL-EDIT\n")
    before = user_part(snap(ws))
    out = restore(R, impl, tag, ws, unpack_dir, "add-only restore", ["--add-only"])
    after = user_part(snap(ws))
    changed = sorted(k for k in before if after.get(k) != before[k])
    R.ok("%s add-only restore changes no file that was already there (not even blank starters)" % tag,
         not changed, changed[:15])
    missing = sorted(k for k in want if k not in before and after.get(k) != ("file", want[k]))
    R.ok("%s add-only restore adds every backed-up file that was missing, byte-identical" % tag, not missing,
         missing[:15])
    c = counts(out)
    R.ok("%s add-only restore replaces and merges nothing" % tag, c is not None and c[1] == 0 and c[2] == 0,
         last_line(out))

    R.section("%s restore refusals and odd backups" % impl)
    ws = clone(pristine, os.path.join(base, "restore refusals"))
    s0 = snap(ws)
    o0 = snap(outside)

    def refuses(label, args, want_text, ws=ws, s0=s0, error_line=True):
        o_before = snap(outside)
        rc, out = drive(impl, ws, "restore", args)
        R.ok("%s restore refuses %s (and changes nothing)" % (tag, label),
             rc != 0 and (last_line(out).startswith("error:") or not error_line) and want_text in out.replace("\\", "/")
             and snap(ws) == s0 and snap(outside) == o_before, "rc=%s\n%s\n%s" % (rc, out, diff(s0, snap(ws))))

    refuses("without a folder", [], "give the unpacked backup folder")
    refuses("a folder that is not a backup", [outside], "not an unpacked Job Search HQ backup")
    refuses("an unknown option", ["--force", unpack_dir], "unknown option" if impl == "sh" else "parameter",
            error_line=impl == "sh")  # PowerShell itself reports a parameter it doesn't know
    inside = J(ws, "imports/unpacked here")
    shutil.copytree(unpack_dir, inside, symlinks=True)
    s_in = snap(ws)
    refuses("an unpacked backup inside the workspace", [inside], "inside the workspace", s0=s_in)
    shutil.rmtree(inside)
    two = os.path.join(base, "two backups")
    top = os.listdir(unpack_dir)[0]
    shutil.copytree(os.path.join(unpack_dir, top), os.path.join(two, top), symlinks=True)
    shutil.copytree(os.path.join(unpack_dir, top), os.path.join(two, top + "-2"), symlinks=True)
    refuses("a folder holding two backups", [two], "more than one backup")
    wbytes(J(ws, "jobs/~$tracker.csv"), b"lock")
    s_lock = snap(ws)
    refuses("while a ~$ lock file is in a personal folder", [unpack_dir], "open in Excel or Word", s0=s_lock)
    os.remove(J(ws, "jobs/~$tracker.csv"))
    if links_ok:
        moved = os.path.join(outside, "pages for restore %s" % impl)
        shutil.move(J(ws, "pages"), moved)
        os.symlink(moved, J(ws, "pages"), target_is_directory=True)
        s_link = snap(ws)
        refuses("when a personal folder here (pages) is a link", [unpack_dir], "pages is a link to another folder",
                s0=s_link)
        os.unlink(J(ws, "pages"))
        shutil.move(moved, J(ws, "pages"))

    # an odd backup: a link, app folders and templates/ inside it
    odd = os.path.join(base, "odd backup")
    shutil.copytree(os.path.join(unpack_dir, top), os.path.join(odd, top), symlinks=True)
    ob = os.path.join(odd, top)
    wbytes(J(ob, "templates/resume-template.html"), b"NOT-AN-APP-FILE\n")
    wbytes(J(ob, ".claude/settings.json"), b"{}\n")
    wbytes(J(ob, "AGENTS.md"), b"not the app\n")
    if links_ok:
        os.symlink(os.path.join(outside, "secret.txt"), J(ob, "jobs/evil-link.md"))
        os.symlink(os.path.join(outside, "secret folder"), J(ob, "profile/evil-folder"), target_is_directory=True)
    odd_names = not IS_WINDOWS
    if odd_names:
        # A folder whose name holds a line break and "..": split on lines, jobs/x<LF>../escape.md would read
        # and write ../escape.md next to the workspace.
        wbytes(os.path.join(ob, "jobs", "x\n..", "escape.md"), b"E2E-ESCAPE\n")
        wbytes(os.path.join(odd, "escape.md"), b"E2E-ESCAPE-PLANTED\n")
    ws = clone(pristine, os.path.join(base, "odd restore"))
    s0 = snap(ws)
    o0 = snap(outside)
    rc, out = drive(impl, ws, "restore", [os.path.join(odd, top)])
    s1 = snap(ws)
    o = out.replace("\\", "/")
    R.ok("%s restore from the backup folder itself (not its parent) works" % tag,
         rc == 0 and last_line(o).startswith("restore: done ("), out)
    R.ok("%s templates/, .claude and AGENTS.md in a backup are reported 'ignored:' and never copied" % tag,
         all(("ignored: %s" % x) in o for x in ("templates", ".claude", "AGENTS.md"))
         and {k: v for k, v in s1.items() if not under(k, PERSONAL)} ==
         {k: v for k, v in s0.items() if not under(k, PERSONAL)}, out)
    if links_ok:
        R.ok("%s links in a backup are reported 'skipped link:', not copied, and what they point to stays out" % tag,
             "skipped link: jobs/evil-link.md" in o and "skipped link: profile/evil-folder" in o
             and not os.path.lexists(J(ws, "jobs/evil-link.md")) and not os.path.lexists(J(ws, "profile/evil-folder"))
             and not any(v[0] == "file" and b"OUTSIDE-SECRET" in v[1] for v in user_part(s1).values())
             and snap(outside) == o0, "%s\n%s" % (out, diff(o0, snap(outside))))
    if odd_names:
        R.ok("%s a name with a line break in a backup is skipped ('skipped odd name:') and nothing escapes" % tag,
             "skipped odd name: a file in jobs/ has a line break in its name" in o
             and not os.path.exists(os.path.join(os.path.dirname(ws), "escape.md"))
             and not any(v[0] == "file" and b"E2E-ESCAPE" in v[1] for v in user_part(s1).values()), out)
    else:
        print("NOTE  %s line-break name check not run: Windows doesn't allow such names" % tag)


def scenario_export_edges(R, impl, base, pristine, outside, links_ok):
    tag = "[%s]" % impl
    R.section("%s export edge cases" % impl)
    ws = clone(pristine, os.path.join(base, "export edges"))
    p = J(ws, "profile/preferences.md")
    wbytes(p, rbytes(p).replace(b"SETUP: not done", b"SETUP: done 2026-10-01", 1))
    wbytes(J(ws, "jobs/acme-operations-analyst/posting.md"), b"posting\n")

    cases = [("a new folder inside the workspace", J(ws, "inside backups")),
             ("the jobs folder", J(ws, "jobs")),
             ("the workspace folder itself", ws)]
    if links_ok:
        link = os.path.join(base, "sneaky shortcut")
        os.symlink(J(ws, "pages"), link, target_is_directory=True)
        cases.append(("a shortcut outside the workspace that points into it", link))
    else:
        print("NOTE  %s symlink cases not run: this system can't make symlinks without admin rights" % tag)
    if case_insensitive(base):
        cases.append(("the workspace path typed with different capitals",
                      os.path.join(os.path.dirname(ws), os.path.basename(ws).swapcase(), "case backups")))
    for label, dest in cases:
        s_before = snap(ws)
        rc, out = drive(impl, ws, "export", [dest])
        s_after = snap(ws)
        R.ok("%s export refuses %s (error, nothing left inside the workspace)" % (tag, label),
             rc != 0 and last_line(out).startswith("error:") and "outside the workspace" in out
             and s_after == s_before, "rc=%s\n%s\n%s" % (rc, out, diff(s_before, s_after)))
        for k in set(s_after) - set(s_before):  # undo whatever a failing case wrote
            fp = J(ws, k)
            if os.path.lexists(fp):
                os.remove(fp)
        for d in (J(ws, "inside backups"), J(ws, "case backups")):
            if os.path.isdir(d) and not os.listdir(d):
                os.rmdir(d)

    # default destination: ~/Downloads, with HOME pointed at a temp folder
    fake = os.path.join(base, "fake home")
    os.makedirs(fake)
    env = {"HOME": bpath(fake) if impl == "sh" else fake, "USERPROFILE": fake}
    if impl == "sh":
        rc, out = run([find_bash(), "-c", 'cd "$HOME" && pwd -P'], env=env)
    else:
        rc, out = run([find_powershell(), "-NoProfile", "-NonInteractive", "-Command",
                       "(Resolve-Path -LiteralPath $HOME).Path"], env=env)
    if rc == 0 and same_path(native(last_line(out)), fake):
        rc, out = drive(impl, ws, "export", [], env=env)
        zp = export_ok(R, tag, "export with no folder", rc, out, os.path.join(fake, "Downloads"))
        R.ok("%s export with no folder saves to Downloads in the home folder (creating it)" % tag, zp is not None)
        if impl == "sh":
            rc, out = drive(impl, ws, "export", ["~/Tilde Backups"], env=env)
            export_ok(R, tag, "export to '~/Tilde Backups'", rc, out, os.path.join(fake, "Tilde Backups"))
    else:
        print("NOTE  %s default-Downloads check not run: this shell's home folder ignores HOME/USERPROFILE "
              "(it would write to the real Downloads): %s" % (tag, out.strip()))

    # which zip tool: Python, then Perl, then zip (sh on Mac/Linux only: a PATH without some tools)
    if impl == "sh" and not IS_WINDOWS:
        for _label, r, data in ODD:
            wbytes(J(ws, r), data)
        for label, hide in (("Perl", ("python", "python3")), ("zip", ("python", "python3", "perl"))):
            tb = os.path.join(base, "tools without " + "-".join(hide))
            os.makedirs(tb)
            for d in ("/bin", "/usr/bin", "/usr/sbin", "/sbin"):
                for n in (os.listdir(d) if os.path.isdir(d) else []):
                    if (n in hide or n.startswith(hide)) or os.path.lexists(os.path.join(tb, n)):
                        continue
                    os.symlink(os.path.join(d, n), os.path.join(tb, n))
            if not os.path.exists(os.path.join(tb, label.lower())):
                print("NOTE  [sh] export with %s not run: no %s on this system" % (label, label.lower()))
                continue
            dest = os.path.join(base, "backups made with " + label)
            rc, out = drive(impl, ws, "export", [dest, "--include-imports"], env={"PATH": tb})
            zp = export_ok(R, tag, "export made with %s (no Python)" % label, rc, out, dest)
            z = read_zip(zp) if zp else {"files": {}, "tops": set(), "no_utf8": [], "backslash": [], "error": "x"}
            fl = dict(z["files"])
            fl.pop("READ-ME.txt", None)
            exp = expected_export(ws, ("imports",))
            R.ok("%s export made with %s holds exactly the expected files, byte-identical" % (tag, label),
                 z["error"] is None and fl == exp, diff({k: ("file", v) for k, v in exp.items()},
                                                        {k: ("file", v) for k, v in fl.items()}))
            if label == "Perl":
                R.ok("%s export made with Perl marks non-ASCII names as UTF-8" % tag,
                     not z["no_utf8"] and any("Müller" in k for k in fl), z["no_utf8"])

    # links on the way to a backed-up folder (knowledge/ for knowledge/field, profile/ for resume.json)
    if links_ok:
        for parent, label in (("knowledge", "knowledge/field"), ("profile", "profile/ and resume.json")):
            moved = os.path.join(outside, "%s moved %s" % (parent, impl))
            wbytes(J(ws, "profile/resume.json"), RESUME_JSON)
            shutil.move(J(ws, parent), moved)
            os.symlink(moved, J(ws, parent), target_is_directory=True)
            dest = os.path.join(base, "backups with linked " + parent)
            rc, out = drive(impl, ws, "export", [dest])
            zp = export_ok(R, tag, "export with %s/ a link" % parent, rc, out, dest)
            z = read_zip(zp) if zp else {"files": {}}
            R.ok("%s export with %s/ a link skips %s ('skipped link: %s'), copies nothing through it" % (
                 tag, parent, label, parent),
                 ("skipped link: %s" % parent) in out.replace("\\", "/").splitlines()
                 and not any(k.startswith(parent + "/") for k in z["files"]) and "resume.json" not in z["files"]
                 if parent == "profile" else
                 ("skipped link: %s" % parent) in out.replace("\\", "/").splitlines()
                 and not any(k.startswith(parent + "/") for k in z["files"]), out)
            os.unlink(J(ws, parent))
            shutil.move(moved, J(ws, parent))
        if not IS_WINDOWS:
            os.symlink(os.path.join(outside, "secret.txt"), J(ws, "jobs/evil\nprofile"))
            dest = os.path.join(base, "backups with a line-break link")
            rc, out = drive(impl, ws, "export", [dest])
            zp = export_ok(R, tag, "export with a link whose name has a line break", rc, out, dest)
            z = read_zip(zp) if zp else {"files": {}}
            R.ok("%s a link whose name has a line break is still left out (nothing it points to in the zip)" % tag,
                 "skipped link: jobs/evil\nprofile" in out.replace("\\", "/")
                 and not any(k.startswith("jobs/evil") for k in z["files"])
                 and not any(b"OUTSIDE-SECRET" in v for v in z["files"].values()), out)
            os.unlink(J(ws, "jobs/evil\nprofile"))

    # some personal folders missing
    shutil.rmtree(J(ws, "outbox"))
    shutil.rmtree(J(ws, "knowledge/field"))
    dest = os.path.join(base, "partial backups")
    rc, out = drive(impl, ws, "export", [dest])
    zp = export_ok(R, tag, "export with outbox/ and knowledge/field/ missing", rc, out, dest)
    z = read_zip(zp) if zp else {"files": {}}
    R.ok("%s ...the zip simply has no outbox/ or knowledge/field/" % tag,
         "profile/preferences.md" in z["files"] and not any(under(k, ("outbox", "knowledge")) for k in z["files"]))

    # no profile folder
    shutil.rmtree(J(ws, "profile"))
    dest = os.path.join(base, "never made")
    rc, out = drive(impl, ws, "export", [dest])
    R.ok("%s export without a profile folder says 'there is nothing to back up yet' and makes nothing" % tag,
         rc == 1 and last_line(out) == "error: there is nothing to back up yet (no profile folder; setup has not run)"
         and not os.path.exists(dest), "rc=%s\n%s" % (rc, out))

    # not a workspace
    os.remove(J(ws, "AGENTS.md"))
    rc, out = drive(impl, ws, "export", [dest])
    R.ok("%s export outside a Job Search HQ workspace (no AGENTS.md) refuses" % tag,
         rc == 1 and "not inside a Job Search HQ workspace" in last_line(out) and not os.path.exists(dest),
         "rc=%s\n%s" % (rc, out))


def scenario_reset_refusals(R, impl, base, pristine, outside, links_ok):
    tag = "[%s]" % impl
    R.section("%s reset refusals (each on a fresh copy; nothing may change)" % impl)
    ref = clone(pristine, os.path.join(base, "refusal base"))
    populate(ref, outside, links_ok, locks=False)
    ext = ".sh" if impl == "sh" else ".ps1"
    n = [0]

    def case(label, want, setup=None, args=("--yes-delete",), script=None):
        n[0] += 1
        ws = clone(ref, os.path.join(base, "refusal %02d" % n[0]))
        if setup:
            setup(ws)
        s0 = snap(ws)
        o0 = snap(outside)
        rc, out = drive(impl, ws, "reset", list(args), script=script(ws) if script else None)
        o = out.replace("\\", "/")
        R.ok("%s reset refuses %s" % (tag, label), rc != 0 and want in o, "rc=%s\n%s" % (rc, out))
        R.ok("%s ...and changes nothing (workspace and outside folder)" % tag,
             snap(ws) == s0 and snap(outside) == o0, diff(s0, snap(ws)))

    def rm(r):
        return lambda ws: os.remove(J(ws, r))

    def empty(r):
        return lambda ws: wbytes(J(ws, r), b"")

    case("to run without --dry-run or --yes-delete", "refusing to run", args=())
    case("an unknown option", "unknown option" if impl == "sh" else "parameter", args=("--force",))
    case("when AGENTS.md is missing", "AGENTS.md not found", rm("AGENTS.md"))
    case("when the first-run script is missing", "starter-file script is missing",
         rm(".claude/skills/start/scripts/init-data" + ext))
    case("when a blank starter file is missing", "blank copy missing: templates/blank/profile/voice.md",
         rm("templates/blank/profile/voice.md"))
    case("when a blank starter file is empty", "blank copy missing: templates/blank/profile/story-bank.md",
         empty("templates/blank/profile/story-bank.md"))

    def tracker_row(ws):
        f = J(ws, "templates/blank/jobs/tracker.csv")
        wbytes(f, rbytes(f) + b"Acme,Analyst,applied\n")
    case("when the blank tracker has rows in it", "not header-only", tracker_row)

    def no_manifest(ws):
        os.remove(J(ws, "product-manifest.json"))
        os.remove(J(ws, "templates/blank/jobs/leads.csv"))
    case("without a manifest when a core blank file is missing", "blank copy missing: templates/blank/jobs/leads.csv",
         no_manifest)

    def misplaced(ws):
        d = J(ws, ".claude/skills/other/scripts")
        os.makedirs(d)
        shutil.copy2(script_path(impl, ws, "reset"), d)
    case("when the script is run from another place in the workspace", "script is not where it should be",
         misplaced, script=lambda ws: J(ws, ".claude/skills/other/scripts/reset" + ext))
    if links_ok:
        def blank_link(ws):
            moved = os.path.join(os.path.dirname(ws), "blank elsewhere")
            shutil.move(J(ws, "templates/blank"), moved)
            os.symlink(moved, J(ws, "templates/blank"), target_is_directory=True)
        case("when templates/blank is a link", "is missing or a link", blank_link)

        def link_in_blank(ws):
            os.symlink(os.path.join(outside, "secret.txt"), J(ws, "templates/blank/profile/extra.md"))
        case("when templates/blank has a link inside", "is a link to another place", link_in_blank)

        def pages_link(ws):
            target = os.path.join(outside, "pages folder %s" % impl)
            shutil.move(J(ws, "pages"), target)
            os.symlink(target, J(ws, "pages"), target_is_directory=True)
        case("when a personal folder (pages) is a link to a folder outside", "pages is a link to another folder",
             pages_link)

        def sent_link(ws):
            target = os.path.join(outside, "sent folder %s" % impl)
            shutil.move(J(ws, "outbox/sent"), target)
            os.symlink(target, J(ws, "outbox/sent"), target_is_directory=True)
        case("when a nested personal folder (outbox/sent) is a link", "outbox/sent is a link to another folder",
             sent_link)

    def nested_lock(ws):
        wbytes(J(ws, "profile/templates/~$resume-template.html"), b"lock")
    case("while a lock file sits deep inside a personal folder", "open: profile/templates/~$resume-template.html",
         nested_lock)


# ---------------------------------------------------------------- main

def main():
    args = parse_args("End-to-end test of /my-data export, reset and restore")
    keep_temps(args.keep)
    R = Run("e2e my-data (%s)" % args.impl)
    for impl in args.impls:
        t0 = time.time()
        base = temp_dir("e2e mydata %s" % impl)
        outside = os.path.join(base, "outside the workspace")
        os.makedirs(outside)
        links_ok = can_symlink(base)
        if not links_ok:
            print("NOTE  [%s] symlink checks not run: this system can't make symlinks without admin rights" % impl)
        R.section("%s setup" % impl)
        pristine = make_workspace(os.path.join(base, "pristine"))
        blank = sorted(k for k in files_under(J(pristine, "templates/blank")) if k != "README.md"
                       and not k.endswith(".DS_Store"))
        rc, out = drive(impl, pristine, "init-data")
        R.ok("[%s] first-run script fills in every starter file from templates/blank" % impl,
             rc == 0 and all(os.path.isfile(J(pristine, r)) for r in blank)
             and len(re.findall(r"^created: ", out, re.M)) == len(blank), out)
        zp, exp, unpack_dir = scenario_main(R, impl, base, pristine, outside, links_ok, blank)
        if unpack_dir:
            scenario_restore_more(R, impl, base, pristine, zp, exp, unpack_dir, outside, links_ok)
        scenario_export_edges(R, impl, base, pristine, outside, links_ok)
        scenario_reset_refusals(R, impl, base, pristine, outside, links_ok)
        print("\n[%s] took %.1fs" % (impl, time.time() - t0))
    R.finish()


if __name__ == "__main__":
    main()
