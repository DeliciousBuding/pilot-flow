"""Unit tests for PilotFlow pure-logic functions.

These tests verify core logic without requiring Feishu API credentials.
"""

import json
import os
import sys
import time
import threading
import datetime as dt
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
    _extract_inline_project_fields,
    _parse_memory_project_entry,
    _history_suggestions_for_plan,
    _create_task,
    _create_doc,
    _create_bitable,
    _append_bitable_update_record,
    _create_calendar_event,
    _create_card_action_ref,
    _plan_idempotency_key,
    _handle_scan_chat_signals,
    _handle_card_action,
    _handle_card_command,
    _env_positive_int,
    _handle_generate_plan,
    _handle_create_project_space,
    _handle_query_status,
    _handle_update_project,
    _handle_health_check,
    _pending_plans,
    _card_action_refs,
    _recent_confirmed_projects,
    _plan_lock,
    _get_chat_scope,
    _needs_confirmation_for_create,
    _needs_confirmation_for_update,
)


def test_scan_chat_signals_suggests_projectization_card(monkeypatch):
    sent_cards = []

    def fake_send_card(chat_id, card):
        sent_cards.append({"chat_id": chat_id, "card": card})
        return "om_signal_card"

    monkeypatch.setattr("tools._hermes_send_card", fake_send_card)

    result = json.loads(_handle_scan_chat_signals({
        "source_text": "Hermes 已总结最近群聊：真实链路验证有目标、承诺、风险和提醒。",
        "signals": {
            "goals": ["下周五前完成 PilotFlow 真实链路验证"],
            "commitments": ["我来整理验证记录", "唐丁负责回滚方案"],
            "risks": ["审批可能卡住"],
            "action_items": ["提醒大家同步进度"],
            "deadlines": ["2026-05-08"],
        },
        "suggested_project": {
            "title": "PilotFlow 真实链路验证项目",
            "goal": "完成 PilotFlow 真实链路验证",
            "members": ["唐丁"],
            "deliverables": ["验证记录", "回滚方案", "同步提醒"],
            "deadline": "2026-05-08",
        },
        "should_suggest_project": True,
        "suggestion_reason": "聊天里已经有目标、负责人、风险和后续提醒，适合整理成项目。",
    }, chat_id="oc_signal", chat_type="group"))

    assert result["status"] == "projectization_suggested"
    assert result["signals"]["goals"]
    assert result["signals"]["commitments"]
    assert result["signals"]["risks"]
    assert result["signals"]["action_items"]
    assert result["suggestion"]["should_suggest_project"] is True
    assert result["suggestion"]["reason"] == "聊天里已经有目标、负责人、风险和后续提醒，适合整理成项目。"
    assert result["card_sent"] is True
    assert sent_cards[0]["chat_id"] == "oc_signal"
    card_json = json.dumps(sent_cards[0]["card"], ensure_ascii=False)
    assert "要不要把它整理成项目" in card_json
    assert "pilotflow_action_id" in card_json
    assert "pilotflow_chat_id" not in card_json


def test_projectization_suggestion_button_generates_pending_plan(monkeypatch):
    sent_cards = []

    def fake_send_card(chat_id, card):
        sent_cards.append({"chat_id": chat_id, "card": card})
        return f"om_signal_{len(sent_cards)}"

    monkeypatch.setattr("tools._hermes_send_card", fake_send_card)

    _handle_scan_chat_signals({
        "source_text": "目标是本周把飞书链路验证落地。我来整理验证记录。记得提醒大家明天同步进度。",
        "signals": {
            "goals": ["本周把飞书链路验证落地"],
            "commitments": ["我来整理验证记录"],
            "risks": ["权限审批可能卡住"],
            "action_items": ["提醒大家明天同步进度"],
            "deadlines": [],
        },
        "suggested_project": {
            "title": "飞书链路验证落地项目",
            "goal": "本周把飞书链路验证落地",
            "members": [],
            "deliverables": ["整理验证记录", "提醒大家明天同步进度"],
            "deadline": "",
        },
        "should_suggest_project": True,
    }, chat_id="oc_signal_button", chat_type="group")

    first_action = sent_cards[0]["card"]["elements"][1]["actions"][0]["value"]["pilotflow_action_id"]
    result = json.loads(_handle_card_action(
        {"action_value": json.dumps({"pilotflow_action_id": first_action}, ensure_ascii=False)},
        chat_id="oc_signal_button",
        chat_type="group",
    ))

    assert result["status"] == "plan_generated"
    assert result["plan"]["goal"] == "本周把飞书链路验证落地"
    assert "提醒大家明天同步进度" in result["plan"]["deliverables"]
    assert _pending_plans["oc_signal_button"]["plan"]["title"]
    assert len(sent_cards) == 2
    followup_card = json.dumps(sent_cards[1]["card"], ensure_ascii=False)
    assert "执行计划" in followup_card
    assert "确认执行" in followup_card


def test_scan_chat_signals_does_not_infer_semantics_from_source_text(monkeypatch):
    monkeypatch.setattr("tools._hermes_send_card", lambda chat_id, card: "om_signal_card")

    result = json.loads(_handle_scan_chat_signals({
        "source_text": "目标、风险、承诺、提醒这些词都在这里，但工具不应该自己识别。",
        "signals": {},
        "should_suggest_project": False,
    }, chat_id="oc_signal_split", chat_type="group"))

    assert result["status"] == "signals_recorded"
    assert result["signals"]["goals"] == []
    assert result["signals"]["commitments"] == []
    assert result["signals"]["risks"] == []
    assert result["signals"]["action_items"] == []


def test_env_positive_int_falls_back_for_invalid_values(monkeypatch):
    monkeypatch.setenv("PILOTFLOW_BAD_INT", "abc")
    assert _env_positive_int("PILOTFLOW_BAD_INT", 10) == 10

    monkeypatch.setenv("PILOTFLOW_BAD_INT", "0")
    assert _env_positive_int("PILOTFLOW_BAD_INT", 10) == 10

    monkeypatch.setenv("PILOTFLOW_BAD_INT", "3")
    assert _env_positive_int("PILOTFLOW_BAD_INT", 10) == 3


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


def _install_fake_drive_comment_sdk(monkeypatch):
    """Install the minimal lark_oapi drive comment surface used by _create_doc."""
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

    fake_v1 = sys.modules.get("lark_oapi.api.drive.v1")
    if fake_v1 is None:
        fake_v1 = types.ModuleType("lark_oapi.api.drive.v1")
        monkeypatch.setitem(sys.modules, "lark_oapi.api.drive.v1", fake_v1)
    for name in [
        "CreateFileCommentRequest",
        "FileComment",
        "FileCommentReply",
    ]:
        setattr(fake_v1, name, type(name, (_Model,), {}))

    fake_docx_v1 = sys.modules.get("lark_oapi.api.docx.v1")
    if fake_docx_v1 is None:
        fake_docx_v1 = types.ModuleType("lark_oapi.api.docx.v1")
        monkeypatch.setitem(sys.modules, "lark_oapi.api.docx.v1", fake_docx_v1)
    for name in [
        "CreateDocumentRequest",
        "CreateDocumentRequestBody",
        "CreateDocumentBlockChildrenRequest",
        "CreateDocumentBlockChildrenRequestBody",
        "TextElement",
        "TextRun",
        "MentionUser",
        "Block",
        "Text",
        "Divider",
    ]:
        setattr(fake_docx_v1, name, type(name, (_Model,), {}))

    modules = sys.modules.get("lark_oapi")
    if modules is None:
        modules = types.ModuleType("lark_oapi")
        monkeypatch.setitem(sys.modules, "lark_oapi", modules)
    api_module = sys.modules.get("lark_oapi.api")
    if api_module is None:
        api_module = types.ModuleType("lark_oapi.api")
        monkeypatch.setitem(sys.modules, "lark_oapi.api", api_module)
    docx_module = sys.modules.get("lark_oapi.api.docx")
    if docx_module is None:
        docx_module = types.ModuleType("lark_oapi.api.docx")
        monkeypatch.setitem(sys.modules, "lark_oapi.api.docx", docx_module)
    monkeypatch.setitem(sys.modules, "lark_oapi.api.docx.v1", fake_docx_v1)



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


def test_create_doc_adds_guidance_comment(monkeypatch):
    _install_fake_drive_comment_sdk(monkeypatch)
    class _FakeCommentResponse:
        def __init__(self, success_value=True, data=None):
            self._success = success_value
            self.data = data
            self.msg = ""

        def success(self):
            return self._success

    class _FakeDocClient:
        def __init__(self):
            self.comments = []
            self.docx = types.SimpleNamespace(
                v1=types.SimpleNamespace(
                    document=types.SimpleNamespace(create=self._create_doc),
                    document_block_children=types.SimpleNamespace(create=self._write_doc),
                )
            )
            self.drive = types.SimpleNamespace(
                v1=types.SimpleNamespace(
                    file_comment=types.SimpleNamespace(create=self._create_comment),
                )
            )

        def _create_doc(self, _request):
            data = types.SimpleNamespace(document=types.SimpleNamespace(document_id="doc_test"))
            return _FakeCommentResponse(success_value=True, data=data)

        def _write_doc(self, _request):
            return _FakeCommentResponse(success_value=True)

        def _create_comment(self, request):
            self.comments.append(request.request_body)
            return _FakeCommentResponse(success_value=True)

    fake_client = _FakeDocClient()

    with (
        patch("tools._get_client", return_value=fake_client),
        patch("tools._set_permission", return_value=True),
        patch("tools._add_editors", return_value=True),
    ):
        doc_url = _create_doc("评论文档项目", "# 评论文档项目\n\n- 目标: 验证评论", "oc_doc_comment")

    assert doc_url == "https://feishu.cn/docx/doc_test"
    assert fake_client.comments
    comment = fake_client.comments[0]
    assert getattr(comment, "content", None) == "请补充内容"

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


def test_project_state_roundtrip_keeps_sanitized_recent_updates(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        ok = _save_project_state(
            "进展持久项目",
            "验证重启后进展恢复",
            ["张三"],
            ["恢复记录"],
            "2026-05-20",
            "进行中",
            updates=[
                {"action": "进展", "value": "完成需求评审"},
                {"action": "进展", "value": "真实链接 https://example.invalid/doc 不应保存"},
                {"action": "进展", "value": "app_secret_like 不应保存"},
                {"action": "进展", "value": "等待业务确认"},
            ],
        )
        projects = _load_project_state()

    assert ok is True
    assert projects[0]["updates"] == [
        {"action": "进展", "value": "完成需求评审"},
        {"action": "进展", "value": "等待业务确认"},
    ]
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


def test_extract_inline_project_fields_parses_group_message():
    text = "帮我创建答辩项目，成员张三、李四，交付物是项目简报和任务清单，5月10日截止"

    fields = _extract_inline_project_fields(text)

    assert fields["title"] == "答辩项目"
    assert fields["members"] == ["张三", "李四"]
    assert fields["deliverables"] == ["项目简报", "任务清单"]
    assert fields["deadline"] == "2026-05-10"


def test_extract_inline_project_fields_uses_mentions_and_relative_deadline():
    text = '请准备上线项目，成员是<at user_id="ou_zhangsan">张三</at>和李四，产出上线方案、回滚方案，明天截止'

    fields = _extract_inline_project_fields(text)

    assert fields["members"] == ["张三", "李四"]
    assert fields["deliverables"] == ["上线方案", "回滚方案"]
    assert fields["deadline"] == "2026-05-05"


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


def test_generate_plan_fills_missing_fields_from_raw_text():
    captured_cards = []

    def fake_send(chat_id, card):
        captured_cards.append(card)
        return "om_raw"

    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with patch("tools._hermes_send_card", side_effect=fake_send):
        result = json.loads(_handle_generate_plan(
            {
                "input_text": "帮我创建答辩项目，成员张三、李四，交付物是项目简报和任务清单，5月10日截止",
            },
            chat_id="oc_raw_parse",
        ))

    assert result["plan"]["title"] == "答辩项目"
    assert result["plan"]["members"] == ["张三", "李四"]
    assert result["plan"]["deliverables"] == ["项目简报", "任务清单"]
    assert result["plan"]["deadline"] == "2026-05-10"
    card_text = captured_cards[0]["elements"][0]["content"]
    assert "**成员：** 张三, 李四" in card_text
    assert "**交付物：** 项目简报, 任务清单" in card_text
    assert "**截止时间：** 2026-05-10" in card_text


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


def test_generate_plan_returns_redacted_flight_record():
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with patch("tools._hermes_send_card", return_value="om_real_message_id"):
        result = json.loads(_handle_generate_plan(
            {
                "input_text": "请查看 https://example.feishu.cn/docx/abc?token=secret",
                "title": "证据链项目",
                "goal": "验证 Flight Recorder",
                "members": ["张三"],
                "deliverables": ["验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id="oc_real_chat_id",
        ))

    flight_record = result["flight_record"]
    encoded = json.dumps(flight_record, ensure_ascii=False)
    assert flight_record["run_id"].startswith("pf_")
    assert flight_record["final_status"] == "planned"
    assert "证据链项目" in flight_record["markdown"]
    assert "oc_real_chat_id" not in encoded
    assert "om_real_message_id" not in encoded
    assert "https://example.feishu.cn" not in encoded
    assert "[redacted:chat_id]" in encoded
    assert "[redacted:message_id]" in encoded
    assert "[redacted:url]" in encoded


def test_generate_plan_returns_confirm_token_and_idempotency_key():
    chat_id = "oc_confirm_token"
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with patch("tools._hermes_send_card", return_value="om_confirm_token"):
        result = json.loads(_handle_generate_plan(
            {
                "input_text": "帮我准备确认协议项目",
                "title": "确认协议项目",
                "goal": "验证确认 token 和幂等 key",
                "members": ["张三"],
                "deliverables": ["验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id=chat_id,
        ))

    confirm_token = result["confirmation"]["confirm_token"]
    idempotency_key = result["confirmation"]["idempotency_key"]
    assert confirm_token.startswith("pct_")
    assert idempotency_key == _plan_idempotency_key(chat_id, result["plan"])
    assert result["flight_record"]["confirmation"]["confirm_token"] == confirm_token
    assert result["flight_record"]["confirmation"]["idempotency_key"] == idempotency_key
    with _plan_lock:
        pending = _pending_plans[chat_id]
        assert pending["confirm_token"] == confirm_token
        assert pending["idempotency_key"] == idempotency_key
        assert pending["plan"]["idempotency_key"] == idempotency_key
        assert any(ref["plan"].get("confirm_token") == confirm_token for ref in _card_action_refs.values())


def test_generate_plan_private_scope_returns_trace_without_card():
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with patch("tools._hermes_send_card") as send_card:
        result = json.loads(_handle_generate_plan(
            {
                "input_text": "帮我创建个人项目",
                "title": "个人项目",
                "goal": "验证私聊自治计划",
                "members": [],
                "deliverables": ["验证记录"],
                "deadline": "2026-05-11",
            },
            chat_id="oc_private_plan",
            chat_scope="private",
        ))

    assert result["status"] == "plan_generated"
    assert result["autonomy"]["mode"] == "auto"
    assert result["card_sent"] is False
    assert result["flight_record"]["final_status"] == "planned"
    send_card.assert_not_called()


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


def test_chat_scope_defaults_to_group_when_unknown():
    with patch.dict(sys.modules, {}, clear=False):
        scope = _get_chat_scope({})
    assert scope["scope"] == "group"


def test_create_autonomy_allows_private_scope_without_confirmation():
    scope = {"scope": "private"}
    confirm, mode, reason = _needs_confirmation_for_create(scope, [])
    assert confirm is False
    assert mode == "auto"
    assert "私聊" in reason or "直接" in reason


def test_create_autonomy_requires_group_confirmation():
    scope = {"scope": "group"}
    confirm, mode, reason = _needs_confirmation_for_create(scope, [])
    assert confirm is True
    assert mode == "must_confirm"
    assert "群聊" in reason


def test_update_autonomy_requires_remove_member_confirmation():
    confirm, mode, reason = _needs_confirmation_for_update(
        "remove_member", "张三", {"members": ["张三"]}, {"scope": "private"}, "oc1"
    )
    assert confirm is True
    assert mode == "must_confirm"
    assert "移除成员" in reason


def test_update_autonomy_allows_regular_progress_update():
    confirm, mode, reason = _needs_confirmation_for_update(
        "add_progress", "完成评审", {"members": ["张三"]}, {"scope": "private"}, "oc1"
    )
    assert confirm is False
    assert mode == "auto"
    assert "直接" in reason or "常规" in reason


def test_create_project_accepts_raw_confirmation_text_fallback():
    chat_id = "oc_same_turn_fallback"
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

    with (
        patch("tools._create_doc", return_value="https://example.invalid/doc"),
        patch("tools._create_bitable", return_value={
            "url": "https://example.invalid/base",
            "app_token": "app1",
            "table_id": "tbl1",
            "record_id": "rec1",
        }),
        patch("tools._create_task", return_value="任务已创建"),
        patch("tools._hermes_send_card", return_value=True),
        patch("tools._create_calendar_event", return_value=None),
        patch("tools._schedule_deadline_reminder", return_value=False),
        patch("tools._save_to_hermes_memory", return_value=True),
    ):
        result = json.loads(_handle_create_project_space(
            {
                "input_text": "确认执行",
                "title": "迁移验证项目",
                "goal": "验证迁移流程",
                "members": [],
                "deliverables": ["迁移验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id=chat_id,
        ))

    assert result["status"] == "project_space_created"
    with _project_registry_lock:
        assert "迁移验证项目" in _project_registry


def test_create_project_returns_redacted_flight_record():
    chat_id = "oc_create_trace"
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with (
        patch("tools._resolve_member", return_value="ou_real_member"),
        patch("tools._create_doc", return_value="https://example.feishu.cn/docx/abc?token=secret"),
        patch("tools._create_bitable", return_value={
            "url": "https://example.feishu.cn/base/app_token=real_app_token",
            "app_token": "app_token=real_app_token",
            "table_id": "tbl1",
            "record_id": "rec1",
        }),
        patch("tools._create_task", return_value="任务已创建"),
        patch("tools._hermes_send_card", return_value="om_entry_message_id"),
        patch("tools._create_calendar_event", return_value=None),
        patch("tools._schedule_deadline_reminder", return_value=False),
        patch("tools._save_to_hermes_memory", return_value=True),
    ):
        result = json.loads(_handle_create_project_space(
            {
                "title": "执行证据项目",
                "goal": "验证创建阶段 Flight Recorder",
                "members": ["张三"],
                "deliverables": ["验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id=chat_id,
            chat_scope="private",
        ))

    flight_record = result["flight_record"]
    encoded = json.dumps(flight_record, ensure_ascii=False)
    assert flight_record["run_id"].startswith("pf_")
    assert flight_record["final_status"] == "success"
    assert "执行证据项目" in flight_record["markdown"]
    assert "oc_create_trace" not in encoded
    assert "om_entry_message_id" not in encoded
    assert "https://example.feishu.cn" not in encoded
    assert "real_app_token" not in encoded
    assert "[redacted:chat_id]" in encoded
    assert "[redacted:message_id]" in encoded
    assert "[redacted:url]" in encoded
    assert "[redacted:app_token]" in encoded


def test_create_project_reuses_pending_idempotency_key_in_result_and_trace():
    chat_id = "oc_idempotency_result"
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with patch("tools._hermes_send_card", return_value="om_plan"):
        plan_result = json.loads(_handle_generate_plan(
            {
                "input_text": "帮我准备幂等项目",
                "title": "幂等项目",
                "goal": "验证执行阶段复用幂等 key",
                "members": ["张三"],
                "deliverables": ["验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id=chat_id,
        ))

    expected_key = plan_result["confirmation"]["idempotency_key"]
    with (
        patch("tools._resolve_member", return_value="ou_real_member"),
        patch("tools._create_doc", return_value="https://example.invalid/doc"),
        patch("tools._create_bitable", return_value={
            "url": "https://example.invalid/base",
            "app_token": "app_token=real_app_token",
            "table_id": "tbl1",
            "record_id": "rec1",
        }),
        patch("tools._create_task", return_value="任务已创建"),
        patch("tools._hermes_send_card", return_value="om_entry"),
        patch("tools._create_calendar_event", return_value=None),
        patch("tools._schedule_deadline_reminder", return_value=False),
        patch("tools._save_to_hermes_memory", return_value=True),
    ):
        result = json.loads(_handle_create_project_space(
            {"input_text": "确认执行"},
            chat_id=chat_id,
        ))

    assert result["status"] == "project_space_created"
    assert result["idempotency_key"] == expected_key
    assert result["flight_record"]["confirmation"]["idempotency_key"] == expected_key
    assert result["flight_record"]["confirmation"]["confirm_token"] == plan_result["confirmation"]["confirm_token"]


def test_create_project_falls_back_to_pending_plan_fields_when_input_text_only():
    chat_id = "oc_same_turn_pending_fields"
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
                "members": ["张三", "李四"],
                "deliverables": ["迁移验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id=chat_id,
        )

    with (
        patch("tools._create_doc", return_value="https://example.invalid/doc"),
        patch("tools._create_bitable", return_value={
            "url": "https://example.invalid/base",
            "app_token": "app1",
            "table_id": "tbl1",
            "record_id": "rec1",
        }),
        patch("tools._create_task", return_value="任务已创建"),
        patch("tools._hermes_send_card", return_value=True),
        patch("tools._create_calendar_event", return_value=None),
        patch("tools._schedule_deadline_reminder", return_value=False),
        patch("tools._save_to_hermes_memory", return_value=True),
    ):
        result = json.loads(_handle_create_project_space(
            {
                "input_text": "确认执行",
            },
            chat_id=chat_id,
        ))

    assert result["status"] == "project_space_created"
    assert result["title"] == "迁移验证项目"
    assert "✅ 项目空间已创建: 迁移验证项目" in result["display"]
    assert "👥 成员: 张三, 李四" in result["display"]
    assert "📋 任务: 迁移验证记录" in result["display"]
    assert "⏰ 截止: 2026-05-10" in result["display"]


def test_project_entry_card_uses_plain_member_names_for_visible_markdown():
    chat_id = "oc_entry_card_plain_members"
    captured_cards = []

    def fake_send_card(_chat_id, card):
        captured_cards.append(card)
        return "om_entry"

    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()

    with (
        patch("tools._resolve_member", return_value="ou_real_member"),
        patch("tools._create_doc", return_value="https://example.invalid/doc"),
        patch("tools._create_bitable", return_value={
            "url": "https://example.invalid/base",
            "app_token": "app1",
            "table_id": "tbl1",
            "record_id": "rec1",
        }),
        patch("tools._create_task", return_value="任务已创建"),
        patch("tools._hermes_send_card", side_effect=fake_send_card),
        patch("tools._create_calendar_event", return_value=None),
        patch("tools._schedule_deadline_reminder", return_value=False),
        patch("tools._save_to_hermes_memory", return_value=True),
    ):
        result = json.loads(_handle_create_project_space(
            {
                "title": "入口卡片成员项目",
                "goal": "验证入口卡片成员展示",
                "members": ["唐丁"],
                "deliverables": ["验证记录"],
                "deadline": "2026-05-12",
            },
            chat_id=chat_id,
            chat_scope="private",
        ))

    assert result["status"] == "project_space_created"
    entry_card = captured_cards[0]
    markdown = entry_card["elements"][0]["content"]
    assert "**成员：** 唐丁" in markdown
    assert "<at user_id=" not in markdown


def test_duplicate_confirmation_after_create_is_idempotent():
    chat_id = "oc_duplicate_confirmation"
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
        _recent_confirmed_projects.clear()

    with patch("tools._hermes_send_card", return_value="om_plan"):
        _handle_generate_plan(
            {
                "input_text": "帮我准备迁移验证项目，先给我确认卡片",
                "title": "迁移验证项目",
                "goal": "验证迁移流程",
                "members": ["张三", "李四"],
                "deliverables": ["迁移验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id=chat_id,
        )

    with (
        patch("tools._create_doc", return_value="https://example.invalid/doc"),
        patch("tools._create_bitable", return_value={
            "url": "https://example.invalid/base",
            "app_token": "app1",
            "table_id": "tbl1",
            "record_id": "rec1",
        }),
        patch("tools._create_task", return_value="任务已创建"),
        patch("tools._hermes_send_card", return_value=True),
        patch("tools._create_calendar_event", return_value=None),
        patch("tools._schedule_deadline_reminder", return_value=False),
        patch("tools._save_to_hermes_memory", return_value=True),
    ):
        created = json.loads(_handle_create_project_space(
            {"input_text": "确认执行"},
            chat_id=chat_id,
        ))
        duplicate = json.loads(_handle_create_project_space(
            {"input_text": "确认执行"},
            chat_id=chat_id,
        ))

    assert created["status"] == "project_space_created"
    assert duplicate["status"] == "duplicate_confirmation_ignored"
    assert duplicate["title"] == "迁移验证项目"
    assert "error" not in duplicate


def test_create_project_idempotency_key_prevents_duplicate_artifact_creation(tmp_path):
    chat_id = "oc_create_idempotency_cache"
    idempotency_key = "pik_same_plan"
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
        _recent_confirmed_projects.clear()
        from tools import _idempotent_project_results
        _idempotent_project_results.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        with (
            patch("tools._resolve_member", return_value="ou_real_member"),
            patch("tools._create_doc", return_value="https://example.invalid/doc") as create_doc,
            patch("tools._create_bitable", return_value={
                "url": "https://example.invalid/base",
                "app_token": "app1",
                "table_id": "tbl1",
                "record_id": "rec1",
            }) as create_bitable,
            patch("tools._create_task", return_value="任务已创建") as create_task,
            patch("tools._hermes_send_card", return_value="om_entry"),
            patch("tools._create_calendar_event", return_value=None),
            patch("tools._schedule_deadline_reminder", return_value=False),
            patch("tools._save_to_hermes_memory", return_value=True),
        ):
            first = json.loads(_handle_create_project_space(
                {
                    "title": "幂等缓存项目",
                    "goal": "验证同一幂等 key 不重复创建",
                    "members": ["张三"],
                    "deliverables": ["验证记录"],
                    "deadline": "2026-05-10",
                    "idempotency_key": idempotency_key,
                },
                chat_id=chat_id,
                chat_scope="private",
            ))
            second = json.loads(_handle_create_project_space(
                {
                    "title": "幂等缓存项目",
                    "goal": "验证同一幂等 key 不重复创建",
                    "members": ["张三"],
                    "deliverables": ["验证记录"],
                    "deadline": "2026-05-10",
                    "idempotency_key": idempotency_key,
                },
                chat_id=chat_id,
                chat_scope="private",
            ))

    assert first["status"] == "project_space_created"
    assert second["status"] == "project_space_replayed"
    assert second["idempotency_key"] == idempotency_key
    assert second["title"] == "幂等缓存项目"
    assert second["display"] == first["display"]
    assert create_doc.call_count == 1
    assert create_bitable.call_count == 1
    assert create_task.call_count == 1


def test_create_project_idempotency_replays_after_state_reload(tmp_path):
    chat_id = "oc_create_idempotency_persist"
    idempotency_key = "pik_persisted_plan"
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
        _recent_confirmed_projects.clear()
        from tools import _idempotent_project_results
        _idempotent_project_results.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        with (
            patch("tools._resolve_member", return_value="ou_real_member"),
            patch("tools._create_doc", return_value="https://example.invalid/doc") as create_doc,
            patch("tools._create_bitable", return_value={
                "url": "https://example.invalid/base",
                "app_token": "app1",
                "table_id": "tbl1",
                "record_id": "rec1",
            }) as create_bitable,
            patch("tools._create_task", return_value="任务已创建") as create_task,
            patch("tools._hermes_send_card", return_value="om_entry"),
            patch("tools._create_calendar_event", return_value=None),
            patch("tools._schedule_deadline_reminder", return_value=False),
            patch("tools._save_to_hermes_memory", return_value=True),
        ):
            first = json.loads(_handle_create_project_space(
                {
                    "title": "持久幂等项目",
                    "goal": "验证重启后幂等 replay",
                    "members": ["张三"],
                    "deliverables": ["验证记录"],
                    "deadline": "2026-05-10",
                    "idempotency_key": idempotency_key,
                },
                chat_id=chat_id,
                chat_scope="private",
            ))
            with _plan_lock:
                _idempotent_project_results.clear()
            replayed = json.loads(_handle_create_project_space(
                {
                    "title": "持久幂等项目",
                    "goal": "验证重启后幂等 replay",
                    "members": ["张三"],
                    "deliverables": ["验证记录"],
                    "deadline": "2026-05-10",
                    "idempotency_key": idempotency_key,
                },
                chat_id=chat_id,
                chat_scope="private",
            ))

    assert first["status"] == "project_space_created"
    assert replayed["status"] == "project_space_replayed"
    assert replayed["display"] == first["display"]
    assert create_doc.call_count == 1
    assert create_bitable.call_count == 1
    assert create_task.call_count == 1
    serialized = state_path.read_text(encoding="utf-8")
    assert "idempotency" in serialized
    assert "app1" not in serialized
    assert "ou_real_member" not in serialized


def test_create_project_rejects_non_confirming_input_text():
    chat_id = "oc_same_turn_reject"
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
            "input_text": "给我确认卡片",
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


def test_create_project_reports_unresolved_members():
    with _project_registry_lock:
        _project_registry.clear()

    def fake_resolve(name, chat_id):
        return "ou_zhangsan" if name == "张三" else None

    with (
        patch("tools._resolve_member", side_effect=fake_resolve),
        patch("tools._create_doc", return_value="https://example.invalid/doc"),
        patch("tools._create_bitable", return_value={
            "url": "https://example.invalid/base",
            "app_token": "app1",
            "table_id": "tbl1",
            "record_id": "rec1",
        }),
        patch("tools._create_task", return_value="任务已创建"),
        patch("tools._hermes_send_card", return_value=True),
        patch("tools._create_calendar_event", return_value=None),
        patch("tools._schedule_deadline_reminder", return_value=False),
        patch("tools._save_to_hermes_memory", return_value=True),
    ):
        result = json.loads(_handle_create_project_space(
            {
                "title": "成员解析项目",
                "goal": "验证成员解析失败反馈",
                "members": ["张三", "外部同学"],
                "deliverables": ["验证记录"],
                "deadline": "2026-06-01",
            },
            chat_id="oc_unresolved_member",
            _pilotflow_gate_consumed=True,
        ))

    assert result["status"] == "project_space_created"
    assert result["unresolved_members"] == ["外部同学"]
    assert any("外部同学" in item and "未能 @" in item for item in result["display"])
    assert "成员解析提醒" in result["instructions"]


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


def test_history_suggestions_can_be_applied_from_card_action():
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
    captured_cards = []

    def capture_card(chat_id, card):
        captured_cards.append(card)
        return f"om_history_apply_{len(captured_cards)}"

    with (
        patch("tools.registry", fake_registry),
        patch("tools._send_interactive_card_via_feishu", side_effect=capture_card),
        patch("tools._mark_card_message", return_value=True),
    ):
        _handle_generate_plan(
            {
                "input_text": "帮我准备新的活动项目",
                "title": "新活动项目",
                "goal": "筹备活动",
                "members": [],
                "deliverables": [],
                "deadline": "",
            },
            chat_id="oc_history_apply",
        )

    first_card = captured_cards[0]
    button_texts = [
        button["text"]["content"]
        for element in first_card["elements"]
        if element.get("tag") == "action"
        for button in element["actions"]
    ]
    assert "采用历史建议" in button_texts

    with _plan_lock:
        apply_action_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_history_apply" and ref["action"] == "apply_history_suggestions"
        )

    with (
        patch("tools.registry", fake_registry),
        patch("tools._send_interactive_card_via_feishu", side_effect=capture_card),
        patch("tools._mark_card_message", return_value=True),
    ):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{apply_action_id}"}}')

    assert result is None
    assert len(captured_cards) >= 2
    rebuilt_card = captured_cards[-1]
    rebuilt_text = rebuilt_card["elements"][0]["content"]
    assert "王五" in rebuilt_text
    assert "赵六" in rebuilt_text
    with _plan_lock:
        assert _pending_plans["oc_history_apply"]["plan"]["members"] == ["王五", "赵六"]


def test_history_suggestions_card_action_reports_failure_when_rebuilt_card_not_sent():
    with _plan_lock:
        _pending_plans.clear()
        _card_action_refs.clear()
        _pending_plans["oc_history_apply_fail"] = {
            "plan": {
                "title": "失败历史建议项目",
                "goal": "验证历史建议失败",
                "members": [],
                "deliverables": [],
                "deadline": "",
                "risks": [],
            }
        }
    action_id = _create_card_action_ref(
        "oc_history_apply_fail",
        "apply_history_suggestions",
        {"history_suggested_fields": {"members": ["王五"], "deliverables": ["活动方案"]}},
    )
    with _plan_lock:
        _card_action_refs[action_id]["message_id"] = "om_history_apply_fail"

    marked_cards = []

    def capture_mark(message_id, title, content, template):
        marked_cards.append((message_id, title, content, template))
        return True

    with (
        patch("tools._send_interactive_card_via_feishu", return_value=False),
        patch("tools._mark_card_message", side_effect=capture_mark),
    ):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert "历史建议已应用，但确认卡片发送失败" in result
    assert marked_cards == [
        (
            "om_history_apply_fail",
            "操作失败",
            "历史建议已应用，但确认卡片发送失败。请在群里重新生成计划。",
            "red",
        )
    ]


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


def test_query_status_dashboard_shows_recent_progress_after_restart(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        assert _save_project_state(
            "重启进展项目",
            "验证重启后看板进展",
            [],
            ["验收记录"],
            "2026-05-20",
            "进行中",
            updates=[{"action": "进展", "value": "完成原型评审"}],
        )
        captured = {}

        def capture_card(chat_id, card):
            captured["card"] = card
            return "om_restart_progress"

        with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
            result = _handle_query_status({"query": "项目进展"}, chat_id="oc_restart_progress")

    assert "项目看板已发送" in result
    body = captured["card"]["elements"][0]["text"]["content"]
    assert "重启进展项目" in body
    assert "最近进展: 完成原型评审" in body


def test_query_status_sends_standup_briefing_card_with_priority_summary():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    due_soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    _register_project(
        "风险简报项目", ["张三"], due_soon, "有风险", [],
        goal="验证简报风险优先", deliverables=["修复方案"],
    )
    _project_registry["风险简报项目"]["updates"] = [{"action": "进展", "value": "接口仍阻塞"}]
    _register_project(
        "逾期简报项目", ["李四"], overdue, "进行中", [],
        goal="验证简报逾期优先", deliverables=["验收记录"],
    )
    _project_registry["逾期简报项目"]["updates"] = [{"action": "进展", "value": "等待业务验收"}]
    _register_project(
        "正常简报项目", ["王五"], due_soon, "进行中", [],
        goal="验证简报正常项目", deliverables=["上线清单"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_standup_briefing"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "发一份站会简报"}, chat_id="oc_standup_briefing")

    assert "项目简报已发送" in result
    card = captured["card"]
    assert card["header"]["title"]["content"] == "项目简报"
    content = json.dumps(card, ensure_ascii=False)
    assert "总项目 3" in content
    assert "风险 1" in content
    assert "逾期 1" in content
    assert "近期截止 2" in content
    assert content.index("风险简报项目") < content.index("正常简报项目")
    assert content.index("逾期简报项目") < content.index("正常简报项目")
    assert "接口仍阻塞" in content
    assert "等待业务验收" in content
    actions = [element for element in card["elements"] if element.get("tag") == "action"]
    assert actions
    button_texts = [button["text"]["content"] for button in actions[0]["actions"]]
    assert button_texts == ["查看风险", "查看逾期", "催办逾期", "批量创建待办"]
    button_values = [button["value"] for button in actions[0]["actions"]]
    assert all("pilotflow_action_id" in value for value in button_values)
    assert all("pilotflow_chat_id" not in value for value in button_values)
    with _plan_lock:
        refs = [ref for ref in _card_action_refs.values() if ref["chat_id"] == "oc_standup_briefing"]
    assert {ref["action"] for ref in refs} >= {"dashboard_filter", "briefing_batch_reminder"}


def test_standup_briefing_overdue_button_sends_batch_reminders():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    future = (dt.date.today() + dt.timedelta(days=5)).isoformat()
    _register_project(
        "简报逾期催办项目", ["张三"], overdue, "进行中", ["文档: https://example.invalid/doc-overdue"],
        goal="验证简报催办", deliverables=["验收记录"],
        app_token="app_overdue", table_id="tbl_overdue", record_id="rec_overdue",
    )
    _register_project(
        "简报未逾期项目", ["李四"], future, "进行中", ["文档: https://example.invalid/doc-future"],
        goal="验证简报催办", deliverables=["验收记录"],
        app_token="app_future", table_id="tbl_future", record_id="rec_future",
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_briefing_buttons"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        _handle_query_status({"query": "站会简报"}, chat_id="oc_briefing_reminder")

    with _plan_lock:
        reminder_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_briefing_reminder" and ref["action"] == "briefing_batch_reminder"
        )
    sent_messages = []
    with (
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        result = json.loads(_handle_card_action(
            {"action_value": json.dumps({"pilotflow_action_id": reminder_id}, ensure_ascii=False)},
            chat_id="ignored_chat",
        ))

    assert result["status"] == "briefing_batch_reminder_sent"
    assert result["filter"] == "overdue"
    assert result["reminder_count"] == 1
    assert result["projects"] == ["简报逾期催办项目"]
    assert len(sent_messages) == 1
    assert sent_messages[0][0] == "oc_briefing_reminder"
    assert "简报逾期催办项目" in sent_messages[0][1]
    assert "简报未逾期项目" not in sent_messages[0][1]
    append_doc.assert_called_once()
    append_history.assert_called_once()


def test_card_command_briefing_batch_reminder_updates_card_after_success():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    _register_project(
        "桥接逾期催办项目", ["张三"], overdue, "进行中", [],
        goal="验证桥接批量催办", deliverables=["验收记录"],
        app_token="app_bridge_reminder", table_id="tbl_bridge_reminder", record_id="rec_bridge_reminder",
    )
    action_id = _create_card_action_ref(
        "oc_bridge_batch_reminder",
        "briefing_batch_reminder",
        {"filter": "overdue", "value": "请今天同步进展"},
    )
    with _plan_lock:
        _card_action_refs[action_id]["message_id"] = "om_bridge_batch_reminder"

    marked_cards = []

    def capture_mark(message_id, title, content, template):
        marked_cards.append((message_id, title, content, template))
        return True

    with (
        patch("tools._hermes_send", return_value=True),
        patch("tools._append_project_doc_update", return_value=True),
        patch("tools._append_bitable_update_record", return_value=True),
        patch("tools._mark_card_message", side_effect=capture_mark),
    ):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert result is None
    assert marked_cards == [
        (
            "om_bridge_batch_reminder",
            "批量催办已发送",
            "已向 1 个逾期项目发送催办提醒。",
            "yellow",
        )
    ]


def test_card_command_briefing_followup_feedback_includes_owner_scope():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    due_soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    _register_project(
        "桥接张三风险待办项目", ["张三"], due_soon, "有风险", [],
        goal="验证负责人反馈", deliverables=["验收记录"],
    )
    action_id = _create_card_action_ref(
        "oc_bridge_owner_followup",
        "briefing_batch_followup_task",
        {"filter": "risk", "member_filters": ["张三"]},
    )
    with _plan_lock:
        _card_action_refs[action_id]["message_id"] = "om_bridge_owner_followup"

    marked_cards = []

    def capture_mark(message_id, title, content, template):
        marked_cards.append((message_id, title, content, template))
        return True

    with (
        patch("tools._create_task", return_value="桥接张三风险待办项目跟进: https://example.invalid/task/task_owner_feedback"),
        patch("tools._hermes_send", return_value=True),
        patch("tools._append_project_doc_update", return_value=True),
        patch("tools._append_bitable_update_record", return_value=False),
        patch("tools._mark_card_message", side_effect=capture_mark),
    ):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert result is None
    assert marked_cards == [
        (
            "om_bridge_owner_followup",
            "批量待办已创建",
            "已为 1 个张三负责的风险项目创建跟进待办。",
            "green",
        )
    ]


def test_filtered_briefing_reminder_button_uses_current_filter():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    due_soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    _register_project(
        "简报风险催办项目", ["张三"], due_soon, "有风险", [],
        goal="验证风险筛选催办", deliverables=["验收记录"],
    )
    _register_project(
        "简报普通催办项目", ["李四"], due_soon, "进行中", [],
        goal="验证风险筛选催办", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_briefing_risk_reminder"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        _handle_query_status({"query": "风险项目简报"}, chat_id="oc_briefing_risk_reminder")

    button_texts = [
        button["text"]["content"]
        for element in captured["card"]["elements"]
        if element.get("tag") == "action"
        for button in element["actions"]
    ]
    assert "催办风险" in button_texts
    assert "催办逾期" not in button_texts

    with _plan_lock:
        reminder_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_briefing_risk_reminder" and ref["action"] == "briefing_batch_reminder"
        )

    sent_messages = []
    with (
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True),
        patch("tools._append_bitable_update_record", return_value=False),
    ):
        result = json.loads(_handle_card_action(
            {"action_value": json.dumps({"pilotflow_action_id": reminder_id}, ensure_ascii=False)},
            chat_id="ignored_chat",
        ))

    assert result["status"] == "briefing_batch_reminder_sent"
    assert result["filter"] == "risk"
    assert result["reminder_count"] == 1
    assert result["projects"] == ["简报风险催办项目"]
    assert len(sent_messages) == 1
    assert "简报风险催办项目" in sent_messages[0][1]
    assert "简报普通催办项目" not in sent_messages[0][1]


def test_standup_briefing_overdue_button_can_create_batch_followup_tasks():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    future = (dt.date.today() + dt.timedelta(days=5)).isoformat()
    _register_project(
        "简报待办逾期项目", ["张三"], overdue, "进行中", [],
        goal="验证简报待办", deliverables=["验收记录"],
        app_token="app_followup_overdue", table_id="tbl_followup_overdue", record_id="rec_followup_overdue",
    )
    _register_project(
        "简报待办未逾期项目", ["李四"], future, "进行中", [],
        goal="验证简报待办", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_briefing_followup"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        _handle_query_status({"query": "发一份站会简报"}, chat_id="oc_briefing_followup")

    button_texts = [
        button["text"]["content"]
        for element in captured["card"]["elements"]
        if element.get("tag") == "action"
        for button in element["actions"]
    ]
    assert "批量创建待办" in button_texts

    with _plan_lock:
        followup_action_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_briefing_followup" and ref["action"] == "briefing_batch_followup_task"
        )

    sent_messages = []
    with (
        patch("tools._create_task", return_value="简报待办逾期项目跟进: https://example.invalid/task/task_321") as create_task,
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        result = json.loads(_handle_card_action(
            {"action_value": json.dumps({"pilotflow_action_id": followup_action_id}, ensure_ascii=False)},
            chat_id="ignored_chat",
        ))

    assert result["status"] == "briefing_batch_followup_task_created"
    assert result["project_count"] == 1
    assert result["projects"] == ["简报待办逾期项目"]
    create_task.assert_called_once_with(
        "简报待办逾期项目跟进",
        "项目: 简报待办逾期项目",
        "张三",
        overdue,
        "oc_briefing_followup",
        ["张三"],
    )
    assert sent_messages
    assert sent_messages[0][0] == "oc_briefing_followup"
    assert "已为 1 个逾期项目创建跟进待办" in sent_messages[0][1]
    assert "简报待办逾期项目" in sent_messages[0][1]
    append_doc.assert_called_once()
    append_history.assert_called_once()


def test_standup_briefing_risk_button_can_create_batch_followup_tasks():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    due_soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    future = (dt.date.today() + dt.timedelta(days=5)).isoformat()
    _register_project(
        "简报风险待办项目", ["张三"], due_soon, "有风险", [],
        goal="验证简报风险待办", deliverables=["验收记录"],
        app_token="app_followup_risk", table_id="tbl_followup_risk", record_id="rec_followup_risk",
    )
    _register_project(
        "简报正常待办项目", ["李四"], future, "进行中", [],
        goal="验证简报风险待办", deliverables=["验收记录"],
        app_token="app_followup_normal", table_id="tbl_followup_normal", record_id="rec_followup_normal",
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_briefing_risk_followup"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        _handle_query_status({"query": "风险项目简报"}, chat_id="oc_briefing_risk_followup")

    with _plan_lock:
        followup_action_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_briefing_risk_followup" and ref["action"] == "briefing_batch_followup_task"
        )

    sent_messages = []
    with (
        patch("tools._create_task", return_value="简报风险待办项目跟进: https://example.invalid/task/task_654") as create_task,
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        result = json.loads(_handle_card_action(
            {"action_value": json.dumps({"pilotflow_action_id": followup_action_id}, ensure_ascii=False)},
            chat_id="ignored_chat",
        ))

    assert result["status"] == "briefing_batch_followup_task_created"
    assert result["project_count"] == 1
    assert result["projects"] == ["简报风险待办项目"]
    create_task.assert_called_once_with(
        "简报风险待办项目跟进",
        "项目: 简报风险待办项目",
        "张三",
        due_soon,
        "oc_briefing_risk_followup",
        ["张三"],
    )
    assert sent_messages
    assert sent_messages[0][0] == "oc_briefing_risk_followup"
    assert "已为 1 个风险项目创建跟进待办" in sent_messages[0][1]
    assert "简报风险待办项目" in sent_messages[0][1]
    append_doc.assert_called_once()
    append_history.assert_called_once()


def test_filtered_briefing_followup_can_filter_by_owner():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    due_soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    _register_project(
        "张三风险待办项目", ["张三"], due_soon, "有风险", [],
        goal="验证负责人风险待办", deliverables=["验收记录"],
    )
    _register_project(
        "李四风险待办项目", ["李四"], due_soon, "有风险", [],
        goal="验证负责人风险待办", deliverables=["验收记录"],
    )

    with patch("tools._send_interactive_card_via_feishu", return_value="om_owner_risk_followup"):
        _handle_query_status({"query": "张三负责的风险项目简报"}, chat_id="oc_owner_risk_followup")

    with _plan_lock:
        followup_action_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_owner_risk_followup" and ref["action"] == "briefing_batch_followup_task"
        )

    sent_messages = []
    with (
        patch("tools._create_task", return_value="张三风险待办项目跟进: https://example.invalid/task/task_owner") as create_task,
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True),
        patch("tools._append_bitable_update_record", return_value=False),
    ):
        result = json.loads(_handle_card_action(
            {"action_value": json.dumps({"pilotflow_action_id": followup_action_id}, ensure_ascii=False)},
            chat_id="ignored_chat",
        ))

    assert result["status"] == "briefing_batch_followup_task_created"
    assert result["member_filters"] == ["张三"]
    assert result["project_count"] == 1
    assert result["projects"] == ["张三风险待办项目"]
    create_task.assert_called_once()
    assert "张三风险待办项目" in sent_messages[0][1]
    assert "李四风险待办项目" not in sent_messages[0][1]


def test_filtered_briefing_followup_button_names_current_filter():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    due_soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    _register_project(
        "简报近期待办项目", ["张三"], due_soon, "进行中", [],
        goal="验证近期截止待办", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_briefing_due_soon_followup"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        _handle_query_status({"query": "近期截止项目简报"}, chat_id="oc_briefing_due_soon_followup")

    button_texts = [
        button["text"]["content"]
        for element in captured["card"]["elements"]
        if element.get("tag") == "action"
        for button in element["actions"]
    ]
    assert "创建近期待办" in button_texts
    assert "批量创建待办" not in button_texts


def test_card_command_briefing_batch_followup_updates_card_after_success_with_filter_label():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    due_soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    _register_project(
        "桥接风险待办项目", ["张三"], due_soon, "有风险", [],
        goal="验证桥接风险待办", deliverables=["验收记录"],
        app_token="app_bridge_risk", table_id="tbl_bridge_risk", record_id="rec_bridge_risk",
    )
    action_id = _create_card_action_ref(
        "oc_bridge_risk_followup",
        "briefing_batch_followup_task",
        {"filter": "risk"},
    )
    with _plan_lock:
        _card_action_refs[action_id]["message_id"] = "om_bridge_risk_followup"

    marked_cards = []

    def capture_mark(message_id, title, content, template):
        marked_cards.append((message_id, title, content, template))
        return True

    with (
        patch("tools._create_task", return_value="桥接风险待办项目跟进: https://example.invalid/task/task_987"),
        patch("tools._hermes_send", return_value=True),
        patch("tools._append_project_doc_update", return_value=True),
        patch("tools._append_bitable_update_record", return_value=True),
        patch("tools._mark_card_message", side_effect=capture_mark),
    ):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert result is None
    assert marked_cards == [
        (
            "om_bridge_risk_followup",
            "批量待办已创建",
            "已为 1 个风险项目创建跟进待办。",
            "green",
        )
    ]


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
    assert {ref["action"] for ref in refs} == {"mark_project_done", "create_followup_task"}


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


def test_query_status_filters_projects_by_member_name():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "张三负责项目", ["张三"], "2026-05-20", "进行中", [],
        goal="验证负责人筛选", deliverables=["验收记录"],
    )
    _register_project(
        "李四负责项目", ["李四"], "2026-05-20", "进行中", [],
        goal="验证负责人筛选", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "张三负责哪些项目"}, chat_id="oc_member_filter")

    assert "项目看板已发送" in result
    content = json.dumps(captured["card"], ensure_ascii=False)
    assert "张三负责项目" in content
    assert "李四负责项目" not in content


def test_query_status_filters_projects_by_mentioned_member_without_raw_at_markup():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "王五推进项目", ["王五"], "2026-05-20", "进行中", [],
        goal="验证提及筛选", deliverables=["验收记录"],
    )
    _register_project(
        "赵六推进项目", ["赵六"], "2026-05-20", "进行中", [],
        goal="验证提及筛选", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    query = '<at user_id="ou_runtime_member">王五</at> 负责哪些项目'
    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": query}, chat_id="oc_mention_member_filter")

    assert "项目看板已发送" in result
    content = json.dumps(captured["card"], ensure_ascii=False)
    assert "王五推进项目" in content
    assert "赵六推进项目" not in content
    assert "<at user_id=" not in content
    assert "@王五" in content


def test_query_status_hides_archived_projects_by_default_and_shows_when_requested():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "进行中生命周期项目", [], "2026-05-20", "进行中", [],
        goal="验证归档隐藏", deliverables=["验收记录"],
    )
    _register_project(
        "已归档生命周期项目", [], "2026-05-20", "已归档", [],
        goal="验证归档隐藏", deliverables=["验收记录"],
    )
    captured_cards = []

    def capture_card(chat_id, card):
        captured_cards.append(card)
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        default_result = _handle_query_status({"query": "项目进展"}, chat_id="oc_archive_default")
        all_result = _handle_query_status({"query": "显示所有项目"}, chat_id="oc_archive_all")
        archived_result = _handle_query_status({"query": "看看归档项目"}, chat_id="oc_archive_only")

    assert "项目看板已发送" in default_result
    default_content = json.dumps(captured_cards[0], ensure_ascii=False)
    assert "进行中生命周期项目" in default_content
    assert "已归档生命周期项目" not in default_content

    assert "项目看板已发送" in all_result
    all_content = json.dumps(captured_cards[1], ensure_ascii=False)
    assert "进行中生命周期项目" in all_content
    assert "已归档生命周期项目" in all_content

    assert "项目看板已发送" in archived_result
    archived_content = json.dumps(captured_cards[2], ensure_ascii=False)
    assert "进行中生命周期项目" not in archived_content
    assert "已归档生命周期项目" in archived_content


def test_query_status_filters_risk_projects():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "正常推进项目", [], "2026-05-20", "进行中", [],
        goal="验证风险筛选", deliverables=["验收记录"],
    )
    _register_project(
        "接口阻塞项目", [], "2026-05-20", "有风险", [],
        goal="验证风险筛选", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "看看风险项目"}, chat_id="oc_risk_filter")

    assert "项目看板已发送" in result
    content = json.dumps(captured["card"], ensure_ascii=False)
    assert "接口阻塞项目" in content
    assert "正常推进项目" not in content
    assert "第 1/1 页" in content


def test_query_status_filters_overdue_projects_with_red_dashboard():
    with _project_registry_lock:
        _project_registry.clear()
    overdue = (dt.date.today() - dt.timedelta(days=2)).isoformat()
    future = (dt.date.today() + dt.timedelta(days=5)).isoformat()
    _register_project(
        "逾期跟进项目", [], overdue, "进行中", [],
        goal="验证逾期筛选", deliverables=["验收记录"],
    )
    _register_project(
        "未逾期项目", [], future, "进行中", [],
        goal="验证逾期筛选", deliverables=["验收记录"],
    )
    _register_project(
        "已完成逾期项目", [], overdue, "已完成", [],
        goal="验证逾期筛选", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "看看逾期项目"}, chat_id="oc_overdue_filter")

    assert "项目看板已发送" in result
    assert captured["card"]["header"]["template"] == "red"
    content = json.dumps(captured["card"], ensure_ascii=False)
    assert "逾期跟进项目" in content
    assert "未逾期项目" not in content
    assert "已完成逾期项目" not in content
    actions = [element for element in captured["card"]["elements"] if element.get("tag") == "action"]
    assert actions
    button_texts = [button["text"]["content"] for button in actions[0]["actions"]]
    assert "创建待办" in button_texts


def test_query_status_filters_due_soon_projects_with_yellow_dashboard():
    with _project_registry_lock:
        _project_registry.clear()
    due_soon = (dt.date.today() + dt.timedelta(days=3)).isoformat()
    later = (dt.date.today() + dt.timedelta(days=12)).isoformat()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    _register_project(
        "快到期项目", [], due_soon, "进行中", [],
        goal="验证到期筛选", deliverables=["验收记录"],
    )
    _register_project(
        "稍后到期项目", [], later, "进行中", [],
        goal="验证到期筛选", deliverables=["验收记录"],
    )
    _register_project(
        "已经逾期项目", [], overdue, "进行中", [],
        goal="验证到期筛选", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "看看近期截止"}, chat_id="oc_due_soon_filter")

    assert "项目看板已发送" in result
    assert captured["card"]["header"]["template"] == "yellow"
    content = json.dumps(captured["card"], ensure_ascii=False)
    assert "快到期项目" in content
    assert "稍后到期项目" not in content
    assert "已经逾期项目" not in content


def test_deadline_dashboard_offers_reminder_button_without_chat_id_payload():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    overdue = (dt.date.today() - dt.timedelta(days=2)).isoformat()
    _register_project(
        "催办按钮项目", ["张三"], overdue, "进行中", [],
        goal="验证催办按钮", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "看看逾期项目"}, chat_id="oc_reminder_button")

    assert "项目看板已发送" in result
    actions = [element for element in captured["card"]["elements"] if element.get("tag") == "action"]
    assert actions
    button_text = [button["text"]["content"] for button in actions[0]["actions"]]
    assert button_text == ["查看状态", "标记完成", "发送提醒", "创建待办"]
    reminder_value = actions[0]["actions"][2]["value"]
    assert "pilotflow_action_id" in reminder_value
    assert "pilotflow_chat_id" not in reminder_value
    with _plan_lock:
        refs = [ref for ref in _card_action_refs.values() if ref["chat_id"] == "oc_reminder_button"]
    assert {ref["action"] for ref in refs} >= {"project_status", "mark_project_done", "send_project_reminder", "project_followup_task"}


def test_filtered_briefing_dashboard_buttons_keep_owner_scope():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    _register_project(
        "张三逾期筛选项目", ["张三"], overdue, "进行中", [],
        goal="验证负责人看板筛选", deliverables=["验收记录"],
    )
    _register_project(
        "李四逾期筛选项目", ["李四"], overdue, "进行中", [],
        goal="验证负责人看板筛选", deliverables=["验收记录"],
    )
    captured_cards = []

    def capture_card(chat_id, card):
        captured_cards.append(card)
        return f"mid-{len(captured_cards)}"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        _handle_query_status({"query": "张三负责的逾期项目简报"}, chat_id="oc_owner_scope_dashboard")

    actions = [element for element in captured_cards[0]["elements"] if element.get("tag") == "action"]
    assert actions
    button_texts = [button["text"]["content"] for button in actions[0]["actions"]]
    assert "查看逾期" in button_texts

    with _plan_lock:
        filter_action_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if (
                ref["chat_id"] == "oc_owner_scope_dashboard"
                and ref["action"] == "dashboard_filter"
                and ref["plan"].get("filter") == "overdue"
            )
        )

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{filter_action_id}"}}')

    assert result is None
    assert len(captured_cards) == 2
    content = json.dumps(captured_cards[1], ensure_ascii=False)
    assert "张三逾期筛选项目" in content
    assert "李四逾期筛选项目" not in content


def test_dashboard_filter_button_keeps_owner_scope_when_clicked_from_owner_briefing():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    _register_project(
        "张三筛选风险项目", ["张三"], overdue, "有风险", [],
        goal="验证负责人筛选看板", deliverables=["验收记录"],
    )
    _register_project(
        "李四筛选风险项目", ["李四"], overdue, "有风险", [],
        goal="验证负责人筛选看板", deliverables=["验收记录"],
    )
    captured_cards = []

    def capture_card(chat_id, card):
        captured_cards.append(card)
        return f"mid-{len(captured_cards)}"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        _handle_query_status({"query": "张三负责的风险项目简报"}, chat_id="oc_owner_dashboard_filter")

    with _plan_lock:
        filter_action_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_owner_dashboard_filter" and ref["action"] == "dashboard_filter"
        )

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{filter_action_id}"}}')

    assert result is None
    assert len(captured_cards) == 2
    second_content = json.dumps(captured_cards[1], ensure_ascii=False)
    assert "张三筛选风险项目" in second_content
    assert "李四筛选风险项目" not in second_content


def test_project_reminder_card_action_sends_chinese_group_reminder():
    with _project_registry_lock:
        _project_registry.clear()
    deadline = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    _register_project(
        "卡片催办项目", ["张三"], deadline, "进行中", [],
        goal="验证卡片催办", deliverables=["验收记录"],
    )
    sent_messages = []
    action_value = json.dumps({"pilotflow_action": "send_project_reminder", "title": "卡片催办项目"}, ensure_ascii=False)

    with patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_reminder_action"))

    assert result["status"] == "project_reminder_sent"
    assert result["project"] == "卡片催办项目"
    assert sent_messages
    chat_id, message = sent_messages[0]
    assert chat_id == "oc_reminder_action"
    assert "项目催办" in message
    assert "卡片催办项目" in message
    assert deadline in message
    assert "张三" in message
    assert "pilotflow" not in message.lower()


def test_project_reminder_card_action_records_doc_and_bitable_history():
    with _project_registry_lock:
        _project_registry.clear()
    deadline = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    _register_project(
        "催办留痕项目", ["张三"], deadline, "进行中", ["文档: https://example.invalid/doc"],
        goal="验证催办留痕", deliverables=["验收记录"],
        app_token="app1", table_id="tbl1", record_id="rec1",
    )
    action_value = json.dumps({"pilotflow_action": "send_project_reminder", "title": "催办留痕项目"}, ensure_ascii=False)

    with (
        patch("tools._hermes_send", return_value=True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_reminder_trace"))

    assert result["status"] == "project_reminder_sent"
    assert result["doc_updated"] is True
    assert result["bitable_history_created"] is True
    append_doc.assert_called_once_with(
        "催办留痕项目",
        _project_registry["催办留痕项目"],
        "催办",
        "已发送催办提醒",
    )
    append_history.assert_called_once()
    args = append_history.call_args.args
    assert args[0] == "app1"
    assert args[1] == "tbl1"
    assert args[2] == "催办"
    assert args[3] == "已发送催办提醒"


def test_update_project_send_reminder_reuses_group_reminder_trace():
    with _project_registry_lock:
        _project_registry.clear()
    deadline = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    _register_project(
        "自然语言催办项目", ["张三"], deadline, "进行中", ["文档: https://example.invalid/doc"],
        goal="验证自然语言催办", deliverables=["验收记录"],
        app_token="app1", table_id="tbl1", record_id="rec1",
    )
    sent_messages = []

    with (
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "自然语言催办", "action": "send_reminder", "value": "请今天同步进展"},
            chat_id="oc_update_reminder",
        ))

    assert result["status"] == "project_updated"
    assert result["action"] == "send_reminder"
    assert result["reminder_sent"] is True
    assert result["doc_updated"] is True
    assert result["bitable_history_created"] is True
    assert sent_messages
    chat_id, message = sent_messages[0]
    assert chat_id == "oc_update_reminder"
    assert "项目催办" in message
    assert "自然语言催办项目" in message
    assert "张三" in message
    assert "pilotflow" not in message.lower()
    append_doc.assert_called_once_with(
        "自然语言催办项目",
        _project_registry["自然语言催办项目"],
        "催办",
        "请今天同步进展",
    )
    append_history.assert_called_once()
    args = append_history.call_args.args
    assert args[0] == "app1"
    assert args[1] == "tbl1"
    assert args[2] == "催办"
    assert args[3] == "请今天同步进展"


def test_update_project_send_reminder_can_batch_overdue_projects():
    with _project_registry_lock:
        _project_registry.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    future = (dt.date.today() + dt.timedelta(days=10)).isoformat()
    _register_project(
        "批量逾期催办项目", ["张三"], overdue, "进行中", ["文档: https://example.invalid/doc-overdue"],
        goal="验证批量逾期催办", deliverables=["验收记录"],
        app_token="app_overdue", table_id="tbl_overdue", record_id="rec_overdue",
    )
    _register_project(
        "批量未到期项目", ["李四"], future, "进行中", ["文档: https://example.invalid/doc-future"],
        goal="验证批量逾期催办", deliverables=["验收记录"],
        app_token="app_future", table_id="tbl_future", record_id="rec_future",
    )
    _register_project(
        "批量已完成逾期项目", ["王五"], overdue, "已完成", ["文档: https://example.invalid/doc-done"],
        goal="验证批量逾期催办", deliverables=["验收记录"],
        app_token="app_done", table_id="tbl_done", record_id="rec_done",
    )
    sent_messages = []

    with (
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "逾期项目", "action": "send_reminder", "value": "请今天同步进展"},
            chat_id="oc_batch_overdue_reminder",
        ))

    assert result["status"] == "project_reminders_sent"
    assert result["reminder_count"] == 1
    assert result["projects"] == ["批量逾期催办项目"]
    assert len(sent_messages) == 1
    assert sent_messages[0][0] == "oc_batch_overdue_reminder"
    assert "批量逾期催办项目" in sent_messages[0][1]
    assert "批量未到期项目" not in sent_messages[0][1]
    assert "批量已完成逾期项目" not in sent_messages[0][1]
    append_doc.assert_called_once()
    assert append_doc.call_args.args[0] == "批量逾期催办项目"
    append_history.assert_called_once()
    assert append_history.call_args.args[:4] == ("app_overdue", "tbl_overdue", "催办", "请今天同步进展")


def test_update_project_batch_reminder_can_filter_overdue_by_owner():
    with _project_registry_lock:
        _project_registry.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    _register_project(
        "张三逾期催办项目", ["张三"], overdue, "进行中", ["文档: https://example.invalid/doc-zhang"],
        goal="验证按负责人批量催办", deliverables=["验收记录"],
        app_token="app_zhang", table_id="tbl_zhang", record_id="rec_zhang",
    )
    _register_project(
        "李四逾期催办项目", ["李四"], overdue, "进行中", ["文档: https://example.invalid/doc-li"],
        goal="验证按负责人批量催办", deliverables=["验收记录"],
        app_token="app_li", table_id="tbl_li", record_id="rec_li",
    )
    sent_messages = []

    with (
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "张三负责的逾期项目", "action": "send_reminder", "value": "请今天同步进展"},
            chat_id="oc_batch_owner_reminder",
        ))

    assert result["status"] == "project_reminders_sent"
    assert result["filter"] == "overdue"
    assert result["member_filters"] == ["张三"]
    assert result["reminder_count"] == 1
    assert result["projects"] == ["张三逾期催办项目"]
    assert len(sent_messages) == 1
    assert "张三逾期催办项目" in sent_messages[0][1]
    assert "李四逾期催办项目" not in sent_messages[0][1]
    append_doc.assert_called_once()
    assert append_doc.call_args.args[0] == "张三逾期催办项目"
    append_history.assert_called_once()
    assert append_history.call_args.args[:4] == ("app_zhang", "tbl_zhang", "催办", "请今天同步进展")


def test_risk_project_dashboard_offers_resolve_risk_button():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "卡片风险项目", [], "2026-05-20", "有风险", [],
        goal="验证风险按钮", deliverables=["验收记录"],
    )
    captured = {}

    def capture_card(chat_id, card):
        captured["card"] = card
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "看看风险项目"}, chat_id="oc_risk_button")

    assert "项目看板已发送" in result
    actions = [
        element for element in captured["card"]["elements"]
        if element.get("tag") == "action"
    ]
    assert actions
    assert actions[0]["actions"][1]["text"]["content"] == "解除风险"
    with _plan_lock:
        refs = [ref for ref in _card_action_refs.values() if ref["chat_id"] == "oc_risk_button"]
    assert {ref["action"] for ref in refs} >= {"project_status", "resolve_risk"}


def test_query_status_paginates_large_dashboards():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    for i in range(1, 13):
        _register_project(
            f"分页项目{i:02d}", [], "2026-05-20", "进行中", [],
            goal="验证分页", deliverables=["验收记录"],
        )
    captured_cards = []

    def capture_card(chat_id, card):
        captured_cards.append(card)
        return True

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        first_result = _handle_query_status({"query": "项目进展"}, chat_id="oc_page_1")
        second_result = _handle_query_status({"query": "项目进展第2页"}, chat_id="oc_page_2")

    assert "项目看板已发送" in first_result
    first_content = json.dumps(captured_cards[0], ensure_ascii=False)
    assert "分页项目01" in first_content
    assert "分页项目10" in first_content
    assert "分页项目11" not in first_content
    assert "第 1/2 页" in first_content

    assert "项目看板已发送" in second_result
    second_content = json.dumps(captured_cards[1], ensure_ascii=False)
    assert "分页项目01" not in second_content
    assert "分页项目11" in second_content
    assert "分页项目12" in second_content
    assert "第 2/2 页" in second_content


def test_dashboard_pagination_button_sends_next_page_card():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    for i in range(1, 13):
        _register_project(
            f"按钮分页项目{i:02d}", [], "2026-05-20", "进行中", [],
            goal="验证按钮分页", deliverables=["验收记录"],
        )
    captured_cards = []

    def capture_card(chat_id, card):
        captured_cards.append(card)
        return f"mid-{len(captured_cards)}"

    with patch("tools._send_interactive_card_via_feishu", side_effect=capture_card):
        result = _handle_query_status({"query": "项目进展"}, chat_id="oc_page_button")
        first_card = captured_cards[0]
        next_button = next(
            action
            for element in first_card["elements"]
            if element.get("tag") == "action"
            for action in element["actions"]
            if action["text"]["content"] == "下一页"
        )
        command_result = _handle_card_command(
            "button " + json.dumps(next_button["value"], ensure_ascii=False)
        )

    assert "项目看板已发送" in result
    assert command_result is None
    assert len(captured_cards) == 2
    second_content = json.dumps(captured_cards[1], ensure_ascii=False)
    assert "按钮分页项目01" not in second_content
    assert "按钮分页项目11" in second_content
    assert "按钮分页项目12" in second_content
    assert "上一页" in second_content
    assert "第 2/2 页" in second_content
    assert "pilotflow_chat_id" not in json.dumps(first_card, ensure_ascii=False)


def test_card_command_dashboard_page_updates_origin_card_after_success():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    for i in range(1, 13):
        _register_project(
            f"桥接分页项目{i:02d}", [], "2026-05-20", "进行中", [],
            goal="验证分页反馈", deliverables=["验收记录"],
        )
    action_id = _create_card_action_ref(
        "oc_bridge_page",
        "dashboard_page",
        {"query": "项目进展 第2页", "page": 2},
    )
    with _plan_lock:
        _card_action_refs[action_id]["message_id"] = "om_bridge_page_origin"

    marked_cards = []

    def capture_mark(message_id, title, content, template):
        marked_cards.append((message_id, title, content, template))
        return True

    with (
        patch("tools._send_interactive_card_via_feishu", return_value="om_bridge_page_next"),
        patch("tools._mark_card_message", side_effect=capture_mark),
    ):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert result is None
    assert marked_cards == [
        (
            "om_bridge_page_origin",
            "看板已翻页",
            "新的项目看板已发送到群聊。",
            "blue",
        )
    ]


def test_card_command_dashboard_filter_updates_origin_card_after_success():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "桥接风险筛选项目", [], "2026-05-20", "有风险", [],
        goal="验证筛选反馈", deliverables=["验收记录"],
    )
    action_id = _create_card_action_ref(
        "oc_bridge_filter",
        "dashboard_filter",
        {"query": "看看风险项目", "filter": "risk"},
    )
    with _plan_lock:
        _card_action_refs[action_id]["message_id"] = "om_bridge_filter_origin"

    marked_cards = []

    def capture_mark(message_id, title, content, template):
        marked_cards.append((message_id, title, content, template))
        return True

    with (
        patch("tools._send_interactive_card_via_feishu", return_value="om_bridge_filter_new"),
        patch("tools._mark_card_message", side_effect=capture_mark),
    ):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert result is None
    assert marked_cards == [
        (
            "om_bridge_filter_origin",
            "看板筛选已发送",
            "风险项目看板已发送到群聊。",
            "blue",
        )
    ]


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


def test_update_project_adds_progress_to_sanitized_state_after_restart(tmp_path):
    state_path = tmp_path / "pilotflow-projects.json"
    with _project_registry_lock:
        _project_registry.clear()

    with patch.dict(os.environ, {"PILOTFLOW_STATE_PATH": str(state_path)}):
        assert _save_project_state(
            "重启进展更新项目",
            "验证重启后继续记录进展",
            [],
            ["验收记录"],
            "2026-05-20",
            "进行中",
            updates=[{"action": "进展", "value": "完成需求评审"}],
        )
        result = json.loads(_handle_update_project(
            {"project_name": "重启进展更新", "action": "add_progress", "value": "完成原型评审"},
            chat_id="oc_state_progress_update",
        ))
        projects = _load_project_state()

    assert result["status"] == "project_updated"
    assert result["project"] == "重启进展更新项目"
    assert result["state_updated"] is True
    assert projects[0]["updates"] == [
        {"action": "进展", "value": "完成需求评审"},
        {"action": "进展", "value": "完成原型评审"},
    ]


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
    create_task.assert_called_once_with(
        "评审清单", "项目: 交付物项目", "张三", "2026-05-20", "oc_deliverable", ["张三"],
    )
    with _project_registry_lock:
        project = _project_registry["交付物项目"]
        assert project["deliverables"] == ["验收记录", "评审清单"]
        assert "任务: 评审清单" in project["artifacts"]


def test_update_project_add_deliverable_assigns_named_member():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "指定负责人交付物项目", ["张三", "李四"], "2026-05-20", "进行中", [],
        goal="验证指定负责人", deliverables=["验收记录"],
    )

    with (
        patch("tools._create_task", return_value="完成接口联调") as create_task,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "指定负责人", "action": "add_deliverable", "value": "李四：完成接口联调"},
            chat_id="oc_named_assignee",
        ))

    assert result["status"] == "project_updated"
    assert result["value"] == "完成接口联调"
    assert result["assignee"] == "李四"
    create_task.assert_called_once_with(
        "完成接口联调", "项目: 指定负责人交付物项目", "李四", "2026-05-20", "oc_named_assignee", ["张三", "李四"],
    )
    with _project_registry_lock:
        project = _project_registry["指定负责人交付物项目"]
        assert project["deliverables"] == ["验收记录", "完成接口联调"]
        assert "李四：完成接口联调" not in project["deliverables"]
    assert "交付物 → 完成接口联调" in send.call_args.args[1]
    assert "负责人 → 李四" in send.call_args.args[1]


def test_update_project_add_deliverable_assigns_feishu_mentioned_member():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "飞书提及交付物项目", ["李四"], "2026-05-20", "进行中", [],
        goal="验证飞书提及负责人", deliverables=["验收记录"],
    )

    with (
        patch("tools._create_task", return_value="完成接口联调") as create_task,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {
                "project_name": "飞书提及",
                "action": "add_deliverable",
                "value": '<at user_id="ou_test">李四</at>：完成接口联调',
            },
            chat_id="oc_mentioned_assignee",
        ))

    assert result["status"] == "project_updated"
    assert result["value"] == "完成接口联调"
    assert result["assignee"] == "李四"
    create_task.assert_called_once_with(
        "完成接口联调", "项目: 飞书提及交付物项目", "李四", "2026-05-20", "oc_mentioned_assignee", ["李四"],
    )
    with _project_registry_lock:
        project = _project_registry["飞书提及交付物项目"]
        assert project["deliverables"] == ["验收记录", "完成接口联调"]
    sent_text = send.call_args.args[1]
    assert "<at user_id" not in sent_text
    assert "负责人 → 李四" in sent_text


def test_create_task_binds_assignee_and_project_followers():
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
        msg = "success"

        def __init__(self):
            self.data = types.SimpleNamespace(
                task=types.SimpleNamespace(url="https://example.invalid/task/task_123", guid="task_guid_123"),
            )

        def success(self):
            return True

    created = {}

    class _TaskApi:
        def create(self, request):
            created["task"] = request.request_body
            return _Response()

    collaborator_requests = []

    class _TaskCollaboratorApi:
        def create(self, request):
            collaborator_requests.append(request)
            return _Response()

    fake_v2 = types.ModuleType("lark_oapi.api.task.v2")
    fake_v2.CreateTaskRequest = type("CreateTaskRequest", (_Model,), {})
    fake_v2.InputTask = type("InputTask", (_Model,), {})
    fake_v2.Member = type("Member", (_Model,), {})
    fake_v1 = types.ModuleType("lark_oapi.api.task.v1")
    fake_v1.CreateTaskCollaboratorRequest = type("CreateTaskCollaboratorRequest", (_Model,), {})
    fake_v1.Collaborator = type("Collaborator", (_Model,), {})

    with (
        patch.dict(sys.modules, {
            "lark_oapi": types.ModuleType("lark_oapi"),
            "lark_oapi.api": types.ModuleType("lark_oapi.api"),
            "lark_oapi.api.task": types.ModuleType("lark_oapi.api.task"),
            "lark_oapi.api.task.v2": fake_v2,
            "lark_oapi.api.task.v1": fake_v1,
        }),
        patch("tools._get_client", return_value=types.SimpleNamespace(
            task=types.SimpleNamespace(
                v2=types.SimpleNamespace(task=_TaskApi()),
                v1=types.SimpleNamespace(task_collaborator=_TaskCollaboratorApi()),
            ),
        )),
        patch("tools._resolve_member", side_effect=lambda name, chat_id: {"张三": "ou_zhang", "李四": "ou_li"}.get(name)),
    ):
        result = _create_task(
            "评审清单", "项目: 协作任务项目", "张三", "2026-05-20",
            "oc_task_members", ["张三", "李四", "未入群"],
        )

    assert result == "评审清单: https://example.invalid/task/task_123"
    assert created["task"].due == {
        "timestamp": "1779271200000",
        "is_all_day": False,
    }
    members = created["task"].members
    assert [(item.id, item.type, item.role) for item in members] == [
        ("ou_zhang", "user", "assignee"),
        ("ou_li", "user", "follower"),
    ]
    assert len(collaborator_requests) == 1
    collaborator_request = collaborator_requests[0]
    assert collaborator_request.task_id == "task_guid_123"
    assert collaborator_request.user_id_type == "open_id"
    assert collaborator_request.request_body.id_list == ["ou_zhang", "ou_li"]


def test_create_task_returns_traceable_task_url_when_available():
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
        msg = "success"

        def __init__(self):
            self.data = types.SimpleNamespace(
                task=types.SimpleNamespace(url="https://example.invalid/task/task_123", guid="task_guid_123"),
            )

        def success(self):
            return True

    class _TaskApi:
        def create(self, request):
            return _Response()

    fake_v2 = types.ModuleType("lark_oapi.api.task.v2")
    fake_v2.CreateTaskRequest = type("CreateTaskRequest", (_Model,), {})
    fake_v2.InputTask = type("InputTask", (_Model,), {})
    fake_v2.Member = type("Member", (_Model,), {})

    with (
        patch.dict(sys.modules, {
            "lark_oapi": types.ModuleType("lark_oapi"),
            "lark_oapi.api": types.ModuleType("lark_oapi.api"),
            "lark_oapi.api.task": types.ModuleType("lark_oapi.api.task"),
            "lark_oapi.api.task.v2": fake_v2,
        }),
        patch("tools._get_client", return_value=types.SimpleNamespace(
            task=types.SimpleNamespace(v2=types.SimpleNamespace(task=_TaskApi())),
        )),
    ):
        result = _create_task("可追踪任务", "项目: 任务追踪项目")

    assert result == "可追踪任务: https://example.invalid/task/task_123"


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


def test_update_project_add_member_cleans_feishu_mention_value():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "提及加成员项目", ["张三"], "2026-05-20", "进行中",
        ["文档: https://example.invalid/docx/doc_token_123"],
        app_token="app1", table_id="tbl1", record_id="rec1",
        goal="验证提及加成员", deliverables=["验收记录"],
    )
    mention_value = '<at user_id="ou_new_member">王五</at>'

    with (
        patch("tools._refresh_project_resource_permissions", return_value=True) as refresh_permissions,
        patch("tools._update_bitable_record", return_value=True) as update_bitable,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
        patch("tools._format_at", side_effect=lambda name, chat_id: f"@{name}"),
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "提及加成员", "action": "add_member", "value": mention_value},
            chat_id="oc_mention_add_member",
        ))

    assert result["status"] == "project_updated"
    assert result["value"] == "王五"
    assert result["permission_refreshed"] is True
    with _project_registry_lock:
        members = _project_registry["提及加成员项目"]["members"]
    assert members == ["张三", "王五"]
    update_bitable.assert_called_once_with("app1", "tbl1", "rec1", {"负责人": "张三, 王五"})
    append_history.assert_called_once()
    assert append_history.call_args.args[2] == "成员"
    assert append_history.call_args.args[3] == "王五"
    refresh_permissions.assert_called_once()
    sent_text = send.call_args.args[1]
    assert "<at user_id" not in sent_text
    assert "成员 → @王五" in sent_text


def test_update_project_remove_member_syncs_registry_bitable_doc_and_feedback():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "移除成员项目", ["张三", "李四", "王五"], "2026-05-20", "进行中",
        ["文档: https://example.invalid/docx/doc_token_123"],
        app_token="app1", table_id="tbl1", record_id="rec1",
        goal="验证移除成员", deliverables=["验收记录"],
    )
    mention_value = '<at user_id="ou_removed_member">李四</at>'

    with (
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._update_bitable_record", return_value=True) as update_bitable,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
        patch("tools._format_at", side_effect=lambda name, chat_id: f"@{name}"),
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "移除成员", "action": "remove_member", "value": mention_value},
            chat_id="oc_remove_member",
        ))

    assert result["status"] == "project_updated"
    assert result["action"] == "remove_member"
    assert result["value"] == "李四"
    with _project_registry_lock:
        members = _project_registry["移除成员项目"]["members"]
    assert members == ["张三", "王五"]
    update_bitable.assert_called_once_with("app1", "tbl1", "rec1", {"负责人": "张三, 王五"})
    append_history.assert_called_once()
    assert append_history.call_args.args[2] == "成员移除"
    assert append_history.call_args.args[3] == "李四"
    append_doc.assert_called_once()
    assert append_doc.call_args.args[2] == "成员移除"
    assert append_doc.call_args.args[3] == "李四"
    sent_text = send.call_args.args[1]
    assert "<at user_id" not in sent_text
    assert "成员移除 → @李四" in sent_text
    assert "项目文档已更新" in sent_text
    assert "状态表已同步" in sent_text


def test_update_project_remove_member_rejects_unknown_member_without_writes():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "未知成员移除项目", ["张三"], "2026-05-20", "进行中",
        ["文档: https://example.invalid/docx/doc_token_123"],
        app_token="app1", table_id="tbl1", record_id="rec1",
        goal="验证未知成员移除", deliverables=["验收记录"],
    )

    with (
        patch("tools._append_project_doc_update") as append_doc,
        patch("tools._update_bitable_record") as update_bitable,
        patch("tools._append_bitable_update_record") as append_history,
        patch("tools._hermes_send") as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "未知成员移除", "action": "remove_member", "value": "李四"},
            chat_id="oc_remove_unknown_member",
        ))

    assert "error" in result
    assert "不是项目「未知成员移除项目」的成员" in result["error"]
    with _project_registry_lock:
        members = _project_registry["未知成员移除项目"]["members"]
    assert members == ["张三"]
    append_doc.assert_not_called()
    update_bitable.assert_not_called()
    append_history.assert_not_called()
    send.assert_not_called()


def test_update_project_deadline_refreshes_calendar_and_reminder():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "截止联动项目", ["张三"], "2026-05-20", "进行中", [],
        goal="验证截止联动", deliverables=["验收记录"],
    )

    with (
        patch("tools._create_calendar_event", return_value="日历事件: 2026-05-30；已邀请 1 位成员") as calendar,
        patch("tools._schedule_deadline_reminder", return_value=True) as reminder,
        patch("tools._hermes_send", return_value=True) as send,
    ):
        result = json.loads(_handle_update_project(
            {"project_name": "截止联动", "action": "update_deadline", "value": "2026-05-30"},
            chat_id="oc_deadline_refresh",
        ))

    assert result["status"] == "project_updated"
    assert result["calendar_event_created"] is True
    assert result["calendar_attendees_added"] is True
    assert result["reminder_scheduled"] is True
    calendar.assert_called_once_with("截止联动项目", "验证截止联动", "2026-05-30", ["张三"], "oc_deadline_refresh")
    reminder.assert_called_once_with("截止联动项目", "2026-05-30", "oc_deadline_refresh")
    sent_text = send.call_args.args[1]
    assert "日历事件已更新" in sent_text
    assert "日历参与人已邀请" in sent_text
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


def test_create_calendar_event_invites_resolved_project_members():
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

    attendee_requests = []

    class _CalendarEventApi:
        def create(self, request):
            event = types.SimpleNamespace(event_id="evt_deadline")
            return _Response(types.SimpleNamespace(event=event))

    class _CalendarEventAttendeeApi:
        def create(self, request):
            attendee_requests.append(request)
            return _Response()

    fake_v4 = types.ModuleType("lark_oapi.api.calendar.v4")
    fake_v4.CreateCalendarEventRequest = type("CreateCalendarEventRequest", (_Model,), {})
    fake_v4.CalendarEvent = type("CalendarEvent", (_Model,), {})
    fake_v4.TimeInfo = type("TimeInfo", (_Model,), {})
    fake_v4.CreateCalendarEventAttendeeRequest = type("CreateCalendarEventAttendeeRequest", (_Model,), {})
    fake_v4.CreateCalendarEventAttendeeRequestBody = type("CreateCalendarEventAttendeeRequestBody", (_Model,), {})
    fake_v4.CalendarEventAttendee = type("CalendarEventAttendee", (_Model,), {})

    client = types.SimpleNamespace(
        calendar=types.SimpleNamespace(v4=types.SimpleNamespace(
            calendar_event=_CalendarEventApi(),
            calendar_event_attendee=_CalendarEventAttendeeApi(),
        )),
    )

    with (
        patch.dict(sys.modules, {
            "lark_oapi": types.ModuleType("lark_oapi"),
            "lark_oapi.api": types.ModuleType("lark_oapi.api"),
            "lark_oapi.api.calendar": types.ModuleType("lark_oapi.api.calendar"),
            "lark_oapi.api.calendar.v4": fake_v4,
        }),
        patch.dict(os.environ, {"PILOTFLOW_FEISHU_CALENDAR_ID": "cal_test"}),
        patch("tools._get_client", return_value=client),
        patch("tools._resolve_member", side_effect=lambda name, chat_id: {"张三": "ou_zhang", "李四": "ou_li"}.get(name)),
    ):
        result = _create_calendar_event(
            "邀请成员项目", "验证日历邀请", "2026-06-01",
            ["张三", "李四", "未入群"], "oc_calendar_attendees",
        )

    assert result == "日历事件: 2026-06-01；已邀请 2 位成员"
    assert len(attendee_requests) == 1
    request = attendee_requests[0]
    assert request.calendar_id == "cal_test"
    assert request.event_id == "evt_deadline"
    assert request.user_id_type == "open_id"
    assert request.request_body.need_notification is True
    assert [(item.type, item.user_id) for item in request.request_body.attendees] == [
        ("user", "ou_zhang"),
        ("user", "ou_li"),
    ]


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


def test_update_project_adds_progress_log_to_doc_and_bitable():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "进展记录项目", ["张三"], "2026-05-20", "进行中", ["文档: https://example.invalid/doc"],
        goal="验证进展同步", deliverables=["验收记录"],
        app_token="app1", table_id="tbl1", record_id="rec1",
    )
    sent_messages = []

    with (
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append(msg) or True),
        patch("tools._save_project_state", return_value=True) as save_state,
    ):
        result = json.loads(_handle_update_project(
            {
                "project_name": "进展记录项目",
                "action": "add_progress",
                "value": "完成原型评审，等待业务确认",
            },
            chat_id="oc_progress_log",
        ))

    assert result["status"] == "project_updated"
    assert result["action"] == "add_progress"
    assert result["doc_updated"] is True
    assert result["bitable_history_created"] is True
    assert result["state_updated"] is True
    append_doc.assert_called_once_with(
        "进展记录项目",
        _project_registry["进展记录项目"],
        "进展",
        "完成原型评审，等待业务确认",
    )
    append_history.assert_called_once()
    save_state.assert_called_once()
    assert sent_messages
    assert "进展 → 完成原型评审，等待业务确认" in sent_messages[0]
    assert "项目文档已更新" in sent_messages[0]
    assert "状态表记录已追加" in sent_messages[0]


def test_update_project_adds_risk_and_marks_project_at_risk():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "风险上报项目", ["张三"], "2026-05-20", "进行中", ["文档: https://example.invalid/doc"],
        goal="验证风险上报", deliverables=["验收记录"],
        app_token="app1", table_id="tbl1", record_id="rec1",
    )

    with (
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
        patch("tools._update_bitable_record", return_value=True) as update_bitable,
        patch("tools._hermes_send", return_value=True) as send,
        patch("tools._save_project_state", return_value=True) as save_state,
    ):
        result = json.loads(_handle_update_project(
            {
                "project_name": "风险上报项目",
                "action": "add_risk",
                "value": "支付接口联调阻塞，高风险",
            },
            chat_id="oc_risk_report",
        ))

    assert result["status"] == "project_updated"
    assert result["action"] == "add_risk"
    assert result["value"] == "支付接口联调阻塞，高风险"
    assert result["risk_level"] == "高"
    assert result["doc_updated"] is True
    assert result["bitable_updated"] is True
    assert result["bitable_history_created"] is True
    assert result["state_updated"] is True
    assert _project_registry["风险上报项目"]["status"] == "有风险"
    update_bitable.assert_called_once_with(
        "app1", "tbl1", "rec1", {"状态": "有风险", "风险等级": "高"},
    )
    append_doc.assert_called_once_with(
        "风险上报项目",
        _project_registry["风险上报项目"],
        "风险",
        "支付接口联调阻塞，高风险",
    )
    append_history.assert_called_once()
    save_state.assert_called_once()
    sent_text = send.call_args.args[1]
    assert "风险 → 支付接口联调阻塞，高风险" in sent_text
    assert "状态已切换为有风险" in sent_text
    assert "状态表已同步" in sent_text


def test_update_project_resolves_risk_and_marks_project_active():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "风险解除项目", ["张三"], "2026-05-20", "有风险", ["文档: https://example.invalid/doc"],
        goal="验证风险解除", deliverables=["验收记录"],
        app_token="app1", table_id="tbl1", record_id="rec1",
    )

    with (
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
        patch("tools._update_bitable_record", return_value=True) as update_bitable,
        patch("tools._hermes_send", return_value=True) as send,
        patch("tools._save_project_state", return_value=True) as save_state,
    ):
        result = json.loads(_handle_update_project(
            {
                "project_name": "风险解除项目",
                "action": "resolve_risk",
                "value": "支付接口联调已恢复",
            },
            chat_id="oc_risk_resolved",
        ))

    assert result["status"] == "project_updated"
    assert result["action"] == "resolve_risk"
    assert result["risk_level"] == "低"
    assert _project_registry["风险解除项目"]["status"] == "进行中"
    assert result["doc_updated"] is True
    assert result["bitable_updated"] is True
    assert result["bitable_history_created"] is True
    assert result["state_updated"] is True
    update_bitable.assert_called_once_with(
        "app1", "tbl1", "rec1", {"状态": "进行中", "风险等级": "低"},
    )
    append_doc.assert_called_once_with(
        "风险解除项目",
        _project_registry["风险解除项目"],
        "风险解除",
        "支付接口联调已恢复",
    )
    append_history.assert_called_once()
    save_state.assert_called_once()
    sent_text = send.call_args.args[1]
    assert "风险解除 → 支付接口联调已恢复" in sent_text
    assert "状态已恢复为进行中" in sent_text
    assert "状态表已同步" in sent_text


def test_card_action_resolves_risk_project():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "卡片解除风险项目", ["张三"], "2026-05-20", "有风险", ["文档: https://example.invalid/doc"],
        goal="验证卡片解除风险", deliverables=["验收记录"],
        app_token="app1", table_id="tbl1", record_id="rec1",
    )

    with (
        patch("tools._update_bitable_record", return_value=True) as update_bitable,
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._hermes_send", return_value=True) as send,
        patch("tools._save_project_state", return_value=True) as save_state,
    ):
        result = json.loads(_handle_card_action(
            {
                "action_value": json.dumps(
                    {"pilotflow_action": "resolve_risk", "title": "卡片解除风险项目"},
                    ensure_ascii=False,
                )
            },
            chat_id="oc_card_resolve_risk",
        ))

    assert result["status"] == "project_risk_resolved"
    assert _project_registry["卡片解除风险项目"]["status"] == "进行中"
    assert result["bitable_updated"] is True
    assert result["doc_updated"] is True
    update_bitable.assert_called_once_with(
        "app1", "tbl1", "rec1", {"状态": "进行中", "风险等级": "低"},
    )
    append_doc.assert_called_once_with(
        "卡片解除风险项目",
        _project_registry["卡片解除风险项目"],
        "风险解除",
        "风险已解除",
    )
    save_state.assert_called_once()
    assert "风险已解除" in send.call_args.args[1]


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
            "任务: 评审清单: https://example.invalid/task/task_123",
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
    assert "[任务：评审清单](https://example.invalid/task/task_123)" in body


def test_project_detail_card_shows_recent_progress_updates():
    with _project_registry_lock:
        _project_registry.clear()
    _register_project(
        "进展详情项目", ["张三"], "2026-05-20", "进行中", [],
        goal="验证详情进展", deliverables=["验收记录"],
    )

    with (
        patch("tools._append_project_doc_update", return_value=True),
        patch("tools._append_bitable_update_record", return_value=True),
        patch("tools._hermes_send", return_value=True),
    ):
        result = json.loads(_handle_update_project(
            {
                "project_name": "进展详情项目",
                "action": "add_progress",
                "value": "完成原型评审，等待业务确认",
            },
            chat_id="oc_progress_detail_update",
        ))

    assert result["status"] == "project_updated"
    captured = {}
    action_value = json.dumps({"pilotflow_action": "project_status", "title": "进展详情项目"}, ensure_ascii=False)

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_progress_detail"

    with patch("tools._hermes_send_card", side_effect=capture_card):
        detail_result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_progress_detail"))

    assert detail_result["status"] == "project_status_sent"
    body = captured["card"]["elements"][0]["content"]
    assert "**最近进展：** 完成原型评审，等待业务确认" in body


def test_project_detail_card_can_create_followup_task_from_action():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "待办详情项目", ["张三", "李四"], "2026-05-20", "进行中", [],
        goal="验证详情卡待办", deliverables=["验收记录"],
        app_token="app_followup_detail", table_id="tbl_followup_detail", record_id="rec_followup_detail",
    )
    captured = {}
    action_value = json.dumps({"pilotflow_action": "project_status", "title": "待办详情项目"}, ensure_ascii=False)

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_followup_detail"

    with patch("tools._hermes_send_card", side_effect=capture_card):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_followup_detail"))

    assert result["status"] == "project_status_sent"
    actions = [element for element in captured["card"]["elements"] if element.get("tag") == "action"]
    assert actions
    button_texts = [button["text"]["content"] for button in actions[0]["actions"]]
    assert "创建待办" in button_texts

    with _plan_lock:
        task_action_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_followup_detail" and ref["action"] == "create_followup_task"
        )

    sent_messages = []
    with (
        patch("tools._create_task", return_value="待办详情项目跟进: https://example.invalid/task/task_123") as create_task,
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        task_result = json.loads(_handle_card_action(
            {"action_value": json.dumps({"pilotflow_action_id": task_action_id}, ensure_ascii=False)},
            chat_id="ignored_chat",
        ))

    assert task_result["status"] == "project_followup_task_created"
    assert task_result["doc_updated"] is True
    assert task_result["bitable_history_created"] is True
    create_task.assert_called_once_with(
        "待办详情项目跟进",
        "项目: 待办详情项目",
        "张三",
        "2026-05-20",
        "oc_followup_detail",
        ["张三", "李四"],
    )
    append_doc.assert_called_once()
    append_history.assert_called_once()
    assert sent_messages
    assert sent_messages[0][0] == "oc_followup_detail"
    assert "待办详情项目跟进" in sent_messages[0][1]


def test_dashboard_followup_task_reports_doc_and_bitable_traces():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    _register_project(
        "看板待办留痕项目", ["张三"], overdue, "进行中", [],
        goal="验证看板待办留痕", deliverables=["验收记录"],
        app_token="app_dashboard_followup", table_id="tbl_dashboard_followup", record_id="rec_dashboard_followup",
    )

    with patch("tools._send_interactive_card_via_feishu", return_value="om_dashboard_followup"):
        _handle_query_status({"query": "逾期项目"}, chat_id="oc_dashboard_followup")

    with _plan_lock:
        task_action_id = next(
            action_id for action_id, ref in _card_action_refs.items()
            if ref["chat_id"] == "oc_dashboard_followup" and ref["action"] == "project_followup_task"
        )

    sent_messages = []
    with (
        patch("tools._create_task", return_value="看板待办留痕项目跟进: https://example.invalid/task/task_dashboard") as create_task,
        patch("tools._hermes_send", side_effect=lambda chat_id, msg: sent_messages.append((chat_id, msg)) or True),
        patch("tools._append_project_doc_update", return_value=True) as append_doc,
        patch("tools._append_bitable_update_record", return_value=True) as append_history,
    ):
        result = json.loads(_handle_card_action(
            {"action_value": json.dumps({"pilotflow_action_id": task_action_id}, ensure_ascii=False)},
            chat_id="ignored_chat",
        ))

    assert result["status"] == "project_followup_task_created"
    assert result["doc_updated"] is True
    assert result["bitable_history_created"] is True
    create_task.assert_called_once_with(
        "看板待办留痕项目跟进",
        "项目: 看板待办留痕项目",
        "张三",
        overdue,
        "oc_dashboard_followup",
        ["张三"],
    )
    append_doc.assert_called_once()
    append_history.assert_called_once()
    assert sent_messages
    assert sent_messages[0][0] == "oc_dashboard_followup"


def test_due_project_detail_card_offers_reminder_button_without_chat_id_payload():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    due_soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    _register_project(
        "详情催办项目", ["张三"], due_soon, "进行中", [],
        goal="验证详情催办", deliverables=["验收记录"],
    )
    captured = {}
    action_value = json.dumps({"pilotflow_action": "project_status", "title": "详情催办项目"}, ensure_ascii=False)

    def capture_card(chat_id, card):
        captured["card"] = card
        return "om_detail_reminder"

    with patch("tools._hermes_send_card", side_effect=capture_card):
        result = json.loads(_handle_card_action({"action_value": action_value}, chat_id="oc_detail_reminder"))

    assert result["status"] == "project_status_sent"
    actions = [element for element in captured["card"]["elements"] if element.get("tag") == "action"]
    assert actions
    button_text = [button["text"]["content"] for button in actions[0]["actions"]]
    assert button_text == ["标记完成", "发送提醒", "创建待办"]
    reminder_value = actions[0]["actions"][1]["value"]
    assert "pilotflow_action_id" in reminder_value
    assert "pilotflow_chat_id" not in reminder_value
    with _plan_lock:
        refs = [ref for ref in _card_action_refs.values() if ref["chat_id"] == "oc_detail_reminder"]
    assert {ref["action"] for ref in refs} == {"mark_project_done", "send_project_reminder", "create_followup_task"}


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
    assert {ref["action"] for ref in refs} == {"reopen_project", "create_followup_task"}


def test_project_detail_card_uses_status_colored_header():
    cases = [
        ("进行中", "blue", "标记完成"),
        ("有风险", "red", "解除风险"),
        ("已完成", "green", "重新打开"),
        ("已归档", "grey", "重新打开"),
    ]

    for status, expected_template, expected_button in cases:
        with _project_registry_lock:
            _project_registry.clear()
        with _plan_lock:
            _card_action_refs.clear()
        title = f"详情颜色项目-{status}"
        _register_project(
            title, [], "2026-05-20", status, [],
            goal="验证详情颜色", deliverables=["验收记录"],
        )
        captured = {}
        action_value = json.dumps({"pilotflow_action": "project_status", "title": title}, ensure_ascii=False)

        def capture_card(chat_id, card):
            captured["card"] = card
            return "om_detail_color"

        with patch("tools._hermes_send_card", side_effect=capture_card):
            result = json.loads(_handle_card_action({"action_value": action_value}, chat_id=f"oc_detail_color_{status}"))

        assert result["status"] == "project_status_sent"
        assert captured["card"]["header"]["template"] == expected_template
        actions = [element for element in captured["card"]["elements"] if element.get("tag") == "action"]
        assert actions[0]["actions"][0]["text"]["content"] == expected_button


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


def test_card_command_project_action_updates_card_as_failed_when_action_fails():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    action_id = _create_card_action_ref(
        "oc_missing_project_action",
        "mark_project_done",
        {"title": "不存在的项目"},
    )
    with _plan_lock:
        _card_action_refs[action_id]["message_id"] = "om_missing_project_action"

    marked_cards = []

    def capture_mark(message_id, title, content, template):
        marked_cards.append((message_id, title, content, template))
        return True

    with patch("tools._mark_card_message", side_effect=capture_mark):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert "没有找到" in result
    assert marked_cards == [
        (
            "om_missing_project_action",
            "操作失败",
            "没有找到这个项目，可能需要先在当前会话创建项目。",
            "red",
        )
    ]


def test_card_command_project_status_updates_origin_card_after_detail_sent():
    with _project_registry_lock:
        _project_registry.clear()
    with _plan_lock:
        _card_action_refs.clear()
    _register_project(
        "桥接详情项目", ["张三"], "2026-05-10", "进行中", [],
        goal="验证详情反馈", deliverables=["验收记录"],
    )
    action_id = _create_card_action_ref(
        "oc_bridge_detail",
        "project_status",
        {"title": "桥接详情项目"},
    )
    with _plan_lock:
        _card_action_refs[action_id]["message_id"] = "om_bridge_detail_origin"

    marked_cards = []

    def capture_mark(message_id, title, content, template):
        marked_cards.append((message_id, title, content, template))
        return True

    with (
        patch("tools._send_interactive_card_via_feishu", return_value="om_bridge_detail_new"),
        patch("tools._mark_card_message", side_effect=capture_mark),
    ):
        result = _handle_card_command(f'button {{"pilotflow_action_id":"{action_id}"}}')

    assert result is None
    assert marked_cards == [
        (
            "om_bridge_detail_origin",
            "项目详情已发送",
            "**桥接详情项目** 的详情卡片已发送到群聊。",
            "blue",
        )
    ]


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
