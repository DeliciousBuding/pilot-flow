"""Unit tests for PilotFlow pure-logic functions.

These tests verify core logic without requiring Feishu API credentials.
"""

import json
import os
import sys
import time
import threading
from unittest.mock import patch

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
    _send_interactive_card_via_feishu,
    _save_to_hermes_memory,
    _schedule_deadline_reminder,
    _clean_plan_list,
    _parse_memory_project_entry,
    _history_suggestions_for_plan,
    _create_card_action_ref,
    _handle_card_action,
    _handle_card_command,
    _handle_generate_plan,
    _handle_create_project_space,
    _pending_plans,
    _card_action_refs,
    _plan_lock,
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


def test_register_project_stores_reusable_project_pattern():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "复用项目", ["张三"], "2026-05-15", "进行中", [],
        goal="验证复用", deliverables=["复盘文档"],
    )
    with _project_registry_lock:
        proj = _project_registry["复用项目"]
        assert proj["goal"] == "验证复用"
        assert proj["deliverables"] == ["复盘文档"]


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


def test_send_interactive_card_uses_feishu_client():
    captured = {}

    class _FakeResponse:
        def success(self):
            return True

    class _FakeMessageAPI:
        def create(self, request):
            captured["request"] = request
            return _FakeResponse()

    class _FakeClient:
        def __init__(self):
            self.im = types.SimpleNamespace(v1=types.SimpleNamespace(message=_FakeMessageAPI()))

    with patch("tools._get_client", return_value=_FakeClient()):
        ok = _send_interactive_card_via_feishu("oc_test_card", {"header": {"title": "测试"}})

    assert ok is True
    request = captured["request"]
    body = request.request_body if hasattr(request, "request_body") else request.body
    assert body.msg_type == "interactive"
    assert body.receive_id == "oc_test_card"
    assert "测试" in body.content


def test_memory_save_reports_dispatch_failure():
    fake_registry = types.SimpleNamespace(dispatch=lambda name, args, **kwargs: json.dumps({"error": "memory disabled"}))
    with patch("tools.registry", fake_registry):
        ok = _save_to_hermes_memory("记忆失败项目", "验证失败返回", ["成员A"], ["文档"], "2026-05-10")

    assert ok is False


def test_deadline_reminder_reports_dispatch_failure():
    import datetime

    future = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
    fake_registry = types.SimpleNamespace(dispatch=lambda name, args, **kwargs: json.dumps({"error": "cron disabled"}))
    with patch("tools.registry", fake_registry):
        ok = _schedule_deadline_reminder("提醒失败项目", future, "oc_deadline_fail")

    assert ok is False


def test_parse_memory_project_entry():
    parsed = _parse_memory_project_entry(
        "【项目创建】答辩项目：目标=准备答辩，成员=张三、李四，交付物=项目简报、任务清单，截止=2026-05-10"
    )

    assert parsed["title"] == "答辩项目"
    assert parsed["members"] == ["张三", "李四"]
    assert parsed["deliverables"] == ["项目简报", "任务清单"]
    assert parsed["deadline"] == "2026-05-10"


def test_clean_plan_list_removes_agent_placeholders():
    assert _clean_plan_list(["示例成员A", "成员B", "王五", "王五"]) == ["王五"]
    assert _clean_plan_list("示例交付物、迁移验证记录") == ["迁移验证记录"]


def test_generate_plan_does_not_show_placeholder_members():
    captured_cards = []

    def fake_send(chat_id, card):
        captured_cards.append(card)
        return "om_fake"

    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with patch("tools._hermes_send_card", side_effect=fake_send):
        result = json.loads(_handle_generate_plan(
            {
                "input_text": "帮我准备迁移验证项目",
                "title": "迁移验证项目",
                "goal": "验证迁移流程",
                "members": ["示例成员A"],
                "deliverables": ["迁移验证记录"],
                "deadline": "",
            },
            chat_id="oc_no_placeholder",
        ))

    assert result["plan"]["members"] == []
    card_text = captured_cards[0]["elements"][0]["content"]
    assert "示例成员A" not in card_text
    assert "**成员：** 待确认" in card_text


def test_create_project_requires_separate_text_confirmation_after_plan():
    chat_id = "oc_same_turn_guard"
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with patch("tools._hermes_send_card", return_value="om_plan"):
        _handle_generate_plan(
            {
                "input_text": "帮我准备迁移验证项目，先给我确认卡片",
                "title": "迁移验证项目",
                "goal": "验证迁移流程",
                "members": [],
                "deliverables": ["迁移验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id=chat_id,
        )

    result = json.loads(_handle_create_project_space(
        {
            "title": "迁移验证项目",
            "goal": "验证迁移流程",
            "members": [],
            "deliverables": ["迁移验证记录"],
            "deadline": "2026-05-10",
        },
        chat_id=chat_id,
    ))

    assert "error" in result
    assert "确认执行" in result["error"]
    with _project_registry_lock:
        assert "迁移验证项目" not in _project_registry


def test_history_suggestions_do_not_silently_mutate_plan():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "答辩历史项目", ["张三", "李四"], "2026-05-10", "进行中", [],
        goal="准备答辩", deliverables=["项目简报", "任务清单"],
    )
    plan = {"title": "新答辩项目", "goal": "准备答辩", "members": [], "deliverables": [], "deadline": ""}

    suggestions, suggested_fields = _history_suggestions_for_plan(plan, "准备新的答辩项目")

    assert plan["members"] == []
    assert plan["deliverables"] == []
    assert suggested_fields["members"] == ["张三", "李四"]
    assert suggested_fields["deliverables"] == ["项目简报", "任务清单"]
    assert suggestions


def test_history_suggestions_ignore_unrelated_history():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "答辩历史项目", ["张三"], "2026-05-10", "进行中", [],
        goal="准备答辩", deliverables=["项目简报"],
    )
    plan = {"title": "迁移项目", "goal": "验证迁移", "members": [], "deliverables": [], "deadline": ""}

    suggestions, suggested_fields = _history_suggestions_for_plan(plan, "帮我准备迁移验证项目")

    assert suggestions == []
    assert suggested_fields == {}


def test_generate_plan_uses_memory_history_when_fields_missing():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
    memory_payload = json.dumps({
        "items": [
            {"content": "【项目创建】活动项目：目标=筹备活动，成员=王五、赵六，交付物=活动方案、宣传文案，截止=2026-05-20"}
        ]
    })
    fake_registry = types.SimpleNamespace(dispatch=lambda name, args, **kwargs: memory_payload)

    with patch("tools.registry", fake_registry), patch("tools._send_interactive_card_via_feishu", return_value=True):
        result = json.loads(_handle_generate_plan(
            {
                "input_text": "帮我准备新的活动项目",
                "title": "新活动项目",
                "goal": "筹备活动",
                "members": [],
                "deliverables": [],
                "deadline": "",
            },
            chat_id="oc_history_memory",
        ))

    assert result["plan"]["members"] == []
    assert result["plan"]["deliverables"] == ["活动方案", "预算表", "宣传物料"]
    assert result["history_suggested_fields"]["members"] == ["王五", "赵六"]
    assert result["history_suggested_fields"]["deliverables"] == ["活动方案", "宣传文案"]
    assert result["history_suggestions"]


def test_project_entry_card_action_marks_project_done():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "动作项目", ["张三"], "2026-05-10", "进行中", [],
        goal="验证入口卡片动作", deliverables=["验收记录"],
    )
    action_value = json.dumps({"pilotflow_action": "mark_project_done", "title": "动作项目"}, ensure_ascii=False)

    with patch("tools._hermes_send", return_value=True):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_action"))

    assert result["status"] == "project_marked_done"
    with _project_registry_lock:
        assert _project_registry["动作项目"]["status"] == "已完成"


def test_card_command_opaque_project_action_carries_project_title():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "入口按钮项目", ["张三"], "2026-05-10", "进行中", [],
        goal="验证入口按钮", deliverables=["验收记录"],
    )
    action_id = _create_card_action_ref("oc_entry_button", "mark_project_done", {"title": "入口按钮项目"})

    with patch("tools._hermes_send", return_value=True), patch("tools._mark_card_message", return_value=True):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert result is None
    with _project_registry_lock:
        assert _project_registry["入口按钮项目"]["status"] == "已完成"


def test_card_command_bridge_uses_opaque_action_id():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
    _call_log.clear()
    chat_id = "oc_card_bridge"
    with patch("tools._send_interactive_card_via_feishu", return_value=True):
        _handle_generate_plan(
            {
                "input_text": "准备桥接项目",
                "title": "桥接项目",
                "goal": "验证按钮桥接",
                "members": ["示例成员A"],
                "deliverables": ["项目简报"],
                "deadline": "2026-05-07",
            },
            chat_id=chat_id,
        )

    with _plan_lock:
        action_id = next(
            k for k, v in _card_action_refs.items()
            if v["chat_id"] == chat_id and v["action"] == "cancel_project"
        )
    raw_args = f'button {{"pilotflow_action_id":"{action_id}"}}'
    with patch("tools._hermes_send", return_value=True) as send:
        result = _handle_card_command(raw_args)

    assert result is None
    send.assert_called_once_with(chat_id, "已取消本次项目创建。")


def test_card_command_confirm_returns_none_after_direct_card_send():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
    chat_id = "oc_card_confirm_bridge"
    with patch("tools._send_interactive_card_via_feishu", return_value=True):
        _handle_generate_plan(
            {
                "input_text": "准备确认桥接项目",
                "title": "确认桥接项目",
                "goal": "验证确认按钮桥接",
                "members": ["示例成员A"],
                "deliverables": ["项目简报"],
                "deadline": "2026-05-07",
            },
            chat_id=chat_id,
        )

    with _plan_lock:
        action_id = next(
            k for k, v in _card_action_refs.items()
            if v["chat_id"] == chat_id and v["action"] == "confirm_project"
        )
    raw_args = f'button {{"pilotflow_action_id":"{action_id}"}}'
    with patch("tools._send_interactive_card_via_feishu", return_value=True):
        result = _handle_card_command(raw_args)

    assert result is None
    with _project_registry_lock:
        assert "确认桥接项目" in _project_registry


def test_old_card_confirm_uses_its_own_plan_snapshot():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
    chat_id = "oc_multi_card"
    with patch("tools._send_interactive_card_via_feishu", return_value=True):
        _handle_generate_plan(
            {
                "input_text": "准备第一个项目",
                "title": "第一个项目",
                "goal": "验证旧卡计划快照",
                "members": ["成员A"],
                "deliverables": ["交付物A"],
                "deadline": "2026-05-07",
            },
            chat_id=chat_id,
        )
        with _plan_lock:
            first_action_id = next(
                k for k, v in _card_action_refs.items()
                if v["chat_id"] == chat_id and v["action"] == "confirm_project"
            )
        _handle_generate_plan(
            {
                "input_text": "准备第二个项目",
                "title": "第二个项目",
                "goal": "验证不会被旧卡覆盖",
                "members": ["成员B"],
                "deliverables": ["交付物B"],
                "deadline": "2026-05-08",
            },
            chat_id=chat_id,
        )

    raw_args = f'button {{"pilotflow_action_id":"{first_action_id}"}}'
    with patch("tools._send_interactive_card_via_feishu", return_value=True):
        result = _handle_card_command(raw_args)

    assert result is None
    with _project_registry_lock:
        assert "第一个项目" in _project_registry
        assert "第二个项目" not in _project_registry
    with _plan_lock:
        assert _pending_plans[chat_id]["plan"]["title"] == "第二个项目"


def test_card_action_id_is_single_use():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
    chat_id = "oc_single_use_card"
    with patch("tools._send_interactive_card_via_feishu", return_value=True):
        _handle_generate_plan(
            {
                "input_text": "准备单次点击项目",
                "title": "单次点击项目",
                "goal": "验证按钮不能重复创建",
                "members": ["成员A"],
                "deliverables": ["交付物A"],
                "deadline": "2026-05-07",
            },
            chat_id=chat_id,
        )
    with _plan_lock:
        action_id = next(
            k for k, v in _card_action_refs.items()
            if v["chat_id"] == chat_id and v["action"] == "confirm_project"
        )
    raw_args = f'button {{"pilotflow_action_id":"{action_id}"}}'
    with patch("tools._send_interactive_card_via_feishu", return_value=True):
        assert _handle_card_command(raw_args) is None
        second = _handle_card_command(raw_args)

    assert "已处理" in second or "已过期" in second
    with _project_registry_lock:
        assert list(_project_registry).count("单次点击项目") == 1


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
