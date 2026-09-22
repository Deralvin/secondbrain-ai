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
        result = {"nodes": nodes, "links": links}
    else:
        raise ValueError(f"unknown action: {action}")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
