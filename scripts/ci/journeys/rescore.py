#!/usr/bin/env python3
"""Re-run a finished eval's checks from its saved results, without any model call.

    python3 scripts/ci/journeys/rescore.py <results-dir> [--only a,b]

For when a check itself was wrong (a regex that missed a clear answer, say): rebuilds the
transcript from events.jsonl, a fresh workspace copy with the scenario's setup, the saved user
files laid over it, the fake connectors' call logs and the responder's recorded state (ctx.json),
then runs the scenario's checks again and prints old vs new verdicts. Scenarios whose responder
state wasn't saved (runs before ctx.json existed) are rescored only if they don't need it.
"""
import sys
sys.dont_write_bytecode = True
import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import shutil  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
from e2e_common import make_workspace, temp_dir  # noqa: E402
import journeys as J  # noqa: E402
import evals as E  # noqa: E402
from sessions import ClaudeSession, Transcript  # noqa: E402

NEEDS_STATE = {"apply-assisted-exact-phrase", "apply-assisted-german", "my-data-reset-german"}


def transcript(d):
    s = ClaudeSession.__new__(ClaudeSession)
    s.t = Transcript("claude")
    s.tool_index = {}
    turn = None
    with open(os.path.join(d, "events.jsonl"), encoding="utf-8") as f:
        for line in f:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if turn is None:
                turn = {"user": "", "texts": [], "final": "", "calls": [], "cost": None, "error": ""}
                s.t.turns.append(turn)
            if s._event(ev, turn):
                turn = None
    ap = os.path.join(d, "approver.jsonl")
    if os.path.exists(ap):
        s.t.approvals = [json.loads(l) for l in open(ap, encoding="utf-8") if l.strip()]
    return s.t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("--only")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    reg = {j.name: j for j in E.registry()}
    for name in sorted(os.listdir(a.results)):
        d = os.path.join(a.results, name)
        cj = os.path.join(d, "checks.json")
        if not os.path.isfile(cj):
            continue
        old = json.load(open(cj, encoding="utf-8"))
        j = reg.get(old["journey"])
        if not j or (only and j.name not in only):
            continue
        saved = {}
        if os.path.exists(os.path.join(d, "ctx.json")):
            saved = json.load(open(os.path.join(d, "ctx.json"), encoding="utf-8"))
        if j.name in NEEDS_STATE and "st" not in saved:
            print("skip  %s (needs the responder state, not saved in this run)" % name)
            continue
        ws = make_workspace(temp_dir("rescore-%s" % j.name))
        ctx = {"app": "claude", "withheld": j.withheld}
        j.setup(ws, ctx)
        ctx.update(saved)
        uf = os.path.join(d, "workspace-user-files")
        for top in os.listdir(uf):
            dst = os.path.join(ws, top)
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            shutil.copytree(os.path.join(uf, top), dst, symlinks=True)
        ctx["fake_calls"] = {}
        for f in os.listdir(d):
            if f.startswith("fake-") and f.endswith("-calls.jsonl"):
                ctx["fake_calls"][f[5:-12]] = [json.loads(l) for l in open(os.path.join(d, f), encoding="utf-8") if l.strip()]
        t = transcript(d)
        c = J.Checks()
        fakes = [fk["name"] for fk in (j.fakes or ())]
        J.safety_checks(c, t, ws, fakes=fakes, draft_status=("draft", "in-gmail-drafts") if "gmail" in fakes else ("draft",))
        j.check(c, t, ws, ctx)
        new = "PASS" if c.passed else "FAIL"
        print("%-5s -> %-5s %s" % (old["status"], new, name))
        for ch in c.items:
            if ch["ok"] is False and not ch.get("soft"):
                print("      FAIL  %s | %s" % (ch["label"], ch["evidence"][:200]))
        with open(os.path.join(d, "rescore.json"), "w", encoding="utf-8") as f:
            json.dump({"old_status": old["status"], "new_status": new, "checks": c.items}, f, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
