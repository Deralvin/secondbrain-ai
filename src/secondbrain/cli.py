"""secondbrain — global CLI entry point."""

import argparse
import json
import os
import sys

from .core import Brain, detect_project


def _print_mem(mem, verbose=False):
    tags = ",".join(mem["tags"]) or "-"
    print(f"[{mem['id']}] {mem['title']}")
    print(f"    project={mem['project']} type={mem['type']} agent={mem['agent'] or '-'} tags={tags}")
    if verbose:
        print(f"    date={mem['created_at']}")
        for line in mem["content"].splitlines():
            print(f"    | {line}")
        if mem["files"]:
            print(f"    files: {', '.join(mem['files'][:10])}")
        for r in mem.get("relations", []):
            print(f"    rel: {r['from_id']} -[{r['kind']}]-> {r['to_id']}")


def _brain():
    return Brain()


def cmd_context(args):
    brain = _brain()
    path = args.path or os.getcwd()
    proj = detect_project(path)
    ctx = brain.context(project=proj["name"], query=args.query)
    if args.json:
        print(json.dumps({"detected_project": proj, **ctx}, ensure_ascii=False, indent=2))
        return
    print(f"PROJECT: {proj['name']}  (root: {proj['root']})")
    print("\nRECENT MEMORIES:")
    if not ctx["recent"]:
        print("  (none)")
    for m in ctx["recent"]:
        print(f"  [{m['id']}] {m['title']}  ({m['project']}, {m['type']})")
    print("\nRELATED FROM OTHER PROJECTS:")
    if not ctx["related_cross_project"]:
        print("  (none)")
    for m in ctx["related_cross_project"]:
        print(f"  [{m['id']}] {m['title']}  ({m['project']}, {m['type']})")


def cmd_capture(args):
    brain = _brain()
    path = args.path or os.getcwd()
    proj = detect_project(path)
    mid = brain.capture(
        title=args.title,
        content=args.content or "",
        project=args.project or proj["name"],
        git_remote=proj["git_remote"],
        type=args.type,
        tags=args.tags.split(",") if args.tags else [],
        agent=args.agent,
        files=args.files.split(",") if args.files else [],
    )
    print(f"captured [{mid}] -> project={args.project or proj['name']}")


def cmd_search(args):
    brain = _brain()
    hits = brain.search(args.query, project=args.project, limit=args.limit)
    if not hits:
        print("no memories found")
        return
    for m in hits:
        _print_mem(m, verbose=args.verbose)


def cmd_list(args):
    brain = _brain()
    for m in brain.list_memories(project=args.project, type=args.type,
                                 limit=args.limit):
        _print_mem(m, verbose=args.verbose)


def cmd_show(args):
    brain = _brain()
    mem = brain.show(args.id)
    if not mem:
        print("not found")
        sys.exit(1)
    _print_mem(mem, verbose=True)


def cmd_link(args):
    brain = _brain()
    brain.link(args.from_id, args.to_id, kind=args.kind)
    print(f"linked {args.from_id} -[{args.kind}]-> {args.to_id}")


def cmd_stats(args):
    brain = _brain()
    s = brain.stats()
    if args.json:
        print(json.dumps(s, indent=2))
        return
    print(f"memories: {s['memories']}  projects: {s['projects']}")
    for t, c in sorted(s["tags"].items(), key=lambda x: -x[1]):
        print(f"  #{t}: {c}")


def cmd_projects(args):
    brain = _brain()
    for p in brain.projects():
        print(f"{p['name']}  memories={p['memories']}  remote={p['git_remote'] or '-'}")


def cmd_autocapture(args):
    brain = _brain()
    path = args.path or os.getcwd()
    mid = brain.auto_capture(path=path, agent=args.agent)
    if mid:
        print(f"auto-captured [{mid}] from git")
    else:
        print("no new commit to capture")


def cmd_export(args):
    brain = _brain()
    data = {
        "projects": brain.projects(),
        "memories": brain.list_memories(limit=100000),
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"exported {len(data['memories'])} memories to {args.out}")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="secondbrain",
                                 description="Local-first cross-project work memory")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("context", help="project context for the current dir")
    p.add_argument("--query", default=None)
    p.add_argument("--path", default=None)
    p.add_argument("--json", action="store_true")
    p.set_defaults(fn=cmd_context)

    p = sub.add_parser("capture", help="save a memory")
    p.add_argument("title")
    p.add_argument("--content", default="")
    p.add_argument("--project", default=None)
    p.add_argument("--type", default="note")
    p.add_argument("--tags", default=None, help="comma separated")
    p.add_argument("--agent", default=None)
    p.add_argument("--files", default=None, help="comma separated")
    p.add_argument("--path", default=None)
    p.set_defaults(fn=cmd_capture)

    p = sub.add_parser("search", help="search memories")
    p.add_argument("query")
    p.add_argument("--project", default=None)
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("-v", "--verbose", action="store_true")
    p.set_defaults(fn=cmd_search)

    p = sub.add_parser("list", help="list memories")
    p.add_argument("--project", default=None)
    p.add_argument("--type", default=None)
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("-v", "--verbose", action="store_true")
    p.set_defaults(fn=cmd_list)

    p = sub.add_parser("show", help="show one memory")
    p.add_argument("id")
    p.set_defaults(fn=cmd_show)

    p = sub.add_parser("link", help="link two memories")
    p.add_argument("from_id")
    p.add_argument("to_id")
    p.add_argument("--kind", default="related")
    p.set_defaults(fn=cmd_link)

    p = sub.add_parser("stats", help="global stats")
    p.add_argument("--json", action="store_true")
    p.set_defaults(fn=cmd_stats)

    p = sub.add_parser("projects", help="list known projects")
    p.set_defaults(fn=cmd_projects)

    p = sub.add_parser("auto-capture", help="capture latest git commit as memory")
    p.add_argument("--agent", default=None)
    p.add_argument("--path", default=None)
    p.set_defaults(fn=cmd_autocapture)

    p = sub.add_parser("export", help="export all memories to JSON")
    p.add_argument("--out", default="secondbrain-export.json")
    p.set_defaults(fn=cmd_export)

    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
