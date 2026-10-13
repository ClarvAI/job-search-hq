#!/usr/bin/env python3
"""User-journey tests: real headless agent sessions on throwaway copies of the workspace.

MANUAL ONLY. Not part of run-all.sh or CI: every journey spends model quota on the account
the CLI is signed in to. Python 3.8+ standard library only.

    python3 scripts/ci/journeys/run.py [--app claude|codex|both] [--model X] [--only a,b] [--keep]
                                       [--jobs N] [--list]

Each journey copies the working tree (make_workspace), sets up fixtures (the fictional Alex
Rivera persona), runs one or more user turns through `claude -p` (stream-json) or `codex exec
--json`, answers the assistant's questions with a simulated user, then checks the files left
behind and the full tool-call log. Results go to a folder outside the repo (printed at the start
and the end): summary.json, and per journey events.jsonl (raw stream), transcript.md (readable),
approver.jsonl (every permission prompt and its answer), checks.json, and a copy of the
workspace's user folders.

Isolation comes first: no connectors, no MCP servers but the harness's own permission
stand-in, no user settings, memory, plugins, agents or skills (sessions.py lists the exact flags
and why). The canary journey proves it and always runs first for each app; if it fails, nothing
else runs for that app.
"""

import sys
sys.dont_write_bytecode = True
import argparse  # noqa: E402
import concurrent.futures  # noqa: E402
import datetime  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import shutil  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
import traceback  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
from e2e_common import REPO, assert_outside_repo, keep_temps, make_workspace, temp_dir  # noqa: E402
import journeys as J  # noqa: E402
from sessions import ClaudeSession, CodexSession, write_readable  # noqa: E402


def parse():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--app", choices=("claude", "codex", "both"), default="both")
    ap.add_argument("--model", help="model for the sessions (default: the CLI's default)")
    ap.add_argument("--only", help="comma-separated journey names (the canary always runs first)")
    ap.add_argument("--keep", action="store_true", help="keep the temp workspaces")
    ap.add_argument("--jobs", type=int, default=3, help="journeys to run at once (default 3)")
    ap.add_argument("--budget-scale", type=float, default=1.0, help="multiply every session's USD cap")
    ap.add_argument("--list", action="store_true", help="list journeys and exit")
    ap.add_argument("--results", help="folder for results (default: a new temp folder)")
    return ap.parse_args()


def make_session(app, ws, out_dir, j, args, extra_dirs=()):
    kw = dict(model=args.model, timeout=j.timeout)
    if app == "claude":
        return ClaudeSession(ws, out_dir, budget=j.budget * args.budget_scale,
                             permission_mode=j.permission_mode, extra_dirs=extra_dirs, **kw)
    return CodexSession(ws, out_dir, **kw)


def converse(sess, first_turns, j, ws, ctx):
    """Sends the scripted turns, then lets the simulated user answer questions until the journey's
    stop condition holds or the follow-up allowance runs out."""
    for text in first_turns:
        turn = sess.send(text)
        if turn["error"] and not turn["texts"]:
            return
    for _ in range(j.followups):
        t = sess.t
        last = t.final()
        if j.stop and j.stop(t, ws):
            return
        if not j.stop and not J.asks_question(last):
            return
        if t.turns[-1]["error"]:
            return
        sess.send(J.simulated_user(last, ctx.get("withheld", ()),
                                   "start" if j.name.startswith("first-run-start") else "generic", j.facts))


def save_user_files(ws, dest):
    for top in ("profile", "jobs", "contacts", "outbox", "history", "knowledge/field", "imports"):
        src = os.path.join(ws, top)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(dest, top), symlinks=True, dirs_exist_ok=True)


def run_one(app, j, args, root, results):
    """One journey on one app. Returns its result dict."""
    name = "%s-%s" % (app, j.name)
    out = os.path.join(results, name)
    os.makedirs(out, exist_ok=True)
    started = time.time()
    res = {"app": app, "journey": j.name, "desc": j.desc, "status": "ERROR", "checks": [],
           "cost_usd": 0.0, "usage": {}, "turns": 0, "seconds": 0, "dir": out, "infra_retries": 0}
    attempts = 0
    while True:
        attempts += 1
        try:
            if j.name == "my-data-backup-restore":
                checks, tr = run_mydata(app, j, args, root, out, attempts)
            else:
                checks, tr = run_simple(app, j, args, root, out, attempts)
        except Exception:  # a harness bug: report it, don't hide it
            res["error"] = traceback.format_exc()
            res["status"] = "ERROR"
            break
        infra = tr and tr[0].infra_failed()
        if infra and attempts == 1:
            res["infra_retries"] = 1
            print("  retrying %s once (infrastructure error: %s)" % (name, tr[0].errors[:1]), flush=True)
            continue
        res["checks"] = checks.items
        res["cost_usd"] = round(sum(t.cost_usd for t in tr), 4)
        usage = {}
        for t in tr:
            for k, v in (t.usage or {}).items():
                if isinstance(v, int):
                    usage[k] = usage.get(k, 0) + v
                elif isinstance(v, dict):
                    usage[k] = {kk: vv for kk, vv in v.items() if kk in ("inputTokens", "outputTokens",
                                                                         "costUSD")}
        res["usage"] = usage
        res["turns"] = sum(len(t.turns) for t in tr)
        res["errors"] = [e for t in tr for e in t.errors]
        res["status"] = "INFRA" if infra else ("PASS" if checks.passed else "FAIL")
        break
    res["seconds"] = round(time.time() - started)
    with open(os.path.join(out, "checks.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2)
    return res


def run_simple(app, j, args, root, out, attempt):
    ws_parent = temp_dir("journey-%s-%s-%d" % (app, j.name, attempt))
    ws = make_workspace(ws_parent)
    ctx = {"app": app, "withheld": j.withheld, "auto": j.permission_mode == "auto"}
    j.setup(ws, ctx)
    sess = make_session(app, ws, out, j, args)
    try:
        converse(sess, j.turns(app), j, ws, ctx)
    finally:
        t = sess.close()
    write_readable(t, os.path.join(out, "transcript.md"))
    save_user_files(ws, os.path.join(out, "workspace-user-files"))
    c = J.Checks()
    J.safety_checks(c, t, ws)
    j.check(c, t, ws, ctx)
    return c, [t]


def run_mydata(app, j, args, root, out, attempt):
    """Session A backs up workspace W1 to a folder outside it; W2 is a copy of W1 reset with the
    app's own reset script; session B restores the backup into W2. The user's files must match."""
    base = temp_dir("journey-%s-mydata-%d" % (app, attempt))
    w1 = make_workspace(os.path.join(base, "w1"))
    backup = os.path.join(base, "backups")
    os.makedirs(backup)
    ctx = {"app": app}
    J.mydata_setup(w1, ctx)
    outa = os.path.join(out, "a-backup")
    os.makedirs(outa)
    sa = make_session(app, w1, outa, j, args, extra_dirs=(backup,))
    try:
        converse(sa, [J.cmd(app, "my-data", "Please back up my job search data. Save the backup in this "
                                            "folder: %s" % backup)], j, w1, ctx)
    finally:
        ta = sa.close()
    write_readable(ta, os.path.join(outa, "transcript.md"))
    c = J.Checks()
    J.safety_checks(c, ta, w1)
    zips = sorted(f for f in os.listdir(backup) if f.startswith("job-search-backup-") and f.endswith(".zip"))
    c.ok("backup zip saved in the chosen folder outside the workspace", zips, os.listdir(backup))
    if not zips:
        return c, [ta]
    zpath = os.path.join(backup, zips[-1])
    zfiles = J.zip_user_files(zpath)
    w1snap = J.user_snapshot(w1)
    tops = ("profile/", "jobs/", "contacts/", "outbox/", "history/", "knowledge/field/", "pages/")
    inzip = {k: v for k, v in zfiles.items() if k.startswith(tops)}
    missing = [k for k in w1snap if k.startswith(tops) and k not in inzip]
    c.ok("backup holds every user file of the workspace", not missing, missing[:10])
    # The activity log gets its "Backup saved" line after the zip is made (my-data step 6).
    differ = [k for k, v in inzip.items() if w1snap.get(k) != v and k != "history/activity.md"]
    c.ok("backup copies are byte-identical to the workspace", not differ, differ[:10])
    rj = zfiles.get("resume.json") or zfiles.get("profile/resume.json")
    if rj:
        try:
            data = json.loads(rj.decode("utf-8"))
            names = {w.get("name") for w in data.get("work") or []}
            c.ok("resume.json: JSON Resume with only the real employers",
                 names == {"Northwind Software", "Globex Analytics"}, names)
        except ValueError as e:
            c.ok("resume.json parses", False, e)
    else:
        c.note("no resume.json in the backup")
    # W2: a copy of W1 reset by the app's own reset script.
    w2 = os.path.join(base, "w2", "Job Search HQ")
    shutil.copytree(w1, w2, symlinks=True)
    import subprocess
    r = subprocess.run(["bash", ".claude/skills/my-data/scripts/reset.sh", "--yes-delete"], cwd=w2,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    c.ok("reset copy prepared with reset.sh", r.returncode == 0, r.stdout.decode()[-400:])
    outb = os.path.join(out, "b-restore")
    os.makedirs(outb)
    unpack = os.path.join(backup, "unpacked")
    sb = make_session(app, w2, outb, j, args, extra_dirs=(backup,))
    ctx2 = dict(ctx)
    try:
        converse(sb, [J.cmd(app, "my-data", "I reset this folder and want my data back. My backup zip is %s. "
                                            "Please unpack it into %s (a new folder) and bring everything "
                                            "back." % (zpath, unpack))], j, w2, ctx2)
    finally:
        tb = sb.close()
    write_readable(tb, os.path.join(outb, "transcript.md"))
    save_user_files(w2, os.path.join(out, "workspace-user-files"))
    J.safety_checks(c, tb, w2)
    ran = [x for x in tb.calls if "restore.sh" in json.dumps(x["input"])]
    c.ok("restore went through restore.sh", ran, [x["name"] for x in tb.calls][:12])
    c.ok("restore.sh finished (restore: done)", any("restore: done" in x["result"] for x in ran),
         "\n".join(x["result"][-300:] for x in ran))
    w2snap = J.user_snapshot(w2)
    skip = {"history/activity.md", "profile/resume.json"}
    lost = [k for k in inzip if k not in skip and w2snap.get(k) != inzip[k]]
    c.ok("after restore every backed-up file is identical in the reset copy", not lost, lost[:10])
    a1 = [l for l in inzip.get("history/activity.md", b"").decode("utf-8-sig").splitlines()
          if l.startswith("- ")]
    a2 = J.read(os.path.join(w2, "history", "activity.md"))
    c.ok("activity log: every line from the backup is back", all(l in a2 for l in a1),
         [l for l in a1 if l not in a2][:3])
    return c, [ta, tb]


def preflight(apps):
    ok = True
    for a in apps:
        if not shutil.which(a):
            print("missing: %s CLI not found on PATH" % a)
            ok = False
    if not shutil.which("bash"):
        print("missing: bash")
        ok = False
    return ok


def main():
    args = parse()
    reg = J.registry()
    if args.list:
        for j in reg:
            print("%-26s %-14s %s" % (j.name, ",".join(j.apps), j.desc))
        return 0
    apps = ["claude", "codex"] if args.app == "both" else [args.app]
    if not preflight(apps):
        return 2
    keep_temps(args.keep)
    results = args.results or tempfile.mkdtemp(prefix="journeys-results-%s." % datetime.date.today().isoformat())
    os.makedirs(results, exist_ok=True)
    assert_outside_repo(results)
    print("results: %s" % results, flush=True)
    only = set(x.strip() for x in args.only.split(",")) if args.only else None
    root = REPO
    summary = {"started": datetime.datetime.now().isoformat(timespec="seconds"), "results_dir": results,
               "model": args.model or "(CLI default)", "apps": apps, "journeys": []}
    canary = [j for j in reg if j.name == "canary-isolation"][0]
    plan = []
    for app in apps:
        print("\n== %s: canary (isolation) first" % app, flush=True)
        res = run_one(app, canary, args, root, results)
        summary["journeys"].append(res)
        _print(res)
        if res["status"] != "PASS":
            print("ISOLATION NOT PROVEN for %s: no other journey runs on it." % app)
            continue
        for j in reg:
            if j.name == "canary-isolation" or app not in j.apps or (only and j.name not in only):
                continue
            plan.append((app, j))
    print("\n== running %d journeys, %d at a time" % (len(plan), max(1, args.jobs)), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as ex:
        futs = {ex.submit(run_one, app, j, args, root, results): (app, j) for app, j in plan}
        for fut in concurrent.futures.as_completed(futs):
            res = fut.result()
            summary["journeys"].append(res)
            _print(res)
    summary["finished"] = datetime.datetime.now().isoformat(timespec="seconds")
    summary["total_cost_usd"] = round(sum(r.get("cost_usd") or 0 for r in summary["journeys"]), 2)
    with open(os.path.join(results, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print("\n== summary")
    for r in summary["journeys"]:
        print("%-5s %-6s %-26s %6ss  $%s" % (r["status"], r["app"], r["journey"], r["seconds"], r.get("cost_usd")))
    print("claude cost (as reported by the CLI): $%s" % summary["total_cost_usd"])
    print("results: %s" % results)
    bad = [r for r in summary["journeys"] if r["status"] != "PASS"]
    return 1 if bad else 0


def _print(res):
    print("%s  %s %s (%ss, $%s)" % (res["status"], res["app"], res["journey"], res["seconds"], res.get("cost_usd")),
          flush=True)
    for ch in res.get("checks") or []:
        if ch["ok"] is False:
            print("      FAIL  %s" % ch["label"])
            if ch["evidence"]:
                print("            | %s" % ch["evidence"][:400].replace("\n", "\n            | "))
    if res.get("error"):
        print("      harness error:\n" + res["error"])


if __name__ == "__main__":
    sys.exit(main())
