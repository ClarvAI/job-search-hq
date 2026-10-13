#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""End-to-end: a fresh copy of the app on its very first run, the way a new user gets it.

Usage: python3 scripts/ci/e2e-fresh.py [--impl sh|ps|both] [--keep]

Passes (each on throwaway copies in a temp folder; the real workspace is never touched):
  clone     a real `git clone` of HEAD (what someone who clones gets): no personal data, scripts
            executable, manifest up to date, hooks wired to scripts that exist and work, health
            before the first run, init-data (first run, idempotent, never overwrites), git keeps
            every personal file ignored; then a second clone where session-start does the first run
            by itself, followed by health.
  crlf      a clone with Windows line endings (core.autocrlf=true, on every OS): shell scripts stay
            LF, the manifest still matches, first run, session-start and health still work.
  unicode   a clone in a folder whose name has spaces, a dash and accents: init + session-start + health.
  worktree  a copy of the working tree (uncommitted changes included, no .git), so a maintainer's
            local run covers work that isn't committed yet. Checks the same things a release-zip
            user meets: no personal data, manifest (outside git), first run, and that `git add -A`
            after the first run picks up no personal file.
--impl sh drives init-data.sh / session-start.sh / health.sh; --impl ps drives the .ps1 twins.
Checks that don't depend on the implementation run once, in the first implementation's pass.
"""

import sys; sys.dont_write_bytecode = True  # noqa: E702  (no __pycache__ inside the app folder)
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import (Run, REPO, IS_WINDOWS, USER_DIRS, USER_DIR_ALLOWED, parse_args,  # noqa: E402
                        keep_temps, temp_dir, make_workspace, clone_workspace, find_bash,
                        find_powershell, find_git, run, last_line, read, user_files, snapshot)
import base64  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import time  # noqa: E402

# The live session's own variables must never steer the scripts under test toward the real folder.
for _k in ("CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"):
    os.environ.pop(_k, None)

INIT = ".claude/skills/start/scripts/init-data"
SESSION = ".claude/hooks/session-start"
HEALTH = ".claude/skills/health/scripts/health"
UNICODE_NAME = "Job Search HQ – Ünïcode"
# Health lines that depend on this machine, not on the app (an old `claude` CLI, for example).
ENV_FIX = {"Claude Code version"}
DENY = re.compile(r'"permissionDecision"\s*:\s*"deny"')
GMAIL_SEND = '{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":{"to":"a@example.com"}}'
GMAIL_SEARCH = '{"tool_name":"mcp__claude_ai_Gmail__search_threads","tool_input":{"query":"from:recruiter"}}'


# ---------------------------------------------------------------- small helpers

def bp(p):
    """A path for bash: Git Bash takes C:/... but not always C:\\..."""
    return p.replace("\\", "/") if IS_WINDOWS else p


def P(ws, rel):
    return os.path.join(ws, *rel.split("/"))


def rb(path):
    with open(path, "rb") as f:
        return f.read()


def wb(path, data):
    with open(path, "wb") as f:
        f.write(data)


def mk(base, sub):
    d = os.path.join(base, sub)
    os.makedirs(d, exist_ok=True)
    return d


def git(ws, *args):
    return run([find_git(), "-C", ws] + list(args), timeout=120)


def ps_run(script, args, cwd=None, env=None, input_text=None):
    return run([find_powershell(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                "-File", script] + list(args), cwd=cwd, env=env, input_text=input_text)


def walk_files(root, skip=(".git",)):
    out = []
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in skip]
        for f in files:
            out.append(os.path.relpath(os.path.join(dirpath, f), root).replace(os.sep, "/"))
    return sorted(out)


def blank_files(ws):
    """What init-data copies: every file under templates/blank/ except its own top-level README.md
    (init-data.sh: find . -type f ! -path ./README.md)."""
    return [f for f in walk_files(P(ws, "templates/blank")) if f != "README.md"]


def snap_diff(a, b):
    added = sorted(set(b) - set(a))
    removed = sorted(set(a) - set(b))
    changed = sorted(k for k in set(a) & set(b) if a[k] != b[k])
    return added, removed, changed


def diff_text(a, b):
    added, removed, changed = snap_diff(a, b)
    return "added: %s\nremoved: %s\nchanged: %s" % (added[:20], removed[:20], changed[:20])


def not_identical(ws, rels):
    bad = []
    for rel in rels:
        p = P(ws, rel)
        if not os.path.isfile(p):
            bad.append(rel + " (missing)")
        elif rb(p) != rb(P(ws, "templates/blank/" + rel)):
            bad.append(rel + " (differs from templates/blank/)")
    return bad


def csv_problem(data):
    """'' if data is a blank CSV: UTF-8 byte-order mark, then a header row and nothing else."""
    if not data.startswith(b"\xef\xbb\xbf"):
        return "no UTF-8 byte-order mark"
    try:
        text = data[3:].decode("utf-8")
    except UnicodeDecodeError as e:
        return "not UTF-8: %s" % e
    lines = [l for l in text.replace("\r", "").split("\n") if l.strip()]
    if len(lines) != 1:
        return "%d non-empty lines (want the header only)" % len(lines)
    cols = lines[0].split(",")
    if len(cols) < 3 or any(not c.strip() for c in cols):
        return "odd header: %r" % lines[0][:120]
    return ""


def missing_phrases(text, phrases):
    return [p for p in phrases if p not in text]


def user_snapshot(ws):
    """Snapshot without the health marker (session-start rewrites it every time)."""
    return {k: v for k, v in snapshot(ws).items() if not k.startswith(".claude/.health/")}


def skip(label, why):
    print("SKIP  %s (%s)" % (label, why), flush=True)


# ---------------------------------------------------------------- the scripts under test

def init_data(ws, impl, *flags):
    """Runs init-data from the folder above the workspace: it must find the workspace by itself."""
    cwd = os.path.dirname(ws)
    if impl == "sh":
        return run([find_bash(), bp(P(ws, INIT + ".sh"))] + list(flags), cwd=cwd)
    ps_flags = {"--quiet": "-Quiet", "--dry-run": "-DryRun"}
    return ps_run(P(ws, INIT + ".ps1"), [ps_flags[f] for f in flags], cwd=cwd)


def session_start(ws, impl, app, sid, cwd=None, env=None):
    """Runs the startup hook the way the app does (hook JSON on stdin), from outside the workspace
    unless cwd is given. Returns (exit code, text for the assistant, raw output, JSON problem)."""
    data = json.dumps({"session_id": sid, "hook_event_name": "SessionStart"}).encode("utf-8")
    cwd = cwd or os.path.dirname(ws)
    if impl == "sh":
        rc, out = run([find_bash(), bp(P(ws, SESSION + ".sh")), app], cwd=cwd, env=env, input_text=data)
    else:
        rc, out = ps_run(P(ws, SESSION + ".ps1"), ["-App", app], cwd=cwd, env=env, input_text=data)
    if impl == "sh" and app != "codex":
        return rc, out, out, ""
    text, problem = hook_json(out)
    return rc, text, out, problem


def hook_json(out):
    """Codex hook output: exactly one line of JSON with hookSpecificOutput.additionalContext."""
    lines = [l for l in out.splitlines() if l.strip()]
    if len(lines) != 1:
        return "", "want exactly one line of JSON, got %d lines" % len(lines)
    try:
        j = json.loads(lines[0])
        h = j["hookSpecificOutput"]
        if h.get("hookEventName") != "SessionStart":
            return "", "hookEventName is %r" % h.get("hookEventName")
        return h["additionalContext"], ""
    except (ValueError, KeyError, TypeError) as e:
        return "", "not the JSON Codex expects: %s" % e


def health(ws, impl, app, cwd=None, env=None):
    if impl == "sh":
        return run([find_bash(), bp(P(ws, HEALTH + ".sh")), app], cwd=cwd or ws, env=env)
    return ps_run(P(ws, HEALTH + ".ps1"), ["-App", app], cwd=cwd or ws, env=env)


def parse_health(out):
    """{'OK': {check: text}, 'FIX': ..., 'NOTE': ..., 'SKIP': ...}, lines outside the vocabulary."""
    res = {"OK": {}, "FIX": {}, "NOTE": {}, "SKIP": {}}
    stray = []
    for l in out.splitlines():
        if not l.strip():
            continue
        m = re.match(r"^(OK|FIX|NOTE|SKIP): ([^:]+): (.*)$", l)
        if m:
            res[m.group(1)][m.group(2)] = m.group(3)
        elif not (l.startswith("summary: ") or l.startswith("most important: ")):
            stray.append(l)
    return res, stray


def app_for(impl):
    """The app each implementation serves: bash hooks are Claude Code's (and Codex on Mac/Linux);
    the .ps1 hooks are Codex on Windows."""
    return "claude" if impl == "sh" else "codex"


def start_word(app):
    return "/start" if app == "claude" else "$start"


# ---------------------------------------------------------------- implementation-independent checks

def check_no_user_data(r, ws, tag, git_index):
    uf = user_files(ws)
    r.ok("%s: has no personal data (user_files() is empty)" % tag, uf == [], "\n".join(uf))
    present = set()
    for d in USER_DIRS:
        top = P(ws, d)
        for rel in walk_files(top) if os.path.isdir(top) else []:
            if not rel.endswith(".DS_Store"):
                present.add(d + "/" + rel)
    r.ok("%s: every user-owned folder holds only its README/.gitkeep" % tag, present == USER_DIR_ALLOWED,
         "extra: %s\nmissing: %s" % (sorted(present - USER_DIR_ALLOWED), sorted(USER_DIR_ALLOWED - present)))
    local = [x for x in (".claude/.health", ".claude/settings.local.json", ".backup") if os.path.exists(P(ws, x))]
    local += [f for f in walk_files(ws) if f.endswith(".local")]
    r.ok("%s: no local-only state (.claude/.health, settings.local.json, .backup, *.local)" % tag, not local,
         "\n".join(local))
    if git_index:
        rc, out = git(ws, "ls-files", "-z")
        names = [n for n in out.split("\0") if n]
        inside = [n for n in names if any(n.startswith(d + "/") for d in USER_DIRS)]
        bad = sorted(set(inside) - USER_DIR_ALLOWED)
        r.ok("%s: git tracks nothing in the user-owned folders but the guides" % tag, rc == 0 and names and not bad,
             out if rc else "\n".join(bad))


def is_script(rel):
    return rel.endswith(".sh") or rel == ".githooks/pre-push"


def check_exec_bits(r, ws, tag, use_git):
    paths = []
    if use_git:
        rc, out = git(ws, "ls-files", "-s", "-z")
        entries = []
        for e in out.split("\0"):
            if "\t" in e:
                meta, path = e.split("\t", 1)
                if is_script(path):
                    entries.append((meta.split()[0], path))
        bad = ["%s %s" % (m, p) for m, p in entries if m != "100755"]
        r.ok("%s: git records every tracked .sh and .githooks/pre-push as executable (100755)" % tag,
             rc == 0 and entries and not bad, out if rc else "\n".join(bad))
        paths = [p for _m, p in entries]
    else:
        paths = [f for f in walk_files(ws) if is_script(f)]
    if IS_WINDOWS:
        skip("%s: scripts executable on disk" % tag, "Windows has no executable bit; git's index mode is what a "
             "Mac or Linux clone gets")
        return
    bad = [p for p in paths if not os.access(P(ws, p), os.X_OK)]
    r.ok("%s: every .sh script and .githooks/pre-push is executable on disk" % tag, paths and not bad,
         "\n".join(bad) or "no scripts found")


def check_line_endings(r, ws, tag, clone, crlf):
    scripts = [f for f in walk_files(ws) if is_script(f)]
    bad = [f for f in scripts if b"\r" in rb(P(ws, f))]
    r.ok("%s: every .sh script and .githooks/pre-push has LF line endings" % tag, scripts and not bad,
         "\n".join(bad))
    if clone:
        ps1 = [f for f in walk_files(ws) if f.endswith(".ps1")]
        badps = [f for f in ps1 if rb(P(ws, f)).count(b"\n") != rb(P(ws, f)).count(b"\r\n")]
        r.ok("%s: every .ps1 has CRLF line endings (.gitattributes eol=crlf)" % tag, ps1 and not badps,
             "\n".join(badps))
    if crlf:
        r.ok("%s: the checkout really has Windows line endings (AGENTS.md is CRLF)" % tag,
             b"\r\n" in rb(P(ws, "AGENTS.md")), "AGENTS.md has no CRLF; core.autocrlf=true was not applied")
        csvs = [f for f in walk_files(ws) if f.endswith(".csv")]
        badcsv = [f for f in csvs if b"\r" in rb(P(ws, f))]
        r.ok("%s: the blank CSVs stay LF (.gitattributes eol=lf)" % tag, csvs and not badcsv, "\n".join(badcsv))


def check_manifest(r, ws, tag):
    if not find_bash():
        skip("%s: build-manifest.sh --check" % tag, "no bash here")
        return
    before = snapshot(ws)
    rc, out = run([find_bash(), bp(P(ws, "scripts/build-manifest.sh")), "--check"], cwd=ws)
    r.ok("%s: bash scripts/build-manifest.sh --check passes" % tag, rc == 0, out)
    r.ok("%s: build-manifest.sh --check changes nothing" % tag, snapshot(ws) == before, diff_text(before, snapshot(ws)))


HOOK_REF = re.compile(r"\.claude[\\/]+hooks[\\/]+([A-Za-z0-9_.-]+\.(?:sh|ps1))")


def parse_wiring(ws):
    """Reads .claude/settings.json and .codex/hooks.json. Returns (wiring dict, error text)."""
    try:
        s = json.loads(read(P(ws, ".claude/settings.json")))
        c = json.loads(read(P(ws, ".codex/hooks.json")))
    except (OSError, ValueError) as e:
        return None, str(e)

    def groups(cfg, ev):
        return (cfg.get("hooks") or {}).get(ev) or []

    def decode(cmd):
        try:
            return base64.b64decode(cmd.split()[-1]).decode("utf-16-le")
        except (ValueError, IndexError, UnicodeDecodeError):
            return ""

    w = {"settings": s, "codex": c, "texts": [], "win": {}}
    for cfg in (s, c):
        for ev in (cfg.get("hooks") or {}):
            for g in groups(cfg, ev):
                for h in g.get("hooks") or []:
                    w["texts"].append(h.get("command", ""))
                    if h.get("commandWindows"):
                        dec = decode(h["commandWindows"])
                        w["texts"].append(dec)
                        if cfg is c:
                            w["win"].setdefault(ev, []).append((h["commandWindows"].split()[-1], dec))
    w["texts"].append((s.get("statusLine") or {}).get("command", ""))
    w["groups"] = groups
    return w, ""


def guard_group(w, cfg, script):
    """The PreToolUse group whose matcher covers a Gmail send, Bash and (Codex) shell, and whose
    command runs the guard script; None if there isn't one."""
    names = ["mcp__claude_ai_Gmail__send_message", "Bash"] + (["shell"] if cfg is w["codex"] else [])
    for g in w["groups"](cfg, "PreToolUse"):
        try:
            m = re.compile(g.get("matcher", ""))
        except re.error:
            continue
        cmds = [h.get("command", "") for h in g.get("hooks") or []]
        if all(m.search(n) for n in names) and any(script in x for x in cmds):
            return g
    return None


def first_cmd(w, cfg, ev):
    for g in w["groups"](cfg, ev):
        for h in g.get("hooks") or []:
            if h.get("command"):
                return h["command"]
    return ""


def check_wiring_static(r, ws, tag):
    w, err = parse_wiring(ws)
    r.ok("%s: .claude/settings.json and .codex/hooks.json parse as JSON" % tag, w is not None, err)
    if w is None:
        return None
    s, c = w["settings"], w["codex"]
    problems = []
    if not guard_group(w, s, "guard.sh"):
        problems.append("Claude: no PreToolUse group runs guard.sh for Gmail tools and Bash")
    if "session-start.sh" not in first_cmd(w, s, "SessionStart"):
        problems.append("Claude: SessionStart does not run session-start.sh")
    g = guard_group(w, c, "guard.sh")
    if not g:
        problems.append("Codex: no PreToolUse group runs guard.sh for Gmail tools, Bash and shell")
    elif not any("guard.ps1" in dec for _b, dec in w["win"].get("PreToolUse", [])):
        problems.append("Codex: the Windows PreToolUse command does not run guard.ps1")
    if "session-start.sh" not in first_cmd(w, c, "SessionStart"):
        problems.append("Codex: SessionStart does not run session-start.sh")
    if not any("session-start.ps1" in dec for _b, dec in w["win"].get("SessionStart", [])):
        problems.append("Codex: the Windows SessionStart command does not run session-start.ps1")
    r.ok("%s: the safety guard is wired for Claude and Codex (matchers cover Gmail, Bash, shell)" % tag,
         not problems, "\n".join(problems))
    refs = sorted(set(m.group(1) for t in w["texts"] for m in HOOK_REF.finditer(t)))
    missing = [x for x in refs if not os.path.isfile(P(ws, ".claude/hooks/" + x))]
    r.ok("%s: every hook script the configs name exists (%s)" % (tag, ", ".join(refs)),
         refs and "guard.sh" in refs and "guard.ps1" in refs and not missing, "missing: %s" % missing)
    return w


def check_wiring_runs(r, ws, impl, tag, w):
    """Runs the hook commands exactly as the configs write them."""
    if w is None:
        return
    s, c = w["settings"], w["codex"]
    sub = P(ws, "jobs")   # Codex may start in a subfolder; its commands walk up to AGENTS.md
    if impl == "sh":
        env = {"CLAUDE_PROJECT_DIR": bp(ws)}
        gs = guard_group(w, s, "guard.sh")
        cmd = [h["command"] for h in gs["hooks"]][0] if gs else "false"
        rc1, o1 = run([find_bash(), "-c", cmd], cwd=ws, env=env, input_text=GMAIL_SEND.encode())
        rc2, o2 = run([find_bash(), "-c", cmd], cwd=ws, env=env, input_text=GMAIL_SEARCH.encode())
        r.ok("%s: Claude's guard hook, run as wired, blocks a Gmail send and allows a Gmail search" % tag,
             DENY.search(o1) and rc2 == 0 and "deny" not in o2,
             "send (exit %d): %s\nsearch (exit %d): %s" % (rc1, o1, rc2, o2))
        gc = guard_group(w, c, "guard.sh")
        cmd = [h["command"] for h in gc["hooks"]][0] if gc else "false"
        rc3, o3 = run([find_bash(), "-c", cmd], cwd=sub, input_text=GMAIL_SEND.encode())
        # Codex's Unix hook blocks the way Codex documents: exit 2 with the reason on stderr (a JSON deny
        # on stdout is accepted too, as the Windows wrapper still answers that way).
        r.ok("%s: Codex's guard hook, run as wired from a subfolder, blocks a Gmail send" % tag,
             DENY.search(o3) or (rc3 == 2 and "Blocked:" in o3), "exit %d: %s" % (rc3, o3))
        data = b'{"session_id":"e2e-wired"}'
        rc4, o4 = run([find_bash(), "-c", first_cmd(w, s, "SessionStart")], cwd=ws, env=env, input_text=data)
        rc5, o5 = run([find_bash(), "-c", first_cmd(w, c, "SessionStart")], cwd=sub, input_text=data)
        text5, prob5 = hook_json(o5)
        r.ok("%s: both startup hooks, run as wired, exit 0 and greet (Codex's as valid JSON)" % tag,
             rc4 == 0 and "Today is " in o4 and rc5 == 0 and not prob5 and "Today is " in text5,
             "claude (exit %d): %s\ncodex (exit %d, %s): %s" % (rc4, o4[-600:], rc5, prob5, o5[-600:]))
    else:
        if not IS_WINDOWS:
            skip("%s: Codex's Windows hook commands (-EncodedCommand)" % tag, "commandWindows only runs on Windows")
            return
        pre = w["win"].get("PreToolUse", [])
        start = w["win"].get("SessionStart", [])
        base = [find_powershell(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand"]
        rc1, o1 = run(base + [pre[0][0] if pre else ""], cwd=sub, input_text=GMAIL_SEND.encode())
        rc2, o2 = run(base + [pre[0][0] if pre else ""], cwd=sub, input_text=GMAIL_SEARCH.encode())
        r.ok("%s: Codex's Windows guard hook, run as wired from a subfolder, blocks a Gmail send and allows a search" % tag,
             DENY.search(o1) and rc2 == 0 and "deny" not in o2,
             "send (exit %d): %s\nsearch (exit %d): %s" % (rc1, o1, rc2, o2))
        rc3, o3 = run(base + [start[0][0] if start else ""], cwd=sub, input_text=b'{"session_id":"e2e-wired"}')
        text3, prob3 = hook_json(o3)
        r.ok("%s: Codex's Windows startup hook, run as wired, exits 0 with valid JSON" % tag,
             rc3 == 0 and not prob3 and "Today is " in text3, "exit %d, %s: %s" % (rc3, prob3, o3[-800:]))


# ---------------------------------------------------------------- first run: init-data

def check_init(r, ws, impl, tag, full):
    expected = blank_files(ws)
    n = len(expected)
    before = snapshot(ws)
    if full:
        rc, out = init_data(ws, impl, "--dry-run")
        would = sorted(l[len("would create: "):] for l in out.splitlines() if l.startswith("would create: "))
        r.ok("%s: init --dry-run lists every starter file and changes nothing" % tag,
             rc == 0 and would == expected and last_line(out) == "init: would create %d file(s)" % n
             and snapshot(ws) == before, out)
    rc, out = init_data(ws, impl)
    created = sorted(l[len("created: "):] for l in out.splitlines() if l.startswith("created: "))
    r.ok("%s: first run (init-data) exits 0 and reports each of the %d starter files" % (tag, n),
         rc == 0 and created == expected and last_line(out) == "init: created %d file(s)" % n, out)
    after = snapshot(ws)
    added, removed, changed = snap_diff(before, after)
    r.ok("%s: first run only adds templates/blank/* (minus its README) at the same paths; nothing else changes" % tag,
         added == expected and not removed and not changed, diff_text(before, after))
    bad = not_identical(ws, expected)
    r.ok("%s: every starter file is byte-identical to its blank copy" % tag, not bad, "\n".join(bad))
    r.ok("%s: every starter file lands in a user-owned folder (data contract)" % tag, user_files(ws) == expected,
         "outside: %s" % sorted(set(expected) - set(user_files(ws))))
    prefs = read(P(ws, "profile/preferences.md")) if os.path.isfile(P(ws, "profile/preferences.md")) else ""
    r.ok("%s: profile/preferences.md says 'SETUP: not done'" % tag,
         re.search(r"(?m)^SETUP: not done\r?$", prefs) is not None, prefs[:300])
    csvs = [f for f in expected if f.endswith(".csv")]
    probs = ["%s: %s" % (f, csv_problem(rb(P(ws, f)))) for f in csvs if csv_problem(rb(P(ws, f)))]
    r.ok("%s: the blank CSVs (%d) start with a UTF-8 BOM and hold only the header row" % (tag, len(csvs)),
         len(csvs) >= 4 and not probs, "\n".join(probs) or "only %d CSVs" % len(csvs))
    if not full:
        return
    # Idempotent.
    rc, out = init_data(ws, impl)
    r.ok("%s: second run says 'init: nothing to do' and changes nothing" % tag,
         rc == 0 and last_line(out) == "init: nothing to do" and snapshot(ws) == after,
         out + "\n" + diff_text(after, snapshot(ws)))
    rc, out = init_data(ws, impl, "--quiet")
    r.ok("%s: --quiet with nothing to do prints nothing (the session-start hook relies on it)" % tag,
         rc == 0 and out.strip() == "" and snapshot(ws) == after, out)
    # Never overwrites: edit two personal files, lose a third, run again.
    prefs_p, tracker_p, dash = P(ws, "profile/preferences.md"), P(ws, "jobs/tracker.csv"), "pages/dashboard.html"
    new_prefs = rb(prefs_p) + b"\nE2E-MARKER: Alex Rivera's own edit\n"
    new_tracker = rb(tracker_p) + b"Acme,Operations Analyst,interested,2026-10-20,apply,,B\n"
    wb(prefs_p, new_prefs)
    wb(tracker_p, new_tracker)
    os.remove(P(ws, dash))
    s1 = snapshot(ws)
    rc, out = init_data(ws, impl)
    s2 = snapshot(ws)
    added, removed, changed = snap_diff(s1, s2)
    r.ok("%s: after edits, a run puts back only the missing file and keeps the user's edits" % tag,
         rc == 0 and last_line(out) == "init: created 1 file(s)" and "created: " + dash in out
         and added == [dash] and not removed and not changed
         and rb(prefs_p) == new_prefs and rb(tracker_p) == new_tracker and not not_identical(ws, [dash]),
         out + "\n" + diff_text(s1, s2))


def check_git_ignored(r, ws, tag):
    rc, st = git(ws, "status", "--porcelain")
    r.ok("%s: git status --porcelain is empty (every personal file is ignored)" % tag, rc == 0 and st.strip() == "", st)
    rc, ign = git(ws, "status", "--porcelain", "--ignored")
    lines = [l for l in ign.splitlines() if l.strip()]
    bad = [l for l in lines if not l.startswith("!! ")]
    paths = [l[3:].strip('"') for l in lines if l.startswith("!! ")]
    need = ["profile/", "jobs/", "contacts/", "history/", "pages/", "knowledge/field/"]
    missing = [d for d in need if not any(p.startswith(d) for p in paths)]
    files = user_files(ws)
    rc2, ci = git(ws, "check-ignore", "--", *files) if files else (1, "")
    not_ignored = sorted(set(files) - set(l.strip() for l in ci.splitlines()))
    r.ok("%s: git status --ignored lists the personal files as ignored (check-ignore agrees for all %d)"
         % (tag, len(files)), rc == 0 and files and not bad and not missing and not not_ignored,
         "non-ignored lines: %s\nfolders not listed: %s\nnot ignored: %s\n%s" % (bad, missing, not_ignored, ign))


# ---------------------------------------------------------------- session start and health

def check_session_start(r, ws, impl, tag, full):
    """On a workspace that never ran init: the startup hook must do the first run by itself."""
    app = app_for(impl)
    sid = "e2e-fresh-" + impl
    expected = blank_files(ws)
    n = len(expected)
    rc, text, out, prob = session_start(ws, impl, app, sid)
    if app == "codex":
        r.ok("%s: session-start (%s) prints exactly one line of the JSON Codex expects" % (tag, app), not prob,
             prob + "\n" + out)
    miss = missing_phrases(text, ["Today is ", "Missing starter files were just set up from the blank copies "
                                  "(%d file(s))" % n])
    r.ok("%s: session-start on a fresh copy exits 0 and says the %d starter files were just set up" % (tag, n),
         rc == 0 and not miss, "exit %d, missing %s\n%s" % (rc, miss, out))
    if app == "claude":
        want = ["The user has not finished setup.", "suggest /start (about 15 to 20 minutes)"]
    else:
        want = ["The user has not finished setup.", 'suggest $start, or just say "set me up"']
    if impl == "sh" and app == "codex":
        want = ["The user has not finished setup.", 'suggest $start (or just say "set me up")']
    miss = missing_phrases(text, want)
    r.ok("%s: session-start tells the assistant setup is not done and to suggest %s" % (tag, start_word(app)),
         not miss, "missing %s\n%s" % (miss, text))
    miss = missing_phrases(text, ["Pipeline: nothing tracked yet.", "Autonomy: coach. Outbox mode: draft-only."])
    r.ok("%s: session-start reads the blank files: nothing tracked, autonomy coach, outbox draft-only" % tag,
         not miss, "missing %s\n%s" % (miss, text))
    bad = not_identical(ws, expected)
    r.ok("%s: session-start created every starter file, byte-identical, and nothing else personal" % tag,
         user_files(ws) == expected and not bad,
         "\n".join(bad) + "\nextra: %s" % sorted(set(user_files(ws)) - set(expected)))
    mark = P(ws, ".claude/.health/last-session-start")
    mtext = read(mark) if os.path.isfile(mark) else "(no marker file)"
    r.ok("%s: session-start leaves the health marker '<time> %s %s'" % (tag, app, sid),
         re.match(r"^[0-9]{9,} %s %s\n$" % (app, re.escape(sid)), mtext) is not None, repr(mtext))
    if not full:
        return
    # Codex's mode first: the claude run after it leaves the marker health expects.
    if impl == "sh":
        rc, text3, out3, prob3 = session_start(ws, "sh", "codex", sid)
        r.ok("%s: session-start.sh codex prints one line of valid JSON that suggests $start" % tag,
             rc == 0 and not prob3 and '$start (or just say "set me up")' in text3,
             "exit %d %s\n%s" % (rc, prob3, out3))
    s1 = user_snapshot(ws)
    rc, text2, out2, prob2 = session_start(ws, impl, app, sid)
    r.ok("%s: second session start: no 'starter files set up' line, still suggests %s, no personal file changed"
         % (tag, start_word(app)),
         rc == 0 and not prob2 and "Missing starter files" not in text2 and "has not finished setup" in text2
         and user_snapshot(ws) == s1, "exit %d %s\n%s\n%s" % (rc, prob2, out2, diff_text(s1, user_snapshot(ws))))


def check_health_untouched(r, ws, impl, tag):
    app = app_for(impl)
    before = snapshot(ws)
    rc, out = health(ws, impl, app)
    h, stray = parse_health(out)
    safety = "safety check (bash)" if impl == "sh" else "safety check (PowerShell)"
    r.ok("%s: health on an untouched copy exits 0, with 'OK: %s' and a 'summary:' line" % (tag, safety),
         rc == 0 and safety in h["OK"] and any(l.startswith("summary: ") for l in out.splitlines()),
         "exit %d\n%s" % (rc, out))
    r.ok("%s: every health line uses its vocabulary (OK/FIX/NOTE/SKIP, summary, most important)" % tag,
         not stray, "\n".join(stray))
    r.ok("%s: before the first run, health says the startup hook never ran and starter files aren't created yet "
         "(a note, not a fix)" % tag,
         "never run" in h["FIX"].get("hooks running", "") and "not created yet" in h["NOTE"].get("starter files", "")
         and "starter files" not in h["FIX"], out)
    r.ok("%s: health is read-only (nothing in the folder changed)" % tag, snapshot(ws) == before,
         diff_text(before, snapshot(ws)))


def version_of(ws):
    m = re.search(r"(?m)^version:[ \t]*([0-9][^\s]*)", read(P(ws, "VERSION")))
    return m.group(1) if m else "?"


def check_health_after(r, ws, impl, tag, full, sid=None):
    app = app_for(impl)
    env = {"CLAUDE_CODE_SESSION_ID": sid} if (sid and app == "claude") else None
    before = snapshot(ws)
    rc, out = health(ws, impl, app, env=env)
    h, stray = parse_health(out)
    safety = "safety check (bash)" if impl == "sh" else "safety check (PowerShell)"
    lines = [l for l in out.splitlines() if l.strip()]
    r.ok("%s: health after the first run exits 0, with 'OK: %s' and a 'summary:' line" % (tag, safety),
         rc == 0 and safety in h["OK"] and any(l.startswith("summary: ") for l in lines) and not stray,
         "exit %d, stray lines %s\n%s" % (rc, stray, out))
    unexpected = sorted(set(h["FIX"]) - {"setup"} - ENV_FIX)
    r.ok("%s: health's only fix on a fresh copy is 'setup not done: type %s'" % (tag, start_word(app)),
         not unexpected and ("setup not done: type %s" % start_word(app)) in h["FIX"].get("setup", "")
         and lines and lines[-1].startswith("most important: setup: setup not done"),
         "unexpected FIX: %s\n%s" % (unexpected, out))
    for name in ENV_FIX & set(h["FIX"]):
        print("      (environment, not the app: FIX: %s: %s)" % (name, h["FIX"][name]))
    want = {"folder": "", "hook setup": "", "hooks running": "", "script line endings": "fine",
            "starter files": "all in place", "app templates": "unchanged", "version": version_of(ws)}
    if env:
        want["hooks running"] = "ran in this session"
    wrong = ["%s (got %r)" % (k, h["OK"].get(k)) for k, v in want.items() if k not in h["OK"] or v not in h["OK"][k]]
    r.ok("%s: health confirms folder, hooks wired and running, LF scripts, starter files, untouched templates, "
         "version %s" % (tag, version_of(ws)), not wrong, "\n".join(wrong) + "\n" + out)
    r.ok("%s: health is read-only (nothing in the folder changed)" % tag, snapshot(ws) == before,
         diff_text(before, snapshot(ws)))
    if not full:
        return
    rc, out = health(ws, impl, app, cwd=P(ws, "jobs"), env=env)
    h2, _ = parse_health(out)
    r.ok("%s: health run from a subfolder says to open the workspace folder itself" % tag,
         rc == 0 and "not on the workspace folder itself" in h2["FIX"].get("folder", ""), out)
    other = "codex" if app == "claude" else "claude"
    rc, out = health(ws, impl, other)
    h3, _ = parse_health(out)
    r.ok("%s: health for %s suggests %s instead" % (tag, other, start_word(other)),
         rc == 0 and ("type %s " % start_word(other)) in h3["FIX"].get("setup", ""), out)


# ---------------------------------------------------------------- passes

def crlf_clone(parent, name="Job Search HQ"):
    dest = os.path.join(parent, name)
    rc, out = run([find_git(), "clone", "-q", "--no-hardlinks", "-c", "core.autocrlf=true", REPO, dest])
    if rc != 0:
        print("git clone (CRLF) failed: %s" % out)
        sys.exit(2)
    return dest


def pass_clone(r, base, impl, shared):
    tag = "clone/" + impl
    r.section("Fresh git clone of HEAD, first run by init-data (%s)" % impl)
    ws = clone_workspace(mk(base, "clone-a"))
    if shared:
        check_no_user_data(r, ws, "clone", git_index=True)
        check_exec_bits(r, ws, "clone", use_git=True)
        check_line_endings(r, ws, "clone", clone=True, crlf=False)
        check_manifest(r, ws, "clone")
        w = check_wiring_static(r, ws, "clone")
    else:
        w, _err = parse_wiring(ws)
    check_health_untouched(r, ws, impl, tag)
    check_init(r, ws, impl, tag, full=True)
    check_git_ignored(r, ws, tag)
    check_wiring_runs(r, ws, impl, tag, w)
    r.section("Fresh git clone of HEAD, first run by session-start (%s)" % impl)
    ws2 = clone_workspace(mk(base, "clone-b"))
    check_session_start(r, ws2, impl, tag, full=True)
    check_git_ignored(r, ws2, tag + " after session start")
    check_health_after(r, ws2, impl, tag, full=True, sid="e2e-fresh-" + impl)


def pass_crlf(r, base, impl, shared):
    tag = "crlf/" + impl
    r.section("Clone with Windows line endings (core.autocrlf=true) (%s)" % impl)
    ws = crlf_clone(mk(base, "crlf-a"))
    if shared:
        check_line_endings(r, ws, "crlf", clone=True, crlf=True)
        check_manifest(r, ws, "crlf")
    check_init(r, ws, impl, tag, full=False)
    ws2 = crlf_clone(mk(base, "crlf-b"))
    check_session_start(r, ws2, impl, tag, full=False)
    check_health_after(r, ws2, impl, tag, full=False, sid="e2e-fresh-" + impl)


def pass_unicode(r, base, impl):
    tag = "unicode/" + impl
    r.section("Folder name with spaces and non-ASCII: %r (%s)" % (UNICODE_NAME, impl))
    ws = clone_workspace(mk(base, "uni"), name=UNICODE_NAME)
    expected = blank_files(ws)
    rc, out = init_data(ws, impl)
    bad = not_identical(ws, expected)
    r.ok("%s: init-data creates all %d starter files, byte-identical" % (tag, len(expected)),
         rc == 0 and last_line(out) == "init: created %d file(s)" % len(expected) and not bad,
         out + "\n" + "\n".join(bad))
    app = app_for(impl)
    sid = "e2e-uni-" + impl
    rc, text, out, prob = session_start(ws, impl, app, sid)
    mark = P(ws, ".claude/.health/last-session-start")
    r.ok("%s: session-start exits 0, finds nothing missing, says setup is not done, writes its marker" % tag,
         rc == 0 and not prob and "Today is " in text and "Missing starter files" not in text
         and "The user has not finished setup." in text and os.path.isfile(mark)
         and (" %s %s" % (app, sid)) in read(mark), "exit %d %s\n%s" % (rc, prob, out))
    rc, text, out, prob = session_start(ws, impl, app, sid, cwd=P(ws, "profile"))
    r.ok("%s: session-start also works when started from inside the workspace" % tag,
         rc == 0 and not prob and "The user has not finished setup." in text, "exit %d %s\n%s" % (rc, prob, out))
    env = {"CLAUDE_CODE_SESSION_ID": sid} if app == "claude" else None
    rc, out = health(ws, impl, app, env=env)
    h, stray = parse_health(out)
    unexpected = sorted(set(h["FIX"]) - {"setup"} - ENV_FIX)
    r.ok("%s: health sees the folder as the workspace root, starter files in place, no unexpected fix" % tag,
         rc == 0 and UNICODE_NAME in h["OK"].get("folder", "") and h["OK"].get("starter files") == "all in place"
         and not unexpected and not stray, "unexpected FIX %s, stray %s\n%s" % (unexpected, stray, out))


def pass_worktree(r, base, impl, shared):
    tag = "worktree/" + impl
    r.section("Copy of the working tree, uncommitted changes included, no .git (%s)" % impl)
    ws = make_workspace(mk(base, "tree-a"))
    if shared:
        check_no_user_data(r, ws, "worktree", git_index=False)
        check_exec_bits(r, ws, "worktree", use_git=False)
        check_line_endings(r, ws, "worktree", clone=False, crlf=False)
        check_manifest(r, ws, "worktree (outside git)")
        # A release-zip user has no .git: build-manifest.sh then lists files itself. That list must
        # match the one git gives (compared below, after `git init`), before and after the first run.
        rc0, o0 = run([find_bash(), bp(P(ws, "scripts/build-manifest.sh"))], cwd=ws) if find_bash() else (1, "no bash")
        no_git = rb(P(ws, "product-manifest.json")) if rc0 == 0 else b""
    check_init(r, ws, impl, tag, full=True)
    # Turn the copy into a repository after the first run: the working tree's .gitignore must keep
    # every personal file out of `git add -A`.
    rc1, o1 = git(ws, "init", "-q")
    rc2, o2 = git(ws, "add", "-A")
    rc3, o3 = git(ws, "ls-files", "-z")
    names = [n for n in o3.split("\0") if n]
    leaked = sorted(n for n in names if any(n.startswith(d + "/") for d in USER_DIRS) and n not in USER_DIR_ALLOWED)
    r.ok("%s: git init + git add -A after the first run picks up no personal file (working-tree .gitignore)" % tag,
         rc1 == 0 and rc2 == 0 and rc3 == 0 and names and not leaked, "\n".join([o1, o2] + leaked))
    if shared and find_bash():
        rc4, o4 = run([find_bash(), bp(P(ws, "scripts/build-manifest.sh"))], cwd=ws)
        with_git = rb(P(ws, "product-manifest.json"))
        r.ok("worktree: build-manifest.sh lists the same files outside git (before the first run) as inside git "
             "(after it)", rc0 == 0 and rc4 == 0 and no_git and with_git == no_git,
             "%s\n%s\n%s" % (o0, o4, "\n".join(sorted(set(with_git.decode("utf-8", "replace").splitlines())
                                                        ^ set(no_git.decode("utf-8", "replace").splitlines())))[:3000]))
    ws2 = make_workspace(mk(base, "tree-b"))
    check_session_start(r, ws2, impl, tag, full=False)
    check_health_after(r, ws2, impl, tag, full=False, sid="e2e-fresh-" + impl)


def main():
    args = parse_args("End-to-end: fresh clone + first run (init-data, session-start, health).")
    keep_temps(args.keep)
    if not find_git():
        print("git is needed")
        sys.exit(2)
    print("bash: %s" % (find_bash() or "-"))
    if "ps" in args.impls:
        pse = find_powershell()
        print("PowerShell: %s" % pse)
        # health.ps1 and health.sh look PowerShell up on PATH for their guard self-test; a PS_EXE
        # outside PATH (a portable pwsh) would otherwise show up as "not installed".
        if os.path.isabs(pse):
            os.environ["PATH"] = os.path.dirname(pse) + os.pathsep + os.environ.get("PATH", "")
    r = Run("e2e fresh clone + first run (%s)" % "+".join(args.impls))
    t0 = time.time()
    for i, impl in enumerate(args.impls):
        t = time.time()
        base = temp_dir("e2e-fresh-" + impl)
        shared = i == 0
        pass_clone(r, base, impl, shared)
        pass_crlf(r, base, impl, shared)
        pass_unicode(r, base, impl)
        pass_worktree(r, base, impl, shared)
        print("\n(%s passes took %.1fs)" % (impl, time.time() - t))
    print("(total %.1fs)" % (time.time() - t0))
    r.finish()


if __name__ == "__main__":
    main()
