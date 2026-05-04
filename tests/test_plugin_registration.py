"""Tests for Hermes plugin registration."""

import json
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

_mock_registry = types.ModuleType("tools.registry")
_mock_registry.registry = types.SimpleNamespace(dispatch=lambda name, args, **kwargs: json.dumps({"ok": True}))
_mock_registry.tool_error = lambda msg: json.dumps({"error": msg})
_mock_registry.tool_result = lambda msg: msg if isinstance(msg, str) else json.dumps(msg)
sys.modules["tools.registry"] = _mock_registry

import plugins.pilotflow as pilotflow


class FakeContext:
    def __init__(self):
        self.calls = []
        self.commands = []

    def register_tool(self, **kwargs):
        self.calls.append(kwargs)

    def register_command(self, **kwargs):
        self.commands.append(kwargs)


def test_register_exposes_expected_tools():
    ctx = FakeContext()

    pilotflow.register(ctx)

    names = [call["name"] for call in ctx.calls]
    assert names == [
        "pilotflow_scan_chat_signals",
        "pilotflow_generate_plan",
        "pilotflow_detect_risks",
        "pilotflow_create_project_space",
        "pilotflow_handle_card_action",
        "pilotflow_query_status",
        "pilotflow_update_project",
        "pilotflow_health_check",
    ]
    assert all(call["toolset"] == "pilotflow" for call in ctx.calls)
    assert all(call["schema"]["name"] == call["name"] for call in ctx.calls)
    assert all(call["handler"] is not None for call in ctx.calls)
    assert all(call["check_fn"] is not None for call in ctx.calls)


def test_skill_guidance_mentions_every_registered_tool_and_action():
    ctx = FakeContext()

    pilotflow.register(ctx)

    skill_text = Path(__file__).resolve().parents[1].joinpath(
        "skills", "pilotflow", "SKILL.md"
    ).read_text(encoding="utf-8")
    description_text = Path(__file__).resolve().parents[1].joinpath(
        "skills", "pilotflow", "DESCRIPTION.md"
    ).read_text(encoding="utf-8")

    for call in ctx.calls:
        assert call["name"] in skill_text

    for action in [
        "update_deadline",
        "add_member",
        "remove_member",
        "add_deliverable",
        "add_progress",
        "add_risk",
        "resolve_risk",
        "update_status",
        "send_reminder",
    ]:
        assert action in skill_text

    for capability in ["运行诊断", "风险闭环", "归档", "催办"]:
        assert capability in description_text


def test_register_exposes_card_slash_bridge():
    ctx = FakeContext()

    pilotflow.register(ctx)

    assert len(ctx.commands) == 1
    assert ctx.commands[0]["name"] == "card"
    assert ctx.commands[0]["handler"] is not None


def test_allow_inferred_schema_fields_are_marked_legacy_only():
    ctx = FakeContext()

    pilotflow.register(ctx)

    found = []
    for call in ctx.calls:
        properties = call["schema"].get("parameters", {}).get("properties", {})
        for field_name, field_schema in properties.items():
            if field_name.startswith("allow_inferred_"):
                description = field_schema.get("description", "")
                found.append((call["name"], field_name))
                assert "仅供回归测试" in description
                assert "旧客户端回放" in description
                assert "生产 Agent 不应传 true" in description
                assert "不再保留向前兼容承诺" in description

    assert found == [
        ("pilotflow_generate_plan", "allow_inferred_fields"),
        ("pilotflow_generate_plan", "allow_inferred_template"),
        ("pilotflow_query_status", "allow_inferred_filters"),
        ("pilotflow_update_project", "allow_inferred_filters"),
    ]
