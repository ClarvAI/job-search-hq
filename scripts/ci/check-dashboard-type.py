"""Checks the Claude Dashboard route of /pages (Python 3.8+ standard library; Node for the data builder).

1. Builds the published datasets from a fixture tracker (the fictional Alex Rivera) with
   .claude/skills/pages/scripts/build-dashboard-data.mjs and checks: only the allowed job fields,
   no contact names, notes, pay, links, locations or activity anywhere; unclear dates left as
   "date unclear" (never guessed); dotted, row-evidence and quoted-comma cells read right; numbers
   match the tracker, including the page's own calculations run against the built data; freshness
   (updated, staleAfterHours 72); damaged trackers refused with nothing written.
2. Checks the themed-page publish copy (--publish-copy) carries the same privacy filter.
3. Lints the shipped page .claude/skills/pages/assets/dashboard-type-index.html: no digits in visible
   text, every value element marked (data-source + data-field, placeholders only), every source a
   known dataset or calc, under 256 KB, no network, outside scripts, fonts, storage or HTML injection.

Usage: python scripts/ci/check-dashboard-type.py [--keep]
Exits 0 when every check passed, 1 when any failed, 2 when it could not run. Without Node the builder
checks are skipped (and count as a failure in CI, where CI is set).
"""
import sys
sys.dont_write_bytecode = True
import json
import os
import re
import shutil
import subprocess
import tempfile
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.realpath(os.path.join(HERE, "..", ".."))
SKILL = os.path.join(REPO, ".claude", "skills", "pages")
BUILDER = os.path.join(SKILL, "scripts", "build-dashboard-data.mjs")
INDEX = os.path.join(SKILL, "assets", "dashboard-type-index.html")
BLANK_DASH = os.path.join(REPO, "templates", "blank", "pages", "dashboard.html")
TODAY = "2026-10-12"
NOW = "2026-10-12T15:04:05.000Z"
UNCLEAR = "date unclear"
JOB_FIELDS = {"key", "company", "role", "status", "stage", "found", "applied", "next_step", "due",
              "deadline", "reached_screen", "reached_interview"}
FORBIDDEN = ["Jordan Smith", "Pat Lee", "Pat", "120,000", "150,000", "$", "example.com", "Denver",
             "Remote", "monitor", "R-1001", "LinkedIn", "Alex Rivera", "555", "referred", "stipend"]

passed = 0
failed = 0


def ok(label, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print("PASS  %s" % label, flush=True)
    else:
        failed += 1
        print("FAIL  %s" % label, flush=True)
        if detail:
            for line in str(detail).splitlines()[:12]:
                print("      %s" % line, flush=True)


def section(name):
    print("\n== %s" % name, flush=True)


# ---------------------------------------------------------------- fixtures (fictional: Alex Rivera)

HEADER = ("company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,"
          "date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes")
ROWS = [
    # quoted comma; slash date inside the next step settled by a part over 12; contact, pay and notes to drop
    '"Acme Holdings, Inc.",Senior Product Marketing Manager,interviewing,2026-10-14,Interview 10/15/2026 with Jordan Smith,,A,5,Denver,2026-09-20,2026-09-25,Jordan Smith,"$120,000-$140,000",LinkedIn,https://example.com/acme,https://example.com/acme/apply,R-1001,0,acme-senior-pmm,"Also: Take-home due 2026-10-20; Pat Lee referred me"',
    # ambiguous slash date with no date_order (unclear); a stray quote mid-cell in notes
    'Initech,Product Marketing Manager,applied,03/04/2026,Follow up with Pat Lee,,B,4,Remote,2026-10-01,2026-10-07,,,Indeed,https://example.com/initech,,,0,initech-pmm,Called recruiter Pat Lee about the 5" monitor stipend',
    # dotted date (day first); a part over 12 elsewhere in the row proves day-month order for 03/10/2026
    'Umbrella Corp,Product Marketing Lead,screening,9.10.2026,Schedule interview,,A,5,Denver,25/09/2026,03/10/2026,,,Company site,,,,0,umbrella-pml,Phone screen went well',
    'Hooli,Growth Marketing Manager,interested,2026-10-13,Decide: apply or skip,2026-10-20,C,3,Denver,2026-10-10,,,,Indeed,,,,0,hooli-gmm,',
    'Vandelay Industries,Product Marketing Manager,rejected,,,,B,4,Denver,2026-09-01,2026-09-05,,,Referral,,,,1,vandelay-pmm,Rejected after screen with Pat Lee',
    'Hooli,Growth Marketing Manager,skipped,,,,C,2,Denver,2026-09-15,,,,Indeed,,,,0,,Duplicate posting',
    'Initech,Senior Product Marketing Manager,offer,2026-10-16,"Respond to offer, ask about salary $150,000",2026-10-18,A,5,Denver,2026-09-08,2026-09-10,,"$150,000",Referral,,,,0,initech-spmm,Offer call with Pat Lee',
]
PREFS = "# Preferences\n\nname: Alex Rivera\ndate_order:\nweekly_goals: 5 applications, 3 networking conversations, 1 mock interview\n"
PAGE_DATA = {
    "example": False, "generated": TODAY, "owner": "Alex Rivera",
    "goals": {"applications": 5, "conversations": 3, "mocks": 1},
    "week": {"start": "2026-10-06", "applications": 1, "conversations": 2, "mocks": 1},
    "history": [{"week": "2026-09-28", "applications": 1, "conversations": 1, "mocks": 0},
                {"week": "2026-10-05", "applications": 1, "conversations": 2, "mocks": 1}],
    "streak": 4,
    "jobs": [
        {"company": "Acme Holdings, Inc.", "role": "Senior Product Marketing Manager", "status": "interviewing", "fit": 5, "priority": "A", "next": "Interview 2026-10-15 with Jordan Smith", "due": "2026-10-14", "location": "Denver", "url": "https://example.com/acme", "applied": "2026-09-25"},
        {"company": "Initech", "role": "Product Marketing Manager", "status": "applied", "next": "Follow up with Pat Lee (date unclear)", "location": "Remote", "applied": "2026-10-07"},
        {"company": "Vandelay Industries", "role": "Product Marketing Manager", "status": "rejected", "heard": True, "location": "Denver"},
        {"company": "Hooli", "role": "PMM </script><b>x</b>", "status": "interested", "next": "Decide: apply or skip", "due": "2026-10-13"},
    ],
    "contacts": [{"name": "Jordan Smith", "company": "Acme Holdings, Inc.", "next": "Thank-you note", "due": "2026-10-13"}],
    "activity": [{"date": "2026-10-11", "text": "Talked with Pat Lee at Initech"}],
}


def page_json(data):
    return json.dumps(data, indent=2).replace("<", "\\u003c")


def make_workspace(root, rows, with_page=True):
    # The builder and its page run from a copy inside the temp workspace, never from the repo.
    for src, rel in ((BUILDER, ("scripts", "build-dashboard-data.mjs")), (INDEX, ("assets", "dashboard-type-index.html"))):
        dest = os.path.join(root, ".claude", "skills", "pages", *rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(src, dest)
    os.makedirs(os.path.join(root, "jobs"))
    os.makedirs(os.path.join(root, "profile"))
    os.makedirs(os.path.join(root, "pages"))
    with open(os.path.join(root, "AGENTS.md"), "w", encoding="utf-8") as f:
        f.write("# fixture\n")
    with open(os.path.join(root, "jobs", "tracker.csv"), "w", encoding="utf-8-sig", newline="") as f:
        f.write("\r\n".join([HEADER] + rows) + "\r\n")
    with open(os.path.join(root, "profile", "preferences.md"), "w", encoding="utf-8") as f:
        f.write(PREFS)
    if with_page:
        with open(BLANK_DASH, encoding="utf-8") as f:
            html = f.read()
        html = re.sub(r'(<script type="application/json" id="data">)[\s\S]*?(</script>)',
                      lambda m: m.group(1) + "\n" + page_json(PAGE_DATA) + "\n" + m.group(2), html, count=1)
        with open(os.path.join(root, "pages", "dashboard.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(html)


def node_cmd():
    return shutil.which("node")


def run_builder(root, out, *extra):
    builder = os.path.join(root, ".claude", "skills", "pages", "scripts", "build-dashboard-data.mjs")
    cmd = [node_cmd(), builder, "--root", root, "--out", out, "--today", TODAY, "--now", NOW] + list(extra)
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def is_clear_date(v):
    return v in ("", UNCLEAR) or bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", v))


def run_calcs(index_html, data):
    """Runs the page's dash.calc functions in Node against the built datasets; returns {calc id: rows}."""
    script = "\n".join(re.findall(r"<script>([\s\S]*?)</script>", index_html))
    runner = r"""
const fs = require('fs');
const [code, dataFile] = [fs.readFileSync(process.argv[2], 'utf8'), process.argv[3]];
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const calcs = {}; const order = [];
const dash = { calc: (id, o) => { calcs[id] = o; order.push(id); }, onData() {}, data() { return { status: 'loading', data: [] }; }, colors: [] };
new Function('dash', code)(dash);
const out = {};
for (const id of order) out[id] = calcs[id].fn(...calcs[id].inputs.map((i) => (i in data ? data[i] : out[i])));
process.stdout.write(JSON.stringify(out));
"""
    tmp = tempfile.mkdtemp(prefix="dash calc ")
    try:
        for name, text in (("page.js", script), ("runner.js", runner), ("data.json", json.dumps(data))):
            with open(os.path.join(tmp, name), "w", encoding="utf-8") as f:
                f.write(text)
        r = subprocess.run([node_cmd(), os.path.join(tmp, "runner.js"), os.path.join(tmp, "page.js"),
                            os.path.join(tmp, "data.json")], capture_output=True, text=True, encoding="utf-8")
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
        return json.loads(r.stdout)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------- 1. datasets

def check_builder(tmp):
    section("Claude Dashboard datasets from a fixture tracker")
    ws = os.path.join(tmp, "work space")
    out = os.path.join(tmp, "out")
    make_workspace(ws, ROWS)
    r = run_builder(ws, out)
    ok("builder runs", r.returncode == 0, r.stdout + r.stderr)
    if r.returncode != 0:
        return
    jobs = load(os.path.join(out, "jobs.json"))
    week = load(os.path.join(out, "week.json"))
    history = load(os.path.join(out, "history.json"))
    manifest = load(os.path.join(out, "datasets.json"))

    ok("one row per tracker row", len(jobs) == len(ROWS), len(jobs))
    ok("only the allowed job fields", all(set(j) == JOB_FIELDS for j in jobs), [sorted(set(j) - JOB_FIELDS) for j in jobs])
    blob = "\n".join(open(os.path.join(out, n), encoding="utf-8").read() for n in ("jobs.json", "week.json", "history.json", "datasets.json"))
    leaks = [w for w in FORBIDDEN if w in blob]
    ok("no contact names, notes, pay, links, locations or the user's name in any dataset", not leaks, leaks)
    ok("no activity or contacts fields", not re.search(r'"(activity|contacts?|notes|salary\w*|link|location|fit|priority|owner)"\s*:', blob))
    ok("every date is YYYY-MM-DD, blank or \"date unclear\"",
       all(is_clear_date(j[k]) for j in jobs for k in ("found", "applied", "due", "deadline")),
       [(j["key"], j["found"], j["applied"], j["due"], j["deadline"]) for j in jobs])
    by = {j["key"]: j for j in jobs}
    acme = by.get("Acme Holdings, Inc. · Senior Product Marketing Manager", {})
    initech = by.get("Initech · Product Marketing Manager", {})
    umbrella = by.get("Umbrella Corp · Product Marketing Lead", {})
    offer = by.get("Initech · Senior Product Marketing Manager", {})
    ok("a quoted comma stays inside the company name", acme.get("company") == "Acme Holdings, Inc.", acme)
    ok("an ambiguous slash date (no date_order) is \"date unclear\", not guessed", initech.get("due") == UNCLEAR, initech)
    ok("a dotted date is read day first", umbrella.get("due") == "2026-10-09", umbrella)
    ok("a part over 12 in the row settles its other slash dates", umbrella.get("found") == "2026-09-25" and umbrella.get("applied") == "2026-10-03", umbrella)
    ok("next steps keep only the standard wording (no names)",
       initech.get("next_step") == "Follow up" and acme.get("next_step") == "Interview 2026-10-15" and offer.get("next_step") == "Respond to offer",
       [initech.get("next_step"), acme.get("next_step"), offer.get("next_step")])
    ok("a stray quote mid-cell doesn't swallow the rows after it", "Umbrella Corp · Product Marketing Lead" in by)
    ok("duplicate jobs get distinct keys", "Hooli · Growth Marketing Manager (2)" in by and len(by) == len(jobs))
    ok("stages follow the board", [j["stage"] for j in jobs] == ["Talking", "Applied", "Talking", "To apply", "Closed", "Closed", "Offer"], [j["stage"] for j in jobs])
    vandelay = by.get("Vandelay Industries · Product Marketing Manager", {})
    ok("a closed job that heard back keeps that history", vandelay.get("reached_screen") == "yes" and vandelay.get("reached_interview") == "no", vandelay)

    wk = {w["measure"]: w for w in week}
    ok("applications in the last seven days match the tracker", wk.get("Applications", {}).get("done") == 1 and wk["Applications"].get("goal") == 5, week)
    ok("conversations and mocks come from today's refreshed page, goals from preferences",
       wk.get("Conversations", {}).get("done") == 2 and wk["Conversations"].get("goal") == 3 and wk.get("Mock interviews", {}).get("done") == 1, week)
    ok("the week window is the seven days to today", all(w["from"] == "2026-10-06" and w["to"] == TODAY for w in week), week)
    ok("weekly history counts applications from the tracker",
       [(h["week"], h["applications"]) for h in history] == [("2026-08-31", 1), ("2026-09-07", 1), ("2026-09-14", 0), ("2026-09-21", 1), ("2026-09-28", 1), ("2026-10-05", 1), ("2026-10-12", 0)],
       [(h["week"], h["applications"]) for h in history])
    ok("history takes conversations from the page for matching weeks", next((h for h in history if h["week"] == "2026-10-05"), {}).get("conversations") == 2, history)

    ok("three datasets, each with updated {at, by} and staleAfterHours 72",
       [d["id"] for d in manifest] == ["jobs", "week", "history"] and all(d["updated"]["at"] == NOW and d["updated"]["by"] and d["staleAfterHours"] == 72 for d in manifest), manifest)
    with open(INDEX, encoding="utf-8") as f:
        index = f.read()
    ok("the page document is the shipped page, unchanged", load(os.path.join(out, "doc-index.json")).get("text") == index.replace("\r\n", "\n"))
    ok("dash/meta has a title and no name", load(os.path.join(out, "doc-dash-meta.json")) == {"title": "My job search"})

    r2 = run_builder(ws, out, "--docs", "jobs=/_blob/aaaa1111", "week=/_blob/bbbb2222", "history=/_blob/cccc3333")
    doc = load(os.path.join(out, "doc-dataset-jobs.json")) if r2.returncode == 0 else {}
    ok("dataset documents point at the attached files",
       r2.returncode == 0 and doc.get("source") == {"kind": "file", "url": "/_blob/aaaa1111", "name": "jobs.json", "format": "json"} and doc.get("staleAfterHours") == 72, r2.stderr or doc)
    r3 = run_builder(ws, out, "--docs", "jobs=https://example.com/x", "week=/_blob/b", "history=/_blob/c")
    ok("a url that isn't an attached file is refused", r3.returncode == 2, r3.stdout + r3.stderr)

    try:
        calcs = run_calcs(index, {"jobs": jobs, "week": week, "history": history})
    except RuntimeError as e:
        ok("the page's calculations run", False, e)
        calcs = {}
    t = (calcs.get("totals") or [{}])[0]
    ok("headline numbers match the tracker",
       (t.get("tracked"), t.get("open"), t.get("applied"), t.get("heard"), t.get("interviewed"), t.get("offers"), t.get("rate")) == (7, 5, 5, 4, 2, 1, 80), t)
    ok("funnel matches", [r["jobs"] for r in calcs.get("funnel", [])] == [7, 5, 4, 2, 1], calcs.get("funnel"))
    ok("stage counts match", {r["stage"]: r["jobs"] for r in calcs.get("stages", [])} == {"To apply": 1, "Applied": 1, "Talking": 2, "Offer": 1, "Closed": 2}, calcs.get("stages"))
    ok("coming up is open jobs with a date, soonest first, unclear last",
       [(r["company"], r["due"]) for r in calcs.get("coming_up", [])] == [("Umbrella Corp", "2026-10-09"), ("Hooli", "2026-10-13"), ("Acme Holdings, Inc.", "2026-10-14"), ("Initech", "2026-10-16"), ("Initech", UNCLEAR)],
       calcs.get("coming_up"))

    section("Damaged trackers are refused")
    for label, rows, header in (
        ("semicolons", [r.replace(",", ";") for r in ROWS[3:4]], HEADER.replace(",", ";")),
        ("a quote that never closes", ['"Acme Holdings, Inc.,Role,applied,,,,,,,,,,,,,,,,,'], HEADER),
    ):
        ws2 = os.path.join(tmp, "bad " + label)
        out2 = os.path.join(tmp, "bad out " + label)
        make_workspace(ws2, rows, with_page=False)
        with open(os.path.join(ws2, "jobs", "tracker.csv"), "w", encoding="utf-8-sig", newline="") as f:
            f.write("\n".join([header] + rows) + "\n")
        rb = run_builder(ws2, out2)
        ok("a tracker saved with %s is refused and nothing is written" % label, rb.returncode == 3 and not os.path.exists(out2), (rb.returncode, rb.stderr))

    section("Themed-page publish copy (--publish-copy)")
    rp = run_builder(ws, out, "--publish-copy")
    ok("publish copy builds", rp.returncode == 0, rp.stdout + rp.stderr)
    if rp.returncode != 0:
        return
    with open(os.path.join(ws, "pages", ".publish", "dashboard.html"), encoding="utf-8") as f:
        copy = f.read()
    m = re.search(r'<script type="application/json" id="data">([\s\S]*?)</script>', copy)
    block = m.group(1) if m else ""
    data = json.loads(block) if block else {}
    ok("starts with the layout line and has no wrapper of its own",
       copy.startswith('<script>document.documentElement.dataset.layout = "overview"</script>\n') and "<!doctype" not in copy.lower() and not re.search(r"<html\b|<meta charset|</html>", copy, re.I),
       copy[:200])
    ok("no contacts, activity log or name", data.get("contacts") == [] and "activity" not in data and "owner" not in data, sorted(data))
    allowed = {"company", "role", "status", "next", "due", "deadline", "applied", "heard", "interviewed"}
    ok("jobs keep only the allowed fields", all(set(j) <= allowed for j in data.get("jobs", [])), [sorted(set(j) - allowed) for j in data.get("jobs", [])])
    leaks = [w for w in FORBIDDEN if w in block]
    ok("no contact names, pay, links or locations in the data block", not leaks, leaks)
    ok("data block holds no raw < (escaped as \\u003c)", "<" not in block and "PMM </script>" in json.dumps(data["jobs"][3]["role"]) .replace("\\u003c", "<"), block[:200])
    nexts = [j.get("next") for j in data.get("jobs", [])]
    ok("next steps reduced to standard wording, unclear-date note kept", nexts == ["Interview 2026-10-15", "Follow up (date unclear)", None, "Decide: apply or skip"], nexts)
    ok("counts kept", data.get("week", {}).get("conversations") == 2 and data.get("goals", {}).get("applications") == 5 and data.get("streak") == 4, data.get("week"))


# ---------------------------------------------------------------- 3. lint the shipped page

class PageScan(HTMLParser):
    VOID = {"br", "img", "input", "meta", "link", "hr", "source", "wbr", "col", "area", "base", "embed", "track", "param"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []        # [tag, attrs, text parts]
        self.visible = []      # text outside <style>/<script>
        self.elements = []     # (tag, attrs, own text, ancestors' tags+attrs)
        self.tags = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append((tag, a))
        if tag in self.VOID:
            self.elements.append((tag, a, "", [(t, x) for t, x, _ in self.stack]))
            return
        self.stack.append([tag, a, []])

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                t, a, parts = self.stack[i]
                del self.stack[i:]
                text = "".join(parts)
                self.elements.append((t, a, text, [(x, y) for x, y, _ in self.stack]))
                for s in self.stack:
                    s[2].append(text)
                return

    def handle_data(self, data):
        if any(t in ("style", "script") for t, _, _ in self.stack):
            return
        self.visible.append(data)
        if self.stack:
            self.stack[-1][2].append(data)


def check_index():
    section("Shipped dashboard page (assets/dashboard-type-index.html)")
    with open(INDEX, "rb") as f:
        raw = f.read()
    ok("under 256 KB", len(raw) < 256 * 1024, len(raw))
    html = raw.decode("utf-8")
    p = PageScan()
    p.feed(html)
    p.close()
    visible = re.sub(r"<!--[\s\S]*?-->", "", "".join(p.visible))
    digits = re.findall(r"[^\s]*\d[^\s]*", visible)
    ok("no digits in visible text (every figure comes from a dataset)", not digits, digits)
    calc_ids = set(re.findall(r"dash\.calc\(\s*'([A-Za-z0-9_-]+)'", html))
    known = {"jobs", "week", "history"} | calc_ids
    sources = set()
    for _, a in p.tags:
        for s in (a.get("data-source") or "").split():
            sources.add(s)
    ok("every data-source is a built dataset or a calc on the page", sources and sources <= known, sorted(sources - known))
    ok("every dataset the builder makes is shown", {"jobs", "week", "history"} <= sources, sorted({"jobs", "week", "history"} - sources))
    bad_fields = []
    unmarked = []
    for tag, a, text, anc in p.elements:
        if "data-field" in a:
            if tag == "th":
                if not any(t == "table" and x.get("data-source") and x.get("data-row-key") for t, x in anc) and not a.get("data-source"):
                    bad_fields.append(("th", a))
            elif not a.get("data-source"):
                bad_fields.append((tag, a))
            elif text.strip() != "—":
                bad_fields.append((tag, a, text))
        elif text.strip() == "—" and not a.get("data-source") and not any(x.get("data-source") for _, x in anc):
            unmarked.append((tag, a))
    ok("every value element is marked (data-source + data-field) and holds only a placeholder", not bad_fields, bad_fields)
    ok("every placeholder sits in a marked element or chart", not unmarked, unmarked)
    tables = [(t, a) for t, a in p.tags if t == "table"]
    ok("tables are marked once with a row key", tables and all(a.get("data-source") and a.get("data-row-key") for _, a in tables), tables)
    ids = [a["id"] for _, a in p.tags if "id" in a]
    ok("element ids are unique", len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1])

    banned = {
        "script src / link / iframe / form / meta / base / object / embed": r"<(script[^>]*\ssrc|link|iframe|form|meta|base|object|embed)\b",
        "document wrapper tags": r"<(html|head|body)\b|<!doctype",
        "inline event handlers": r"<[^>]*\son[a-z]+\s*=",
        "CSS imports or url()": r"@import|url\(",
        "network calls": r"\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bimport\(",
        "browser storage or cookies": r"localStorage|sessionStorage|indexedDB|document\.cookie",
        "HTML injection": r"innerHTML|outerHTML|insertAdjacentHTML|\.html\(|document\.write|\beval\(|new Function",
        "font hosts": r"fonts\.googleapis|fonts\.gstatic|@font-face",
    }
    for label, rx in banned.items():
        hits = re.findall(rx, html, re.I)
        ok("no %s" % label, not hits, hits)
    urls = [u for u in re.findall(r"https?://[^\s'\"<>)]+", html) if u != "http://www.w3.org/2000/svg"]
    ok("no web addresses (except the SVG namespace)", not urls, urls)
    scripts = "\n".join(re.findall(r"<script>([\s\S]*?)</script>", html))
    ok("no arrays of numbers in the scripts", not re.search(r"\[\s*-?\d+(\.\d+)?\s*,\s*-?\d+", scripts), re.findall(r"\[\s*-?\d[^\]]*\]", scripts))
    ok("text from data is set as text only", "textContent" in scripts)
    ok("dark mode and theme come from the dashboard's tokens", "var(--color-fg)" in html and not re.search(r"(?<![-\w])#[0-9a-fA-F]{3,8}\b", re.sub(r"<script>[\s\S]*?</script>", "", html)))
    ok("reduced motion respected", "prefers-reduced-motion" in html)


def main():
    keep = "--keep" in sys.argv
    if not os.path.isfile(INDEX) or not os.path.isfile(BUILDER):
        print("could not find the dashboard page or builder")
        return 2
    check_index()
    if node_cmd():
        tmp = tempfile.mkdtemp(prefix="dash check ")
        try:
            check_builder(tmp)
        finally:
            if keep:
                print("\nkept %s" % tmp)
            else:
                shutil.rmtree(tmp, ignore_errors=True)
    else:
        print("\nnote  node isn't installed; the dataset builder checks were skipped")
        if os.environ.get("CI"):
            ok("node is available in CI", False)
    print("\ncheck-dashboard-type: passed %d, failed %d" % (passed, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
