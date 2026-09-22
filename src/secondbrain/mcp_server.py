"""Minimal stdio MCP server for Hermes/Claude/OpenCode integration."""

import json
import sys

from .core import Brain

TOOLS = [
    {
        "name": "search_memories",
        "description": "Search shared work memories across all projects.",
        "inputSchema": {"type": "object", "properties": {
            "query": {"type": "string"},
            "project": {"type": "string"},
            "limit": {"type": "integer", "default": 10},
        }, "required": ["query"]},
    },
    {
        "name": "project_context",
        "description": "Get recent and cross-project related memories.",
        "inputSchema": {"type": "object", "properties": {
            "project": {"type": "string"},
            "query": {"type": "string"},
        }, "required": ["project"]},
    },
    {
        "name": "create_memory",
        "description": "Save a structured summary of completed meaningful work in the shared Second Brain. Use before the final response after a feature, bug fix, decision, reusable learning, or verified configuration change. Include problem, root cause, solution, verification, changed files, and technologies. Never include secrets.",
        "inputSchema": {"type": "object", "properties": {
            "title": {"type": "string"},
            "content": {"type": "string"},
            "project": {"type": "string"},
            "type": {"type": "string", "default": "note"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "agent": {"type": "string"},
            "files": {"type": "array", "items": {"type": "string"}},
        }, "required": ["title", "content", "project"]},
    },
    {
        "name": "capture_latest_commit",
        "description": "Fallback capture of the latest git commit and worktree metadata. Prefer create_memory with an AI-written summary when the agent understands the completed work.",
        "inputSchema": {"type": "object", "properties": {
            "path": {"type": "string"},
            "agent": {"type": "string"},
        }},
    },
]


def _text(data):
    return {"content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False, indent=2)}]}


def call(name, args):
    brain = Brain()
    if name == "search_memories":
        return _text(brain.search(args.get("query", ""), args.get("project"), args.get("limit", 10)))
    if name == "project_context":
        return _text(brain.context(args["project"], args.get("query")))
    if name == "create_memory":
        mid = brain.capture(
            title=args["title"], content=args["content"], project=args["project"],
            type=args.get("type", "note"), tags=args.get("tags", []),
            agent=args.get("agent", "mcp-agent"), files=args.get("files", []),
        )
        return _text({"id": mid, "saved": True})
    if name == "capture_latest_commit":
        mid = brain.auto_capture(args.get("path") or ".", args.get("agent", "mcp-agent"))
        return _text({"id": mid, "saved": bool(mid)})
    raise ValueError(f"Unknown tool: {name}")


def serve():
    """Serve newline-delimited JSON-RPC over stdin/stdout."""
    for line in sys.stdin:
        try:
            req = json.loads(line)
            method = req.get("method")
            result = None
            if method == "initialize":
                result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                          "serverInfo": {"name": "secondbrain", "version": "0.1.0"}}
            elif method == "notifications/initialized":
                continue
            elif method == "tools/list":
                result = {"tools": TOOLS}
            elif method == "tools/call":
                params = req.get("params", {})
                result = call(params["name"], params.get("arguments", {}))
            else:
                result = {"error": {"code": -32601, "message": f"Method not found: {method}"}}
            if "id" in req:
                print(json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": result}), flush=True)
        except Exception as exc:
            if "id" in locals() and req.get("id") is not None:
                print(json.dumps({"jsonrpc": "2.0", "id": req.get("id"),
                                  "error": {"code": -32603, "message": str(exc)}}), flush=True)


if __name__ == "__main__":
    serve()
