"""Tests for Hermes plugin registration."""

import json
import os
import sys
import types

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


def test_register_exposes_card_slash_bridge():
    ctx = FakeContext()

    pilotflow.register(ctx)

    assert len(ctx.commands) == 1
    assert ctx.commands[0]["name"] == "card"
    assert ctx.commands[0]["handler"] is not None
