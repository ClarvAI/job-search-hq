#!/usr/bin/env python3
"""Token and size budget for the instructions an agent loads (HANDOFF P1-14).

    python3 scripts/ci/journeys/budget.py            # sizes only, no model calls
    python3 scripts/ci/journeys/budget.py --live     # also measures real startup tokens (costs a few cents)
    python3 scripts/ci/journeys/budget.py --json out.json

What it reports
- Always loaded at startup: Claude Code = CLAUDE.md (which imports AGENTS.md) + every skill's
  name/description + every agent's description; Codex = AGENTS.md + .agents/skills descriptions +
  .codex/agents descriptions.
- Per skill, when it runs: SKILL.md, plus the reference files it names (its own references/,
  knowledge/*.md, other skills' references). "max" = SKILL.md + everything it names.
- Repeated sentences (60+ characters, normalized) that appear in more than one instruction file.
- --live: a trivial isolated `claude -p` turn ("Reply with OK") in a throwaway copy of the
  workspace and in an empty folder, same flags as the journeys; the difference in the first API
  call's input tokens is what this workspace adds to every Claude Code session (instructions,
  skill and agent descriptions, the session-start note). Codex: `codex debug prompt-input` with
  the project's settings, if the CLI has it.

Token figures without --live are estimates at 2.9 bytes per token: on 2026-10-13 a --live run
measured 18,319 added tokens for 52.8 KB of startup text with Claude Code 2.1.296 (Claude's
current tokenizer counts more tokens per byte than older ones). Codex's tokenizer differs. Python 3.8+ standard library only.
"""

import sys
sys.dont_write_bytecode = True
import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from e2e_common import REPO, make_workspace, temp_dir  # noqa: E402

BPT = 2.9


def rd(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def size(path):
    return len(rd(path).encode("utf-8"))


def frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n", text.replace("\r", ""), re.S)
    return m.group(1) if m else ""


def desc_bytes(path):
    """Bytes of the name + description that an app keeps in context for a skill or agent."""
    fm = frontmatter(rd(path))
    keep = [l for l in fm.splitlines() if re.match(r"^(name|description)\s*[:=]", l)]
    return len("\n".join(keep).encode("utf-8"))


def toml_desc_bytes(path):
    t = rd(path)
    keep = [l for l in t.splitlines() if re.match(r"^(name|description)\s*=", l)]
    return len("\n".join(keep).encode("utf-8"))


def tok(b):
    return int(round(b / BPT))


REF = re.compile(r"(?:\.claude/skills/[\w-]+/)?references/[\w.-]+\.md|knowledge/[\w.-]+\.md|"
                 r"\.claude/agents/[\w-]+\.md|templates/[\w/.-]+\.md")


def skill_refs(name, text):
    out = []
    for m in sorted(set(REF.findall(text))):
        if m.startswith("references/"):
            p = os.path.join(".claude", "skills", name, m)
        else:
            p = m
        if os.path.isfile(os.path.join(REPO, p)) and p not in out:
            out.append(p)
    return out


def static_report():
    os.chdir(REPO)
    rep = {"bytes_per_token_estimate": BPT}
    sk = sorted(d for d in os.listdir(".claude/skills") if os.path.isfile(os.path.join(".claude/skills", d, "SKILL.md")))
    claude_desc = sum(desc_bytes(os.path.join(".claude/skills", d, "SKILL.md")) for d in sk)
    agents = sorted(f for f in os.listdir(".claude/agents") if f.endswith(".md"))
    agent_desc = sum(desc_bytes(os.path.join(".claude/agents", f)) for f in agents)
    a, c = size("AGENTS.md"), size("CLAUDE.md")
    rep["claude_startup"] = {"AGENTS.md": a, "CLAUDE.md": c, "skill descriptions (%d)" % len(sk): claude_desc,
                             "agent descriptions (%d)" % len(agents): agent_desc}
    rep["claude_startup"]["total"] = a + c + claude_desc + agent_desc
    cx = sorted(d for d in os.listdir(".agents/skills") if os.path.isfile(os.path.join(".agents/skills", d, "SKILL.md")))
    cx_desc = sum(desc_bytes(os.path.join(".agents/skills", d, "SKILL.md")) for d in cx)
    cxa = sorted(f for f in os.listdir(".codex/agents") if f.endswith(".toml")) if os.path.isdir(".codex/agents") else []
    cxa_desc = sum(toml_desc_bytes(os.path.join(".codex/agents", f)) for f in cxa)
    rep["codex_startup"] = {"AGENTS.md": a, "skill descriptions (%d)" % len(cx): cx_desc,
                            "agent descriptions (%d)" % len(cxa): cxa_desc}
    rep["codex_startup"]["total"] = a + cx_desc + cxa_desc
    skills = []
    for d in sk:
        p = os.path.join(".claude/skills", d, "SKILL.md")
        t = rd(p)
        refs = skill_refs(d, t)
        rb = sum(size(r) for r in refs)
        skills.append({"skill": d, "SKILL.md": size(p), "description": desc_bytes(p), "refs": refs,
                       "refs_bytes": rb, "max": size(p) + rb})
    rep["skills"] = sorted(skills, key=lambda x: -x["max"])
    rep["duplicates"] = duplicates(["AGENTS.md", "CLAUDE.md"] + [os.path.join(".claude/skills", d, "SKILL.md") for d in sk])
    return rep


def sentences(text):
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    for s in re.split(r"(?<=[.!?])\s+|\n", text):
        n = re.sub(r"[`*_\[\]()]", "", s).strip().lower()
        n = re.sub(r"\s+", " ", n)
        if len(n) >= 60:
            yield n


def duplicates(files):
    seen = {}
    for f in files:
        for s in set(sentences(rd(f))):
            seen.setdefault(s, []).append(f)
    dup = [{"sentence": s, "files": fs, "bytes_repeated": len(s) * (len(fs) - 1)}
           for s, fs in seen.items() if len(fs) > 1]
    return sorted(dup, key=lambda x: -x["bytes_repeated"])


def first_call_input(events):
    for l in events.splitlines():
        try:
            e = json.loads(l)
        except ValueError:
            continue
        if e.get("type") == "result":
            u = e.get("usage") or {}
            it = (u.get("iterations") or [u])[0]
            return sum(int(it.get(k) or 0) for k in ("input_tokens", "cache_read_input_tokens",
                                                       "cache_creation_input_tokens")), e.get("total_cost_usd")
    return None, None


def live_claude(model):
    from sessions import clean_env
    out = {}
    base = temp_dir("budget")
    ws = make_workspace(base)
    empty = os.path.join(base, "empty")
    os.makedirs(empty)
    home = os.path.join(base, "home")
    os.makedirs(home)
    for label, cwd in (("workspace", ws), ("empty folder", empty)):
        proj = {}
        try:
            with open(os.path.join(cwd, ".claude", "settings.json"), encoding="utf-8") as f:
                proj = json.load(f)
        except (OSError, ValueError):
            pass
        settings = {"env": {"HOME": home}, "permissions": {"allow": list((proj.get("permissions") or {}).get("allow") or [])}}
        cmd = ["claude", "-p", "--output-format", "stream-json", "--verbose", "--setting-sources", "project",
               "--strict-mcp-config", "--no-session-persistence", "--settings", json.dumps(settings),
               "--max-budget-usd", "0.5", "--model", model, "Reply with just: OK"]
        r = subprocess.run(cmd, cwd=cwd, env=clean_env({"ENABLE_CLAUDEAI_MCP_SERVERS": "false",
                                                         "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}),
                           stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
        n, cost = first_call_input(r.stdout.decode("utf-8", "replace"))
        out[label] = {"first_call_input_tokens": n, "cost_usd": cost}
    if out["workspace"]["first_call_input_tokens"] and out["empty folder"]["first_call_input_tokens"]:
        out["added_by_workspace"] = out["workspace"]["first_call_input_tokens"] - out["empty folder"]["first_call_input_tokens"]
    return out


def live_codex():
    if not shutil.which("codex"):
        return {"error": "codex CLI not found"}
    base = temp_dir("budget-codex")
    ws = make_workspace(base)
    from sessions import codex_project_overrides, clean_env
    cmd = ["codex", "debug", "prompt-input"] + codex_project_overrides(ws) + ["Reply with just: OK"]
    r = subprocess.run(cmd, cwd=ws, env=clean_env(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, timeout=120)
    txt = r.stdout.decode("utf-8", "replace")
    if r.returncode != 0:
        return {"error": r.stderr.decode("utf-8", "replace")[-400:]}
    base_cmd = ["codex", "debug", "prompt-input", "Reply with just: OK"]
    empty = os.path.join(base, "empty")
    os.makedirs(empty)
    r0 = subprocess.run(base_cmd, cwd=empty, env=clean_env(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, timeout=120)
    t0 = r0.stdout.decode("utf-8", "replace") if r0.returncode == 0 else ""
    return {"prompt_input_bytes": len(txt.encode("utf-8")), "empty_folder_bytes": len(t0.encode("utf-8")),
            "added_bytes": len(txt.encode("utf-8")) - len(t0.encode("utf-8")) if t0 else None,
            "agents_md_included": "# Job Search HQ" in txt,
            "skills_listed": len(set(re.findall(r"agents/skills/([\w-]+)/SKILL\.md", txt)))}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--model", default="claude-haiku-5-5", help="model for --live (startup size is model-independent)")
    ap.add_argument("--json")
    args = ap.parse_args()
    rep = static_report()
    if args.live:
        rep["live_claude"] = live_claude(args.model)
        rep["live_codex"] = live_codex()
    for app in ("claude_startup", "codex_startup"):
        print("\n%s (bytes ~ tokens)" % app)
        for k, v in rep[app].items():
            print("  %-34s %7d  ~%6d" % (k, v, tok(v)))
    print("\nskills by size when loaded (bytes): SKILL.md / + references it names = max")
    for s in rep["skills"]:
        print("  %-18s %6d  %6d  = %6d  ~%5d tok  (%d refs)" % (s["skill"], s["SKILL.md"], s["refs_bytes"], s["max"],
                                                              tok(s["max"]), len(s["refs"])))
    print("\nrepeated sentences across instruction files: %d (%d bytes repeated)" % (
        len(rep["duplicates"]), sum(d["bytes_repeated"] for d in rep["duplicates"])))
    for d in rep["duplicates"][:15]:
        print("  %4d B  %s\n         in %s" % (d["bytes_repeated"], d["sentence"][:110], ", ".join(d["files"])))
    if args.live:
        print("\nlive:", json.dumps(rep["live_claude"]), json.dumps(rep["live_codex"]))
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(rep, f, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
