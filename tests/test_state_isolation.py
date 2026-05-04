"""Regression tests for per-test PilotFlow module-state cleanup."""

import json
import os
import sys
import types


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugins", "pilotflow"))

_mock_registry = types.ModuleType("tools.registry")
_mock_registry.registry = types.SimpleNamespace(dispatch=lambda name, args, **kwargs: json.dumps({"ok": True}))
_mock_registry.tool_error = lambda msg: json.dumps({"error": msg})
_mock_registry.tool_result = lambda msg: msg if isinstance(msg, str) else json.dumps(msg)
sys.modules["tools.registry"] = _mock_registry

from tools import (  # noqa: E402
    _card_action_refs,
    _idempotent_project_results,
    _pending_plans,
    _plan_lock,
    _project_registry,
    _project_registry_lock,
    _recent_confirmed_projects,
)


def test_module_state_seed_for_cleanup_fixture():
    with _project_registry_lock:
        _project_registry["隔离测试项目"] = {"status": "进行中"}
    with _plan_lock:
        _pending_plans["oc_isolation"] = {"plan": {"title": "隔离测试项目"}}
        _card_action_refs["act_isolation"] = {"action": "project_status"}
        _recent_confirmed_projects["oc_isolation"] = {"title": "隔离测试项目"}
        _idempotent_project_results["idem_isolation"] = {"status": "project_space_created"}


def test_module_state_is_clean_after_previous_test():
    with _project_registry_lock:
        assert "隔离测试项目" not in _project_registry
    with _plan_lock:
        assert "oc_isolation" not in _pending_plans
        assert "act_isolation" not in _card_action_refs
        assert "oc_isolation" not in _recent_confirmed_projects
        assert "idem_isolation" not in _idempotent_project_results
