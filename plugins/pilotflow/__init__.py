"""PilotFlow plugin — AI project operations officer for Feishu group chats.

Provides project management tools that wrap Hermes's existing Feishu capabilities.
Drop this plugin into Hermes's plugins/ directory to enable.
"""

from __future__ import annotations

from plugins.pilotflow.tools import (
    PILOTFLOW_GENERATE_PLAN_SCHEMA,
    PILOTFLOW_DETECT_RISKS_SCHEMA,
    PILOTFLOW_CREATE_PROJECT_SPACE_SCHEMA,
    PILOTFLOW_HANDLE_CARD_ACTION_SCHEMA,
    PILOTFLOW_QUERY_STATUS_SCHEMA,
    PILOTFLOW_UPDATE_PROJECT_SCHEMA,
    _handle_generate_plan,
    _handle_detect_risks,
    _handle_create_project_space,
    _handle_card_action,
    _handle_card_command,
    _handle_query_status,
    _handle_update_project,
    _check_available,
)


_TOOLS = (
    ("pilotflow_generate_plan", PILOTFLOW_GENERATE_PLAN_SCHEMA, _handle_generate_plan, "📋"),
    ("pilotflow_detect_risks", PILOTFLOW_DETECT_RISKS_SCHEMA, _handle_detect_risks, "⚠️"),
    ("pilotflow_create_project_space", PILOTFLOW_CREATE_PROJECT_SPACE_SCHEMA, _handle_create_project_space, "🚀"),
    ("pilotflow_handle_card_action", PILOTFLOW_HANDLE_CARD_ACTION_SCHEMA, _handle_card_action, "🎯"),
    ("pilotflow_query_status", PILOTFLOW_QUERY_STATUS_SCHEMA, _handle_query_status, "🔍"),
    ("pilotflow_update_project", PILOTFLOW_UPDATE_PROJECT_SCHEMA, _handle_update_project, "✏️"),
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

    # Hermes routes Feishu card clicks as `/card button {...}`. Registering
    # this bridge keeps PilotFlow plug-in-only; no Hermes core patch required.
    register_command = getattr(ctx, "register_command", None)
    if register_command:
        register_command(
            name="card",
            handler=_handle_card_command,
            description="PilotFlow 飞书卡片按钮回调",
            args_hint='button {"pilotflow_action":"confirm_project"}',
        )
