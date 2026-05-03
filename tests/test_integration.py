"""Integration tests for PilotFlow with mocked gateway.

Tests the full flow from generate_plan to create_project_space
without requiring Feishu credentials.
"""

import sys
import os
import json
import datetime

# Add plugin path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugins", "pilotflow"))

# Mock tools.registry before importing
import types

_mock_registry = types.ModuleType("tools.registry")
_call_log = []


def _mock_dispatch(name, args, **kwargs):
    _call_log.append({"name": name, "args": args})
    if name == "send_message":
        return json.dumps({"success": True, "platform": "feishu", "chat_id": args.get("target", "").split(":")[-1]})
    if name == "memory":
        return json.dumps({"success": True, "message": "Entry added."})
    if name == "cronjob":
        return json.dumps({"success": True, "job_id": "test_job_123"})
    return json.dumps({"error": f"Unknown tool: {name}"})


_mock_registry.registry = types.SimpleNamespace(dispatch=_mock_dispatch)
_mock_registry.tool_error = lambda msg: json.dumps({"error": msg})
_mock_registry.tool_result = lambda msg: msg if isinstance(msg, str) else json.dumps(msg)
sys.modules["tools.registry"] = _mock_registry

from tools import (
    _handle_generate_plan,
    _handle_create_project_space,
    _handle_card_action,
    _handle_query_status,
    _handle_update_project,
    _handle_detect_risks,
    _check_plan_gate,
    _clear_plan_gate,
    _register_project,
    _project_registry,
    _project_registry_lock,
    _deadline_countdown,
    _detect_template,
    _member_names_plain,
    _evict_caches,
)


def _clear_state():
    """Reset all state between tests."""
    with _project_registry_lock:
        _project_registry.clear()
    _call_log.clear()


# --- Integration Test: Full Project Creation Flow ---

def test_full_flow_create_project():
    """Test the complete flow: generate_plan -> confirm -> create_project_space."""
    _clear_state()
    chat_id = "oc_integration_test"

    # Step 1: User @PilotFlow with a project request
    result1 = _handle_generate_plan(
        {"input_text": "帮我准备答辩项目空间，成员唐丁，交付物是项目简报和任务清单，5月7日截止"},
        chat_id=chat_id,
    )
    plan = json.loads(result1)

    # Verify plan generation
    assert plan["status"] == "plan_generated"
    assert plan["card_sent"] is True
    assert plan["template"] is not None
    assert "答辩" in plan["template"]
    assert len(plan["plan"]["deliverables"]) >= 2
    print("  PASS  Step 1: Plan generated with template")

    # Step 2: Verify plan gate is set
    assert _check_plan_gate(chat_id) is True
    print("  PASS  Step 2: Plan gate set")

    # Step 3: Verify confirmation card was sent
    card_calls = [c for c in _call_log if c["name"] == "send_message" and c["args"].get("msg_type") == "interactive"]
    assert len(card_calls) >= 1
    card = json.loads(card_calls[-1]["args"]["message"])
    assert card["header"]["template"] == "blue"
    assert len(card["elements"][1]["actions"]) == 2  # confirm + cancel buttons
    print("  PASS  Step 3: Confirmation card sent with buttons")

    # Step 4: User confirms -> create project space
    _call_log.clear()
    result2 = _handle_create_project_space(
        {
            "title": "答辩项目",
            "goal": "准备答辩",
            "members": ["唐丁"],
            "deliverables": ["项目简报", "任务清单"],
            "deadline": "2026-05-07",
        },
        chat_id=chat_id,
    )
    create_result = json.loads(result2)

    # Verify creation result
    assert create_result["status"] == "project_space_created"
    assert "display" in create_result
    assert len(create_result["display"]) >= 5  # title, doc, bitable, members, tasks, deadline, calendar, reminder, notification
    print("  PASS  Step 4: Project space created with display")

    # Step 5: Verify plan gate is cleared
    assert _check_plan_gate(chat_id) is False
    print("  PASS  Step 5: Plan gate cleared")

    # Step 6: Verify project registered
    with _project_registry_lock:
        assert "答辩项目" in _project_registry
        proj = _project_registry["答辩项目"]
        assert proj["members"] == ["唐丁"]
        assert proj["deadline"] == "2026-05-07"
        assert proj["status"] == "进行中"
    print("  PASS  Step 6: Project registered in memory")

    # Step 7: Verify memory save was called
    memory_calls = [c for c in _call_log if c["name"] == "memory"]
    assert len(memory_calls) >= 1
    assert "答辩项目" in memory_calls[0]["args"]["content"]
    assert "成员=1 人" in memory_calls[0]["args"]["content"]
    assert "唐丁" not in memory_calls[0]["args"]["content"]
    print("  PASS  Step 7: Project saved to Hermes memory")

    # Step 8: Verify cron job was scheduled
    cron_calls = [c for c in _call_log if c["name"] == "cronjob"]
    assert len(cron_calls) >= 1
    assert "答辩项目" in cron_calls[0]["args"]["name"]
    print("  PASS  Step 8: Deadline reminder cron job scheduled")

    # Step 9: Verify send_message was called (entry card)
    msg_calls = [c for c in _call_log if c["name"] == "send_message"]
    assert len(msg_calls) >= 1
    print("  PASS  Step 9: Entry card sent via Hermes")


def test_card_action_confirm_uses_pending_plan():
    """Test card confirm recovers pending plan and creates the project."""
    _clear_state()
    chat_id = "oc_card_confirm"

    _handle_generate_plan(
        {
            "input_text": "准备答辩项目",
            "title": "卡片确认项目",
            "goal": "验证卡片确认",
            "members": ["唐丁"],
            "deliverables": ["项目简报"],
            "deadline": "2026-05-07",
        },
        chat_id=chat_id,
    )
    _call_log.clear()

    result = json.loads(_handle_card_action(
        {"action_value": json.dumps({"pilotflow_action": "confirm_project"})},
        chat_id=chat_id,
    ))

    assert result["status"] == "project_space_created"
    assert result["title"] == "卡片确认项目"
    assert _check_plan_gate(chat_id) is False
    with _project_registry_lock:
        assert "卡片确认项目" in _project_registry
    assert any(c["name"] == "memory" for c in _call_log)
    assert any(c["name"] == "cronjob" for c in _call_log)
    print("  PASS  Card confirm creates project from pending plan")


def test_card_action_cancel_clears_pending_plan():
    """Test card cancel clears the confirmation gate and does not create a project."""
    _clear_state()
    chat_id = "oc_card_cancel"

    _handle_generate_plan(
        {
            "input_text": "准备取消项目",
            "title": "取消项目",
            "goal": "验证取消",
            "members": ["唐丁"],
            "deliverables": ["项目简报"],
            "deadline": "2026-05-07",
        },
        chat_id=chat_id,
    )
    assert _check_plan_gate(chat_id) is True
    _call_log.clear()

    result = json.loads(_handle_card_action(
        {"action_value": json.dumps({"pilotflow_action": "cancel_project"})},
        chat_id=chat_id,
    ))

    assert result["status"] == "cancelled"
    assert _check_plan_gate(chat_id) is False
    with _project_registry_lock:
        assert "取消项目" not in _project_registry
    assert any(c["name"] == "send_message" for c in _call_log)
    print("  PASS  Card cancel clears gate without creating project")


# --- Integration Test: Query Status After Creation ---

def test_query_status_after_creation():
    """Test query_status shows projects with countdown."""
    _clear_state()

    # Register a project
    future = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()
    _register_project("看板项目", ["张三", "李四"], future, "进行中", ["文档: url"])

    # Query status
    result = _handle_query_status({"query": "项目进展"}, chat_id="oc_query")
    assert "看板项目" in result
    assert "张三" in result
    assert "李四" in result
    assert "剩余" in result
    assert "天" in result
    print("  PASS  Query status shows project with countdown")


# --- Integration Test: Update Project ---

def test_update_project_full_flow():
    """Test updating deadline, adding member, and changing status."""
    _clear_state()

    # Register a project
    _register_project("更新测试项目", ["张三"], "2026-05-10", "进行中", [])

    # Update deadline
    result1 = json.loads(_handle_update_project(
        {"project_name": "更新测试", "action": "update_deadline", "value": "2026-05-20"},
        chat_id="oc_update",
    ))
    assert result1["registry_updated"] is True
    with _project_registry_lock:
        assert _project_registry["更新测试项目"]["deadline"] == "2026-05-20"
    print("  PASS  Update deadline")

    # Add member
    result2 = json.loads(_handle_update_project(
        {"project_name": "更新测试", "action": "add_member", "value": "李四"},
        chat_id="oc_update",
    ))
    assert result2["registry_updated"] is True
    with _project_registry_lock:
        assert "李四" in _project_registry["更新测试项目"]["members"]
    print("  PASS  Add member")

    # Update status
    result3 = json.loads(_handle_update_project(
        {"project_name": "更新测试", "action": "update_status", "value": "已完成"},
        chat_id="oc_update",
    ))
    assert result3["registry_updated"] is True
    with _project_registry_lock:
        assert _project_registry["更新测试项目"]["status"] == "已完成"
    print("  PASS  Update status")


# --- Integration Test: Edge Cases ---

def test_create_without_plan():
    """Test that create_project_space rejects without plan."""
    _clear_state()
    result = _handle_create_project_space(
        {"title": "测试", "goal": "测试", "members": ["张三"], "deliverables": ["PPT"]},
        chat_id="oc_no_plan",
    )
    assert "error" in result.lower() or "请先" in result
    print("  PASS  Create without plan rejected")


def test_update_nonexistent_project():
    """Test that update_project handles non-existent projects."""
    _clear_state()
    result = _handle_update_project(
        {"project_name": "不存在", "action": "update_status", "value": "完成"},
        chat_id="oc_missing",
    )
    # Result is JSON with Unicode escapes, parse it
    data = json.loads(result)
    assert "error" in data
    assert "未找到" in data["error"]
    print("  PASS  Update non-existent project rejected")


def test_detect_risks_comprehensive():
    """Test risk detection with various inputs."""
    _clear_state()

    # All missing
    r1 = json.loads(_handle_detect_risks({"members": [], "deliverables": [], "deadline": ""}))
    assert r1["risks_found"] == 3

    # Only members missing
    r2 = json.loads(_handle_detect_risks({"members": [], "deliverables": ["PPT"], "deadline": "2026-05-10"}))
    assert r2["risks_found"] == 1
    assert r2["risks"][0]["level"] == "high"

    # No risks
    r3 = _handle_detect_risks({"members": ["张三"], "deliverables": ["PPT"], "deadline": "2026-05-10"})
    assert "未检测到风险" in r3

    print("  PASS  Risk detection comprehensive")


# --- Run all tests ---

if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            test_fn()
            passed += 1
        except Exception as e:
            failed += 1
            print(f"  FAIL  {test_fn.__name__}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
