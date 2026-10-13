"""Shared helpers for the end-to-end tests in scripts/ci/e2e-*.py.

Python standard library only (3.8+). Every test works on a throwaway copy of the app in a temp
folder whose path has a space in it, like many real folders; the real workspace is never touched.

    import sys; sys.dont_write_bytecode = True   # no __pycache__ inside the app folder
    from e2e_common import Run, REPO, make_workspace, sh, ps

Each e2e-*.py script takes:
    --impl sh|ps|both   which script versions to drive (default sh). ps needs PowerShell from
                        $PS_EXE, else pwsh, else powershell; asking for ps without one exits 2.
    --keep              leave the temp folder in place and print where it is (for debugging)
and exits 0 when every check passed, 1 when any failed, 2 when it could not run.
"""

import argparse
import atexit
import os
import shutil
import stat
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.realpath(os.path.join(HERE, "..", ".."))
IS_WINDOWS = os.name == "nt"

# User-owned paths (DATA_CONTRACT.md). A fresh copy of the app must not contain anything here
# except these folder guides and placeholders.
USER_DIRS = ("profile", "jobs", "contacts", "outbox", "interviews", "history", "imports", "pages",
             "knowledge/field")
USER_DIR_ALLOWED = {
    "profile/README.md", "jobs/README.md", "contacts/README.md", "imports/README.md",
    "pages/README.md", "interviews/.gitkeep", "outbox/sent/.gitkeep", "outbox/discarded/.gitkeep",
}


# ---------------------------------------------------------------- reporting

class Run:
    """Collects PASS/FAIL lines and turns them into an exit code."""

    def __init__(self, title):
        self.title = title
        self.passed = 0
        self.failed = 0
        self.failures = []

    def section(self, name):
        print("\n== %s" % name, flush=True)

    def ok(self, label, cond, detail=""):
        if cond:
            self.passed += 1
            print("PASS  %s" % label, flush=True)
        else:
            self.failed += 1
            self.failures.append(label)
            print("FAIL  %s" % label, flush=True)
            if detail:
                for line in str(detail).rstrip().splitlines()[-40:]:
                    print("      | %s" % line)
        return bool(cond)

    def finish(self):
        print("\n%s: passed %d, failed %d" % (self.title, self.passed, self.failed))
        sys.exit(1 if self.failed else 0)


def parse_args(description, extra=None):
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("--impl", choices=("sh", "ps", "both"), default="sh")
    ap.add_argument("--keep", action="store_true", help="keep the temp folder for debugging")
    if extra:
        extra(ap)
    args = ap.parse_args()
    args.impls = ["sh", "ps"] if args.impl == "both" else [args.impl]
    if "ps" in args.impls and not find_powershell():
        print("no PowerShell found (set PS_EXE)")
        sys.exit(2)
    if "sh" in args.impls and not find_bash():
        print("no bash found (set BASH_EXE)")
        sys.exit(2)
    return args


# ---------------------------------------------------------------- tools

def find_bash():
    """bash from $BASH_EXE or PATH. On Windows, PATH lookup through shutil.which matters: a bare
    "bash" given to subprocess would find C:\\Windows\\System32\\bash.exe (WSL) before Git Bash."""
    env = os.environ.get("BASH_EXE")
    if env:
        return env
    found = shutil.which("bash")
    if found and IS_WINDOWS and os.path.normcase(found).startswith(
            os.path.normcase(os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32"))):
        for guess in (r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files\Git\usr\bin\bash.exe"):
            if os.path.exists(guess):
                return guess
        return None
    return found


def find_powershell():
    env = os.environ.get("PS_EXE")
    if env:
        return shutil.which(env) or (env if os.path.exists(env) else None)
    return shutil.which("pwsh") or shutil.which("powershell")


def find_node():
    return shutil.which("node")


def find_git():
    return shutil.which("git")


def run(cmd, cwd=None, env=None, input_text=None, timeout=300):
    """Runs a command; returns (exit code, stdout+stderr as text with CRs removed)."""
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    try:
        p = subprocess.run(cmd, cwd=cwd, env=full_env, input=input_text, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, timeout=timeout,
                           stdin=None if input_text is not None else subprocess.DEVNULL,
                           universal_newlines=False)
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or b"").decode("utf-8", "replace")
        return 124, out.replace("\r", "") + "\n(timed out after %ss)" % timeout
    except OSError as e:
        return 127, "could not start %s: %s" % (cmd[0], e)
    return p.returncode, p.stdout.decode("utf-8", "replace").replace("\r", "")


def sh(script, *args, cwd=None, env=None, timeout=300):
    """Runs a bash script (path absolute or relative to cwd)."""
    return run([find_bash(), script] + list(args), cwd=cwd, env=env, timeout=timeout)


def ps(script, *args, cwd=None, env=None, timeout=300):
    """Runs a PowerShell script with -File (the way the app's docs tell users to)."""
    return run([find_powershell(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                "-File", script] + list(args), cwd=cwd, env=env, timeout=timeout)


def last_line(out):
    lines = [l for l in out.strip().splitlines() if l.strip()]
    return lines[-1] if lines else ""


# ---------------------------------------------------------------- temp folders and copies

_TEMPS = []
_KEEP = [False]


def keep_temps(flag=True):
    _KEEP[0] = flag


def _cleanup():
    for d in _TEMPS:
        if _KEEP[0]:
            print("kept: %s" % d)
        else:
            _force_rmtree(d)


atexit.register(_cleanup)


def _force_rmtree(path):
    def onerror(func, p, _exc):
        try:
            os.chmod(p, stat.S_IWRITE | stat.S_IREAD | stat.S_IEXEC)
            func(p)
        except OSError:
            pass
    if os.path.islink(path):
        os.unlink(path)
    elif os.path.isdir(path):
        shutil.rmtree(path, onerror=onerror)


def temp_dir(prefix):
    """A new empty temp folder outside the repo (RUNNER_TEMP on CI), removed at exit."""
    base = os.environ.get("RUNNER_TEMP") or tempfile.gettempdir()
    d = os.path.realpath(tempfile.mkdtemp(prefix=prefix + ".", dir=base))
    assert_outside_repo(d)
    _TEMPS.append(d)
    return d


def assert_outside_repo(path):
    rp = os.path.normcase(os.path.realpath(path))
    repo = os.path.normcase(REPO)
    if rp == repo or rp.startswith(repo + os.sep):
        print("refusing: %s is inside the workspace" % path)
        sys.exit(2)


def product_files(root=REPO):
    """Files git tracks or would track in the working tree (tracked + untracked, minus ignored),
    the same list scripts/build-manifest.sh uses. Deleted-but-tracked files are skipped."""
    rc, out = run([find_git(), "-C", root, "ls-files", "-z", "-co", "--exclude-standard"])
    if rc != 0:
        print("git ls-files failed: %s" % out)
        sys.exit(2)
    names = sorted(set(n for n in out.split("\0") if n))
    return [n for n in names if os.path.isfile(os.path.join(root, n))]


def make_workspace(parent, name="Job Search HQ"):
    """Copies the app as it is in the working tree (uncommitted changes included, user data and
    .git left out) into <parent>/<name>. Keeps the executable bit. Returns the new folder."""
    dest = os.path.join(parent, name)
    assert_outside_repo(dest)
    os.makedirs(dest)
    for rel in product_files():
        src = os.path.join(REPO, rel)
        dst = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    return dest


def clone_workspace(parent, name="Job Search HQ"):
    """A real `git clone` of the repo's committed HEAD (what a user who clones gets, with this
    machine's line-ending settings). Returns the new folder."""
    dest = os.path.join(parent, name)
    assert_outside_repo(dest)
    rc, out = run([find_git(), "clone", "-q", "--no-hardlinks", REPO, dest])
    if rc != 0:
        print("git clone failed: %s" % out)
        sys.exit(2)
    return dest


def build_release_zip(workspace, zip_path):
    """Builds a release zip from a workspace copy with its own build-manifest.sh."""
    return sh(os.path.join(workspace, "scripts", "build-manifest.sh"), "--zip", zip_path,
              cwd=workspace)


def read(path, encoding="utf-8"):
    with open(path, encoding=encoding, newline="") as f:
        return f.read()


def write(path, text, encoding="utf-8"):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding=encoding, newline="") as f:
        f.write(text)


def user_files(workspace):
    """Every file under the user-owned folders, minus the allowed guides/placeholders."""
    found = []
    for d in USER_DIRS:
        top = os.path.join(workspace, d)
        for dirpath, _dirs, files in os.walk(top):
            for f in files:
                rel = os.path.relpath(os.path.join(dirpath, f), workspace).replace(os.sep, "/")
                if rel not in USER_DIR_ALLOWED and not rel.endswith(".DS_Store"):
                    found.append(rel)
    return sorted(found)


def snapshot(root, skip=(".git",)):
    """{relative path: bytes} of every file under root (for before/after comparisons)."""
    snap = {}
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in skip]
        for f in files:
            p = os.path.join(dirpath, f)
            if os.path.islink(p):
                continue
            rel = os.path.relpath(p, root).replace(os.sep, "/")
            with open(p, "rb") as fh:
                snap[rel] = fh.read()
    return snap
