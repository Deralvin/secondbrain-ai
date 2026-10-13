import json
import os
import subprocess
import sys

import pytest

SRC = os.path.join(os.path.dirname(__file__), "..", "src")
sys.path.insert(0, os.path.abspath(SRC))

from secondbrain.core import Brain, detect_project, redact  # noqa: E402


@pytest.fixture
def brain(tmp_path):
    return Brain(home=str(tmp_path / "brain"))


@pytest.fixture
def git_repo(tmp_path):
    repo = tmp_path / "hrm-apps"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(
        ["git", "-C", str(repo), "remote", "add", "origin",
         "git@github.com:acme/hrm-apps.git"],
        check=True,
    )
    return repo


# ---------- redaction ----------

def test_redact_strips_api_keys_and_tokens():
    text = "used OPENAI_API_KEY=sk-abc123def and password: hunter2 to login"
    out = redact(text)
    assert "sk-abc123def" not in out
    assert "hunter2" not in out
    assert "[REDACTED]" in out


def test_redact_keeps_normal_text():
    text = "Fixed form validation using GetX validator on employee form."
    assert redact(text) == text


# ---------- project detection ----------

def test_detect_project_from_git_repo(git_repo):
    proj = detect_project(str(git_repo))
    assert proj["name"] == "hrm-apps"
    assert proj["git_remote"] == "git@github.com:acme/hrm-apps.git"


def test_detect_project_from_subdirectory(git_repo):
    sub = git_repo / "lib" / "features"
    sub.mkdir(parents=True)
    proj = detect_project(str(sub))
    assert proj["name"] == "hrm-apps"


def test_detect_project_without_git_defaults_to_dirname(tmp_path):
    folder = tmp_path / "lonely-app"
    folder.mkdir()
    proj = detect_project(str(folder))
    assert proj["name"] == "lonely-app"
    assert proj["git_remote"] is None


# ---------- capture ----------

def test_capture_creates_memory_with_project_and_tags(brain):
    mid = brain.capture(
        title="Fix error validasi form employee",
        content="Tambahkan GlobalKey<FormState> dan validator.",
        project="hrm-apps",
        path="/fake/hrm-apps",
        git_remote=None,
        type="bug_fix",
        tags=["flutter", "getx", "form"],
        agent="hermes",
        files=["lib/features/employee/form.dart"],
    )
    mem = brain.show(mid)
    assert mem["title"] == "Fix error validasi form employee"
    assert mem["project"] == "hrm-apps"
    assert set(mem["tags"]) == {"flutter", "getx", "form"}
    assert mem["type"] == "bug_fix"
    assert mem["agent"] == "hermes"
    assert mem["files"] == ["lib/features/employee/form.dart"]


def test_capture_redacts_secrets(brain):
    mid = brain.capture(
        title="Login fix",
        content="set API_KEY=sk-supersecret then call dio",
        project="crm-apps",
    )
    mem = brain.show(mid)
    assert "sk-supersecret" not in mem["content"]
    assert "[REDACTED]" in mem["content"]


def test_capture_same_project_reused(brain):
    brain.capture(title="a", content="x", project="hrm-apps")
    brain.capture(title="b", content="y", project="hrm-apps")
    projects = brain.projects()
    assert len(projects) == 1
    assert projects[0]["name"] == "hrm-apps"


# ---------- search ----------

def test_search_finds_by_keyword(brain):
    brain.capture(title="Firebase notification", content="pod deintegrate lalu pod install", project="inventory-apps", tags=["firebase"])
    brain.capture(title="GetX routing", content="routing pakai GetPage", project="hrm-apps", tags=["getx"])
    hits = brain.search("firebase pod")
    assert len(hits) == 1
    assert hits[0]["title"] == "Firebase notification"


def test_search_finds_by_tag(brain):
    brain.capture(title="GetX routing", content="GetPage bindings", project="hrm-apps", tags=["getx", "flutter"])
    hits = brain.search("getx")
    assert len(hits) == 1


def test_search_filter_by_project(brain):
    brain.capture(title="Form validation", content="validator form", project="hrm-apps")
    brain.capture(title="Form validation", content="validator form", project="crm-apps")
    hits = brain.search("form", project="crm-apps")
    assert len(hits) == 1
    assert hits[0]["project"] == "crm-apps"


# ---------- context (cross-project reuse) ----------

def test_context_includes_cross_project_related(brain):
    brain.capture(
        title="Form validation pattern",
        content="GlobalKey<FormState> + validator reusable",
        project="hrm-apps",
        tags=["flutter", "form"],
    )
    ctx = brain.context(project="crm-apps")
    titles = [m["title"] for m in ctx["related_cross_project"]]
    assert "Form validation pattern" in titles
    assert ctx["project"] == "crm-apps"


def test_context_recent_memories(brain):
    brain.capture(title="m1", content="first", project="hrm-apps")
    brain.capture(title="m2", content="second", project="hrm-apps")
    ctx = brain.context(project="hrm-apps")
    titles = [m["title"] for m in ctx["recent"]]
    assert "m2" in titles and "m1" in titles


# ---------- relations ----------

def test_link_memories_creates_relation(brain):
    a = brain.capture(title="a", content="a", project="hrm-apps")
    b = brain.capture(title="b", content="b", project="crm-apps")
    brain.link(a, b, kind="reuses_pattern")
    mem = brain.show(b)
    rels = [r for r in mem["relations"]]
    assert any(r["from_id"] == a and r["to_id"] == b and r["kind"] == "reuses_pattern" for r in rels)


# ---------- auto-capture from git ----------

def test_auto_capture_summarizes_git_changes(brain, git_repo):
    (git_repo / "main.dart").write_text("void main() {}\n")
    subprocess.run(["git", "-C", str(git_repo), "add", "."], check=True)
    subprocess.run(
        ["git", "-C", str(git_repo), "-c", "user.email=t@t", "-c", "user.name=t",
         "commit", "-qm", "feat: employee form"],
        check=True,
    )
    mid = brain.auto_capture(path=str(git_repo), agent="claude-code")
    mem = brain.show(mid)
    assert mem["project"] == "hrm-apps"
    assert mem["agent"] == "claude-code"
    assert "employee form" in mem["content"]


def test_auto_capture_twice_skips_duplicate(brain, git_repo):
    (git_repo / "a.txt").write_text("1")
    subprocess.run(["git", "-C", str(git_repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(git_repo), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "one"], check=True)
    brain.auto_capture(path=str(git_repo), agent="claude-code")
    (git_repo / "b.txt").write_text("2")
    subprocess.run(["git", "-C", str(git_repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(git_repo), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "two"], check=True)
    brain.auto_capture(path=str(git_repo), agent="claude-code")
    # third run with no new commits -> no new memory
    result = brain.auto_capture(path=str(git_repo), agent="claude-code")
    assert result is None


def test_auto_capture_uncommitted_worktree(brain, git_repo):
    (git_repo / "lib.dart").write_text("class Employee {}\n")
    mid = brain.auto_capture(path=str(git_repo), agent="hermes")
    mem = brain.show(mid)
    assert mem["project"] == "hrm-apps"
    assert mem["agent"] == "hermes"
    assert mem["type"] == "work_session"
    assert "lib.dart" in mem["files"]


def test_auto_capture_uncommitted_duplicate_is_skipped(brain, git_repo):
    (git_repo / "lib.dart").write_text("class Employee {}\n")
    brain.auto_capture(path=str(git_repo), agent="hermes")
    assert brain.auto_capture(path=str(git_repo), agent="hermes") is None


# ---------- list / stats ----------

def test_list_filters_by_project_and_type(brain):
    brain.capture(title="x", content="x", project="hrm-apps", type="bug_fix")
    brain.capture(title="y", content="y", project="crm-apps", type="feature")
    only_hrm = brain.list_memories(project="hrm-apps")
    assert [m["title"] for m in only_hrm] == ["x"]
    only_feat = brain.list_memories(type="feature")
    assert [m["title"] for m in only_feat] == ["y"]


def test_stats_counts(brain):
    brain.capture(title="x", content="x", project="hrm-apps", tags=["flutter"])
    brain.capture(title="y", content="y", project="crm-apps", tags=["flutter"])
    s = brain.stats()
    assert s["memories"] == 2
    assert s["projects"] == 2
    assert s["tags"]["flutter"] == 2


def test_update_and_delete_memory(brain):
    mid = brain.capture(title="original title", content="secret api_key=sk-123456789", project="hrm-apps", tags=["tag1"])
    # test update
    updated = brain.update(mid, title="new title", tags=["tag1", "tag2"], content="updated content")
    assert updated["title"] == "new title"
    assert "tag2" in updated["tags"]
    assert updated["content"] == "updated content"
    # test delete
    assert brain.delete(mid) is True
    assert brain.show(mid) is None
    assert brain.delete(mid) is False

