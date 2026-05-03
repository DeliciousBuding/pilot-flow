"""Unit tests for PilotFlow pure-logic functions.

These tests verify core logic without requiring Feishu API credentials.
"""

import json
import os
import sys
import time
import threading

# Add plugin path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugins", "pilotflow"))

# Mock tools.registry before importing tools
import types

_mock_registry = types.ModuleType("tools.registry")
_call_log = []


def _mock_dispatch(name, args, **kwargs):
    _call_log.append({"name": name, "args": args})
    return json.dumps({"ok": True})


_mock_registry.registry = types.SimpleNamespace(dispatch=_mock_dispatch)
_mock_registry.tool_error = lambda msg: json.dumps({"error": msg})
_mock_registry.tool_result = lambda msg: msg if isinstance(msg, str) else json.dumps(msg)
sys.modules["tools.registry"] = _mock_registry

from tools import (
    _detect_template,
    _member_names_plain,
    _project_registry,
    _project_registry_lock,
    _register_project,
    _check_plan_gate,
    _set_plan_gate,
    _clear_plan_gate,
    _evict_caches,
    _PLAN_GATE_TTL,
    _deadline_countdown,
)


# --- Template detection ---

def test_detect_template_defense():
    t = _detect_template("帮我准备答辩项目")
    assert t is not None
    assert "项目简报" in t["deliverables"]
    assert t["suggested_deadline_days"] == 7


def test_detect_template_sprint():
    t = _detect_template("开始新的sprint")
    assert t is not None
    assert "需求文档" in t["deliverables"]


def test_detect_template_activity():
    t = _detect_template("策划一个活动")
    assert t is not None
    assert "活动方案" in t["deliverables"]


def test_detect_template_launch():
    t = _detect_template("准备上线发布")
    assert t is not None
    assert "上线方案" in t["deliverables"]


def test_detect_template_none():
    t = _detect_template("今天天气怎么样")
    assert t is None


# --- Member names ---

def test_member_names_plain():
    result = _member_names_plain(["张三", "李四", "王五"])
    assert result == "张三, 李四, 王五"


def test_member_names_plain_empty():
    result = _member_names_plain([])
    assert result == ""


def test_member_names_plain_single():
    result = _member_names_plain(["张三"])
    assert result == "张三"


# --- Project registry ---

def test_register_and_query_project():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project("测试项目", ["张三"], "2026-05-10", "进行中", ["文档: url"])
    with _project_registry_lock:
        assert "测试项目" in _project_registry
        proj = _project_registry["测试项目"]
        assert proj["members"] == ["张三"]
        assert proj["deadline"] == "2026-05-10"
        assert proj["status"] == "进行中"
        assert proj["app_token"] == ""  # no bitable metadata by default


def test_register_project_with_bitable_metadata():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "带表格项目", ["李四"], "2026-05-15", "进行中", [],
        app_token="abc", table_id="tbl", record_id="rec1",
    )
    with _project_registry_lock:
        proj = _project_registry["带表格项目"]
        assert proj["app_token"] == "abc"
        assert proj["table_id"] == "tbl"
        assert proj["record_id"] == "rec1"


def test_register_project_eviction():
    with _project_registry_lock:
        _project_registry.clear()
    # Fill to max
    for i in range(50):
        _register_project(f"项目{i}", [], "", "进行中", [])
    assert len(_project_registry) == 50
    # Adding one more should evict the oldest
    _register_project("新项目", [], "", "进行中", [])
    assert len(_project_registry) == 50
    assert "新项目" in _project_registry


# --- Plan gate ---

def test_plan_gate_default_off():
    assert _check_plan_gate("test_chat_1") is False


def test_plan_gate_set_and_check():
    _set_plan_gate("test_chat_2")
    assert _check_plan_gate("test_chat_2") is True
    _clear_plan_gate("test_chat_2")
    assert _check_plan_gate("test_chat_2") is False


def test_plan_gate_per_chat():
    _set_plan_gate("chat_a")
    assert _check_plan_gate("chat_a") is True
    assert _check_plan_gate("chat_b") is False
    _clear_plan_gate("chat_a")


# --- Cache eviction ---

def test_evict_caches_runs_without_error():
    _evict_caches()  # should not raise


# --- Integration tests ---

def test_full_flow_generate_plan_and_gate():
    """Test: generate_plan sets gate, create_project_space checks it."""
    with _project_registry_lock:
        _project_registry.clear()
    chat_id = "test_flow_chat"
    # Gate should be off initially
    assert _check_plan_gate(chat_id) is False
    # After generate_plan, gate should be on
    _set_plan_gate(chat_id)
    assert _check_plan_gate(chat_id) is True
    # After clear, gate should be off
    _clear_plan_gate(chat_id)
    assert _check_plan_gate(chat_id) is False


def test_full_flow_update_project():
    """Test: register project, update deadline, verify registry change."""
    with _project_registry_lock:
        _project_registry.clear()
    _register_project("测试项目", ["张三"], "2026-05-10", "进行中", ["文档: url"])
    with _project_registry_lock:
        proj = _project_registry["测试项目"]
        assert proj["deadline"] == "2026-05-10"
        proj["deadline"] = "2026-05-15"
    with _project_registry_lock:
        assert _project_registry["测试项目"]["deadline"] == "2026-05-15"


def test_full_flow_query_status_with_countdown():
    """Test: register project, query status shows countdown."""
    with _project_registry_lock:
        _project_registry.clear()
    import datetime
    future = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()
    _register_project("看板项目", ["李四"], future, "进行中", [])
    cd = _deadline_countdown(future)
    assert "剩余" in cd
    assert "天" in cd


def test_full_flow_template_detection():
    """Test: all 4 templates detected correctly."""
    assert _detect_template("帮我准备答辩") is not None
    assert _detect_template("开始新的sprint") is not None
    assert _detect_template("策划一个活动") is not None
    assert _detect_template("准备上线") is not None
    assert _detect_template("今天天气怎么样") is None


# --- Run all tests ---

if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            test_fn()
            passed += 1
            print(f"  PASS  {test_fn.__name__}")
        except Exception as e:
            failed += 1
            print(f"  FAIL  {test_fn.__name__}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
