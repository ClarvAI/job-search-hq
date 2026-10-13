#!/usr/bin/env python3
"""End-to-end test of the "try it first" sample workspace (.claude/skills/tour/scripts/make-sample.sh|.ps1).

On a throwaway copy of the app (a folder whose name has spaces) it checks that:
  - the user's own workspace stays byte-identical through make, refusals and removal (D7: the tour never
    edits real data; the sample is a separate folder next to it);
  - the sample folder holds the app, its marker, every file in templates/sample/workspace/ (dates filled in,
    no {{...}} tokens left), and the blank files for everything the sample doesn't provide;
  - the sample's CSVs follow the panels' rules (BOM, header, quoting, no formula cells, valid statuses and
    dates, exactly one "date unclear" row), Outbox headers follow AGENTS.md, page data blocks are valid
    JSON with no "<", and every panel has something to show;
  - session-start, run inside the sample, reports the sample pipeline (not "set up first");
  - it refuses an existing target (and suggests a free name), a target inside the workspace, a parent that
    is a link, a bad name, and running from inside a sample;
  - --remove deletes only a folder with the sample marker that still names the sample person;
  - with --impl both, the bash and PowerShell versions make identical sample files.

Usage: python3 scripts/ci/e2e-sample.py [--impl sh|ps|both] [--keep]
Python 3.8+ standard library only. Exit 0 all passed, 1 a check failed, 2 could not run.
"""
import sys; sys.dont_write_bytecode = True  # noqa: E702
import datetime
import json
import os
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import (Run, REPO, IS_WINDOWS, parse_args, keep_temps, temp_dir, make_workspace,  # noqa: E402
                        run, find_bash, find_powershell, read, write, snapshot)

for _k in ("CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"):
    os.environ.pop(_k, None)

SCRIPT = ".claude/skills/tour/scripts/make-sample"
SESSION = ".claude/hooks/session-start"
SAMPLE_SRC = os.path.join(REPO, "templates", "sample")
WS_NAME = "Job Search HQ"
SAMPLE_NAME = WS_NAME + " (sample - Alex Rivera)"
TODAY = datetime.date.today()
USER_DIRS = ("profile", "jobs", "contacts", "outbox", "interviews", "history", "knowledge/field", "pages")
TOKEN = re.compile(r"\{\{(D[-+][0-9]+|N[-+][0-9]+|UNCLEAR)\}\}")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SLASH = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
TRACKER_STATUS = {"interested", "applied", "screening", "interviewing", "offer", "accepted", "rejected",
                  "withdrawn", "skipped", "ghosted"}
OPEN_STATUS = {"interested", "applied", "screening", "interviewing", "offer"}
LEAD_STATUS = {"new", "saved", "added", "skipped", "not-for-me"}
LEAD_REASON = {"too-senior", "too-junior", "wrong-location", "not-my-field", "company", "pay"}
CONTACT_STATUS = {"to-contact", "contacted", "replied", "talked", "referred", "cold"}
RELATIONSHIP = {"family-intro", "former-manager", "former-colleague", "alum", "linkedin-connection", "recruiter",
                "hiring-manager", "interviewer", "met-at-event", "cold"}
OUTBOX_KEYS = ("channel", "kind", "to", "cc", "subject", "job", "contact", "reply_to", "created", "status")
PLACEHOLDER = re.compile(r"\[(Name|Company|First name|Your name)\]|\{\{|\{First name\}|<Company>|___", re.I)


def P(root, rel):
    return os.path.join(root, *rel.split("/"))


def bp(p):
    return p.replace("\\", "/") if IS_WINDOWS else p


def make_sample(ws, impl, *args, cwd=None):
    """Runs the workspace's make-sample with long-form args (--parent X --name Y --remove --dry-run --today D)."""
    if impl == "sh":
        conv = [bp(a) if os.path.isabs(a) else a for a in args]
        return run([find_bash(), bp(P(ws, SCRIPT + ".sh"))] + conv, cwd=cwd)
    flags = {"--parent": "-Parent", "--name": "-Name", "--remove": "-Remove", "--dry-run": "-DryRun", "--today": "-Today"}
    return run([find_powershell(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
                P(ws, SCRIPT + ".ps1")] + [flags.get(a, a) for a in args], cwd=cwd)


def session_start(ws, impl):
    data = json.dumps({"session_id": "e2e-sample", "hook_event_name": "SessionStart"}).encode("utf-8")
    if impl == "sh":
        return run([find_bash(), bp(P(ws, SESSION + ".sh")), "claude"], cwd=os.path.dirname(ws), input_text=data)
    rc, out = run([find_powershell(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
                   P(ws, SESSION + ".ps1"), "-App", "codex"], cwd=os.path.dirname(ws), input_text=data)
    try:
        out = json.loads(out.strip().splitlines()[-1])["hookSpecificOutput"]["additionalContext"]
    except (ValueError, KeyError, IndexError):
        pass
    return rc, out


def render_rel(rel, today):
    """The file name a sample file gets (the same token rules as make-sample)."""
    def sub(m):
        tok = m.group(1)
        if tok == "UNCLEAR":
            return unclear_date(today)
        off = int(tok[1:])
        d = today + datetime.timedelta(days=off)
        return d.strftime("%Y-%m-%d") if tok[0] == "D" else d.strftime("%Y%m%d")
    return TOKEN.sub(sub, rel)


def unclear_date(today):
    for k in range(7, 60):
        d = today + datetime.timedelta(days=k)
        if d.day <= 12 and d.day != d.month:
            return d.strftime("%m/%d/%Y")
    return ""


def sample_files():
    top = os.path.join(SAMPLE_SRC, "workspace")
    out = []
    for dirpath, _dirs, files in os.walk(top):
        for f in files:
            if f != ".DS_Store":
                out.append(os.path.relpath(os.path.join(dirpath, f), top).replace(os.sep, "/"))
    return sorted(out)


def user_snapshot(root):
    snap = snapshot(root)
    return {k: v.replace(b"\r\n", b"\n") for k, v in snap.items()
            if any(k == d or k.startswith(d + "/") for d in USER_DIRS)}


# ---------------------------------------------------------------- CSV rules (AGENTS.md "CSV files")

def parse_csv(raw):
    """Returns (rows, problem). A quote opens a value only at the very start of a cell."""
    text = raw.decode("utf-8")
    if not text.startswith("﻿"):
        return [], "no byte-order mark"
    text = text[1:].replace("\r\n", "\n")
    if ";" in text.split("\n", 1)[0] and "," not in text.split("\n", 1)[0]:
        return [], "header split by semicolons"
    rows, row, cell, i, n = [], [], "", 0, len(text)
    at_start, quoted = True, False
    while i < n:
        c = text[i]
        if quoted:
            if c == '"':
                if i + 1 < n and text[i + 1] == '"':
                    cell += '"'; i += 2; continue  # noqa: E702
                quoted = False; i += 1; continue  # noqa: E702
            cell += c; i += 1; continue  # noqa: E702
        if at_start and c == '"':
            quoted, at_start = True, False; i += 1; continue  # noqa: E702
        if c == ",":
            row.append(cell); cell, at_start = "", True; i += 1; continue  # noqa: E702
        if c == "\n":
            row.append(cell); rows.append(row); row, cell, at_start = [], "", True; i += 1; continue  # noqa: E702
        cell += c; at_start = False; i += 1  # noqa: E702
    if quoted:
        return rows, "a quoted value never closes"
    if cell or row:
        row.append(cell); rows.append(row)  # noqa: E702
    return rows, ""


def check_csv(r, sample, rel, tag):
    raw = open(P(sample, rel), "rb").read()
    blank = read(P(REPO, "templates/blank/" + rel)).lstrip("﻿").splitlines()[0]
    rows, problem = parse_csv(raw)
    r.ok("%s %s: readable by the panels (BOM, commas, quotes closed)" % (tag, rel), not problem, problem)
    if problem or not rows:
        return []
    r.ok("%s %s: header matches the blank file" % (tag, rel), ",".join(rows[0]) == blank, rows[0])
    bad = [(i + 1, row) for i, row in enumerate(rows[1:]) if len(row) != len(rows[0])]
    r.ok("%s %s: every row has %d values" % (tag, rel, len(rows[0])), not bad, bad[:3])
    formula = [(row[0], c) for row in rows[1:] for c in row if c[:1] in ("=", "+", "-", "@", "\t")]
    r.ok("%s %s: no value starts with = + - @ or a tab" % (tag, rel), not formula, formula[:3])
    fancy = [c for row in rows[1:] for c in row if re.search("[‘’“”–—]", c)]
    r.ok("%s %s: plain quotes and dashes only" % (tag, rel), not fancy, fancy[:3])
    return [dict(zip(rows[0], row)) for row in rows[1:]]


def is_unclear(s):
    m = SLASH.match(s)
    return bool(m) and int(m.group(1)) <= 12 and int(m.group(2)) <= 12 and m.group(1).lstrip("0") != m.group(2).lstrip("0")


def check_data(r, sample, tag, today):
    # Every sample file is there, with dates filled in.
    missing = [rel for rel in sample_files() if not os.path.isfile(P(sample, render_rel(rel, today)))]
    r.ok("%s every file in templates/sample/workspace/ is in the sample (%d files)" % (tag, len(sample_files())),
         not missing, missing[:5])
    left = []
    for d in USER_DIRS:
        for dirpath, _dirs, files in os.walk(P(sample, d)):
            for f in files:
                p = os.path.join(dirpath, f)
                if TOKEN.search(f) or TOKEN.search(open(p, "rb").read().decode("utf-8", "replace")):
                    left.append(os.path.relpath(p, sample))
    r.ok("%s no date token left in any personal file" % tag, not left, left[:5])
    blanks = []
    for dirpath, _dirs, files in os.walk(P(REPO, "templates/blank")):
        for f in files:
            rel = os.path.relpath(os.path.join(dirpath, f), P(REPO, "templates/blank")).replace(os.sep, "/")
            if rel != "README.md" and not f.endswith(".DS_Store") and not os.path.isfile(P(sample, rel)):
                blanks.append(rel)
    r.ok("%s every blank starter file is there too (design, references, pages, ...)" % tag, not blanks, blanks)
    r.ok("%s profile/design.md is the blank Default look" % tag,
         read(P(sample, "profile/design.md")) == read(P(REPO, "templates/blank/profile/design.md")))
    marker = P(sample, ".sample-workspace")
    r.ok("%s the sample marker is there" % tag, os.path.isfile(marker) and
         read(marker).splitlines()[0] == "Job Search HQ sample workspace (made by make-sample)")
    r.ok("%s the app was copied (AGENTS.md, panels, hooks, settings)" % tag, all(os.path.isfile(P(sample, x)) for x in (
        "AGENTS.md", "CLAUDE.md", ".claude/settings.json", ".claude/hooks/session-start.sh",
        ".claude/skills/pipeline/hooks/register.tsx", ".codex/hooks.json")))
    leaked = [x for x in (".git", "scripts/ci", "docs/maintainers", ".github", ".claude/settings.local.json",
                          ".claude/skills/pipeline/tests") if os.path.exists(P(sample, x))]
    r.ok("%s no git history, maintainer files or local settings copied" % tag, not leaked, leaked)
    prefs = read(P(sample, "profile/preferences.md")).replace("\r", "")   # a Windows checkout has CRLF
    r.ok("%s preferences: setup done, sample name, sample banner" % tag,
         re.search(r"(?m)^SETUP: done \d{4}-\d{2}-\d{2}$", prefs) and "\nname: Alex Rivera (sample)\n" in prefs
         and "SAMPLE WORKSPACE" in prefs)
    sp_p = P(sample, "profile/setup-progress.md")
    sp = read(sp_p).replace("\r", "") if os.path.isfile(sp_p) else ""
    r.ok("%s setup checklist: every section done, in profile/setup-progress.md (not in preferences)" % tag,
         "\nsetup_progress: resume, status, preferences, field-pack, story, forms, look, first-week\n" in sp
         and not re.search(r"(?m)^setup_progress:", prefs), sp[:300])

    # Tracker
    jobs = check_csv(r, sample, "jobs/tracker.csv", tag)
    statuses = {j["status"] for j in jobs}
    r.ok("%s tracker: every status except accepted (%d rows)" % (tag, len(jobs)),
         statuses == TRACKER_STATUS - {"accepted"}, sorted(statuses))
    folders = [j["folder"] for j in jobs if j["folder"] and not os.path.isfile(P(sample, "jobs/%s/posting.md" % j["folder"]))]
    r.ok("%s tracker: every job folder named exists with a posting" % tag, not folders, folders)
    unclear, bad_dates, no_next = [], [], []
    for j in jobs:
        for col in ("next_action_date", "deadline", "date_found", "date_applied"):
            v = j[col]
            if not v or ISO.match(v):
                continue
            if is_unclear(v):
                unclear.append((j["company"], col, v))
            else:
                bad_dates.append((j["company"], col, v))
        if j["status"] in OPEN_STATUS and not j["next_action_date"]:
            no_next.append(j["company"])
    r.ok("%s tracker: dates are YYYY-MM-DD except one unclear slash date" % tag,
         not bad_dates and len(unclear) == 1 and unclear[0][1] == "next_action_date", (bad_dates, unclear))
    r.ok("%s tracker: every open job has a next step date" % tag, not no_next, no_next)
    due_today = [j for j in jobs if j["next_action_date"] == today.isoformat()]
    r.ok("%s tracker: something is due today, an interview tomorrow, an offer deadline ahead" % tag,
         due_today and any(j["next_action"] == "Interview %s" % (today + datetime.timedelta(days=1)).isoformat() for j in jobs)
         and any(j["status"] == "offer" and j["deadline"] > today.isoformat() for j in jobs))

    # Leads
    leads = check_csv(r, sample, "jobs/leads.csv", tag)
    ls = {l["status"] for l in leads}
    r.ok("%s leads: every status, new ones for the Job Inbox" % tag, ls == LEAD_STATUS, sorted(ls))
    badr = [l["id"] for l in leads if (l["status"] == "not-for-me") != bool(l["reason"]) or
            (l["reason"] and l["reason"] not in LEAD_REASON and not l["reason"].startswith("other: "))]
    r.ok("%s leads: not-for-me rows (and only they) have a valid reason" % tag, not badr, badr)
    ids = [l["id"] for l in leads]
    r.ok("%s leads: ids are unique and look like L-YYYYMMDD-NN" % tag,
         len(set(ids)) == len(ids) and all(re.match(r"^L-\d{8}-\d{2}$", i) for i in ids), ids)

    # Contacts
    contacts = check_csv(r, sample, "contacts/contacts.csv", tag)
    cs = {c["status"] for c in contacts}
    r.ok("%s contacts: every status" % tag, cs == CONTACT_STATUS, sorted(cs))
    badc = [c["name"] for c in contacts if c["relationship"] not in RELATIONSHIP or not c["touches"].isdigit()
            or int(c["touches"]) > 2 or (c["next_followup"] and not ISO.match(c["next_followup"]))]
    r.ok("%s contacts: relationships, touches and dates are valid" % tag, not badc, badc)
    r.ok("%s contacts: a follow-up is due today" % tag, any(c["next_followup"] == today.isoformat() for c in contacts))
    emails = [c["email"] for c in contacts if c["email"] and not re.search(r"@([a-z0-9-]+\.)*example\.com$", c["email"])]
    r.ok("%s contacts: only example.com addresses" % tag, not emails, emails)

    # Outbox
    found = {"draft": 0, "in-gmail-drafts": 0, "sent": 0}
    problems = []
    for sub, allowed in (("outbox", ("draft", "in-gmail-drafts")), ("outbox/sent", ("sent",))):
        for f in sorted(os.listdir(P(sample, sub))):
            if not f.endswith(".md") or f.startswith("_"):
                continue
            text = read(P(sample, sub + "/" + f)).replace("\r\n", "\n")
            m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
            if not m:
                problems.append(f + ": no header"); continue  # noqa: E702
            head = {}
            for line in m.group(1).split("\n"):
                k, _, v = line.partition(":")
                head[k.strip()] = v.strip()
            body = m.group(2).strip()
            miss = [k for k in OUTBOX_KEYS if k not in head]
            if miss:
                problems.append("%s: missing %s" % (f, miss))
            if not re.match(r"^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$", f):
                problems.append(f + ": name is not YYYY-MM-DD-slug.md")
            st = head.get("status", "")
            if st not in allowed:
                problems.append("%s: status %r in %s" % (f, st, sub))
            else:
                found[st] += 1
            if st == "sent" and not ISO.match(head.get("sent", "")):
                problems.append(f + ": sent file without a sent: date")
            if head.get("channel") == "email" and (not head.get("subject") or "@" not in head.get("to", "")):
                problems.append(f + ": email without a subject or address")
            if head.get("channel") == "linkedin" and head.get("kind") == "connection-note" and len(body) > 200:
                problems.append("%s: connection note is %d characters (200 max)" % (f, len(body)))
            if PLACEHOLDER.search(text):
                problems.append(f + ": placeholder text")
            if head.get("job") and not os.path.isdir(P(sample, "jobs/" + head["job"])):
                problems.append(f + ": job folder %s missing" % head["job"])
    r.ok("%s outbox: headers follow AGENTS.md (names, keys, subjects, 200-character note, no placeholders)" % tag,
         not problems, problems)
    r.ok("%s outbox: drafts, one waiting in Gmail, and sent ones" % tag,
         found["draft"] >= 2 and found["in-gmail-drafts"] == 1 and found["sent"] >= 1, found)

    # Pages
    for rel, check in (("pages/dashboard.html", "dashboard"), ("pages/flashcards.html", "flashcards"),
                       ("jobs/acme-senior-product-marketing-manager/interview-brief.html", "brief")):
        p = P(sample, rel)
        if not r.ok("%s %s exists" % (tag, rel), os.path.isfile(p)):
            continue
        html = read(p)
        blocks = re.findall(r'<script type="application/json" id="data">(.*?)</script>', html, re.S)
        data, err = None, ""
        try:
            data = json.loads(blocks[0]) if len(blocks) == 1 else None
        except ValueError as e:
            err = str(e)
        r.ok("%s %s: one data block, valid JSON, no '<' inside" % (tag, rel),
             data is not None and "<" not in blocks[0], err or "%d blocks" % len(blocks))
        if data is None:
            continue
        if check == "dashboard":
            r.ok("%s dashboard: not example data, owner marked sample, one job per tracker row" % tag,
                 data.get("example") is False and "sample" in data.get("owner", "")
                 and sorted((j["company"], j["role"], j["status"]) for j in data.get("jobs", []))
                 == sorted((j["company"], j["role"], j["status"]) for j in jobs))
        elif check == "flashcards":
            ids = [(d["id"], c["id"]) for d in data.get("decks", []) for c in d.get("cards", [])]
            r.ok("%s flashcards: real cards (no example- ids), unique ids" % tag,
                 ids and not any(c.startswith("example-") for _d, c in ids) and len(set(ids)) == len(ids), ids[:3])
        else:
            r.ok("%s brief: filled for Acme tomorrow" % tag, data.get("example") is False
                 and data.get("whenISO", "").startswith((today + datetime.timedelta(days=1)).isoformat()))
    # Apply Kit: a job with application-answers.md in the format the panel reads.
    answers = read(P(sample, "jobs/vandelay-senior-product-marketing-manager/application-answers.md"))
    r.ok("%s apply kit: answers are '## question' headings" % tag, len(re.findall(r"(?m)^## ", answers)) >= 4)


def snapshot_ok(r, ws, before, label):
    after = snapshot(ws)
    changed = sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))
    r.ok(label, not changed, changed[:10])


def main():
    args = parse_args("End-to-end test of the sample workspace (make-sample).")
    keep_temps(args.keep)
    r = Run("e2e-sample")
    made = {}
    for impl in args.impls:
        tag = "[%s]" % impl
        r.section("make a sample next to the workspace (%s)" % impl)
        tmp = temp_dir("e2e-sample")
        ws = make_workspace(tmp, WS_NAME)
        # The user's own folder as after a first run, plus one real-looking tracker row of theirs.
        rc, out = run([find_bash(), bp(P(ws, ".claude/skills/start/scripts/init-data.sh"))]) if find_bash() else (1, "")
        if rc != 0:
            for rel in ("profile/preferences.md", "jobs/tracker.csv"):
                write(P(ws, rel), read(P(REPO, "templates/blank/" + rel)))
        tracker = P(ws, "jobs/tracker.csv")
        write(tracker, read(tracker) + "Initech,Operations Analyst,interested,%s,Decide: apply or skip,,B,3,"
              "\"Denver, CO\",%s,,,,Company site,,,,0,,mine\n" % (TODAY.isoformat(), TODAY.isoformat()))
        before = snapshot(ws)

        rc, out = make_sample(ws, impl, "--dry-run", cwd=tmp)
        r.ok("%s dry run says what it would do and makes nothing" % tag,
             rc == 0 and "sample: dry-run" in out and not os.path.exists(os.path.join(tmp, SAMPLE_NAME)), out)
        rc, out = make_sample(ws, impl, "--today", TODAY.isoformat(), cwd=tmp)
        sample = os.path.join(tmp, SAMPLE_NAME)
        r.ok("%s make-sample made '%s' next to the workspace" % (tag, SAMPLE_NAME),
             rc == 0 and out.strip().splitlines()[-1] == "sample: made " + (bp(sample) if impl == "sh" else sample)
             and os.path.isdir(sample), out)
        snapshot_ok(r, ws, before, "%s the user's workspace is byte-identical after making the sample" % tag)
        if not os.path.isdir(sample):
            continue
        made[impl] = sample
        check_data(r, sample, tag, TODAY)

        r.section("session start inside the sample (%s)" % impl)
        rc, out = session_start(sample, impl)
        r.ok("%s session start reports the sample pipeline, not 'set up first'" % tag,
             rc == 0 and "Pipeline:" in out and "1 offer" in out and "not finished setup" not in out
             and "skipped or not reached yet" not in out and "Initech (Product Marketing Lead)" in out, out)
        r.ok("%s session start shows the unclear date and the sample notice" % tag,
             "Date unclear" in out and "SAMPLE workspace" in out, out)
        snapshot_ok(r, ws, before, "%s the user's workspace is still byte-identical" % tag)

        r.section("refusals (%s)" % impl)
        rc, out = make_sample(ws, impl, cwd=tmp)
        r.ok("%s refuses when the sample folder already exists, and suggests a free name" % tag,
             rc != 0 and "already exists" in out and ("suggest: %s 2" % SAMPLE_NAME) in out, out)
        rc, out = make_sample(ws, impl, "--parent", P(ws, "jobs"), cwd=tmp)
        r.ok("%s refuses a target inside the workspace" % tag,
             rc != 0 and "inside your own workspace" in out and not os.path.exists(P(ws, "jobs/" + SAMPLE_NAME)), out)
        rc, out = make_sample(ws, impl, "--name", "../escape", cwd=tmp)
        r.ok("%s refuses a folder name with a path in it" % tag, rc != 0 and "not a usable folder name" in out, out)
        link_in, link_out = os.path.join(tmp, "link to workspace"), os.path.join(tmp, "link elsewhere")
        os.makedirs(os.path.join(tmp, "elsewhere"))
        try:
            os.symlink(ws, link_in, target_is_directory=True)
            os.symlink(os.path.join(tmp, "elsewhere"), link_out, target_is_directory=True)
            linked = True
        except (OSError, NotImplementedError):
            linked = False
            print("SKIP  %s linked-parent refusals (this computer can't make links)" % tag)
        if linked:
            rc, out = make_sample(ws, impl, "--parent", link_in, cwd=tmp)
            r.ok("%s refuses a parent folder that is a link into the workspace" % tag,
                 rc != 0 and "link" in out and not os.path.exists(P(ws, SAMPLE_NAME)), out)
            rc, out = make_sample(ws, impl, "--parent", link_out, cwd=tmp)
            r.ok("%s refuses a parent folder that is a link anywhere (never follows links)" % tag,
                 rc != 0 and "link" in out and not os.listdir(os.path.join(tmp, "elsewhere")), out)
        rc, out = make_sample(sample, impl, "--parent", os.path.join(tmp, "elsewhere"), cwd=tmp)
        r.ok("%s refuses to make a sample from inside a sample" % tag,
             rc != 0 and "already a sample workspace" in out and not os.listdir(os.path.join(tmp, "elsewhere")), out)
        snapshot_ok(r, ws, before, "%s the user's workspace is byte-identical after the refusals" % tag)

        r.section("removal (%s)" % impl)
        plain = os.path.join(tmp, SAMPLE_NAME + " 2")
        os.makedirs(P(plain, "profile"))
        write(P(plain, "notes.txt"), "not a sample\n")
        rc, out = make_sample(ws, impl, "--remove", "--name", SAMPLE_NAME + " 2", cwd=tmp)
        r.ok("%s --remove refuses a folder without the sample marker" % tag,
             rc != 0 and "not made by make-sample" in out and os.path.isfile(P(plain, "notes.txt")), out)
        write(P(plain, ".sample-workspace"), "Job Search HQ sample workspace (made by make-sample)\n")
        write(P(plain, "profile/preferences.md"), "name: Casey Example\n")
        rc, out = make_sample(ws, impl, "--remove", "--name", SAMPLE_NAME + " 2", cwd=tmp)
        r.ok("%s --remove refuses a marked folder that no longer names the sample person" % tag,
             rc != 0 and "no longer looks like the sample" in out and os.path.isfile(P(plain, "notes.txt")), out)
        if linked:
            os.symlink(sample, os.path.join(tmp, SAMPLE_NAME + " 3"), target_is_directory=True)
            rc, out = make_sample(ws, impl, "--remove", "--name", SAMPLE_NAME + " 3", cwd=tmp)
            r.ok("%s --remove refuses a link to the sample" % tag,
                 rc != 0 and "link" in out and os.path.isdir(sample), out)
        rc, out = make_sample(ws, impl, "--remove", "--parent", ws, "--name", "jobs", cwd=tmp)
        r.ok("%s --remove refuses anything inside the workspace" % tag,
             rc != 0 and os.path.isdir(P(ws, "jobs")), out)
        snapshot_ok(r, ws, before, "%s the user's workspace is byte-identical after the refused removals" % tag)
        if len(args.impls) > 1 and impl == "sh":
            made["sh-snap"] = user_snapshot(sample)  # for the parity check after the PowerShell run
        elif "sh-snap" in made:
            a, b = made["sh-snap"], user_snapshot(sample)
            diff = sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))
            r.ok("[parity] bash and PowerShell make identical sample files (%d files)" % len(b), not diff, diff[:10])
        rc, out = make_sample(ws, impl, "--remove", cwd=tmp)
        r.ok("%s --remove deletes the sample it made" % tag,
             rc == 0 and "sample: removed" in out and not os.path.exists(sample), out)
        snapshot_ok(r, ws, before, "%s the user's workspace is byte-identical at the end" % tag)
    r.finish()


if __name__ == "__main__":
    main()
