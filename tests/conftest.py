"""Shared pytest fixtures for PilotFlow tests."""

import sys

import pytest


@pytest.fixture(autouse=True)
def _reset_pilotflow_module_state():
    """Clear process-local PilotFlow caches after every test.

    Test modules install a lightweight tools.registry mock before importing
    tools, so this fixture intentionally avoids importing tools first.
    """
    yield
    tools = sys.modules.get("tools")
    if tools is None:
        return
    with tools._project_registry_lock:
        tools._project_registry.clear()
    with tools._plan_lock:
        tools._pending_plans.clear()
        tools._card_action_refs.clear()
        tools._recent_confirmed_projects.clear()
        tools._idempotent_project_results.clear()
