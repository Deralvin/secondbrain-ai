import json
import os
import subprocess
import sys

SRC = os.path.join(os.path.dirname(__file__), "..", "src")
sys.path.insert(0, os.path.abspath(SRC))


def _bridge(request, env_home):
    env = dict(os.environ, SECONDBRAIN_HOME=env_home)
    result = subprocess.run(
        [sys.executable, "-m", "secondbrain.bridge"],
        input=json.dumps(request), text=True, capture_output=True,
        cwd=os.path.join(os.path.dirname(__file__), ".."), env=env, check=True,
    )
    return json.loads(result.stdout)


def test_bridge_memories(tmp_path):
    home = tmp_path / "brain"
    from secondbrain.core import Brain
    Brain(home=str(home)).capture(
        title="Bridge memory", content="works", project="hrm-apps", agent="hermes")
    out = _bridge({"action": "memories", "project": None, "limit": 10}, str(home))
    assert out[0]["title"] == "Bridge memory"


def test_bridge_stats(tmp_path):
    home = tmp_path / "brain"
    from secondbrain.core import Brain
    Brain(home=str(home)).capture(title="a", content="a", project="p1")
    out = _bridge({"action": "stats"}, str(home))
    assert out["memories"] == 1 and out["projects"] == 1


def test_bridge_graph(tmp_path):
    home = tmp_path / "brain"
    from secondbrain.core import Brain
    Brain(home=str(home)).capture(
        title="Graph memory", content="c", project="crm-apps",
        tags=["flutter"], agent="claude-code")
    out = _bridge({"action": "graph"}, str(home))
    ids = [n["id"] for n in out["nodes"]]
    assert "project:crm-apps" in ids
    assert "tag:flutter" in ids
    assert "agent:claude-code" in ids
    assert any(n["id"].startswith("memory:") for n in out["nodes"])
    assert len(out["links"]) == 3


def test_bridge_graph_with_relations(tmp_path):
    home = tmp_path / "brain"
    from secondbrain.core import Brain
    b = Brain(home=str(home))
    m1 = b.capture(title="Mem 1", content="c1", project="p1")
    m2 = b.capture(title="Mem 2", content="c2", project="p1")
    b.link(m1, m2, kind="reuses_pattern")
    out = _bridge({"action": "graph"}, str(home))

    # Check relation link
    rel_links = [l for l in out["links"] if l.get("is_relation")]
    assert len(rel_links) == 1
    assert rel_links[0]["source"] == f"memory:{m1}"
    assert rel_links[0]["target"] == f"memory:{m2}"
    assert rel_links[0]["kind"] == "reuses_pattern"

    # Check memory node has relations attached
    mem1_node = next(n for n in out["nodes"] if n["id"] == f"memory:{m1}")
    assert len(mem1_node["memory"]["relations"]) == 1
    assert mem1_node["memory"]["relations"][0]["kind"] == "reuses_pattern"
    assert mem1_node["memory"]["relations"][0]["direction"] == "outgoing"

