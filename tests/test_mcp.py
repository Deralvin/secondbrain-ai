import json
import os
import sys

import pytest

SRC = os.path.join(os.path.dirname(__file__), "..", "src")
sys.path.insert(0, os.path.abspath(SRC))

from secondbrain import mcp_server  # noqa: E402


@pytest.fixture(autouse=True)
def brain_home(tmp_path, monkeypatch):
    home = tmp_path / "brain"
    monkeypatch.setenv("SECONDBRAIN_HOME", str(home))
    yield home


def _result(name, args):
    out = mcp_server.call(name, args)
    return json.loads(out["content"][0]["text"])


def test_tools_list_shape():
    names = [t["name"] for t in mcp_server.TOOLS]
    assert names == ["search_memories", "project_context",
                     "create_memory", "capture_latest_commit"]


def test_create_and_search_roundtrip():
    out = _result("create_memory", {
        "title": "Firebase fix",
        "content": "pod deintegrate lalu pod install --repo-update",
        "project": "inventory-apps",
        "agent": "hermes",
        "tags": ["firebase", "ios"],
    })
    assert out.get("saved") is True
    hits = _result("search_memories", {"query": "firebase pod"})
    assert any(m["title"] == "Firebase fix" for m in hits)


def test_project_context_cross_project():
    _result("create_memory", {
        "title": "Form validation pattern",
        "content": "GlobalKey<FormState>",
        "project": "hrm-apps",
        "agent": "hermes",
    })
    ctx = _result("project_context", {"project": "crm-apps", "query": "form"})
    assert any(m["title"] == "Form validation pattern"
               for m in ctx["related_cross_project"])
    assert all(m["project"] != "crm-apps" for m in ctx["related_cross_project"])


def test_unknown_tool_raises():
    with pytest.raises(ValueError):
        _result("nope", {})
