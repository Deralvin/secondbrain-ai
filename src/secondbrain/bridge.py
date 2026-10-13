"""JSON bridge for the Next.js dashboard. Keeps SQLite access in Python stdlib."""
import json
import sys

from .core import Brain


def main():
    request = json.loads(sys.stdin.read() or "{}")
    brain = Brain()
    action = request.get("action")
    if action == "memories":
        result = brain.search(request.get("query", ""), request.get("project"), request.get("limit", 100)) if request.get("query") else brain.list_memories(request.get("project"), limit=request.get("limit", 100))
    elif action == "projects":
        result = brain.projects()
    elif action == "stats":
        result = brain.stats()
    elif action == "graph":
        memories = brain.list_memories(limit=500)
        nodes, links, seen = [], [], set()
        def add(node):
            if node["id"] not in seen:
                seen.add(node["id"])
                nodes.append(node)
        for memory in memories:
            memory_id = f"memory:{memory['id']}"
            project_id = f"project:{memory['project']}"
            add({"id": project_id, "label": memory["project"], "type": "project"})
            add({"id": memory_id, "label": memory["title"], "type": "memory", "project": memory["project"], "memory": memory})
            links.append({"source": memory_id, "target": project_id, "kind": "belongs_to"})
            if memory.get("agent"):
                agent_id = f"agent:{memory['agent']}"
                add({"id": agent_id, "label": memory["agent"], "type": "agent"})
                links.append({"source": memory_id, "target": agent_id, "kind": "created_by"})
            for tag in memory["tags"]:
                tag_id = f"tag:{tag}"
                add({"id": tag_id, "label": tag, "type": "tag"})
                links.append({"source": memory_id, "target": tag_id, "kind": "tagged"})

        # Fetch memory-to-memory relations
        raw_relations = brain.conn.execute(
            "SELECT from_id, to_id, kind FROM relations"
        ).fetchall()
        rel_map = {}
        for r in raw_relations:
            f, t, k = r["from_id"], r["to_id"], r["kind"]
            rel_map.setdefault(f, []).append({"from_id": f, "to_id": t, "kind": k, "direction": "outgoing"})
            rel_map.setdefault(t, []).append({"from_id": f, "to_id": t, "kind": k, "direction": "incoming"})

        for node in nodes:
            if node["type"] == "memory" and node.get("memory"):
                node["memory"]["relations"] = rel_map.get(node["memory"]["id"], [])

        for r in raw_relations:
            source_id = f"memory:{r['from_id']}"
            target_id = f"memory:{r['to_id']}"
            if source_id in seen and target_id in seen:
                links.append({
                    "source": source_id,
                    "target": target_id,
                    "kind": r["kind"],
                    "is_relation": True,
                })

        result = {"nodes": nodes, "links": links}
    elif action == "memory":
        result = brain.show(request.get("id"))
    elif action == "create_memory":
        mid = brain.capture(
            title=request["title"],
            content=request["content"],
            project=request["project"],
            type=request.get("type", "note"),
            tags=request.get("tags", []),
            files=request.get("files", []),
            agent=request.get("agent", "manual"),
        )
        result = {"id": mid, "success": True}
    elif action == "update_memory":
        updated = brain.update(
            mid=request["id"],
            title=request.get("title"),
            content=request.get("content"),
            type=request.get("type"),
            tags=request.get("tags"),
            files=request.get("files"),
            project=request.get("project"),
        )
        if not updated:
            raise ValueError(f"memory not found: {request.get('id')}")
        result = {"memory": updated, "success": True}
    elif action == "delete_memory":
        ok = brain.delete(request["id"])
        if not ok:
            raise ValueError(f"memory not found: {request.get('id')}")
        result = {"id": request["id"], "success": True}
    else:
        raise ValueError(f"unknown action: {action}")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
