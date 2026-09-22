"""Core library: storage, project detection, search, relations, auto-capture."""

import datetime
import hashlib
import os
import re
import sqlite3
import subprocess
import uuid

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    git_remote TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'note',
    project_id INTEGER REFERENCES projects(id),
    tags TEXT DEFAULT '[]',
    files TEXT DEFAULT '[]',
    agent TEXT,
    created_at TEXT NOT NULL,
    git_commit TEXT,
    dedup_hash TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS relations (
    from_id TEXT NOT NULL REFERENCES memories(id),
    to_id TEXT NOT NULL REFERENCES memories(id),
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_id);
"""

_SECRET_PATTERNS = [
    # common token formats
    re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b"),
]

_KV_SECRET = re.compile(
    r"(?i)((?:api|secret|token|password|passwd|pwd|access|openai|anthropic|"
    r"github|google|aws|firebase)[_-]?(?:key|token|secret)?"
    r"(?:\s*[=:]\s*))\S+"
)


def redact(text: str) -> str:
    """Replace secrets-looking strings with [REDACTED]."""
    if not text:
        return text
    out = text
    for pat in _SECRET_PATTERNS:
        out = pat.sub("[REDACTED]", out)
    out = _KV_SECRET.sub(r"\1[REDACTED]", out)
    return out


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _git(path, *args, check=False):
    try:
        res = subprocess.run(
            ["git", "-C", path, *args],
            capture_output=True, text=True, timeout=15,
        )
        if check and res.returncode != 0:
            raise RuntimeError(res.stderr)
        return res.stdout.strip() if res.returncode == 0 else ""
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""


def detect_project(path: str):
    """Walk up from path to find a git root; fall back to dirname."""
    cur = os.path.abspath(path)
    git_remote = None
    while True:
        if os.path.isdir(os.path.join(cur, ".git")):
            url = _git(cur, "remote", "get-url", "origin")
            if url:
                git_remote = url
            return {"name": os.path.basename(cur), "root": cur, "git_remote": git_remote}
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    return {"name": os.path.basename(os.path.abspath(path)),
            "root": os.path.abspath(path), "git_remote": None}


class Brain:
    def __init__(self, home: str = None):
        self.home = home or os.environ.get(
            "SECONDBRAIN_HOME",
            os.path.expanduser("~/.secondbrain"),
        )
        os.makedirs(self.home, exist_ok=True)
        self.db_path = os.path.join(self.home, "brain.db")
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    # ---------- internal ----------

    def _project_id(self, name, git_remote=None):
        row = self.conn.execute(
            "SELECT id FROM projects WHERE name = ?", (name,)).fetchone()
        if row:
            if git_remote:
                self.conn.execute(
                    "UPDATE projects SET git_remote = ? WHERE id = ?",
                    (git_remote, row["id"]))
                self.conn.commit()
            return row["id"]
        cur = self.conn.execute(
            "INSERT INTO projects (name, git_remote, created_at) VALUES (?,?,?)",
            (name, git_remote, _now()))
        self.conn.commit()
        return cur.lastrowid

    @staticmethod
    def _row_to_memory(row):
        if row is None:
            return None
        mem = dict(row)
        mem["tags"] = _loads(mem.get("tags") or "[]")
        mem["files"] = _loads(mem.get("files") or "[]")
        return mem

    # ---------- capture ----------

    def capture(self, title, content, project, path=None, git_remote=None,
                type="note", tags=None, agent=None, files=None,
                git_commit=None, dedup_key=None):
        pid = self._project_id(project, git_remote)
        tags = sorted(set(t.strip() for t in (tags or []) if t and t.strip()))
        files = files or []
        dedup = dedup_key or hashlib.sha256(
            f"{project}|{title}|{content}".encode()).hexdigest()
        mid = str(uuid.uuid4())[:8]
        try:
            self.conn.execute(
                "INSERT INTO memories (id,title,content,type,project_id,tags,"
                "files,agent,created_at,git_commit,dedup_hash) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (mid, title, redact(content), type, pid,
                 _dumps(tags), _dumps(files), agent, _now(), git_commit, dedup))
            self.conn.commit()
        except sqlite3.IntegrityError:
            existing = self.conn.execute(
                "SELECT id FROM memories WHERE dedup_hash = ?",
                (dedup,)).fetchone()
            return existing["id"] if existing else mid
        return mid

    # ---------- query ----------

    def show(self, mid):
        row = self.conn.execute(
            "SELECT m.*, p.name AS project FROM memories m "
            "JOIN projects p ON p.id = m.project_id WHERE m.id = ?",
            (mid,)).fetchone()
        if not row:
            return None
        mem = self._row_to_memory(row)
        rels = self.conn.execute(
            "SELECT r.from_id, r.to_id, r.kind FROM relations r "
            "WHERE r.from_id = ? OR r.to_id = ?", (mid, mid)).fetchall()
        mem["relations"] = [dict(r) for r in rels]
        return mem

    def list_memories(self, project=None, type=None, limit=50):
        q = ("SELECT m.*, p.name AS project FROM memories m "
             "JOIN projects p ON p.id = m.project_id WHERE 1=1")
        args = []
        if project:
            q += " AND p.name = ?"
            args.append(project)
        if type:
            q += " AND m.type = ?"
            args.append(type)
        q += " ORDER BY m.created_at DESC LIMIT ?"
        args.append(limit)
        rows = self.conn.execute(q, args).fetchall()
        return [self._row_to_memory(r) for r in rows]

    def search(self, query, project=None, limit=20):
        """Naive but effective: LIKE across title/content/tags with word AND."""
        words = [w for w in re.split(r"\s+", query.strip()) if w]
        if not words:
            return self.list_memories(project=project, limit=limit)
        q = ("SELECT m.*, p.name AS project FROM memories m "
             "JOIN projects p ON p.id = m.project_id WHERE 1=1")
        args = []
        for w in words:
            q += " AND (m.title LIKE ? OR m.content LIKE ? OR m.tags LIKE ?)"
            like = f"%{w}%"
            args.extend([like, like, like])
        if project:
            q += " AND p.name = ?"
            args.append(project)
        q += " ORDER BY m.created_at DESC LIMIT ?"
        args.append(limit)
        rows = self.conn.execute(q, args).fetchall()
        return [self._row_to_memory(r) for r in rows]

    def projects(self):
        rows = self.conn.execute(
            "SELECT p.*, COUNT(m.id) AS memories FROM projects p "
            "LEFT JOIN memories m ON m.project_id = p.id "
            "GROUP BY p.id ORDER BY memories DESC").fetchall()
        return [dict(r) for r in rows]

    def stats(self):
        memories = self.conn.execute("SELECT COUNT(*) c FROM memories").fetchone()["c"]
        projects = self.conn.execute("SELECT COUNT(*) c FROM projects").fetchone()["c"]
        tags = {}
        for row in self.conn.execute("SELECT tags FROM memories"):
            for t in _loads(row["tags"] or "[]"):
                tags[t] = tags.get(t, 0) + 1
        return {"memories": memories, "projects": projects, "tags": tags}

    # ---------- context ----------

    def context(self, project, query=None, limit=5):
        recent = [m for m in self.list_memories(project=project, limit=limit)]
        if query:
            related = self.search(query, limit=limit)
        else:
            related = self.list_memories(limit=limit)
        cross = [m for m in related if m["project"] != project][:limit]
        return {
            "project": project,
            "recent": recent,
            "related_cross_project": cross,
        }

    # ---------- relations ----------

    def link(self, from_id, to_id, kind="related"):
        self.conn.execute(
            "INSERT INTO relations (from_id, to_id, kind, created_at) "
            "VALUES (?,?,?,?)", (from_id, to_id, kind, _now()))
        self.conn.commit()

    # ---------- auto-capture from git ----------

    def auto_capture(self, path, agent=None):
        """Capture the newest commit or uncommitted state of a project."""
        proj = detect_project(path)
        commit = _git(proj["root"], "rev-parse", "HEAD") or None
        dirty = "\n".join(l for l in _git(
            proj["root"], "status", "--porcelain").splitlines() if l.strip())
        if commit and not dirty:
            existing = self.conn.execute(
                "SELECT id FROM memories WHERE git_commit = ?", (commit,)).fetchone()
        else:
            worktree_hash = hashlib.sha256(
                ((commit or "") + "|" + dirty).encode()).hexdigest()
            existing = self.conn.execute(
                "SELECT id FROM memories WHERE dedup_hash = ?",
                ("worktree:" + worktree_hash,)).fetchone()
        if existing:
            return None
        if commit:
            subject = _git(proj["root"], "log", "-1", "--pretty=%s")
            body = _git(proj["root"], "log", "-1", "--pretty=%b")
            files = [l.split("\t", 1)[-1] for l in
                     _git(proj["root"], "diff-tree", "--no-commit-id",
                          "--name-only", "-r", commit).splitlines() if l.strip()]
        else:
            subject = ""
            body = ""
            files = [l[3:] for l in _git(
                proj["root"], "status", "--porcelain").splitlines()
                     if len(l) > 3 and l[3:].strip()]
        dirty = "\n".join(l for l in _git(
            proj["root"], "status", "--porcelain").splitlines() if l.strip())
        if not subject:
            subject = "work session"
            if dirty:
                subject += " (uncommitted changes)"
        content = (subject or "work session") + \
            (("\n\n" + body) if body else "") + \
            (("\n\nFiles:\n" + "\n".join(files)) if files else "")
        dirty2 = "\n".join(l for l in _git(
            proj["root"], "status", "--porcelain").splitlines() if l.strip())
        if dirty2:
            content += "\n\nUncommitted:\n" + dirty2
        dedup = f"git:{commit}" if (commit and not dirty2) else "worktree:" + hashlib.sha256(
            ((commit or "") + "|" + dirty2).encode()).hexdigest()
        return self.capture(
            title=subject or "work session",
            content=content,
            project=proj["name"],
            git_remote=proj["git_remote"],
            type="work_session",
            agent=agent,
            files=files,
            git_commit=commit,
            dedup_key=dedup,
        )


def _dumps(obj):
    import json
    return json.dumps(obj, ensure_ascii=False)


def _loads(s):
    import json
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return []
