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
