"""Permission-prompt stand-in for journey sessions (Claude Code --permission-prompt-tool).

A tiny MCP server over stdio (newline-delimited JSON-RPC, Python stdlib only) with one tool,
`approve`. Claude Code calls it whenever a tool use would show the user a permission box: an
"ask" rule in the project settings (edits to profile/master-resume.md or preferences.md), a
shell command not on the allow list, a file outside the folder. It plays a careful user who
clicks Allow only for work inside the throwaway workspace (and the extra folders the journey
names), and Deny for everything else. Every request is logged as one JSON line, so journeys
can assert that the ask rules really fired and that nothing reached outside.

Environment:
    JOURNEY_ALLOW_DIRS  os.pathsep-separated folders the session may touch (workspace first)
    JOURNEY_LOG         file to append one JSON line per request to
"""

import json
import os
import re
import sys

sys.dont_write_bytecode = True

ALLOW = [os.path.realpath(p) for p in os.environ.get("JOURNEY_ALLOW_DIRS", "").split(os.pathsep) if p]
LOG = os.environ.get("JOURNEY_LOG", "")
HOME = os.path.realpath(os.path.expanduser("~"))

FILE_TOOLS = {"Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep"}
# Words that mean a shell command reaches outside the machine or the folder on purpose.
# "~/x", "~user", a bare "~"; not Excel lock files like "folder/~$x" or "~\$x".
HOME_TILDE = re.compile(r"(?<![\w/.-])~(?=/|$|\s|[A-Za-z_])")
NET_WORDS = re.compile(r"\b(curl|wget|nc|ncat|ssh|scp|sftp|rsync|ftp|telnet|sendmail|mail|osascript|open)\b")


def inside(path):
    if not path:
        return False
    p = os.path.realpath(os.path.expanduser(path))
    for a in ALLOW:
        if p == a or p.startswith(a + os.sep):
            return True
    return False


def decide(tool, args):
    """Returns (allow?, reason)."""
    if tool in FILE_TOOLS:
        path = args.get("file_path") or args.get("notebook_path") or args.get("path") or ""
        if not path:
            return True, "no path (defaults to the workspace)"
        if not os.path.isabs(os.path.expanduser(path)):
            return True, "relative path"
        return (True, "inside allowed folders") if inside(path) else (False, "outside the workspace")
    if tool in ("Bash", "PowerShell"):
        cmd = str(args.get("command", ""))
        if HOME_TILDE.search(cmd) or "$HOME" in cmd or "${HOME}" in cmd:
            return False, "mentions the home folder"
        if NET_WORDS.search(cmd):
            return False, "network or app-launching command"
        for m in re.finditer(r"(/[^\s'\"`;|&<>()]+)", cmd):
            p = m.group(1)
            if p.startswith(HOME) and not inside(p):
                return False, "path in the home folder outside the workspace: %s" % p
            if p.startswith(("/Users/", "/home/")) and not inside(p):
                return False, "path in a home folder: %s" % p
        return True, "shell command inside the workspace"
    if tool.startswith("mcp__"):
        return False, "MCP tools are never approved in journeys"
    if tool in ("WebFetch", "WebSearch", "Skill", "Task", "Agent", "TodoWrite", "ToolSearch"):
        return True, "harmless built-in"
    return False, "not on the journey allow list"


def log(entry):
    if not LOG:
        return
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def reply(msg_id, result=None, error=None):
    out = {"jsonrpc": "2.0", "id": msg_id}
    if error is not None:
        out["error"] = error
    else:
        out["result"] = result
    sys.stdout.write(json.dumps(out) + "\n")
    sys.stdout.flush()


TOOL = {
    "name": "approve",
    "description": "Permission prompt handler for automated test sessions. Not for direct use.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "tool_name": {"type": "string"},
            "input": {"type": "object"},
            "tool_use_id": {"type": "string"},
        },
        "required": ["tool_name", "input"],
    },
}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        method = msg.get("method")
        mid = msg.get("id")
        if method == "initialize":
            pv = (msg.get("params") or {}).get("protocolVersion") or "2025-06-18"
            reply(mid, {"protocolVersion": pv, "capabilities": {"tools": {}},
                        "serverInfo": {"name": "journey-approver", "version": "1.0"}})
        elif method == "tools/list":
            reply(mid, {"tools": [TOOL]})
        elif method == "tools/call":
            params = msg.get("params") or {}
            a = params.get("arguments") or {}
            tool = str(a.get("tool_name", ""))
            args = a.get("input") or {}
            ok, why = decide(tool, args)
            log({"tool": tool, "input": args, "decision": "allow" if ok else "deny", "reason": why})
            body = {"behavior": "allow", "updatedInput": args} if ok else \
                   {"behavior": "deny", "message": "The user declined this (%s)." % why}
            reply(mid, {"content": [{"type": "text", "text": json.dumps(body)}]})
        elif method == "ping":
            reply(mid, {})
        elif mid is not None:
            reply(mid, error={"code": -32601, "message": "method not found"})


if __name__ == "__main__":
    main()
