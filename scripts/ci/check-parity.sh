#!/usr/bin/env bash
# Parity checks between the Claude Code and Codex halves of the workspace, and the blank starter files:
#  1. every .claude/skills/<name>/SKILL.md has a Codex wrapper .agents/skills/<name>/SKILL.md, with the
#     same name and the identical description (Codex-only chat skills under .agents/ are fine);
#  2. templates/blank/ holds no real-looking email addresses or phone numbers (only example.com-style
#     addresses and 555 numbers), and its preferences.md starts out as "SETUP: not done";
#  3. the blank CSVs start with a UTF-8 BOM and hold only their comma-separated header line;
#  4. no JSON data block in templates/blank/pages/*.html holds a raw "</" (escape "<" as \u003c).
#  5. the eight copies of the panels' csvdate.ts are identical, and so are their csvdate.test.ts copies;
#  6. every review agent in .claude/agents/ has a .codex/agents/ twin with the identical description;
#  7. AGENTS.md stays within its size budget (30000 bytes).
#  8. Codex skill-picker metadata is well formed; the blank preferences keep their language: line.
# Usage: bash scripts/ci/check-parity.sh      Exits 1 on any problem.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$REPO" || exit 2
PY=""
for c in python3 python; do "$c" -c 'import json' >/dev/null 2>&1 && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "python is needed"; exit 2; }
"$PY" - <<'PY'
import json, os, re, sys
bad = 0
def fail(msg):
    global bad
    bad += 1
    print("FAIL  " + msg)

def front(path):
    """name and description from a SKILL.md front matter (single-line or folded values)."""
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    out, key = {}, None
    for line in lines[1:]:
        if line.strip() == "---":
            break
        m = re.match(r"^([A-Za-z_-]+):\s*(.*)$", line)
        if m:
            key, val = m.group(1), m.group(2).strip()
            if val in (">", "|", ">-", "|-"):
                val = ""
            out[key] = val
        elif key and line.startswith((" ", "\t")):
            out[key] = (out[key] + " " + line.strip()).strip()
    for k, v in list(out.items()):
        if len(v) >= 2 and v[0] == '"' and v[-1] == '"':
            v = v[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        elif len(v) >= 2 and v[0] == "'" and v[-1] == "'":
            v = v[1:-1].replace("''", "'")
        out[k] = v
    return out

# 1. Skills
n = 0
for name in sorted(os.listdir(".claude/skills")):
    c = os.path.join(".claude/skills", name, "SKILL.md")
    if not os.path.isfile(c):
        continue  # a mod (panel) folder without a skill
    n += 1
    a = os.path.join(".agents/skills", name, "SKILL.md")
    cf = front(c)
    if not cf or "description" not in cf:
        fail(c + ": no front matter description"); continue
    if cf.get("name") != name:
        fail("%s: name is %r, folder is %r" % (c, cf.get("name"), name))
    if not os.path.isfile(a):
        fail("%s has no Codex wrapper at %s" % (c, a)); continue
    af = front(a)
    if not af or af.get("name") != name:
        fail("%s: name should be %r" % (a, name)); continue
    if af.get("description") != cf.get("description"):
        fail("%s and %s have different descriptions" % (c, a)); continue
    print("ok    skill %s" % name)
print("skills: %d checked" % n)
if n == 0:
    fail("no skills found")

# 2. Blank starter files
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})")
OK_DOMAINS = re.compile(r"(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$", re.I)
PHONE = re.compile(r"(?<![\w.-])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-](\d{4})(?![\w-])")
blank = "templates/blank"
if not os.path.isdir(blank):
    fail("templates/blank is missing")
else:
    setup = False; files = 0
    for d, _, names in os.walk(blank):
        for fn in names:
            p = os.path.join(d, fn)
            try:
                text = open(p, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            files += 1
            for m in EMAIL.finditer(text):
                if not OK_DOMAINS.search(m.group(1)):
                    fail("%s: real-looking email address %s" % (p, m.group(0)))
            for m in PHONE.finditer(text):
                if m.group(2) != "555":
                    fail("%s: real-looking phone number %s" % (p, m.group(0)))
            if fn == "preferences.md":
                if re.search(r"(?m)^SETUP: not done", text):
                    setup = True
                else:
                    fail(p + ' does not contain "SETUP: not done"')
    if not setup:
        fail('no templates/blank/**/preferences.md with "SETUP: not done"')
    else:
        print("ok    templates/blank: %d text files, no real contact details, setup starts as not done" % files)

# 3. Blank CSVs: a UTF-8 BOM (so Excel on Windows reads accents right) and the header line only.
csvs = 0
for d, _, names in os.walk(blank):
    for fn in sorted(names):
        if not fn.endswith(".csv"):
            continue
        p = os.path.join(d, fn)
        raw = open(p, "rb").read()
        csvs += 1
        if not raw.startswith(b"\xef\xbb\xbf"):
            fail(p + ": should start with a UTF-8 BOM")
        lines = [l for l in raw.decode("utf-8-sig").splitlines() if l.strip()]
        if len(lines) != 1:
            fail("%s: should hold only the header line (has %d lines)" % (p, len(lines)))
        elif ";" in lines[0] or "," not in lines[0]:
            fail(p + ": the header should be comma-separated")
print("ok    templates/blank: %d CSV files checked (BOM, header only)" % csvs)

# 4. Page data blocks: JSON inside <script type="application/json"> must not hold a raw "</"
#    (it would end the script element early; write it as \u003c/). Checked in the blank pages.
DATA = re.compile(r"<script\b[^>]*\btype\s*=\s*[\"']application/json[\"'][^>]*>(.*?)</script", re.S | re.I)
pages = os.path.join(blank, "pages")
blocks = 0
if os.path.isdir(pages):
    for fn in sorted(os.listdir(pages)):
        if not fn.endswith(".html"):
            continue
        p = os.path.join(pages, fn)
        text = open(p, encoding="utf-8").read()
        for m in DATA.finditer(text):
            blocks += 1
            if "</" in m.group(1):
                fail('%s: a data block contains a raw "</" (escape "<" as \\u003c)' % p)
            if "<!--" in m.group(1):
                fail('%s: a data block contains "<!--" (escape "<" as \\u003c)' % p)
print("ok    templates/blank/pages: %d data blocks checked for raw \"</\"" % blocks)

# 5. The panels' shared CSV/date helpers: every mod carries its own copy of csvdate.ts; all must match.
copies = sorted(os.path.join(".claude/skills", m, "hooks/csvdate.ts") for m in os.listdir(".claude/skills")
                if os.path.isfile(os.path.join(".claude/skills", m, "hooks/csvdate.ts")))
if copies:
    first = open(copies[0], "rb").read()
    diff = [c for c in copies[1:] if open(c, "rb").read() != first]
    for c in diff:
        fail("%s differs from %s (change all copies of csvdate.ts together)" % (c, copies[0]))
    if not diff:
        print("ok    csvdate.ts: %d identical copies" % len(copies))
    if len(copies) < 8:
        fail("expected csvdate.ts in 8 mods, found %d" % len(copies))

# 6. ...and their tests: every mod that carries csvdate.ts carries the same tests/csvdate.test.ts.
tests = []
for c in copies:
    t = os.path.join(os.path.dirname(os.path.dirname(c)), "tests", "csvdate.test.ts")
    if os.path.isfile(t):
        tests.append(t)
    else:
        fail("%s has no tests/csvdate.test.ts next to it" % os.path.dirname(os.path.dirname(c)))
if tests:
    first = open(tests[0], "rb").read()
    diff = [t for t in tests[1:] if open(t, "rb").read() != first]
    for t in diff:
        fail("%s differs from %s (change all copies of csvdate.test.ts together)" % (t, tests[0]))
    if not diff:
        print("ok    csvdate.test.ts: %d identical copies" % len(tests))

# 7. Review agents: each .claude/agents/<name>.md has a Codex twin .codex/agents/<name>.toml with the
#    same name and the identical description.
TOML_STR = re.compile(r'^(name|description)\s*=\s*("(?:[^"\\]|\\.)*")\s*$', re.M)
agents = 0
for fn in sorted(os.listdir(".claude/agents")):
    if not fn.endswith(".md"):
        continue
    agents += 1
    name = fn[:-3]
    c = os.path.join(".claude/agents", fn)
    x = os.path.join(".codex/agents", name + ".toml")
    cf = front(c) or {}
    if cf.get("name") != name:
        fail("%s: name is %r, file is %r" % (c, cf.get("name"), name))
    if not os.path.isfile(x):
        fail("%s has no Codex twin at %s" % (c, x)); continue
    xf = {k: json.loads(v) for k, v in TOML_STR.findall(open(x, encoding="utf-8").read())}
    if xf.get("name") != name:
        fail("%s: name should be %r" % (x, name))
    elif xf.get("description") != cf.get("description"):
        fail("%s and %s have different descriptions" % (c, x))
    else:
        print("ok    agent %s" % name)
for fn in sorted(os.listdir(".codex/agents")):
    if fn.endswith(".toml") and not os.path.isfile(os.path.join(".claude/agents", fn[:-5] + ".md")):
        fail(".codex/agents/%s has no .claude/agents twin" % fn)
if agents == 0:
    fail("no review agents found in .claude/agents")

# 8. AGENTS.md is read in full at the start of every Codex session (and by Claude through CLAUDE.md):
#    keep it within budget so it isn't cut off and doesn't crowd out the conversation.
BUDGET = 30000
size = os.path.getsize("AGENTS.md")
if size > BUDGET:
    fail("AGENTS.md is %d bytes; keep it at %d or less (move detail into the skills or the playbook)" % (size, BUDGET))
else:
    print("ok    AGENTS.md: %d bytes (budget %d)" % (size, BUDGET))

# 9. Codex skill-picker metadata (.agents/skills/<name>/agents/openai.yaml): a quoted display_name and a
#    quoted short_description of 25-64 characters, for a skill that exists.
YAML_KEY = re.compile(r'^\s+(display_name|short_description):\s*"([^"]*)"\s*$', re.M)
metas = 0
for name in sorted(os.listdir(".agents/skills")):
    y = os.path.join(".agents/skills", name, "agents", "openai.yaml")
    if not os.path.isfile(y):
        continue
    metas += 1
    keys = dict(YAML_KEY.findall(open(y, encoding="utf-8").read()))
    sd = keys.get("short_description", "")
    if not keys.get("display_name"):
        fail("%s: needs a quoted display_name" % y)
    elif not 25 <= len(sd) <= 64:
        fail("%s: short_description should be 25-64 characters (has %d)" % (y, len(sd)))
    else:
        print("ok    codex metadata %s" % name)

# 10. The blank preferences keep the conversation-language line that start fills in.
prefs = open("templates/blank/profile/preferences.md", encoding="utf-8").read()
if not re.search(r"^language:", prefs, re.M):
    fail("templates/blank/profile/preferences.md has no 'language:' line")
else:
    print("ok    blank preferences have a language: line")
sys.exit(1 if bad else 0)
PY
