"""Headless agent sessions for the journey harness: Claude Code and Codex, isolated.

Both drivers return a Transcript: every turn's user text, the assistant's text, every tool call
(with its input and result), hook events, and cost/usage, plus the raw event stream on disk.

ISOLATION (the reason this file exists; run.py refuses to run journeys if the canary fails)

Claude Code (checked with 2.1.296):
  --setting-sources project      user settings (~/.claude/settings.json: plugins, permissions,
                                 hooks, env) and user agents/skills are not loaded; the project's
                                 own .claude/settings.json is (hooks, ask/deny rules)
  --strict-mcp-config            no MCP server except the ones in --mcp-config ...
  --mcp-config {journey only}    ... which holds only approver.py (the permission-prompt stand-in)
  ENABLE_CLAUDEAI_MCP_SERVERS=false   no claude.ai connectors (Gmail, Calendar, Drive, ...)
  CLAUDE_CODE_DISABLE_AUTO_MEMORY=1   no auto-memory
  --disallowedTools ...          no tools that reach outside the session (push notifications,
                                 remote triggers, cron, worktrees, workflows, design sync); also
                                 AskUserQuestion, so questions come as plain text the simulated
                                 user can answer (the skills' Codex path)
  --settings {deny ...}          file tools may not touch the home folder (Read/Edit/Write(~/**))
                                 and shell commands that name it are denied
  --no-session-persistence       nothing written to ~/.claude/projects
  inherited CLAUDE*/CODEX* env vars are removed (no link back to the calling session)
  Auth is untouched (OAuth from the keychain), so no throwaway CLAUDE_CONFIG_DIR is needed.

  Permissions: headless sessions get no permission box, and an untrusted folder (a temp copy is
  never trusted, and trusting it would mean editing ~/.claude.json) has its project allow list
  ignored. So the project's allow list is passed again through --settings (what a trusted folder
  gets), the project's ask/deny rules and hooks still apply as written, and every would-be box
  goes to approver.py, which allows only work inside the temp workspace (plus named extra
  folders) and logs each request. Permission mode is the project default unless a journey asks
  for another (e.g. auto). bypassPermissions is never used: it would also skip the ask rules the
  journeys check.

Codex (checked with codex-cli 0.160.1):
  --ignore-user-config           ~/.codex/config.toml (MCP servers, plugins, profiles) not loaded;
                                 auth still comes from CODEX_HOME, untouched
  --disable apps/plugins/remote_plugin/browser_use*/computer_use/in_app_browser/memories/...
  -c memories.*=false            no memories read or written
  -s workspace-write -C <copy>   writes only inside the temp copy (reads are NOT confined: the
                                 Codex sandbox can read the whole disk; reported as a limit)
  --skip-git-repo-check
  project trust: a session flag cannot mark a folder trusted (Codex ignores projects.* from -c),
  and an untrusted folder's .codex/config.toml and .codex/hooks.json are not loaded. AGENTS.md and
  .agents/skills still load. So the project's settings are passed as -c overrides
  (project_doc_max_bytes, web_search, memories, and the hooks from .codex/hooks.json), with
  --dangerously-bypass-hook-trust so they run without a persisted trust record. The guard and the
  session-start hook therefore run exactly as wired in the project.
"""

import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
APPROVER = os.path.join(HERE, "approver.py")

CLAUDE_DISALLOWED = [
    "AskUserQuestion", "PushNotification", "RemoteTrigger", "CronCreate", "CronDelete",
    "ScheduleWakeup", "DesignSync", "EnterWorktree", "ExitWorktree", "Workflow",
]
CODEX_DISABLED = [
    "apps", "plugins", "remote_plugin", "browser_use", "browser_use_external",
    "browser_use_full_cdp_access", "computer_use", "in_app_browser", "in_app_local_automation",
    "memories", "image_generation", "tool_suggest", "skill_mcp_dependency_install",
    "realtime_conversation", "in_app_chat", "in_app_dictation",
]


def clean_env(extra=None):
    env = {k: v for k, v in os.environ.items()
           if not (k.startswith("CLAUDE") or k.startswith("CODEX_") and k != "CODEX_HOME"
                   or k in ("ENABLE_CLAUDEAI_MCP_SERVERS",))}
    env.update(extra or {})
    return env


class ToolCall(dict):
    """name, input (dict), result (str), is_error (bool), turn (int), sub (bool: in a subagent)."""


class Transcript:
    def __init__(self, app):
        self.app = app
        self.turns = []          # [{user, texts, final, calls, cost, error}]
        self.init = {}
        self.hooks = []          # [(event, name)]
        self.cost_usd = 0.0
        self.usage = {}
        self.errors = []         # infra/agent errors (strings)
        self.approvals = []      # approver.py log entries
        self.denials = []
        self.session_id = ""

    @property
    def calls(self):
        return [c for t in self.turns for c in t["calls"]]

    @property
    def texts(self):
        return [x for t in self.turns for x in t["texts"]]

    def all_text(self):
        return "\n".join(self.texts)

    def final(self):
        return self.turns[-1]["final"] if self.turns else ""

    def infra_failed(self):
        """True when the session never really ran (start failure, API error, no reply at all)."""
        if not self.turns:
            return True
        first = self.turns[0]
        return not first["texts"] and not first["calls"] and bool(first["error"])


# ------------------------------------------------------------------ Claude Code

class ClaudeSession:
    def __init__(self, ws, out_dir, model=None, budget=5.0, max_turns=80, timeout=1800,
                 permission_mode=None, extra_dirs=(), claude="claude"):
        self.ws = ws
        self.out_dir = out_dir
        self.timeout = timeout
        self.deadline = time.time() + timeout
        self.t = Transcript("claude")
        self.approver_log = os.path.join(out_dir, "approver.jsonl")
        self.raw = open(os.path.join(out_dir, "events.jsonl"), "a", encoding="utf-8")
        self.err = open(os.path.join(out_dir, "stderr.txt"), "a", encoding="utf-8")
        allow_dirs = [ws] + list(extra_dirs)
        mcp = {"mcpServers": {"journey": {
            "command": sys.executable, "args": ["-I", APPROVER],
            "env": {"JOURNEY_ALLOW_DIRS": os.pathsep.join(allow_dirs),
                    "JOURNEY_LOG": self.approver_log}}}}
        proj = {}
        try:
            with open(os.path.join(ws, ".claude", "settings.json"), encoding="utf-8") as f:
                proj = json.load(f)
        except (OSError, ValueError):
            pass
        settings = {"permissions": {
            "allow": list((proj.get("permissions") or {}).get("allow") or []),
            "deny": ["Read(~/**)", "Edit(~/**)", "Write(~/**)",
                     "Bash(*~/*)", "Bash(*$HOME*)", "Bash(*/Users/*)"],
        }}
        cmd = [claude, "-p", "--input-format", "stream-json", "--output-format", "stream-json",
               "--verbose", "--include-hook-events",
               "--setting-sources", "project",
               "--strict-mcp-config", "--mcp-config", json.dumps(mcp),
               "--permission-prompt-tool", "mcp__journey__approve",
               "--settings", json.dumps(settings),
               "--disallowedTools", ",".join(CLAUDE_DISALLOWED),
               "--max-turns", str(max_turns), "--max-budget-usd", str(budget),
               "--no-session-persistence"]
        if model:
            cmd += ["--model", model]
        if permission_mode:
            cmd += ["--permission-mode", permission_mode]
        for d in extra_dirs:
            cmd += ["--add-dir", d]
        self.cmd = cmd
        with open(os.path.join(out_dir, "command.json"), "w", encoding="utf-8") as f:
            json.dump({"cmd": cmd, "env_added": {"ENABLE_CLAUDEAI_MCP_SERVERS": "false",
                                                 "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"},
                       "env_removed": "every CLAUDE*/CODEX_* variable of the calling shell"}, f, indent=1)
        env = clean_env({"ENABLE_CLAUDEAI_MCP_SERVERS": "false",
                         "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"})
        self.q = queue.Queue()
        try:
            self.p = subprocess.Popen(cmd, cwd=ws, env=env, stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=self.err)
        except OSError as e:
            self.p = None
            self.t.errors.append("could not start claude: %s" % e)
            return
        threading.Thread(target=self._reader, daemon=True).start()
        self.tool_index = {}

    def _reader(self):
        for line in self.p.stdout:
            self.q.put(line.decode("utf-8", "replace"))
        self.q.put(None)

    def send(self, text):
        turn = {"user": text, "texts": [], "final": "", "calls": [], "cost": None, "error": ""}
        self.t.turns.append(turn)
        if not self.p or self.p.poll() is not None:
            turn["error"] = "session not running"
            return turn
        msg = {"type": "user", "message": {"role": "user", "content": text}}
        try:
            self.p.stdin.write((json.dumps(msg) + "\n").encode("utf-8"))
            self.p.stdin.flush()
        except OSError as e:
            turn["error"] = "write failed: %s" % e
            return turn
        while True:
            left = self.deadline - time.time()
            if left <= 0:
                turn["error"] = "timed out after %ss" % self.timeout
                self.t.errors.append(turn["error"])
                self.kill()
                return turn
            try:
                line = self.q.get(timeout=min(left, 30))
            except queue.Empty:
                continue
            if line is None:
                turn["error"] = turn["error"] or "claude exited (code %s)" % self.p.poll()
                return turn
            self.raw.write(line if line.endswith("\n") else line + "\n")
            self.raw.flush()
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if self._event(ev, turn):
                return turn

    def _event(self, ev, turn):
        typ = ev.get("type")
        n = len(self.t.turns) - 1
        if typ == "system":
            st = ev.get("subtype")
            if st == "init":
                self.t.init = ev
                self.t.session_id = ev.get("session_id", "")
            elif st in ("hook_started", "hook_response"):
                self.t.hooks.append((st, ev.get("hook_name", ""), str(ev.get("output", ""))[:400]))
        elif typ == "assistant":
            sub = bool(ev.get("parent_tool_use_id"))
            for c in (ev.get("message") or {}).get("content") or []:
                if c.get("type") == "text" and not sub:
                    turn["texts"].append(c.get("text", ""))
                elif c.get("type") == "tool_use":
                    call = ToolCall(name=c.get("name", ""), input=c.get("input") or {}, result="",
                                    is_error=False, turn=n, sub=sub, id=c.get("id"))
                    turn["calls"].append(call)
                    self.tool_index[c.get("id")] = call
        elif typ == "user":
            content = (ev.get("message") or {}).get("content")
            if isinstance(content, list):
                for c in content:
                    if c.get("type") == "tool_result":
                        call = self.tool_index.get(c.get("tool_use_id"))
                        if call is not None:
                            r = c.get("content")
                            if isinstance(r, list):
                                r = "\n".join(x.get("text", "") for x in r if isinstance(x, dict))
                            call["result"] = str(r)
                            call["is_error"] = bool(c.get("is_error"))
        elif typ == "result":
            turn["final"] = ev.get("result") or (turn["texts"][-1] if turn["texts"] else "")
            turn["cost"] = ev.get("total_cost_usd")
            if ev.get("total_cost_usd"):
                self.t.cost_usd = max(self.t.cost_usd, float(ev["total_cost_usd"]))
            self.t.usage = ev.get("modelUsage") or self.t.usage
            self.t.denials.extend(ev.get("permission_denials") or [])
            if ev.get("is_error") or ev.get("subtype") != "success":
                turn["error"] = "%s %s" % (ev.get("subtype"), ev.get("api_error_status") or "")
                self.t.errors.append(turn["error"])
            return True
        return False

    def kill(self):
        if self.p and self.p.poll() is None:
            self.p.kill()

    def close(self):
        if self.p and self.p.poll() is None:
            try:
                self.p.stdin.close()
                self.p.wait(timeout=30)
            except (OSError, subprocess.TimeoutExpired):
                self.kill()
        self.raw.close()
        self.err.close()
        if os.path.exists(self.approver_log):
            with open(self.approver_log, encoding="utf-8") as f:
                self.t.approvals = [json.loads(l) for l in f if l.strip()]
        return self.t


# ------------------------------------------------------------------ Codex

def _toml(v):
    if isinstance(v, dict):
        return "{" + ", ".join("%s = %s" % (k, _toml(x)) for k, x in v.items()
                               if k != "commandWindows") + "}"
    if isinstance(v, list):
        return "[" + ", ".join(_toml(x) for x in v) + "]"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return json.dumps(v)


def codex_project_overrides(ws):
    """The trusted-folder settings of the project (.codex/config.toml + hooks.json) as -c flags."""
    flags = ["-c", "project_doc_max_bytes=65536", "-c", 'web_search="live"',
             "-c", "memories.generate_memories=false", "-c", "memories.use_memories=false"]
    try:
        with open(os.path.join(ws, ".codex", "hooks.json"), encoding="utf-8") as f:
            hooks = json.load(f).get("hooks") or {}
    except (OSError, ValueError):
        hooks = {}
    for ev, v in hooks.items():
        flags += ["-c", "hooks.%s=%s" % (ev, _toml(v))]
    return flags


class CodexSession:
    def __init__(self, ws, out_dir, model=None, timeout=1800, codex="codex", **_ignored):
        self.ws = ws
        self.out_dir = out_dir
        self.timeout = timeout
        self.deadline = time.time() + timeout
        self.model = model
        self.codex = codex
        self.t = Transcript("codex")
        self.raw = open(os.path.join(out_dir, "events.jsonl"), "a", encoding="utf-8")
        self.err = open(os.path.join(out_dir, "stderr.txt"), "a", encoding="utf-8")
        self.common = ["--json", "--ignore-user-config", "--skip-git-repo-check",
                       "--dangerously-bypass-hook-trust"] + codex_project_overrides(ws)
        for f in CODEX_DISABLED:
            self.common += ["--disable", f]
        if model:
            self.common += ["-m", model]
        self.env = clean_env()
        with open(os.path.join(out_dir, "command.json"), "w", encoding="utf-8") as f:
            json.dump({"cmd": [codex, "exec"] + self.common + ["-s", "workspace-write", "-C", ws, "<prompt>"],
                       "env_removed": "every CLAUDE*/CODEX_* variable except CODEX_HOME"}, f, indent=1)

    def send(self, text):
        turn = {"user": text, "texts": [], "final": "", "calls": [], "cost": None, "error": ""}
        self.t.turns.append(turn)
        n = len(self.t.turns) - 1
        if self.t.session_id:
            cmd = [self.codex, "exec", "resume"] + self.common + [
                "-c", 'sandbox_mode="workspace-write"', self.t.session_id, text]
        else:
            cmd = [self.codex, "exec"] + self.common + ["-s", "workspace-write", "-C", self.ws, text]
        left = max(30, self.deadline - time.time())
        try:
            p = subprocess.run(cmd, cwd=self.ws, env=self.env, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=left)
            out, err, rc = p.stdout, p.stderr, p.returncode
        except subprocess.TimeoutExpired as e:
            out, err, rc = e.stdout or b"", e.stderr or b"", 124
            turn["error"] = "timed out after %ss" % self.timeout
        except OSError as e:
            turn["error"] = "could not start codex: %s" % e
            self.t.errors.append(turn["error"])
            return turn
        self.err.write(err.decode("utf-8", "replace"))
        for line in out.decode("utf-8", "replace").splitlines():
            self.raw.write(line + "\n")
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            typ = ev.get("type")
            if typ == "thread.started":
                self.t.session_id = ev.get("thread_id", "")
            elif typ == "turn.completed":
                u = ev.get("usage") or {}
                for k, v in u.items():
                    if isinstance(v, int):
                        self.t.usage[k] = self.t.usage.get(k, 0) + v
            elif typ == "turn.failed" or typ == "error":
                turn["error"] = str(ev.get("error") or ev.get("message"))[:300]
            elif typ == "item.completed":
                it = ev.get("item") or {}
                kind = it.get("type")
                if kind == "agent_message":
                    turn["texts"].append(it.get("text", ""))
                elif kind == "command_execution":
                    turn["calls"].append(ToolCall(name="shell", input={"command": it.get("command", "")},
                                                  result=it.get("aggregated_output", ""),
                                                  is_error=it.get("exit_code") not in (0, None),
                                                  turn=n, sub=False))
                elif kind == "mcp_tool_call":
                    turn["calls"].append(ToolCall(name="mcp__%s__%s" % (it.get("server"), it.get("tool")),
                                                  input=it.get("arguments") or {},
                                                  result=json.dumps(it.get("result"))[:4000],
                                                  is_error=bool(it.get("error")), turn=n, sub=False))
                elif kind == "file_change":
                    turn["calls"].append(ToolCall(name="apply_patch", input={"changes": it.get("changes")},
                                                  result=it.get("status", ""), is_error=False,
                                                  turn=n, sub=False))
                elif kind == "web_search":
                    turn["calls"].append(ToolCall(name="web_search", input={"query": it.get("query", "")},
                                                  result="", is_error=False, turn=n, sub=False))
                elif kind == "error":
                    msg = it.get("message", "")
                    if "bypass-hook-trust" not in msg:
                        self.t.errors.append(msg[:300])
                elif kind not in ("reasoning", "todo_list"):
                    turn["calls"].append(ToolCall(name=str(kind), input=it, result="", is_error=False,
                                                  turn=n, sub=False))
        self.raw.flush()
        turn["final"] = turn["texts"][-1] if turn["texts"] else ""
        if rc not in (0, None) and not turn["error"]:
            turn["error"] = "codex exited %s: %s" % (rc, err.decode("utf-8", "replace")[-300:])
        if turn["error"]:
            self.t.errors.append(turn["error"])
        return turn

    def kill(self):
        pass

    def close(self):
        self.raw.close()
        self.err.close()
        return self.t


def write_readable(t, path):
    """A plain-text transcript a person can skim."""
    with open(path, "w", encoding="utf-8") as f:
        f.write("# %s session %s\n\n" % (t.app, t.session_id))
        if t.init:
            f.write("tools: %s\nmcp_servers: %s\nmodel: %s\npermissionMode: %s\n\n" % (
                t.init.get("tools"), t.init.get("mcp_servers"), t.init.get("model"),
                t.init.get("permissionMode")))
        for i, turn in enumerate(t.turns):
            f.write("\n## Turn %d\n\nUSER: %s\n\n" % (i + 1, turn["user"]))
            for c in turn["calls"]:
                inp = json.dumps(c["input"])[:600]
                f.write("  [tool%s] %s %s\n" % (" (subagent)" if c.get("sub") else "", c["name"], inp))
                if c["result"]:
                    res = c["result"][:800].replace("\n", "\n      ")
                    f.write("      -> %s%s\n" % ("ERROR " if c["is_error"] else "", res))
            for x in turn["texts"]:
                f.write("\nASSISTANT: %s\n" % x)
            if turn["error"]:
                f.write("\n(error: %s)\n" % turn["error"])
        if t.approvals:
            f.write("\n## Permission prompts answered by approver.py\n")
            for a in t.approvals:
                f.write("- %s %s: %s (%s)\n" % (a["decision"], a["tool"],
                                                json.dumps(a["input"])[:200], a["reason"]))
        f.write("\ncost_usd: %s\nusage: %s\nerrors: %s\n" % (t.cost_usd, json.dumps(t.usage)[:800],
                                                          t.errors))


def which(name):
    return shutil.which(name)
