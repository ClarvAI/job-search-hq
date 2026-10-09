#!/usr/bin/env bash
# Parity checks between the Claude Code and Codex halves of the workspace, and the blank starter files:
#  1. every .claude/skills/<name>/SKILL.md has a Codex wrapper .agents/skills/<name>/SKILL.md, with the
#     same name and the identical description (Codex-only chat skills under .agents/ are fine);
#  2. templates/blank/ holds no real-looking email addresses or phone numbers (only example.com-style
#     addresses and 555 numbers), and its preferences.md starts out as "SETUP: not done".
# Usage: bash scripts/ci/check-parity.sh      Exits 1 on any problem.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$REPO" || exit 2
PY=""
for c in python3 python; do "$c" -c 'import json' >/dev/null 2>&1 && { PY="$c"; break; }; done
[ -n "$PY" ] || { echo "python is needed"; exit 2; }
"$PY" - <<'PY'
import os, re, sys
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
sys.exit(1 if bad else 0)
PY
