"""PilotFlow plugin — AI project operations officer for Feishu group chats.

Provides project management tools that wrap Hermes's existing Feishu capabilities.
Drop this plugin into Hermes's plugins/ directory to enable.
"""

from __future__ import annotations

from plugins.pilotflow.tools import (
    PILOTFLOW_GENERATE_PLAN_SCHEMA,
    PILOTFLOW_DETECT_RISKS_SCHEMA,
    PILOTFLOW_CREATE_PROJECT_SPACE_SCHEMA,
    PILOTFLOW_SEND_SUMMARY_SCHEMA,
    PILOTFLOW_QUERY_STATUS_SCHEMA,
    _handle_generate_plan,
    _handle_detect_risks,
    _handle_create_project_space,
    _handle_send_summary,
    _handle_query_status,
    _check_available,
)


_TOOLS = (
    ("pilotflow_generate_plan", PILOTFLOW_GENERATE_PLAN_SCHEMA, _handle_generate_plan, "📋"),
    ("pilotflow_detect_risks", PILOTFLOW_DETECT_RISKS_SCHEMA, _handle_detect_risks, "⚠️"),
    ("pilotflow_create_project_space", PILOTFLOW_CREATE_PROJECT_SPACE_SCHEMA, _handle_create_project_space, "🚀"),
    ("pilotflow_send_summary", PILOTFLOW_SEND_SUMMARY_SCHEMA, _handle_send_summary, "📊"),
    ("pilotflow_query_status", PILOTFLOW_QUERY_STATUS_SCHEMA, _handle_query_status, "🔍"),
)


def register(ctx) -> None:
    """Register all PilotFlow tools. Called once by the plugin loader."""
    for name, schema, handler, emoji in _TOOLS:
        ctx.register_tool(
            name=name,
            toolset="pilotflow",
            schema=schema,
            handler=handler,
            check_fn=_check_available,
            emoji=emoji,
        )
