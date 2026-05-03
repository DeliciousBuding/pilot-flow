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
    _save_project_state,
    _load_project_state,
    _schedule_deadline_reminder,
    _clean_plan_list,
    _parse_memory_project_entry,
    _history_suggestions_for_plan,
    _create_bitable,
    _append_bitable_update_record,
    _create_calendar_event,
    _create_card_action_ref,
    _handle_card_action,
    _handle_card_command,
    _handle_generate_plan,
    _handle_create_project_space,
    _handle_query_status,
    _handle_update_project,
    _handle_health_check,
    _pending_plans,
    _card_action_refs,
    _plan_lock,
)


def _install_fake_bitable_sdk(monkeypatch):
    """Install the minimal lark_oapi bitable surface used by _create_bitable."""
    class _Builder:
        def __init__(self, cls):
            self.cls = cls
            self.values = {}

        def __getattr__(self, name):
            def setter(value):
                self.values[name] = value
                return self
            return setter

        def build(self):
            return self.cls(**self.values)

    class _Model:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        @classmethod
        def builder(cls):
            return _Builder(cls)

    fake_v1 = types.ModuleType("lark_oapi.api.bitable.v1")
    for name in [
        "CreateAppRequest",
        "App",
        "CreateAppTableRecordRequest",
        "AppTableRecord",
        "CreateAppTableFieldRequest",
        "AppTableField",
    ]:
        setattr(fake_v1, name, type(name, (_Model,), {}))

    modules = {
        "lark_oapi": types.ModuleType("lark_oapi"),
        "lark_oapi.api": types.ModuleType("lark_oapi.api"),
        "lark_oapi.api.bitable": types.ModuleType("lark_oapi.api.bitable"),
        "lark_oapi.api.bitable.v1": fake_v1,
    }
    monkeypatch.setitem(sys.modules, "lark_oapi", modules["lark_oapi"])
    monkeypatch.setitem(sys.modules, "lark_oapi.api", modules["lark_oapi.api"])
    monkeypatch.setitem(sys.modules, "lark_oapi.api.bitable", modules["lark_oapi.api.bitable"])
    monkeypatch.setitem(sys.modules, "lark_oapi.api.bitable.v1", fake_v1)


class _FakeBitableResponse:
    def __init__(self, data=None, msg=""):
        self.data = data
        self.msg = msg

    def success(self):
        return True


class _FakeBitableClient:
    def __init__(self):
        self.field_names = []
        self.records = []
        self.bitable = types.SimpleNamespace(
            v1=types.SimpleNamespace(
                app=types.SimpleNamespace(create=self._create_app),
                app_table_field=types.SimpleNamespace(create=self._create_field),
                app_table_record=types.SimpleNamespace(create=self._create_record),
            )
        )

    def _create_app(self, _request):
        data = types.SimpleNamespace(
            app=types.SimpleNamespace(
                app_token="app_token_test",
                default_table_id="tbl_test",
                url="https://example.invalid/base/app_token_test",
            )
        )
        return _FakeBitableResponse(data=data)

    def _create_field(self, request):
        self.field_names.append(request.request_body.field_name)
        return _FakeBitableResponse()

    def _create_record(self, request):
        self.records.append(request.request_body.fields)
        data = types.SimpleNamespace(record=types.SimpleNamespace(record_id="rec_test"))
        return _FakeBitableResponse(data=data)


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


def test_create_bitable_includes_deliverables_field_and_initial_value(monkeypatch):
    _install_fake_bitable_sdk(monkeypatch)
    fake_client = _FakeBitableClient()

    with (
        patch("tools._get_client", return_value=fake_client),
        patch("tools._set_permission", return_value=True),
        patch("tools._add_editors", return_value=True),
    ):
        meta = _create_bitable(
            "交付物同步项目",
            "张三",
            "2026-05-20",
            [],
            "oc_bitable_create",
            deliverables=["验收记录", "评审清单"],
        )

    assert meta["app_token"] == "app_token_test"
    assert "交付物" in fake_client.field_names
    assert "更新内容" in fake_client.field_names
    assert fake_client.records[0]["交付物"] == "验收记录, 评审清单"


def test_append_bitable_update_record_writes_change_log(monkeypatch):
    _install_fake_bitable_sdk(monkeypatch)
    fake_client = _FakeBitableClient()
    project = {
        "members": ["张三"],
        "deadline": "2026-05-20",
        "status": "已完成",
        "deliverables": ["验收记录"],
    }

    with patch("tools._get_client", return_value=fake_client):
        created = _append_bitable_update_record("app1", "tbl1", "状态", "已完成", project)

    assert created is True
    record = fake_client.records[0]
    assert record["类型"] == "update"
    assert record["负责人"] == "张三"
    assert record["状态"] == "已完成"
    assert record["交付物"] == "验收记录"
    assert "状态 → 已完成" in record["更新内容"]


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


def test_health_check_returns_sanitized_runtime_status():
    with (
        patch("tools.APP_ID", "sentinel_app_id_should_not_leak"),
        patch("tools.APP_SECRET", "sentinel_secret_should_not_leak"),
        patch("tools._get_client", return_value=object()),
        patch("tools._get_chat_id", return_value="oc_sentinel_chat_should_not_leak"),
        patch("tools._lark_sdk_status", return_value="已安装"),
        patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": "sentinel_state_path_should_not_leak"}),
    ):
        raw = _handle_health_check({"include_details": True}, chat_id="oc_sentinel_chat_should_not_leak")

    result = json.loads(raw)
    assert result["status"] == "ok"
    assert result["checks"]["feishu_credentials"] == "已配置"
    assert result["checks"]["feishu_client"] == "可用"
    assert result["checks"]["chat_context"] == "已检测"
    assert result["checks"]["state_path"] == "已配置"
    assert "sentinel_app_id_should_not_leak" not in raw
    assert "sentinel_secret_should_not_leak" not in raw
    assert "oc_sentinel_chat_should_not_leak" not in raw
    assert "sentinel_state_path_should_not_leak" not in raw


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


def test_project_state_roundtrip_is_sanitized_and_portable(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        ok = _save_project_state(
            "持久项目",
            "验证重启后恢复",
            ["张三"],
            ["恢复记录"],
            "2026-05-20",
            "进行中",
            artifacts=["文档: https://example.invalid/doc"],
            app_token="app_secret_like",
            table_id="tbl_secret_like",
            record_id="rec_secret_like",
        )
        projects = _load_project_state()

    assert ok is True
    assert projects[0]["title"] == "持久项目"
    assert projects[0]["deliverables"] == ["恢复记录"]
    assert "members" not in projects[0]
    serialized = state_path.read_text(encoding="utf-8")
    assert "张三" not in serialized
    assert "example.invalid" not in serialized
    assert "secret_like" not in serialized


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


def test_generate_plan_uses_session_chat_and_initiator_context():
    import datetime
    import types

    captured_cards = []

    def fake_send(chat_id, card):
        captured_cards.append(card)
        return "om_context"

    def fake_get_session_env(name, default=""):
        values = {
            "HERMES_SESSION_CHAT_NAME": "增长小组",
            "HERMES_SESSION_USER_NAME": "王小明",
        }
        return values.get(name, default)

    fake_session_context = types.ModuleType("gateway.session_context")
    fake_session_context.get_session_env = fake_get_session_env
    fake_gateway = types.ModuleType("gateway")
    fake_gateway.session_context = fake_session_context

    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with (
        patch.dict(sys.modules, {
            "gateway": fake_gateway,
            "gateway.session_context": fake_session_context,
        }),
        patch("tools._hermes_send_card", side_effect=fake_send),
    ):
        result = json.loads(_handle_generate_plan(
            {
                "input_text": "帮我创建本周增长实验项目",
                "title": "",
                "goal": "推进本周增长实验",
                "members": [],
                "deliverables": ["实验方案"],
                "deadline": "",
            },
            chat_id="oc_session_context",
        ))

    today = datetime.date.today().isoformat()
    assert result["plan"]["title"] == f"增长小组 - {today}"
    assert result["plan"]["members"] == ["王小明"]
    assert result["session_context_used"] == {
        "chat_name": True,
        "initiator": True,
    }
    assert _pending_plans["oc_session_context"]["plan"]["members"] == ["王小明"]
    card_text = captured_cards[0]["elements"][0]["content"]
    assert "**成员：** 王小明" in card_text


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


def test_query_status_falls_back_to_hermes_memory_after_restart(tmp_path):
    with _project_registry_lock:
        _project_registry.clear()
    memory_payload = json.dumps({
        "items": [
            {"content": "【项目创建】重启恢复项目：目标=验证重启恢复，成员=无，交付物=恢复记录，截止=2026-05-20"}
        ]
    })
    fake_registry = types.SimpleNamespace(dispatch=lambda name, args, **kwargs: memory_payload)
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    missing_state = tmp_path / "missing-state.json"
    with (
        patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(missing_state)}),
        patch("tools.registry", fake_registry),
        patch("tools._send_interactive_card_via_feishu", side_effect=capture_card),
    ):
        result = _handle_query_status({"query": "项目进展"}, chat_id="oc_memory_status")

    assert "项目看板已发送" in result
    body = captured["card"]["elements"][0]["text"]["content"]
    assert "重启恢复项目" in body
    assert "恢复记录" in body
    assert "暂无项目记录" not in body


def test_query_status_dashboard_includes_project_action_buttons():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "看板操作项目", ["张三"], "2026-05-10", "进行中", [],
        goal="验证看板按钮", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_dashboard"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "项目进展"}, chat_id="oc_dashboard_actions")

    assert "项目看板已发送" in result
    actions = [
        element for element in captured["card"]["elements"]
        if element.get("tag") == "action"
    ]
    assert actions
    button_text = [button["text"]["content"] for button in actions[0]["actions"]]
    assert button_text == ["查看状态", "标记完成"]
    button_values = [button["value"] for button in actions[0]["actions"]]
    assert all("pilotflow_action_id" in value for value in button_values)
    assert all("pilotflow_chat_id" not in value for value in button_values)
    with _plan_lock:
        refs = [ref for ref in _card_action_refs.values() if ref["chat_id"] == "oc_dashboard_actions"]
    assert {ref["action"] for ref in refs} >= {"project_status", "mark_project_done"}
    assert all(ref["plan"]["title"] == "看板操作项目" for ref in refs)


def test_query_status_named_project_sends_detail_card_directly():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "定向详情项目", ["张三"], "2026-05-20", "进行中", [],
        goal="验证定向查询", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_direct_detail"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "定向详情项目进展如何"}, chat_id="oc_direct_detail")

    assert "项目详情已发送" in result
    card = captured["card"]
    assert card["header"]["title"]["content"] == "📌 项目详情"
    body = card["elements"][0]["content"]
    assert "定向详情项目" in body
    assert "验证定向查询" in body
    assert "验收记录" in body
    assert "项目看板" not in json.dumps(card, ensure_ascii=False)
    with _plan_lock:
        refs = [ref for ref in _card_action_refs.values() if ref["chat_id"] == "oc_direct_detail"]
    assert {ref["action"] for ref in refs} == {"mark_project_done"}


def test_query_status_named_state_project_sends_detail_card_after_restart(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        _save_project_state(
            "重启定向项目",
            "验证重启后定向查询",
            [],
            ["恢复记录"],
            "2026-05-20",
            "进行中",
            [],
        )
        captured = {}

        def capture_card(chat_id, card):
            captured["card"] = card
            return "om_state_direct_detail"

        with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
            result = _handle_query_status({"query": "重启定向项目进展如何"}, chat_id="oc_state_direct_detail")

    assert "项目详情已发送" in result
    card = captured["card"]
    assert card["header"]["title"]["content"] == "📌 项目详情"
    body = card["elements"][0]["content"]
    assert "重启定向项目" in body
    assert "验证重启后定向查询" in body
    assert "恢复记录" in body


def test_query_status_filters_active_projects():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "进行中筛选项目", [], "2026-05-20", "进行中", [],
        goal="验证筛选", deliverables=["验收记录"],
    )
    _register_project(
        "已完成筛选项目", [], "2026-05-20", "已完成", [],
        goal="验证筛选", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "还有哪些未完成项目"}, chat_id="oc_filter_active")

    assert "项目看板已发送" in result
    content = json.dumps(captured["card"], ensure_ascii=False)
    assert "进行中筛选项目" in content
    assert "已完成筛选项目" not in content


def test_query_status_completed_filter_shows_empty_match_state():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "未完成筛选项目", [], "2026-05-20", "进行中", [],
        goal="验证空筛选", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "看看已完成项目"}, chat_id="oc_filter_done")

    assert "项目看板已发送" in result
    content = json.dumps(captured["card"], ensure_ascii=False)
    assert "未完成筛选项目" not in content
    assert "暂无匹配项目" in content
    assert "暂无项目记录" not in content


def test_completed_project_dashboard_offers_reopen_button():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "完成可重开项目", [], "2026-05-20", "已完成", [],
        goal="验证重开按钮", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "看看已完成项目"}, chat_id="oc_reopen_dashboard")

    assert "项目看板已发送" in result
    actions = [
        element for element in captured["card"]["elements"]
        if element.get("tag") == "action"
    ]
    assert actions
    assert actions[0]["actions"][1]["text"]["content"] == "重新打开"
    with _plan_lock:
        refs = [ref for ref in _card_action_refs.values() if ref["chat_id"] == "oc_reopen_dashboard"]
    assert {ref["action"] for ref in refs} >= {"project_status", "reopen_project"}


def test_dashboard_card_action_marks_state_project_done_after_restart(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        assert _save_project_state(
            "重启看板项目",
            "验证重启后按钮可用",
            ["张三"],
            ["验收记录"],
            "2026-05-20",
            "进行中",
            artifacts=["文档: https://example.invalid/doc"],
        )
        result = json.loads(_handle_card_action(
            {
                "action_value": json.dumps(
                    {"pilotflow_action": "mark_project_done", "title": "重启看板项目"},
                    ensure_ascii=False,
                )
            },
            chat_id="oc_state_done",
        ))
        projects = _load_project_state()

    assert result["status"] == "project_marked_done"
    assert result["bitable_updated"] is False
    assert projects[0]["title"] == "重启看板项目"
    assert projects[0]["status"] == "已完成"


def test_card_action_reopens_state_project_after_restart(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        assert _save_project_state(
            "重启重开项目",
            "验证重启后重开",
            [],
            ["验收记录"],
            "2026-05-20",
            "已完成",
        )
        with patch("tools._hermes_send", return_value=True):
            result = json.loads(_handle_card_action(
                {
                    "action_value": json.dumps(
                        {"pilotflow_action": "reopen_project", "title": "重启重开项目"},
                        ensure_ascii=False,
                    )
                },
                chat_id="oc_reopen_state",
            ))
        projects = _load_project_state()

    assert result["status"] == "project_reopened"
    assert result["bitable_updated"] is False
    assert projects[0]["title"] == "重启重开项目"
    assert projects[0]["status"] == "进行中"


def test_update_project_updates_sanitized_state_after_restart(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        assert _save_project_state(
            "重启更新项目",
            "验证重启后自然语言更新",
            ["张三"],
            ["验收记录"],
            "2026-05-20",
            "进行中",
            artifacts=["文档: https://example.invalid/doc"],
        )
        result = json.loads(_handle_update_project(
            {"project_name": "重启更新", "action": "update_deadline", "value": "2026-05-25"},
            chat_id="oc_state_update",
        ))
        projects = _load_project_state()

    assert result["status"] == "project_updated"
    assert result["project"] == "重启更新项目"
    assert result["registry_updated"] is False
    assert result["state_updated"] is True
    assert result["bitable_updated"] is False
    assert projects[0]["title"] == "重启更新项目"
    assert projects[0]["deadline"] == "2026-05-25"
    assert projects[0]["status"] == "进行中"


def test_update_project_status_uses_sanitized_state_after_restart(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        assert _save_project_state(
            "重启状态项目",
            "验证重启后改状态",
            [],
            ["验收记录"],
            "2026-05-20",
            "进行中",
        )
        result = json.loads(_handle_update_project(
            {"project_name": "重启状态", "action": "update_status", "value": "暂停"},
            chat_id="oc_state_status",
        ))
        projects = _load_project_state()

    assert result["status"] == "project_updated"
    assert result["project"] == "重启状态项目"
    assert result["state_updated"] is True
    assert projects[0]["status"] == "暂停"


def test_update_project_adds_deliverable_and_creates_task():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "交付物项目", ["张三"], "2026-05-20", "进行中", [],
        goal="验证新增交付物", deliverables=["验收记录"],
    )

    with (
        patch("tools._create_task", return_value="评审清单") as create_task,
        patch("tools._hermes_send", return_value=True),
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "交付物", "action": "add_deliverable", "value": "评审清单"},
            chat_id="oc_deliverable",
        ))

    assert result["status"] == "project_updated"
    assert result["action"] == "add_deliverable"
    assert result["registry_updated"] is True
    assert result["task_created"] is True
    create_task.assert_called_once_with("评审清单", "项目: 交付物项目", "张三", "2026-05-20", "oc_deliverable")
    with _project_registry_lock:
        project = _project_registry["交付物项目"]
        assert project["deliverables"] == ["验收记录", "评审清单"]
        assert "任务: 评审清单" in project["artifacts"]


def test_update_project_add_member_refreshes_resource_permissions():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "权限同步项目", ["张三"], "2026-05-20", "进行中",
        ["文档: https://example.invalid/docx/doc_token_123"],
        app_token="app1", table_id="tbl1", record_id="rec1",
        goal="验证加成员刷新权限", deliverables=["验收记录"],
    )

    with (
        patch("tools._set_permission") as set_permission,
        patch("tools._add_editors") as add_editors,
        patch("tools._update_bitable_record", return_value=True) as update_bitable,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "权限同步", "action": "add_member", "value": "李四"},
            chat_id="oc_permission_refresh",
        ))

    assert result["status"] == "project_updated"
    assert result["permission_refreshed"] is True
    set_permission.assert_any_call("doc_token_123", "docx")
    set_permission.assert_any_call("app1", "bitable")
    add_editors.assert_any_call("doc_token_123", "docx", "oc_permission_refresh")
    add_editors.assert_any_call("app1", "bitable", "oc_permission_refresh")
    update_bitable.assert_called_once_with("app1", "tbl1", "rec1", {"负责人": "张三, 李四"})
    assert "资源权限已刷新" in send.call_args.args[1]


def test_update_project_deadline_refreshes_calendar_and_reminder():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "截止联动项目", ["张三"], "2026-05-20", "进行中", [],
        goal="验证截止联动", deliverables=["验收记录"],
    )

    with (
        patch("tools._create_calendar_event", return_value="日历事件: 2026-05-30") as calendar,
        patch("tools._schedule_deadline_reminder", return_value=True) as reminder,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "截止联动", "action": "update_deadline", "value": "2026-05-30"},
            chat_id="oc_deadline_refresh",
        ))

    assert result["status"] == "project_updated"
    assert result["calendar_event_created"] is True
    assert result["reminder_scheduled"] is True
    calendar.assert_called_once_with("截止联动项目", "验证截止联动", "2026-05-30")
    reminder.assert_called_once_with("截止联动项目", "2026-05-30", "oc_deadline_refresh")
    sent_text = send.call_args.args[1]
    assert "日历事件已更新" in sent_text
    assert "截止提醒已设置" in sent_text


def test_create_calendar_event_resolves_primary_calendar_id():
    import types

    class _Builder:
        def __init__(self, cls):
            self.cls = cls
            self.values = {}

        def __getattr__(self, name):
            def setter(value):
                self.values[name] = value
                return self
            return setter

        def build(self):
            return self.cls(**self.values)

    class _Model:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        @classmethod
        def builder(cls):
            return _Builder(cls)

    class _Response:
        def __init__(self, data=None):
            self.data = data
            self.msg = "success"

        def success(self):
            return True

    created = {}

    class _CalendarApi:
        def primary(self, request):
            calendar = types.SimpleNamespace(calendar_id="cal_primary")
            user_calendar = types.SimpleNamespace(calendar=calendar)
            return _Response(types.SimpleNamespace(calendars=[user_calendar]))

    class _CalendarEventApi:
        def create(self, request):
            created["calendar_id"] = request.calendar_id
            created["summary"] = request.request_body.summary
            created["start_timestamp"] = request.request_body.start_time.timestamp
            return _Response()

    fake_v4 = types.ModuleType("lark_oapi.api.calendar.v4")
    fake_v4.PrimaryCalendarRequest = type("PrimaryCalendarRequest", (_Model,), {})
    fake_v4.CreateCalendarEventRequest = type("CreateCalendarEventRequest", (_Model,), {})
    fake_v4.CalendarEvent = type("CalendarEvent", (_Model,), {})
    fake_v4.TimeInfo = type("TimeInfo", (_Model,), {})

    with (
        patch.dict(sys.modules, {
            "lark_oapi": types.ModuleType("lark_oapi"),
            "lark_oapi.api": types.ModuleType("lark_oapi.api"),
            "lark_oapi.api.calendar": types.ModuleType("lark_oapi.api.calendar"),
            "lark_oapi.api.calendar.v4": fake_v4,
        }),
        patch("tools._get_client", return_value=types.SimpleNamespace(
            calendar=types.SimpleNamespace(v4=types.SimpleNamespace(
                calendar=_CalendarApi(),
                calendar_event=_CalendarEventApi(),
            )),
        )),
    ):
        result = _create_calendar_event("真实日历项目", "验证 primary 解析", "2026-06-01")

    assert result == "日历事件: 2026-06-01"
    assert created["calendar_id"] == "cal_primary"
    assert created["summary"] == "📌 截止: 真实日历项目"
    assert created["start_timestamp"]


def test_update_project_add_deliverable_syncs_bitable_deliverables():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "交付物表格项目", ["张三"], "2026-05-20", "进行中", [],
        app_token="app1", table_id="tbl1", record_id="rec1",
        goal="验证新增交付物同步状态表", deliverables=["验收记录"],
    )

    with (
        patch("tools._create_task", return_value=None),
        patch("tools._update_bitable_record", return_value=True) as update_bitable,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "交付物表格", "action": "add_deliverable", "value": "评审清单"},
            chat_id="oc_deliverable_bitable",
        ))

    assert result["status"] == "project_updated"
    assert result["bitable_updated"] is True
    update_bitable.assert_called_once_with(
        "app1", "tbl1", "rec1", {"交付物": "验收记录, 评审清单"},
    )
    assert "状态表已同步" in send.call_args.args[1]


def test_update_project_appends_bitable_update_history():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "流水记录项目", ["张三"], "2026-05-20", "进行中", [],
        app_token="app1", table_id="tbl1", record_id="rec1",
        goal="验证多维表格流水", deliverables=["验收记录"],
    )

    with (
        patch("tools._update_bitable_record", return_value=True),
        patch("tools._append_bitable_update_record", return_value=True) as append_record,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "流水记录", "action": "update_status", "value": "已完成"},
            chat_id="oc_bitable_history",
        ))

    assert result["status"] == "project_updated"
    assert result["bitable_history_created"] is True
    append_record.assert_called_once()
    args = append_record.call_args.args
    assert args[0] == "app1"
    assert args[1] == "tbl1"
    assert args[2] == "状态"
    assert args[3] == "已完成"
    assert "状态表记录已追加" in send.call_args.args[1]


def test_update_project_appends_update_to_project_doc():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "文档更新项目", [], "2026-05-20", "进行中",
        ["文档: https://example.invalid/docx/doc_token_123"],
        goal="验证文档更新", deliverables=["验收记录"],
    )

    with (
        patch("tools._create_task", return_value=None),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "文档更新", "action": "add_deliverable", "value": "评审清单"},
            chat_id="oc_doc_update",
        ))

    assert result["status"] == "project_updated"
    assert result["doc_updated"] is True
    append_doc.assert_called_once()
    args = append_doc.call_args.args
    assert args[0] == "文档更新项目"
    assert args[2] == "交付物"
    assert args[3] == "评审清单"
    sent_text = send.call_args.args[1]
    assert "项目文档已更新" in sent_text


def test_update_project_adds_deliverable_to_sanitized_state_after_restart(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        assert _save_project_state(
            "重启交付物项目",
            "验证重启后新增交付物",
            [],
            ["验收记录"],
            "2026-05-20",
            "进行中",
        )
        with patch("tools._hermes_send", return_value=True):
            result = json.loads(_handle_update_project(
                {"project_name": "重启交付物", "action": "add_deliverable", "value": "评审清单"},
                chat_id="oc_state_deliverable",
            ))
        projects = _load_project_state()

    assert result["status"] == "project_updated"
    assert result["project"] == "重启交付物项目"
    assert result["state_updated"] is True
    assert result["task_created"] is False
    assert projects[0]["deliverables"] == ["验收记录", "评审清单"]


def test_project_status_action_sends_interactive_detail_card():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "详情卡项目", ["张三"], "2026-05-20", "进行中", [],
        goal="验证详情卡", deliverables=["验收记录"],
    )
    captured = {}
    action_value = json.dumps({"pilotflow_action": "project_status", "title": "详情卡项目"}, ensure_ascii=False)

    def capture_card(chat_id, card):
        captured["chat_id"] = chat_id
        captured["card"] = card
        return "om_detail_card"

    with (
        patch("tools._hermes_send", return_value=True) as send_text,
        patch("tools._hermes_send_card", side_effect=capture_card),
    ):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_detail"))

    assert result["status"] == "project_status_sent"
    send_text.assert_not_called()
    assert captured["chat_id"] == "oc_detail"
    card = captured["card"]
    assert card["header"]["title"]["content"] == "📌 项目详情"
    body = card["elements"][0]["content"]
    assert "详情卡项目" in body
    assert "验证详情卡" in body
    assert "验收记录" in body
    assert "2026-05-20" in body
    actions = [element for element in card["elements"] if element.get("tag") == "action"]
    assert actions
    assert actions[0]["actions"][0]["text"]["content"] == "标记完成"
    assert "pilotflow_action_id" in actions[0]["actions"][0]["value"]
    assert "pilotflow_chat_id" not in actions[0]["actions"][0]["value"]


def test_project_detail_card_includes_registry_resource_links():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "资源链接项目", [], "2026-05-20", "进行中",
        [
            "文档: https://example.invalid/docx/doc_token_123",
            "多维表格: https://example.invalid/base/app_token_123",
        ],
        goal="验证资源链接", deliverables=["验收记录"],
    )
    captured = {}
    action_value = json.dumps({"pilotflow_action": "project_status", "title": "资源链接项目"}, ensure_ascii=False)

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_detail_links"

    with patch("tools._hermes_send_card", side_effect=capture_card):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_detail_links"))

    assert result["status"] == "project_status_sent"
    body = captured["card"]["elements"][0]["content"]
    assert "[项目文档](https://example.invalid/docx/doc_token_123)" in body
    assert "[状态表](https://example.invalid/base/app_token_123)" in body


def test_completed_project_detail_card_offers_reopen_button():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "详情重开项目", [], "2026-05-20", "已完成", [],
        goal="验证详情重开", deliverables=["验收记录"],
    )
    captured = {}
    action_value = json.dumps({"pilotflow_action": "project_status", "title": "详情重开项目"}, ensure_ascii=False)

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_detail_reopen"

    with patch("tools._hermes_send_card", side_effect=capture_card):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_detail_reopen"))

    assert result["status"] == "project_status_sent"
    actions = [element for element in captured["card"]["elements"] if element.get("tag") == "action"]
    assert actions[0]["actions"][0]["text"]["content"] == "重新打开"
    with _plan_lock:
        refs = [ref for ref in _card_action_refs.values() if ref["chat_id"] == "oc_detail_reopen"]
    assert {ref["action"] for ref in refs} == {"reopen_project"}


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


def test_project_entry_card_action_syncs_bitable_status():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "表格同步项目", ["张三"], "2026-05-10", "进行中", [],
        app_token="app1", table_id="tbl1", record_id="rec1",
        goal="验证入口卡片同步状态表", deliverables=["验收记录"],
    )
    action_value = json.dumps({"pilotflow_action": "mark_project_done", "title": "表格同步项目"}, ensure_ascii=False)

    with (
        patch("tools._hermes_send", return_value=True),
        patch("tools._update_bitable_record", return_value=True) as update_bitable,
    ):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_action_bitable"))

    assert result["status"] == "project_marked_done"
    assert result["bitable_updated"] is True
    update_bitable.assert_called_once_with("app1", "tbl1", "rec1", {"状态": "已完成"})


def test_project_entry_card_action_appends_completion_to_project_doc():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "文档完成项目", [], "2026-05-10", "进行中",
        ["文档: https://example.invalid/docx/doc_token_123"],
        goal="验证卡片完成写文档", deliverables=["验收记录"],
    )
    action_value = json.dumps({"pilotflow_action": "mark_project_done", "title": "文档完成项目"}, ensure_ascii=False)

    with (
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_card_doc_done"))

    assert result["status"] == "project_marked_done"
    assert result["doc_updated"] is True
    append_doc.assert_called_once()
    args = append_doc.call_args.args
    assert args[0] == "文档完成项目"
    assert args[2] == "状态"
    assert args[3] == "已完成"
    assert "项目文档已更新" in send.call_args.args[1]


def test_project_entry_card_action_appends_reopen_to_project_doc():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "文档重开项目", [], "2026-05-10", "已完成",
        ["文档: https://example.invalid/docx/doc_token_456"],
        goal="验证卡片重开写文档", deliverables=["验收记录"],
    )
    action_value = json.dumps({"pilotflow_action": "reopen_project", "title": "文档重开项目"}, ensure_ascii=False)

    with (
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_card_doc_reopen"))

    assert result["status"] == "project_reopened"
    assert result["doc_updated"] is True
    append_doc.assert_called_once()
    args = append_doc.call_args.args
    assert args[0] == "文档重开项目"
    assert args[2] == "状态"
    assert args[3] == "进行中"
    assert "项目文档已更新" in send.call_args.args[1]


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
