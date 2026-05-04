"""Verify PilotFlow's WSL Hermes Feishu runtime.

Default mode is a safe dry run. Use --send-card only when you intentionally
want to send a real Feishu interactive card to PILOTFLOW_TEST_CHAT_ID.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import types
from urllib import error, request
from pathlib import Path
from typing import Any


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _load_env(path: Path) -> dict[str, str]:
    values = _parse_env_file(path)
    for key, value in values.items():
        os.environ[key] = value
    return values


def _read_runtime_config(path: Path) -> dict[str, Any]:
    """Read the small Hermes config subset needed to prove runtime alignment."""
    result: dict[str, Any] = {
        "has_config_file": path.exists(),
        "config_has_feishu_gateway": False,
    }
    if not path.exists():
        return result

    lines = path.read_text(encoding="utf-8").splitlines()
    section_stack: list[tuple[int, str]] = []
    for raw_line in lines:
        if not raw_line.strip() or raw_line.lstrip().startswith("#") or ":" not in raw_line:
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        key, value = raw_line.strip().split(":", 1)
        value = value.strip().strip('"').strip("'")
        while section_stack and section_stack[-1][0] >= indent:
            section_stack.pop()
        parent_keys = [item[1] for item in section_stack]
        if parent_keys == ["model"] and key == "default" and value:
            result["config_model"] = value
        elif parent_keys == ["model"] and key == "provider" and value:
            result["config_provider"] = value
        elif len(parent_keys) == 2 and parent_keys[0] == "providers" and key in ("base_url", "key_env", "model") and value:
            provider = parent_keys[1]
            providers = result.setdefault("providers", {})
            providers.setdefault(provider, {})[key] = value
        elif "gateway" in parent_keys and key == "default_platform" and value == "feishu":
            result["config_has_feishu_gateway"] = True
        elif key == "feishu" and "gateway" in parent_keys:
            result["config_has_feishu_gateway"] = True
        if not value:
            section_stack.append((indent, key))
    return result


def _safe_bool(value: Any) -> bool:
    return bool(value)


def _sanitize_result(result: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "mode",
        "status",
        "card_sent",
        "card_has_title",
        "card_has_goal",
        "card_has_risk",
        "would_send_card",
        "has_chat_id",
        "has_feishu_credentials",
        "has_config_file",
        "config_model",
        "config_provider",
        "config_has_feishu_gateway",
        "lark_oapi_import_ok",
        "pilotflow_import_ok",
        "has_confirm_token",
        "has_idempotency_key",
        "trace_has_key",
        "redaction_enabled",
        "action_ref_count",
        "action_refs_have_token",
        "pending_plan_recovered",
        "card_action_recovered",
        "llm_probe_ok",
        "llm_probe_status",
        "llm_probe_error",
        "llm_probe_provider",
        "health_check_ok",
        "health_check_sanitized",
        "health_has_credentials",
        "health_has_client",
        "health_has_chat_context",
        "health_has_state_path_status",
        "health_memory_flags_reported",
        "health_card_bridge_registered",
        "health_skill_guidance_current",
        "registration_tools_exposed",
        "registration_expected_tool_count",
        "registration_schemas_match_names",
        "registration_check_fns_present",
        "registration_card_command_exposed",
        "registration_handlers_present",
        "history_suggestion_found",
        "history_apply_action_found",
        "history_apply_card_sent",
        "history_privacy_members_ignored",
        "history_deliverables_recovered",
        "history_pending_recovered",
        "history_card_count",
        "projectization_suggestion_sent",
        "projectization_action_found",
        "projectization_plan_generated",
        "projectization_plan_card_sent",
        "projectization_risks_preserved",
        "projectization_action_items_preserved",
        "projectization_pending_recovered",
        "projectization_cards_sent",
        "project_create_gate_created",
        "project_create_confirmed",
        "project_create_doc_created",
        "project_create_bitable_created",
        "project_create_task_created",
        "project_create_calendar_created",
        "project_create_reminder_scheduled",
        "project_create_entry_card_sent",
        "project_create_state_recorded",
        "project_create_memory_saved",
        "project_create_trace_redacted",
        "session_initiator_plan_recorded",
        "session_initiator_project_created",
        "session_initiator_registry_recorded",
        "session_initiator_state_recorded",
        "session_initiator_detail_card_shown",
        "collab_doc_created",
        "collab_doc_comment_created",
        "collab_doc_permission_refreshed",
        "collab_task_created",
        "collab_task_assignee_bound",
        "collab_task_followers_bound",
        "collab_task_collaborators_created",
        "collab_task_url_returned",
        "update_task_created",
        "update_task_name_returned",
        "update_task_feedback_includes_summary",
        "update_task_artifact_recorded",
        "archive_gate_required",
        "archive_gate_no_write",
        "archive_gate_confirmed",
        "archive_gate_feedback_sent",
        "followup_task_created",
        "followup_task_feedback_sent",
        "followup_task_artifact_recorded",
        "followup_task_public_update_recorded",
        "deadline_update_applied",
        "deadline_calendar_created",
        "deadline_attendees_added",
        "deadline_reminder_scheduled",
        "deadline_feedback_sent",
        "member_added",
        "member_mention_cleaned",
        "member_permissions_refreshed",
        "member_bitable_owner_synced",
        "member_feedback_sent",
        "member_remove_gate_required",
        "member_remove_gate_no_write",
        "member_removed",
        "member_remove_bitable_synced",
        "member_remove_doc_recorded",
        "member_remove_history_recorded",
        "member_remove_feedback_sent",
        "member_remove_mention_cleaned",
        "risk_reported",
        "risk_level_high",
        "risk_bitable_synced",
        "risk_history_recorded",
        "risk_feedback_sent",
        "risk_resolved",
        "risk_level_low",
        "risk_resolve_feedback_sent",
        "progress_update_applied",
        "progress_doc_updated",
        "progress_history_recorded",
        "progress_state_recorded",
        "progress_feedback_sent",
        "reminder_single_sent",
        "reminder_single_doc_updated",
        "reminder_single_history_recorded",
        "reminder_single_state_recorded",
        "reminder_batch_sent",
        "reminder_batch_filtered",
        "reminder_batch_history_recorded",
        "reminder_feedback_sanitized",
        "briefing_batch_reminder_sent",
        "briefing_batch_reminder_filtered",
        "briefing_batch_reminder_doc_recorded",
        "briefing_batch_reminder_history_recorded",
        "briefing_batch_reminder_state_recorded",
        "briefing_batch_reminder_feedback_sent",
        "briefing_batch_reminder_used_opaque_ref",
        "card_command_bridge_executed",
        "card_command_bridge_suppressed_text",
        "card_command_bridge_marked_origin",
        "card_command_bridge_doc_recorded",
        "card_command_bridge_history_recorded",
        "card_command_bridge_state_recorded",
        "card_command_bridge_used_opaque_ref",
        "card_command_bridge_feedback_sanitized",
        "card_status_done_applied",
        "card_status_reopen_applied",
        "card_status_bitable_synced",
        "card_status_doc_recorded",
        "card_status_state_recorded",
        "card_status_feedback_sent",
        "card_status_used_opaque_refs",
        "batch_followup_created",
        "batch_followup_filtered",
        "batch_followup_task_created",
        "batch_followup_doc_recorded",
        "batch_followup_history_recorded",
        "batch_followup_state_recorded",
        "batch_followup_feedback_sent",
        "batch_followup_used_opaque_ref",
        "dashboard_filter_sent",
        "dashboard_filter_scoped",
        "dashboard_page_sent",
        "dashboard_page_scoped",
        "dashboard_cards_sent",
        "dashboard_used_opaque_refs",
        "error",
    }
    return {key: result[key] for key in allowed if key in result}


def _check_imports(hermes_dir: Path) -> dict[str, bool]:
    sys.path.insert(0, str(hermes_dir))
    lark_ok = False
    pilotflow_ok = False
    try:
        import lark_oapi  # noqa: F401
        lark_ok = True
    except Exception:
        lark_ok = False
    try:
        import plugins.pilotflow  # noqa: F401
        pilotflow_ok = True
    except Exception:
        pilotflow_ok = False
    return {
        "lark_oapi_import_ok": lark_ok,
        "pilotflow_import_ok": pilotflow_ok,
    }


def _probe_llm(config: dict[str, Any]) -> dict[str, Any]:
    """Probe OpenAI-compatible /models without exposing URL, key, or body."""
    provider = str(config.get("config_provider") or "").strip()
    providers = config.get("providers") if isinstance(config.get("providers"), dict) else {}
    provider_config = providers.get(provider) if isinstance(providers.get(provider), dict) else {}
    base_url = str(provider_config.get("base_url") or os.environ.get("OPENAI_BASE_URL") or "").rstrip("/")
    key_env = str(provider_config.get("key_env") or "OPENAI_API_KEY")
    api_key = os.environ.get(key_env, "")
    result: dict[str, Any] = {
        "llm_probe_provider": provider,
        "llm_probe_ok": False,
    }
    if not base_url or not api_key:
        result["llm_probe_error"] = "missing_config"
        return result
    probe_url = f"{base_url}/models"
    req = request.Request(probe_url, headers={"Authorization": f"Bearer {api_key}"})
    try:
        with request.urlopen(req, timeout=10) as resp:  # noqa: S310 - operator-provided runtime endpoint
            result["llm_probe_status"] = int(getattr(resp, "status", 0) or 0)
            result["llm_probe_ok"] = 200 <= result["llm_probe_status"] < 300
    except error.HTTPError as exc:
        result["llm_probe_status"] = int(exc.code)
        result["llm_probe_error"] = "http_error"
    except Exception:
        result["llm_probe_error"] = "request_error"
    return result


def _verify_runtime_health_check(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow reports sanitized runtime health."""
    sys.path.insert(0, str(hermes_dir))
    from plugins.pilotflow.tools import _handle_health_check  # pylint: disable=import-error

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    raw = _handle_health_check({"include_details": True}, chat_id=chat_id)
    data = json.loads(raw)
    checks = data.get("checks") if isinstance(data.get("checks"), dict) else {}
    sensitive_values = [
        value
        for key, value in os.environ.items()
        if key in {
            "FEISHU_APP_ID",
            "FEISHU_APP_SECRET",
            "PILOTFLOW_TEST_CHAT_ID",
            "PILOTFLOW_STATE_PATH",
            "HERMES_HOME",
            "OPENAI_API_KEY",
        }
        and value
    ]
    return {
        "health_check_ok": data.get("status") in {"ok", "warning"}
        and data.get("summary") == "PilotFlow 运行检查完成",
        "health_check_sanitized": all(value not in raw for value in sensitive_values),
        "health_has_credentials": checks.get("feishu_credentials") == "已配置",
        "health_has_client": checks.get("feishu_client") == "可用",
        "health_has_chat_context": checks.get("chat_context") == "已检测",
        "health_has_state_path_status": checks.get("state_path") in {"已配置", "跟随 HERMES_HOME", "默认位置"},
        "health_memory_flags_reported": (
            checks.get("memory_write") in {"开启", "关闭"}
            and checks.get("memory_read") in {"开启", "关闭"}
        ),
        "health_card_bridge_registered": checks.get("card_bridge") == "已注册",
        "health_skill_guidance_current": checks.get("skill_guidance") == "已同步",
    }


def _send_runtime_plan_card(hermes_dir: Path) -> dict[str, Any]:
    sys.path.insert(0, str(hermes_dir))
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _card_action_refs,
        _check_plan_gate,
        _create_card_action_ref,
        _handle_generate_plan,
        _hermes_send_card,
        _load_pending_plan,
        _pending_plans,
        _plan_lock,
        _resolve_card_action_ref,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    sent_cards: list[dict] = []

    def tracking_send_card(target_chat_id: str, card_json: dict) -> bool | str:
        sent_cards.append(card_json)
        return _hermes_send_card(target_chat_id, card_json)

    with tempfile.TemporaryDirectory(prefix="pilotflow-runtime-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _plan_lock:
            _pending_plans.clear()
            _card_action_refs.clear()
        import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error

        original_send_card = runtime_tools._hermes_send_card
        runtime_tools._hermes_send_card = tracking_send_card
        try:
            raw = _handle_generate_plan(
                {
                    "input_text": "PilotFlow runtime verifier: send one confirmation card only",
                    "title": "确认幂等验证项目",
                    "goal": "验证真实 Feishu 卡片发送后返回 confirm token 和 idempotency key",
                    "members": [],
                    "deliverables": ["验证记录"],
                    "deadline": "2026-05-10",
                    "risks": ["验证卡片必须展示风险"],
                },
                chat_id=chat_id,
            )
        finally:
            runtime_tools._hermes_send_card = original_send_card
        data = json.loads(raw)
        with _plan_lock:
            action_refs = list(_card_action_refs.values())
            _pending_plans.clear()
            _card_action_refs.clear()
        pending_plan_recovered = _check_plan_gate(chat_id) and bool((_load_pending_plan(chat_id) or {}).get("plan"))
        restart_action_id = _create_card_action_ref(
            chat_id,
            "dashboard_page",
            {"query": "项目进展 第1页", "page": 1},
        )
        with _plan_lock:
            _card_action_refs.clear()
        card_action_recovered = bool(_resolve_card_action_ref(restart_action_id))
    if original_state_path is None:
        os.environ.pop("PILOTFLOW_STATE_PATH", None)
    else:
        os.environ["PILOTFLOW_STATE_PATH"] = original_state_path
    card_markdown = ""
    if sent_cards:
        card_markdown = str(((sent_cards[0].get("elements") or [{}])[0].get("content")) or "")
    return {
        "status": data.get("status"),
        "card_sent": _safe_bool(data.get("card_sent")),
        "card_has_title": "确认幂等验证项目" in card_markdown,
        "card_has_goal": "验证真实 Feishu 卡片发送后返回 confirm token 和 idempotency key" in card_markdown,
        "card_has_risk": "验证卡片必须展示风险" in card_markdown,
        "has_confirm_token": _safe_bool((data.get("confirmation") or {}).get("confirm_token")),
        "has_idempotency_key": _safe_bool((data.get("confirmation") or {}).get("idempotency_key")),
        "trace_has_key": _safe_bool(((data.get("flight_record") or {}).get("confirmation") or {}).get("idempotency_key")),
        "redaction_enabled": _safe_bool((data.get("flight_record") or {}).get("redaction", {}).get("enabled")),
        "action_ref_count": len(action_refs),
        "action_refs_have_token": all(
            _safe_bool((ref.get("plan") or {}).get("confirm_token"))
            for ref in action_refs
        ),
        "pending_plan_recovered": pending_plan_recovered,
        "card_action_recovered": card_action_recovered,
    }


def _verify_runtime_history_suggestions(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow can read/apply history suggestions safely."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _card_action_refs,
        _handle_card_action,
        _handle_generate_plan,
        _load_pending_plan,
        _pending_plans,
        _plan_lock,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_registry = runtime_tools.registry
    original_send_card = runtime_tools._hermes_send_card
    sent_cards: list[dict] = []
    memory_payload = json.dumps({
        "items": [
            {
                "content": (
                    "【项目创建】历史活动项目：目标=筹备活动，成员=2 人，"
                    "交付物=活动方案、宣传文案，截止=2026-05-20"
                )
            }
        ]
    }, ensure_ascii=False)

    class _HistoryRegistry:
        def dispatch(self, name: str, args: dict[str, Any], **kwargs: Any) -> str:  # noqa: ARG002
            if name == "memory" and args.get("action") in {"scan", "search"}:
                return memory_payload
            return json.dumps({"success": True})

    def tracking_send_card(target_chat_id: str, card_json: dict) -> bool | str:
        sent_cards.append(card_json)
        return original_send_card(target_chat_id, card_json)

    with tempfile.TemporaryDirectory(prefix="pilotflow-history-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _plan_lock:
            _pending_plans.clear()
            _card_action_refs.clear()
        runtime_tools.registry = _HistoryRegistry()
        runtime_tools._hermes_send_card = tracking_send_card
        try:
            raw = _handle_generate_plan(
                {
                    "input_text": "帮我准备新的活动项目",
                    "title": "新活动项目",
                    "goal": "筹备活动",
                    "members": [],
                    "deliverables": [],
                    "deadline": "",
                },
                chat_id=chat_id,
            )
            data = json.loads(raw)
            with _plan_lock:
                apply_action_id = next(
                    (
                        action_id
                        for action_id, ref in _card_action_refs.items()
                        if ref.get("action") == "apply_history_suggestions"
                    ),
                    "",
                )
            apply_result: dict[str, Any] = {}
            if apply_action_id:
                apply_result = json.loads(_handle_card_action(
                    {"action_value": json.dumps({"pilotflow_action_id": apply_action_id}, ensure_ascii=False)},
                    chat_id=chat_id,
                ))
            with _plan_lock:
                _pending_plans.clear()
                _card_action_refs.clear()
            recovered_pending = _load_pending_plan(chat_id) or {}
        finally:
            runtime_tools.registry = original_registry
            runtime_tools._hermes_send_card = original_send_card
    if original_state_path is None:
        os.environ.pop("PILOTFLOW_STATE_PATH", None)
    else:
        os.environ["PILOTFLOW_STATE_PATH"] = original_state_path
    recovered_plan = recovered_pending.get("plan") if isinstance(recovered_pending, dict) else {}
    recovered_members = recovered_plan.get("members") if isinstance(recovered_plan, dict) else []
    recovered_deliverables = recovered_plan.get("deliverables") if isinstance(recovered_plan, dict) else []
    return {
        "history_suggestion_found": bool(data.get("history_suggestions")),
        "history_apply_action_found": bool(apply_action_id),
        "history_apply_card_sent": apply_result.get("status") == "history_suggestions_applied",
        "history_privacy_members_ignored": recovered_members == [],
        "history_deliverables_recovered": recovered_deliverables == ["活动方案", "宣传文案"],
        "history_pending_recovered": bool(recovered_plan),
        "history_card_count": len(sent_cards),
    }


def _verify_runtime_projectization_suggestion(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow turns Hermes chat signals into a project plan card."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _card_action_refs,
        _handle_card_action,
        _handle_scan_chat_signals,
        _load_pending_plan,
        _pending_plans,
        _plan_lock,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_send_card = runtime_tools._hermes_send_card
    sent_cards: list[dict[str, Any]] = []

    def tracking_send_card(target_chat_id: str, card_json: dict[str, Any]) -> bool | str:
        sent_cards.append(card_json)
        return original_send_card(target_chat_id, card_json)

    with tempfile.TemporaryDirectory(prefix="pilotflow-projectization-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _plan_lock:
            _pending_plans.clear()
            _card_action_refs.clear()
        runtime_tools._hermes_send_card = tracking_send_card
        try:
            suggestion = json.loads(_handle_scan_chat_signals(
                {
                    "source_text": "Hermes 已总结群聊：本周要完成客户上线，API 审批可能卡住，需要整理上线清单。",
                    "signals": {
                        "goals": ["本周完成客户上线"],
                        "commitments": ["张三整理上线清单"],
                        "risks": ["API 审批可能卡住"],
                        "action_items": ["整理上线清单", "同步审批进度"],
                        "deadlines": ["2026-05-20"],
                    },
                    "suggested_project": {
                        "title": "运行态项目化建议项目",
                        "goal": "本周完成客户上线",
                        "members": ["张三"],
                        "deliverables": ["整理上线清单", "同步审批进度"],
                        "deadline": "2026-05-20",
                        "risks": ["API 审批可能卡住"],
                    },
                    "should_suggest_project": True,
                    "suggestion_reason": "聊天里已经有目标、负责人、风险和行动项，适合整理成项目。",
                },
                chat_id=chat_id,
            ))
            with _plan_lock:
                action_id = next(
                    (
                        candidate
                        for candidate, ref in _card_action_refs.items()
                        if ref.get("action") == "suggest_project_from_signals"
                    ),
                    "",
                )
            plan_result: dict[str, Any] = {}
            if action_id:
                plan_result = json.loads(_handle_card_action(
                    {"action_value": json.dumps({"pilotflow_action_id": action_id}, ensure_ascii=False)},
                    chat_id=chat_id,
                ))
            recovered_pending = _load_pending_plan(chat_id) or {}
            with _plan_lock:
                _pending_plans.clear()
                _card_action_refs.clear()
        finally:
            runtime_tools._hermes_send_card = original_send_card
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    recovered_plan = recovered_pending.get("plan") if isinstance(recovered_pending, dict) else {}
    recovered_deliverables = recovered_plan.get("deliverables") if isinstance(recovered_plan, dict) else []
    recovered_risks = recovered_plan.get("risks") if isinstance(recovered_plan, dict) else []
    return {
        "projectization_suggestion_sent": (
            suggestion.get("status") == "projectization_suggested"
            and suggestion.get("card_sent") is True
        ),
        "projectization_action_found": bool(action_id),
        "projectization_plan_generated": plan_result.get("status") == "plan_generated",
        "projectization_plan_card_sent": plan_result.get("card_sent") is True,
        "projectization_risks_preserved": recovered_risks == ["API 审批可能卡住"],
        "projectization_action_items_preserved": recovered_deliverables == ["整理上线清单", "同步审批进度"],
        "projectization_pending_recovered": bool(recovered_plan),
        "projectization_cards_sent": len(sent_cards) == 2,
    }


def _verify_runtime_project_creation(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow can create a project space through the real gate path."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_create_project_space,
        _handle_generate_plan,
        _load_project_state,
        _pending_plans,
        _plan_lock,
        _project_registry,
        _project_registry_lock,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_create_doc = runtime_tools._create_doc
    original_create_bitable = runtime_tools._create_bitable
    original_create_task = runtime_tools._create_task
    original_create_calendar = runtime_tools._create_calendar_event
    original_schedule_reminder = runtime_tools._schedule_deadline_reminder
    original_save_memory = runtime_tools._save_to_hermes_memory
    original_send_card = runtime_tools._hermes_send_card
    created_docs: list[tuple[str, str, str]] = []
    created_bitables: list[tuple[str, str, str, list[str]]] = []
    created_tasks: list[tuple[str, str, str, str, str, list[str]]] = []
    created_calendars: list[tuple[str, str, str, list[str], str]] = []
    scheduled_reminders: list[tuple[str, str, str]] = []
    saved_memory: list[tuple[str, str, list[str], list[str], str]] = []
    sent_cards: list[dict[str, Any]] = []

    def fake_create_doc(title: str, markdown_content: str, target_chat_id: str) -> str:
        created_docs.append((title, markdown_content, target_chat_id))
        return "https://example.invalid/doc/project-create"

    def fake_create_bitable(
        title: str,
        owner: str,
        deadline: str,
        risks: list,
        target_chat_id: str,
        deliverables: list[str] | None = None,
    ) -> dict[str, str]:
        created_bitables.append((title, owner, deadline, list(deliverables or [])))
        return {
            "url": "https://example.invalid/base/project-create",
            "app_token": "app_project_create",
            "table_id": "tbl_project_create",
            "record_id": "rec_project_create",
        }

    def fake_create_task(
        summary: str,
        description: str,
        assignee: str,
        deadline: str,
        target_chat_id: str,
        members: list[str],
    ) -> str:
        created_tasks.append((summary, description, assignee, deadline, target_chat_id, list(members)))
        return f"{summary}: https://example.invalid/task/project-create"

    def fake_create_calendar(
        title: str,
        goal: str,
        deadline: str,
        members: list[str] | None = None,
        target_chat_id: str = "",
    ) -> str:
        created_calendars.append((title, goal, deadline, list(members or []), target_chat_id))
        return f"日历事件: {deadline}"

    def fake_schedule_reminder(title: str, deadline: str, target_chat_id: str) -> bool:
        scheduled_reminders.append((title, deadline, target_chat_id))
        return True

    def fake_save_memory(title: str, goal: str, members: list, deliverables: list, deadline: str) -> bool:
        saved_memory.append((title, goal, list(members), list(deliverables), deadline))
        return True

    def fake_send_card(_chat_id: str, card: dict[str, Any]) -> str:
        sent_cards.append(card)
        return f"om_project_create_{len(sent_cards)}"

    with tempfile.TemporaryDirectory(prefix="pilotflow-project-create-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _plan_lock:
            _pending_plans.clear()
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._create_doc = fake_create_doc
        runtime_tools._create_bitable = fake_create_bitable
        runtime_tools._create_task = fake_create_task
        runtime_tools._create_calendar_event = fake_create_calendar
        runtime_tools._schedule_deadline_reminder = fake_schedule_reminder
        runtime_tools._save_to_hermes_memory = fake_save_memory
        runtime_tools._hermes_send_card = fake_send_card
        try:
            plan = json.loads(_handle_generate_plan(
                {
                    "input_text": "创建一个运行态项目创建闭环验证项目，负责人张三，交付验收清单，截止 2026-05-20",
                    "title": "运行态项目创建闭环项目",
                    "goal": "验证安装后的创建项目空间闭环",
                    "members": ["张三"],
                    "deliverables": ["验收清单"],
                    "deadline": "2026-05-20",
                    "risks": ["需要确认真实资源链路"],
                },
                chat_id=chat_id,
            ))
            data = json.loads(_handle_create_project_space(
                {"confirmation_text": "确认执行"},
                chat_id=chat_id,
            ))
            state_projects = _load_project_state()
        finally:
            runtime_tools._create_doc = original_create_doc
            runtime_tools._create_bitable = original_create_bitable
            runtime_tools._create_task = original_create_task
            runtime_tools._create_calendar_event = original_create_calendar
            runtime_tools._schedule_deadline_reminder = original_schedule_reminder
            runtime_tools._save_to_hermes_memory = original_save_memory
            runtime_tools._hermes_send_card = original_send_card
            with _plan_lock:
                _pending_plans.clear()
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    flight_record_text = json.dumps(data.get("flight_record", {}), ensure_ascii=False)
    entry_card_text = ""
    if len(sent_cards) >= 2:
        entry_card_text = str(((sent_cards[1].get("elements") or [{}])[0].get("content")) or "")
    return {
        "project_create_gate_created": plan.get("status") == "plan_generated"
        and bool((plan.get("confirmation") or {}).get("confirm_token")),
        "project_create_confirmed": data.get("status") == "project_space_created"
        and data.get("title") == "运行态项目创建闭环项目",
        "project_create_doc_created": created_docs
        and created_docs[0][0] == "运行态项目创建闭环项目 - 项目简报"
        and "验证安装后的创建项目空间闭环" in created_docs[0][1],
        "project_create_bitable_created": created_bitables == [(
            "运行态项目创建闭环项目",
            "张三",
            "2026-05-20",
            ["验收清单"],
        )],
        "project_create_task_created": created_tasks == [(
            "验收清单",
            "项目: 运行态项目创建闭环项目",
            "张三",
            "2026-05-20",
            chat_id,
            ["张三"],
        )],
        "project_create_calendar_created": created_calendars == [(
            "运行态项目创建闭环项目",
            "验证安装后的创建项目空间闭环",
            "2026-05-20",
            ["张三"],
            chat_id,
        )],
        "project_create_reminder_scheduled": scheduled_reminders == [(
            "运行态项目创建闭环项目",
            "2026-05-20",
            chat_id,
        )],
        "project_create_entry_card_sent": (
            bool(sent_cards)
            and len(sent_cards) >= 2
            and "日历事件: 2026-05-20" in entry_card_text
            and "截止提醒已设置" in entry_card_text
        ),
        "project_create_state_recorded": any(
            item.get("title") == "运行态项目创建闭环项目"
            and item.get("status") == "有风险"
            and item.get("deliverables") == ["验收清单"]
            for item in state_projects
        ),
        "project_create_memory_saved": saved_memory == [(
            "运行态项目创建闭环项目",
            "验证安装后的创建项目空间闭环",
            ["张三"],
            ["验收清单"],
            "2026-05-20",
        )],
        "project_create_trace_redacted": (
            bool((data.get("flight_record") or {}).get("redaction", {}).get("enabled"))
            and "example.invalid" not in flight_record_text
            and chat_id not in flight_record_text
        ),
    }


def _verify_runtime_plugin_registration(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow exposes the expected Hermes tools and command."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow as runtime_plugin  # pylint: disable=import-error

    expected_tools = [
        "pilotflow_scan_chat_signals",
        "pilotflow_generate_plan",
        "pilotflow_detect_risks",
        "pilotflow_create_project_space",
        "pilotflow_handle_card_action",
        "pilotflow_query_status",
        "pilotflow_update_project",
        "pilotflow_health_check",
    ]

    class RuntimeRegistrationContext:
        def __init__(self) -> None:
            self.tools: list[dict[str, Any]] = []
            self.commands: list[dict[str, Any]] = []

        def register_tool(self, **kwargs: Any) -> None:
            self.tools.append(kwargs)

        def register_command(self, **kwargs: Any) -> None:
            self.commands.append(kwargs)

    ctx = RuntimeRegistrationContext()
    runtime_plugin.register(ctx)
    tool_names = [item.get("name") for item in ctx.tools]
    card_commands = [item for item in ctx.commands if item.get("name") == "card"]
    return {
        "registration_tools_exposed": tool_names == expected_tools,
        "registration_expected_tool_count": len(tool_names) == len(expected_tools),
        "registration_schemas_match_names": all(
            (item.get("schema") or {}).get("name") == item.get("name")
            for item in ctx.tools
        ),
        "registration_check_fns_present": all(callable(item.get("check_fn")) for item in ctx.tools),
        "registration_card_command_exposed": bool(card_commands)
        and callable(card_commands[0].get("handler"))
        and "pilotflow_action" in str(card_commands[0].get("args_hint", "")),
        "registration_handlers_present": all(callable(item.get("handler")) for item in ctx.tools),
    }


def _verify_runtime_session_initiator(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow preserves sanitized session initiator metadata."""
    sys.path.insert(0, str(hermes_dir))
    import types
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_create_project_space,
        _handle_generate_plan,
        _handle_query_status,
        _load_project_state,
        _pending_plans,
        _plan_lock,
        _project_registry,
        _project_registry_lock,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "") or "oc_runtime_session_initiator"
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_modules = {
        "gateway": sys.modules.get("gateway"),
        "gateway.session_context": sys.modules.get("gateway.session_context"),
    }
    original_create_doc = runtime_tools._create_doc
    original_create_bitable = runtime_tools._create_bitable
    original_create_task = runtime_tools._create_task
    original_create_calendar = runtime_tools._create_calendar_event
    original_schedule_reminder = runtime_tools._schedule_deadline_reminder
    original_save_memory = runtime_tools._save_to_hermes_memory
    original_send_card = runtime_tools._hermes_send_card
    sent_cards: list[dict[str, Any]] = []

    def fake_get_session_env(name: str, default: str = "") -> str:
        values = {
            "HERMES_SESSION_CHAT_NAME": "运行态发起人群",
            "HERMES_SESSION_USER_NAME": "王小明",
        }
        return values.get(name, default)

    fake_session_context = types.ModuleType("gateway.session_context")
    fake_session_context.get_session_env = fake_get_session_env
    fake_gateway = types.ModuleType("gateway")
    fake_gateway.session_context = fake_session_context

    def fake_send_card(_chat_id: str, card: dict[str, Any]) -> str:
        sent_cards.append(card)
        return f"om_session_initiator_{len(sent_cards)}"

    with tempfile.TemporaryDirectory(prefix="pilotflow-session-initiator-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        sys.modules["gateway"] = fake_gateway
        sys.modules["gateway.session_context"] = fake_session_context
        with _plan_lock:
            _pending_plans.clear()
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._create_doc = lambda title, content, target_chat_id: "https://example.invalid/doc/session-initiator"
        runtime_tools._create_bitable = lambda title, owner, deadline, risks, target_chat_id, deliverables=None: {
            "url": "https://example.invalid/base/session-initiator",
            "app_token": "app_session_initiator",
            "table_id": "tbl_session_initiator",
            "record_id": "rec_session_initiator",
        }
        runtime_tools._create_task = lambda summary, description, assignee, deadline, target_chat_id, members: (
            f"{summary}: https://example.invalid/task/session-initiator"
        )
        runtime_tools._create_calendar_event = lambda title, goal, deadline, members=None, target_chat_id="": ""
        runtime_tools._schedule_deadline_reminder = lambda title, deadline, target_chat_id: False
        runtime_tools._save_to_hermes_memory = lambda title, goal, members, deliverables, deadline: True
        runtime_tools._hermes_send_card = fake_send_card
        try:
            plan = json.loads(_handle_generate_plan(
                {
                    "input_text": "请创建运行态发起人贯穿验证项目",
                    "title": "运行态发起人贯穿项目",
                    "goal": "验证安装后的发起人字段",
                    "members": [],
                    "deliverables": ["发起人验收记录"],
                    "deadline": "2026-05-20",
                },
                chat_id=chat_id,
            ))
            created = json.loads(_handle_create_project_space({"confirmation_text": "确认执行"}, chat_id=chat_id))
            with _project_registry_lock:
                registry_project = dict(_project_registry.get("运行态发起人贯穿项目", {}))
                _project_registry.clear()
            state_projects = _load_project_state()
            _handle_query_status({"query": "运行态发起人贯穿项目进展如何"}, chat_id=chat_id)
        finally:
            runtime_tools._create_doc = original_create_doc
            runtime_tools._create_bitable = original_create_bitable
            runtime_tools._create_task = original_create_task
            runtime_tools._create_calendar_event = original_create_calendar
            runtime_tools._schedule_deadline_reminder = original_schedule_reminder
            runtime_tools._save_to_hermes_memory = original_save_memory
            runtime_tools._hermes_send_card = original_send_card
            with _plan_lock:
                _pending_plans.clear()
            with _project_registry_lock:
                _project_registry.clear()
            for name, module in original_modules.items():
                if module is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = module
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    detail_card_text = str(((sent_cards[-1].get("elements") or [{}])[0].get("content")) or "") if sent_cards else ""
    return {
        "session_initiator_plan_recorded": (
            plan.get("status") == "plan_generated"
            and (plan.get("plan") or {}).get("initiator") == "王小明"
            and (plan.get("plan") or {}).get("members") == ["王小明"]
        ),
        "session_initiator_project_created": (
            created.get("status") == "project_space_created"
            and created.get("title") == "运行态发起人贯穿项目"
        ),
        "session_initiator_registry_recorded": registry_project.get("initiator") == "王小明",
        "session_initiator_state_recorded": any(
            item.get("title") == "运行态发起人贯穿项目"
            and item.get("initiator") == "王小明"
            for item in state_projects
        ),
        "session_initiator_detail_card_shown": "**发起人：** 王小明" in detail_card_text,
    }


class _RuntimeFakeModel:
    """Minimal lark_oapi model shim for installed-runtime verifier paths."""

    def __init__(self, **kwargs: Any):
        self.__dict__.update(kwargs)

    @classmethod
    def builder(cls):
        return _RuntimeFakeBuilder(cls)


class _RuntimeFakeBuilder:
    def __init__(self, model_cls: type[_RuntimeFakeModel]):
        self._model_cls = model_cls
        self._values: dict[str, Any] = {}

    def __getattr__(self, name: str):
        def setter(value: Any = None, *args: Any, **kwargs: Any):
            self._values[name] = value if not args and not kwargs else (value, args, kwargs)
            return self

        return setter

    def build(self):
        return self._model_cls(**self._values)


def _install_runtime_collab_sdk_modules() -> dict[str, Any]:
    """Install minimal SDK modules for doc/task collaboration verifier calls."""
    previous = {
        name: sys.modules.get(name)
        for name in [
            "lark_oapi.api.docx",
            "lark_oapi.api.docx.v1",
            "lark_oapi.api.drive",
            "lark_oapi.api.drive.v1",
            "lark_oapi.api.task",
            "lark_oapi.api.task.v1",
            "lark_oapi.api.task.v2",
        ]
    }
    for package_name in ["docx", "drive", "task"]:
        full_name = f"lark_oapi.api.{package_name}"
        if full_name not in sys.modules:
            sys.modules[full_name] = types.ModuleType(full_name)

    def module_with_models(module_name: str, model_names: list[str]) -> types.ModuleType:
        module = types.ModuleType(module_name)
        for model_name in model_names:
            setattr(module, model_name, type(model_name, (_RuntimeFakeModel,), {}))
        sys.modules[module_name] = module
        return module

    module_with_models("lark_oapi.api.docx.v1", [
        "Block",
        "Text",
        "TextElement",
        "TextRun",
        "MentionUser",
        "Divider",
        "CreateDocumentRequest",
        "CreateDocumentRequestBody",
        "CreateDocumentBlockChildrenRequest",
        "CreateDocumentBlockChildrenRequestBody",
    ])
    module_with_models("lark_oapi.api.drive.v1", [
        "CreateFileCommentRequest",
        "FileComment",
    ])
    module_with_models("lark_oapi.api.task.v2", [
        "CreateTaskRequest",
        "InputTask",
        "Member",
    ])
    module_with_models("lark_oapi.api.task.v1", [
        "CreateTaskCollaboratorRequest",
        "Collaborator",
    ])
    return previous


def _restore_runtime_modules(previous: dict[str, Any]) -> None:
    for name, module in previous.items():
        if module is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = module


def _verify_runtime_collaboration_resources(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed doc comments and task member binding stay wired."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import _create_doc, _create_task  # pylint: disable=import-error

    previous_modules = _install_runtime_collab_sdk_modules()
    original_client = runtime_tools._get_client
    original_set_permission = runtime_tools._set_permission
    original_add_editors = runtime_tools._add_editors
    original_resolve_member = runtime_tools._resolve_member

    captures: dict[str, Any] = {
        "doc_titles": [],
        "doc_children_count": 0,
        "doc_comments": [],
        "permissions": [],
        "editors": [],
        "task_payloads": [],
        "task_collaborators": [],
    }

    class _Resp:
        def __init__(self, data: Any = None):
            self.data = data
            self.msg = "ok"

        def success(self) -> bool:
            return True

    class _DocApi:
        def create(self, request: Any) -> _Resp:
            captures["doc_titles"].append(getattr(request.request_body, "title", ""))
            data = types.SimpleNamespace(document=types.SimpleNamespace(document_id="doc_collab"))
            return _Resp(data)

    class _DocChildrenApi:
        def create(self, request: Any) -> _Resp:
            children = getattr(request.request_body, "children", []) or []
            captures["doc_children_count"] = len(children)
            return _Resp()

    class _CommentApi:
        def create(self, request: Any) -> _Resp:
            captures["doc_comments"].append({
                "file_token": getattr(request, "file_token", ""),
                "file_type": getattr(request, "file_type", ""),
                "content": getattr(request.request_body, "content", ""),
                "user_id_type": getattr(request, "user_id_type", ""),
            })
            return _Resp()

    class _TaskApi:
        def create(self, request: Any) -> _Resp:
            captures["task_payloads"].append(request.request_body)
            task = types.SimpleNamespace(guid="task_collab", url="https://example.invalid/task/collab")
            return _Resp(types.SimpleNamespace(task=task))

    class _TaskCollaboratorApi:
        def create(self, request: Any) -> _Resp:
            body = getattr(request, "request_body", None)
            captures["task_collaborators"].append({
                "task_id": getattr(request, "task_id", ""),
                "user_id_type": getattr(request, "user_id_type", ""),
                "id_list": list(getattr(body, "id_list", []) or []),
            })
            return _Resp()

    client = types.SimpleNamespace(
        docx=types.SimpleNamespace(v1=types.SimpleNamespace(
            document=_DocApi(),
            document_block_children=_DocChildrenApi(),
        )),
        drive=types.SimpleNamespace(v1=types.SimpleNamespace(
            file_comment=_CommentApi(),
        )),
        task=types.SimpleNamespace(
            v2=types.SimpleNamespace(task=_TaskApi()),
            v1=types.SimpleNamespace(task_collaborator=_TaskCollaboratorApi()),
        ),
    )
    member_map = {"张三": "ou_zhang", "李四": "ou_li", "王五": "ou_wang"}
    try:
        runtime_tools._get_client = lambda: client
        runtime_tools._set_permission = lambda token, doc_type: captures["permissions"].append((token, doc_type)) or True
        runtime_tools._add_editors = lambda token, doc_type, chat_id: captures["editors"].append((token, doc_type, chat_id)) or True
        runtime_tools._resolve_member = lambda name, chat_id: member_map.get(name)

        doc_url = _create_doc(
            "运行态协作资源项目",
            "# 运行态协作资源项目\n\n## 目标\n验证文档评论和权限刷新",
            "oc_collab_runtime",
        )
        task_name = _create_task(
            "协作资源验收",
            "项目: 运行态协作资源项目",
            "张三",
            "2026-05-20",
            "oc_collab_runtime",
            ["张三", "李四", "王五"],
        )
    finally:
        runtime_tools._get_client = original_client
        runtime_tools._set_permission = original_set_permission
        runtime_tools._add_editors = original_add_editors
        runtime_tools._resolve_member = original_resolve_member
        _restore_runtime_modules(previous_modules)

    task_payload = captures["task_payloads"][0] if captures["task_payloads"] else None
    task_members = list(getattr(task_payload, "members", []) or []) if task_payload else []
    task_roles = {getattr(member, "role", "") for member in task_members}
    task_ids = {getattr(member, "id", "") for member in task_members}
    collaborator_ids = set(captures["task_collaborators"][0]["id_list"]) if captures["task_collaborators"] else set()
    return {
        "collab_doc_created": doc_url == "https://feishu.cn/docx/doc_collab" and captures["doc_children_count"] > 0,
        "collab_doc_comment_created": captures["doc_comments"] == [{
            "file_token": "doc_collab",
            "file_type": "docx",
            "content": "请补充内容",
            "user_id_type": "open_id",
        }],
        "collab_doc_permission_refreshed": (
            ("doc_collab", "docx") in captures["permissions"]
            and ("doc_collab", "docx", "oc_collab_runtime") in captures["editors"]
        ),
        "collab_task_created": bool(task_payload) and "协作资源验收" in str(task_name),
        "collab_task_assignee_bound": "assignee" in task_roles and "ou_zhang" in task_ids,
        "collab_task_followers_bound": "follower" in task_roles and {"ou_li", "ou_wang"}.issubset(task_ids),
        "collab_task_collaborators_created": collaborator_ids == {"ou_zhang", "ou_li", "ou_wang"},
        "collab_task_url_returned": task_name == "协作资源验收: https://example.invalid/task/collab",
    }


def _verify_runtime_update_task_summary(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow exposes add-deliverable task summaries safely."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_update_project,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_create_task = runtime_tools._create_task
    original_send = runtime_tools._hermes_send
    sent_messages: list[str] = []

    def fake_create_task(*_args: Any, **_kwargs: Any) -> str:
        return "运行态新增待办: https://example.invalid/task/runtime"

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with _project_registry_lock:
        _project_registry.clear()
    runtime_tools._create_task = fake_create_task
    runtime_tools._hermes_send = fake_send
    try:
        _register_project(
            "运行态交付物验证项目",
            ["张三"],
            "2026-05-20",
            "进行中",
            [],
            goal="验证安装后的更新链路",
            deliverables=["初始验收"],
        )
        data = json.loads(_handle_update_project(
            {
                "project_name": "运行态交付物",
                "action": "add_deliverable",
                "value": "运行态新增待办",
            },
            chat_id=chat_id,
        ))
        with _project_registry_lock:
            artifacts = list(_project_registry["运行态交付物验证项目"].get("artifacts", []))
    finally:
        runtime_tools._create_task = original_create_task
        runtime_tools._hermes_send = original_send
        with _project_registry_lock:
            _project_registry.clear()

    return {
        "update_task_created": data.get("task_created") is True,
        "update_task_name_returned": bool(data.get("task_name")),
        "update_task_feedback_includes_summary": any("飞书任务 → 运行态新增待办" in msg for msg in sent_messages),
        "update_task_artifact_recorded": any(item.startswith("任务: 运行态新增待办") for item in artifacts),
    }


def _verify_runtime_archive_gate(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow pauses archive updates until explicit confirmation."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_update_project,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_update_bitable = runtime_tools._update_bitable_record
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_send = runtime_tools._hermes_send
    write_calls: list[str] = []
    sent_messages: list[str] = []

    def fake_write(*_args: Any, **_kwargs: Any) -> bool:
        write_calls.append("write")
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with _project_registry_lock:
        _project_registry.clear()
    runtime_tools._update_bitable_record = fake_write
    runtime_tools._append_project_doc_update = fake_write
    runtime_tools._append_bitable_update_record = fake_write
    runtime_tools._hermes_send = fake_send
    try:
        _register_project(
            "运行态归档验证项目",
            ["张三"],
            "2026-05-20",
            "进行中",
            [],
            app_token="app_runtime",
            table_id="tbl_runtime",
            record_id="rec_runtime",
            goal="验证安装后的归档确认门控",
            deliverables=["初始验收"],
        )
        blocked = json.loads(_handle_update_project(
            {"project_name": "运行态归档", "action": "update_status", "value": "已归档"},
            chat_id=chat_id,
        ))
        blocked_write_count = len(write_calls)
        blocked_send_count = len(sent_messages)
        with _project_registry_lock:
            blocked_status = _project_registry["运行态归档验证项目"].get("status")

        confirmed = json.loads(_handle_update_project(
            {
                "project_name": "运行态归档",
                "action": "update_status",
                "value": "已归档",
                "confirmation_text": "确认执行",
            },
            chat_id=chat_id,
        ))
        with _project_registry_lock:
            confirmed_status = _project_registry["运行态归档验证项目"].get("status")
    finally:
        runtime_tools._update_bitable_record = original_update_bitable
        runtime_tools._append_project_doc_update = original_append_doc
        runtime_tools._append_bitable_update_record = original_append_history
        runtime_tools._hermes_send = original_send
        with _project_registry_lock:
            _project_registry.clear()

    return {
        "archive_gate_required": blocked.get("status") == "confirmation_required",
        "archive_gate_no_write": blocked_status == "进行中" and blocked_write_count == 0 and blocked_send_count == 0,
        "archive_gate_confirmed": confirmed.get("status") == "project_updated" and confirmed_status == "已归档",
        "archive_gate_feedback_sent": any("状态表已同步" in msg for msg in sent_messages),
    }


def _verify_runtime_followup_task(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow can create a follow-up task from card action."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _create_card_action_ref,
        _handle_card_action,
        _load_project_state,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_create_task = runtime_tools._create_task
    original_send = runtime_tools._hermes_send
    sent_messages: list[str] = []

    def fake_create_task(*_args: Any, **_kwargs: Any) -> str:
        return "运行态详情跟进: https://example.invalid/task/followup"

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with tempfile.TemporaryDirectory(prefix="pilotflow-followup-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._create_task = fake_create_task
        runtime_tools._hermes_send = fake_send
        try:
            _register_project(
                "运行态详情跟进项目",
                ["张三"],
                "2026-05-20",
                "进行中",
                ["文档: https://example.invalid/doc/followup"],
                goal="验证安装后的卡片跟进待办链路",
                deliverables=["初始验收"],
            )
            data = json.loads(_handle_card_action(
                {
                    "action_value": json.dumps({
                        "pilotflow_action_id": _create_card_action_ref(
                            chat_id,
                            "create_followup_task",
                            {"title": "运行态详情跟进项目"},
                        )
                    }, ensure_ascii=False)
                },
                chat_id=chat_id,
            ))
            with _project_registry_lock:
                artifacts = list(_project_registry["运行态详情跟进项目"].get("artifacts", []))
            state_projects = _load_project_state()
        finally:
            runtime_tools._create_task = original_create_task
            runtime_tools._hermes_send = original_send
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    public_updates = []
    for item in state_projects:
        if item.get("title") == "运行态详情跟进项目":
            public_updates = item.get("updates", [])
            break
    return {
        "followup_task_created": data.get("status") == "project_followup_task_created" and data.get("task_created") is True,
        "followup_task_feedback_sent": any("运行态详情跟进" in msg for msg in sent_messages),
        "followup_task_artifact_recorded": any(item.startswith("任务: 运行态详情跟进") for item in artifacts),
        "followup_task_public_update_recorded": any(
            item.get("action") == "任务" and item.get("value") == "运行态详情跟进"
            for item in public_updates
            if isinstance(item, dict)
        ),
    }


def _verify_runtime_deadline_update(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow updates deadline calendar/reminder hooks."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_update_project,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_calendar = runtime_tools._create_calendar_event
    original_reminder = runtime_tools._schedule_deadline_reminder
    original_send = runtime_tools._hermes_send
    sent_messages: list[str] = []

    def fake_calendar(*_args: Any, **_kwargs: Any) -> str:
        return "日历事件: 2026-05-30；已邀请 1 位成员"

    def fake_reminder(*_args: Any, **_kwargs: Any) -> bool:
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with _project_registry_lock:
        _project_registry.clear()
    runtime_tools._create_calendar_event = fake_calendar
    runtime_tools._schedule_deadline_reminder = fake_reminder
    runtime_tools._hermes_send = fake_send
    try:
        _register_project(
            "运行态截止联动项目",
            ["张三"],
            "2026-05-20",
            "进行中",
            [],
            goal="验证安装后的截止时间联动",
            deliverables=["初始验收"],
        )
        data = json.loads(_handle_update_project(
            {
                "project_name": "运行态截止联动",
                "action": "update_deadline",
                "value": "2026-05-30",
            },
            chat_id=chat_id,
        ))
        with _project_registry_lock:
            new_deadline = _project_registry["运行态截止联动项目"].get("deadline")
    finally:
        runtime_tools._create_calendar_event = original_calendar
        runtime_tools._schedule_deadline_reminder = original_reminder
        runtime_tools._hermes_send = original_send
        with _project_registry_lock:
            _project_registry.clear()

    feedback_text = "\n".join(sent_messages)
    return {
        "deadline_update_applied": data.get("status") == "project_updated" and new_deadline == "2026-05-30",
        "deadline_calendar_created": data.get("calendar_event_created") is True,
        "deadline_attendees_added": data.get("calendar_attendees_added") is True,
        "deadline_reminder_scheduled": data.get("reminder_scheduled") is True,
        "deadline_feedback_sent": all(
            marker in feedback_text
            for marker in ("日历事件已更新", "日历参与人已邀请", "截止提醒已设置")
        ),
    }


def _verify_runtime_member_permissions(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow refreshes resource permissions after add_member."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_update_project,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_refresh = runtime_tools._refresh_project_resource_permissions
    original_update_bitable = runtime_tools._update_bitable_record
    original_append_history = runtime_tools._append_bitable_update_record
    original_format_at = runtime_tools._format_at
    original_send = runtime_tools._hermes_send
    bitable_updates: list[dict[str, Any]] = []
    sent_messages: list[str] = []

    def fake_refresh(*_args: Any, **_kwargs: Any) -> bool:
        return True

    def fake_update_bitable(_app_token: str, _table_id: str, _record_id: str, fields: dict) -> bool:
        bitable_updates.append(dict(fields))
        return True

    def fake_append_history(*_args: Any, **_kwargs: Any) -> bool:
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with _project_registry_lock:
        _project_registry.clear()
    runtime_tools._refresh_project_resource_permissions = fake_refresh
    runtime_tools._update_bitable_record = fake_update_bitable
    runtime_tools._append_bitable_update_record = fake_append_history
    runtime_tools._format_at = lambda name, _chat_id: f"@{name}"
    runtime_tools._hermes_send = fake_send
    try:
        _register_project(
            "运行态权限同步项目",
            ["张三"],
            "2026-05-20",
            "进行中",
            ["文档: https://example.invalid/docx/doc_token_runtime"],
            app_token="app_runtime",
            table_id="tbl_runtime",
            record_id="rec_runtime",
            goal="验证安装后的成员权限联动",
            deliverables=["初始验收"],
        )
        data = json.loads(_handle_update_project(
            {
                "project_name": "运行态权限同步",
                "action": "add_member",
                "value": '<at user_id="ou_runtime_member">王五</at>',
                "confirmation_text": "确认执行",
            },
            chat_id=chat_id,
        ))
        with _project_registry_lock:
            members = list(_project_registry["运行态权限同步项目"].get("members", []))
    finally:
        runtime_tools._refresh_project_resource_permissions = original_refresh
        runtime_tools._update_bitable_record = original_update_bitable
        runtime_tools._append_bitable_update_record = original_append_history
        runtime_tools._format_at = original_format_at
        runtime_tools._hermes_send = original_send
        with _project_registry_lock:
            _project_registry.clear()

    feedback_text = "\n".join(sent_messages)
    return {
        "member_added": data.get("status") == "project_updated" and members == ["张三", "王五"],
        "member_mention_cleaned": data.get("value") == "王五" and "<at user_id" not in feedback_text,
        "member_permissions_refreshed": data.get("permission_refreshed") is True,
        "member_bitable_owner_synced": any(fields.get("负责人") == "张三, 王五" for fields in bitable_updates),
        "member_feedback_sent": "成员 → @王五" in feedback_text and "项目资源权限已刷新" in feedback_text,
    }


def _verify_runtime_member_removal(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow gates and applies member removal with trace sync."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_update_project,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_update_bitable = runtime_tools._update_bitable_record
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_format_at = runtime_tools._format_at
    original_send = runtime_tools._hermes_send
    bitable_updates: list[dict[str, Any]] = []
    doc_labels: list[tuple[str, str, str]] = []
    history_labels: list[tuple[str, str, str, str]] = []
    sent_messages: list[str] = []

    def fake_update_bitable(_app_token: str, _table_id: str, _record_id: str, fields: dict) -> bool:
        bitable_updates.append(dict(fields))
        return True

    def fake_append_doc(title: str, _project: dict, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        doc_labels.append((title, label, value))
        return True

    def fake_append_history(app_token: str, table_id: str, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        history_labels.append((app_token, table_id, label, value))
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with _project_registry_lock:
        _project_registry.clear()
    runtime_tools._update_bitable_record = fake_update_bitable
    runtime_tools._append_project_doc_update = fake_append_doc
    runtime_tools._append_bitable_update_record = fake_append_history
    runtime_tools._format_at = lambda name, _chat_id: f"@{name}"
    runtime_tools._hermes_send = fake_send
    try:
        _register_project(
            "运行态成员移除项目",
            ["张三", "李四", "王五"],
            "2026-05-20",
            "进行中",
            ["文档: https://example.invalid/docx/remove-member"],
            app_token="app_remove_member",
            table_id="tbl_remove_member",
            record_id="rec_remove_member",
            goal="验证安装后的成员移除闭环",
            deliverables=["初始验收"],
        )
        gated = json.loads(_handle_update_project(
            {
                "project_name": "运行态成员移除",
                "action": "remove_member",
                "value": '<at user_id="ou_removed_member">李四</at>',
            },
            chat_id=chat_id,
        ))
        with _project_registry_lock:
            members_after_gate = list(_project_registry["运行态成员移除项目"].get("members", []))
        gate_had_no_write = (
            not bitable_updates
            and not doc_labels
            and not history_labels
            and not sent_messages
        )
        data = json.loads(_handle_update_project(
            {
                "project_name": "运行态成员移除",
                "action": "remove_member",
                "value": '<at user_id="ou_removed_member">李四</at>',
                "confirmation_text": "确认执行",
            },
            chat_id=chat_id,
        ))
        with _project_registry_lock:
            members_after_remove = list(_project_registry["运行态成员移除项目"].get("members", []))
    finally:
        runtime_tools._update_bitable_record = original_update_bitable
        runtime_tools._append_project_doc_update = original_append_doc
        runtime_tools._append_bitable_update_record = original_append_history
        runtime_tools._format_at = original_format_at
        runtime_tools._hermes_send = original_send
        with _project_registry_lock:
            _project_registry.clear()

    feedback_text = "\n".join(sent_messages)
    return {
        "member_remove_gate_required": gated.get("status") == "confirmation_required"
        and gated.get("action") == "remove_member",
        "member_remove_gate_no_write": members_after_gate == ["张三", "李四", "王五"] and gate_had_no_write,
        "member_removed": data.get("status") == "project_updated" and members_after_remove == ["张三", "王五"],
        "member_remove_bitable_synced": any(fields.get("负责人") == "张三, 王五" for fields in bitable_updates),
        "member_remove_doc_recorded": ("运行态成员移除项目", "成员移除", "李四") in doc_labels,
        "member_remove_history_recorded": (
            "app_remove_member", "tbl_remove_member", "成员移除", "李四"
        ) in history_labels,
        "member_remove_feedback_sent": "成员移除 → @李四" in feedback_text,
        "member_remove_mention_cleaned": data.get("value") == "李四" and "<at user_id" not in feedback_text,
    }


def _verify_runtime_risk_cycle(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow can report and resolve a project risk."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_update_project,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_update_bitable = runtime_tools._update_bitable_record
    original_send = runtime_tools._hermes_send
    bitable_updates: list[dict[str, Any]] = []
    history_labels: list[str] = []
    sent_messages: list[str] = []

    def fake_append_doc(*_args: Any, **_kwargs: Any) -> bool:
        return True

    def fake_append_history(_app_token: str, _table_id: str, label: str, *_args: Any, **_kwargs: Any) -> bool:
        history_labels.append(label)
        return True

    def fake_update_bitable(_app_token: str, _table_id: str, _record_id: str, fields: dict) -> bool:
        bitable_updates.append(dict(fields))
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with _project_registry_lock:
        _project_registry.clear()
    runtime_tools._append_project_doc_update = fake_append_doc
    runtime_tools._append_bitable_update_record = fake_append_history
    runtime_tools._update_bitable_record = fake_update_bitable
    runtime_tools._hermes_send = fake_send
    try:
        _register_project(
            "运行态风险闭环项目",
            ["张三"],
            "2026-05-20",
            "进行中",
            ["文档: https://example.invalid/doc/risk"],
            app_token="app_runtime",
            table_id="tbl_runtime",
            record_id="rec_runtime",
            goal="验证安装后的风险闭环",
            deliverables=["初始验收"],
        )
        reported = json.loads(_handle_update_project(
            {
                "project_name": "运行态风险闭环",
                "action": "add_risk",
                "value": "支付接口联调阻塞，高风险",
            },
            chat_id=chat_id,
        ))
        with _project_registry_lock:
            reported_status = _project_registry["运行态风险闭环项目"].get("status")

        resolved = json.loads(_handle_update_project(
            {
                "project_name": "运行态风险闭环",
                "action": "resolve_risk",
                "value": "支付接口联调已恢复",
            },
            chat_id=chat_id,
        ))
        with _project_registry_lock:
            resolved_status = _project_registry["运行态风险闭环项目"].get("status")
    finally:
        runtime_tools._append_project_doc_update = original_append_doc
        runtime_tools._append_bitable_update_record = original_append_history
        runtime_tools._update_bitable_record = original_update_bitable
        runtime_tools._hermes_send = original_send
        with _project_registry_lock:
            _project_registry.clear()

    feedback_text = "\n".join(sent_messages)
    return {
        "risk_reported": reported.get("status") == "project_updated" and reported_status == "有风险",
        "risk_level_high": reported.get("risk_level") == "高",
        "risk_bitable_synced": {"状态": "有风险", "风险等级": "高"} in bitable_updates,
        "risk_history_recorded": "风险" in history_labels and "风险解除" in history_labels,
        "risk_feedback_sent": "风险 → 支付接口联调阻塞，高风险" in feedback_text and "状态已切换为有风险" in feedback_text,
        "risk_resolved": resolved.get("status") == "project_updated" and resolved_status == "进行中",
        "risk_level_low": resolved.get("risk_level") == "低",
        "risk_resolve_feedback_sent": "风险解除 → 支付接口联调已恢复" in feedback_text and "状态已恢复为进行中" in feedback_text,
    }


def _verify_runtime_progress_update(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow records progress to doc, Base history, and state."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_update_project,
        _load_project_state,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_send = runtime_tools._hermes_send
    history_labels: list[str] = []
    sent_messages: list[str] = []

    def fake_append_doc(*_args: Any, **_kwargs: Any) -> bool:
        return True

    def fake_append_history(_app_token: str, _table_id: str, label: str, *_args: Any, **_kwargs: Any) -> bool:
        history_labels.append(label)
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with tempfile.TemporaryDirectory(prefix="pilotflow-progress-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._append_project_doc_update = fake_append_doc
        runtime_tools._append_bitable_update_record = fake_append_history
        runtime_tools._hermes_send = fake_send
        try:
            _register_project(
                "运行态进展记录项目",
                ["张三"],
                "2026-05-20",
                "进行中",
                ["文档: https://example.invalid/doc/progress"],
                app_token="app_runtime",
                table_id="tbl_runtime",
                record_id="rec_runtime",
                goal="验证安装后的进展记录链路",
                deliverables=["初始验收"],
            )
            data = json.loads(_handle_update_project(
                {
                    "project_name": "运行态进展记录",
                    "action": "add_progress",
                    "value": "完成原型评审，等待业务确认",
                },
                chat_id=chat_id,
            ))
            state_projects = _load_project_state()
        finally:
            runtime_tools._append_project_doc_update = original_append_doc
            runtime_tools._append_bitable_update_record = original_append_history
            runtime_tools._hermes_send = original_send
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    state_updates = []
    for item in state_projects:
        if item.get("title") == "运行态进展记录项目":
            state_updates = item.get("updates", [])
            break
    feedback_text = "\n".join(sent_messages)
    return {
        "progress_update_applied": data.get("status") == "project_updated" and data.get("action") == "add_progress",
        "progress_doc_updated": data.get("doc_updated") is True,
        "progress_history_recorded": data.get("bitable_history_created") is True and "进展" in history_labels,
        "progress_state_recorded": any(
            item.get("action") == "进展" and item.get("value") == "完成原型评审，等待业务确认"
            for item in state_updates
            if isinstance(item, dict)
        ),
        "progress_feedback_sent": (
            "进展 → 完成原型评审，等待业务确认" in feedback_text
            and "项目文档已更新" in feedback_text
            and "状态表记录已追加" in feedback_text
        ),
    }


def _verify_runtime_project_reminder(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow sends project reminders with doc/Base/state traces."""
    sys.path.insert(0, str(hermes_dir))
    import datetime as dt
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _handle_update_project,
        _load_project_state,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_send = runtime_tools._hermes_send
    doc_labels: list[tuple[str, str, str]] = []
    history_labels: list[tuple[str, str, str, str]] = []
    sent_messages: list[str] = []

    def fake_append_doc(title: str, _project: dict, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        doc_labels.append((title, label, value))
        return True

    def fake_append_history(app_token: str, table_id: str, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        history_labels.append((app_token, table_id, label, value))
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with tempfile.TemporaryDirectory(prefix="pilotflow-reminder-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._append_project_doc_update = fake_append_doc
        runtime_tools._append_bitable_update_record = fake_append_history
        runtime_tools._hermes_send = fake_send
        try:
            overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
            future = (dt.date.today() + dt.timedelta(days=10)).isoformat()
            _register_project(
                "运行态单项目催办项目",
                ["张三"],
                future,
                "进行中",
                ["文档: https://example.invalid/doc/reminder-single"],
                app_token="app_single",
                table_id="tbl_single",
                record_id="rec_single",
                goal="验证安装后的单项目催办",
                deliverables=["初始验收"],
            )
            _register_project(
                "运行态批量逾期催办项目",
                ["李四"],
                overdue,
                "进行中",
                ["文档: https://example.invalid/doc/reminder-overdue"],
                app_token="app_overdue",
                table_id="tbl_overdue",
                record_id="rec_overdue",
                goal="验证安装后的批量催办",
                deliverables=["初始验收"],
            )
            _register_project(
                "运行态批量未到期项目",
                ["王五"],
                future,
                "进行中",
                ["文档: https://example.invalid/doc/reminder-future"],
                app_token="app_future",
                table_id="tbl_future",
                record_id="rec_future",
                goal="验证安装后的批量催办过滤",
                deliverables=["初始验收"],
            )
            single = json.loads(_handle_update_project(
                {
                    "project_name": "运行态单项目催办",
                    "action": "send_reminder",
                    "value": "请今天同步最新进展",
                },
                chat_id=chat_id,
            ))
            batch = json.loads(_handle_update_project(
                {
                    "project_name": "逾期项目",
                    "action": "send_reminder",
                    "value": "请今天同步最新进展",
                    "filter": "overdue",
                },
                chat_id=chat_id,
            ))
            state_projects = _load_project_state()
        finally:
            runtime_tools._append_project_doc_update = original_append_doc
            runtime_tools._append_bitable_update_record = original_append_history
            runtime_tools._hermes_send = original_send
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    state_updates: list[dict[str, Any]] = []
    for item in state_projects:
        if item.get("title") == "运行态单项目催办项目":
            state_updates = item.get("updates", [])
            break
    feedback_text = "\n".join(sent_messages)
    return {
        "reminder_single_sent": single.get("status") == "project_updated" and single.get("reminder_sent") is True,
        "reminder_single_doc_updated": single.get("doc_updated") is True
        and ("运行态单项目催办项目", "催办", "请今天同步最新进展") in doc_labels,
        "reminder_single_history_recorded": single.get("bitable_history_created") is True
        and ("app_single", "tbl_single", "催办", "请今天同步最新进展") in history_labels,
        "reminder_single_state_recorded": any(
            item.get("action") == "催办" and item.get("value") == "已发送催办提醒"
            for item in state_updates
            if isinstance(item, dict)
        ),
        "reminder_batch_sent": batch.get("status") == "project_reminders_sent" and batch.get("reminder_count") == 1,
        "reminder_batch_filtered": batch.get("projects") == ["运行态批量逾期催办项目"],
        "reminder_batch_history_recorded": ("app_overdue", "tbl_overdue", "催办", "请今天同步最新进展") in history_labels,
        "reminder_feedback_sanitized": (
            "项目催办" in feedback_text
            and "运行态单项目催办项目" in feedback_text
            and "运行态批量逾期催办项目" in feedback_text
            and "运行态批量未到期项目" not in feedback_text
            and "example.invalid" not in feedback_text
            and "<at user_id" not in feedback_text
        ),
    }


def _verify_runtime_briefing_batch_reminder(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow can send filtered batch reminders from a briefing card action."""
    sys.path.insert(0, str(hermes_dir))
    import datetime as dt
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _create_card_action_ref,
        _handle_card_action,
        _load_project_state,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_send = runtime_tools._hermes_send
    doc_labels: list[tuple[str, str, str]] = []
    history_labels: list[tuple[str, str, str, str]] = []
    sent_messages: list[str] = []

    def fake_append_doc(title: str, _project: dict, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        doc_labels.append((title, label, value))
        return True

    def fake_append_history(app_token: str, table_id: str, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        history_labels.append((app_token, table_id, label, value))
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with tempfile.TemporaryDirectory(prefix="pilotflow-briefing-reminder-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._append_project_doc_update = fake_append_doc
        runtime_tools._append_bitable_update_record = fake_append_history
        runtime_tools._hermes_send = fake_send
        try:
            overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
            future = (dt.date.today() + dt.timedelta(days=10)).isoformat()
            _register_project(
                "运行态简报催办逾期项目",
                ["张三"],
                overdue,
                "进行中",
                ["文档: https://example.invalid/doc/briefing-reminder-overdue"],
                app_token="app_briefing_reminder",
                table_id="tbl_briefing_reminder",
                record_id="rec_briefing_reminder",
                goal="验证安装后的简报卡片批量催办",
                deliverables=["初始验收"],
            )
            _register_project(
                "运行态简报催办未到期项目",
                ["李四"],
                future,
                "进行中",
                ["文档: https://example.invalid/doc/briefing-reminder-future"],
                app_token="app_briefing_future",
                table_id="tbl_briefing_future",
                record_id="rec_briefing_future",
                goal="验证安装后的简报卡片批量催办过滤",
                deliverables=["初始验收"],
            )
            action_id = _create_card_action_ref(
                chat_id,
                "briefing_batch_reminder",
                {"filter": "overdue", "value": "请今天同步最新进展"},
            )
            data = json.loads(_handle_card_action(
                {"action_value": json.dumps({"pilotflow_action_id": action_id}, ensure_ascii=False)},
                chat_id=chat_id,
            ))
            state_projects = _load_project_state()
        finally:
            runtime_tools._append_project_doc_update = original_append_doc
            runtime_tools._append_bitable_update_record = original_append_history
            runtime_tools._hermes_send = original_send
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    state_updates: list[dict[str, Any]] = []
    for item in state_projects:
        if item.get("title") == "运行态简报催办逾期项目":
            state_updates = item.get("updates", [])
            break
    feedback_text = "\n".join(sent_messages)
    return {
        "briefing_batch_reminder_sent": data.get("status") == "briefing_batch_reminder_sent"
        and data.get("reminder_count") == 1,
        "briefing_batch_reminder_filtered": data.get("projects") == ["运行态简报催办逾期项目"],
        "briefing_batch_reminder_doc_recorded": (
            "运行态简报催办逾期项目", "催办", "请今天同步最新进展"
        ) in doc_labels,
        "briefing_batch_reminder_history_recorded": (
            "app_briefing_reminder", "tbl_briefing_reminder", "催办", "请今天同步最新进展"
        ) in history_labels,
        "briefing_batch_reminder_state_recorded": any(
            item.get("action") == "催办" and item.get("value") == "已发送催办提醒"
            for item in state_updates
            if isinstance(item, dict)
        ),
        "briefing_batch_reminder_feedback_sent": (
            "项目催办" in feedback_text
            and "运行态简报催办逾期项目" in feedback_text
            and "运行态简报催办未到期项目" not in feedback_text
            and "example.invalid" not in feedback_text
            and "<at user_id" not in feedback_text
        ),
        "briefing_batch_reminder_used_opaque_ref": bool(action_id),
    }


def _verify_runtime_card_command_bridge(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow handles Hermes `/card button` bridge and marks the origin card."""
    sys.path.insert(0, str(hermes_dir))
    import datetime as dt
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _attach_card_message_id,
        _create_card_action_ref,
        _handle_card_command,
        _load_project_state,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_send = runtime_tools._hermes_send
    original_mark = runtime_tools._mark_card_message
    doc_labels: list[tuple[str, str, str]] = []
    history_labels: list[tuple[str, str, str, str]] = []
    sent_messages: list[str] = []
    marked_cards: list[tuple[str, str, str, str]] = []

    def fake_append_doc(title: str, _project: dict, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        doc_labels.append((title, label, value))
        return True

    def fake_append_history(app_token: str, table_id: str, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        history_labels.append((app_token, table_id, label, value))
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    def fake_mark(message_id: str, title: str, content: str, template: str) -> bool:
        marked_cards.append((message_id, title, content, template))
        return True

    with tempfile.TemporaryDirectory(prefix="pilotflow-card-command-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._append_project_doc_update = fake_append_doc
        runtime_tools._append_bitable_update_record = fake_append_history
        runtime_tools._hermes_send = fake_send
        runtime_tools._mark_card_message = fake_mark
        try:
            overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
            future = (dt.date.today() + dt.timedelta(days=10)).isoformat()
            _register_project(
                "运行态桥接催办逾期项目",
                ["张三"],
                overdue,
                "进行中",
                ["文档: https://example.invalid/doc/card-command-overdue"],
                app_token="app_card_command",
                table_id="tbl_card_command",
                record_id="rec_card_command",
                goal="验证安装后的卡片桥接催办",
                deliverables=["初始验收"],
            )
            _register_project(
                "运行态桥接催办未到期项目",
                ["李四"],
                future,
                "进行中",
                ["文档: https://example.invalid/doc/card-command-future"],
                app_token="app_card_future",
                table_id="tbl_card_future",
                record_id="rec_card_future",
                goal="验证安装后的卡片桥接催办过滤",
                deliverables=["初始验收"],
            )
            action_id = _create_card_action_ref(
                chat_id,
                "briefing_batch_reminder",
                {"filter": "overdue", "value": "请今天同步最新进展"},
            )
            _attach_card_message_id([action_id], "om_runtime_card_command")
            command_result = _handle_card_command(
                f'button {json.dumps({"pilotflow_action_id": action_id}, ensure_ascii=False)}'
            )
            state_projects = _load_project_state()
        finally:
            runtime_tools._append_project_doc_update = original_append_doc
            runtime_tools._append_bitable_update_record = original_append_history
            runtime_tools._hermes_send = original_send
            runtime_tools._mark_card_message = original_mark
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    state_updates: list[dict[str, Any]] = []
    for item in state_projects:
        if item.get("title") == "运行态桥接催办逾期项目":
            state_updates = item.get("updates", [])
            break
    marked_text = "\n".join(" ".join(item) for item in marked_cards)
    return {
        "card_command_bridge_executed": (
            len(sent_messages) == 1
            and "运行态桥接催办逾期项目" in sent_messages[0]
            and "运行态桥接催办未到期项目" not in sent_messages[0]
        ),
        "card_command_bridge_suppressed_text": command_result is None,
        "card_command_bridge_marked_origin": marked_cards == [(
            "om_runtime_card_command",
            "批量催办已发送",
            "已向 1 个逾期项目发送催办提醒。",
            "yellow",
        )],
        "card_command_bridge_doc_recorded": (
            "运行态桥接催办逾期项目", "催办", "请今天同步最新进展"
        ) in doc_labels,
        "card_command_bridge_history_recorded": (
            "app_card_command", "tbl_card_command", "催办", "请今天同步最新进展"
        ) in history_labels,
        "card_command_bridge_state_recorded": any(
            item.get("action") == "催办" and item.get("value") == "已发送催办提醒"
            for item in state_updates
            if isinstance(item, dict)
        ),
        "card_command_bridge_used_opaque_ref": bool(action_id),
        "card_command_bridge_feedback_sanitized": (
            "example.invalid" not in marked_text
            and "<at user_id" not in marked_text
        ),
    }


def _verify_runtime_card_status_cycle(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow can complete and reopen projects from card actions."""
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _create_card_action_ref,
        _handle_card_action,
        _load_project_state,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_update_bitable = runtime_tools._update_bitable_record
    original_send = runtime_tools._hermes_send
    bitable_updates: list[dict[str, Any]] = []
    doc_labels: list[tuple[str, str, str]] = []
    history_labels: list[tuple[str, str, str, str]] = []
    sent_messages: list[str] = []

    def fake_update_bitable(_app_token: str, _table_id: str, _record_id: str, fields: dict) -> bool:
        bitable_updates.append(dict(fields))
        return True

    def fake_append_doc(title: str, _project: dict, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        doc_labels.append((title, label, value))
        return True

    def fake_append_history(app_token: str, table_id: str, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        history_labels.append((app_token, table_id, label, value))
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with tempfile.TemporaryDirectory(prefix="pilotflow-card-status-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._append_project_doc_update = fake_append_doc
        runtime_tools._append_bitable_update_record = fake_append_history
        runtime_tools._update_bitable_record = fake_update_bitable
        runtime_tools._hermes_send = fake_send
        try:
            _register_project(
                "运行态卡片状态项目",
                ["张三"],
                "2026-05-30",
                "进行中",
                ["文档: https://example.invalid/doc/card-status"],
                app_token="app_card_status",
                table_id="tbl_card_status",
                record_id="rec_card_status",
                goal="验证安装后的卡片状态闭环",
                deliverables=["初始验收"],
            )
            done_action_id = _create_card_action_ref(chat_id, "mark_project_done", {"title": "运行态卡片状态项目"})
            done = json.loads(_handle_card_action(
                {"action_value": json.dumps({"pilotflow_action_id": done_action_id}, ensure_ascii=False)},
                chat_id=chat_id,
            ))
            with _project_registry_lock:
                done_status = _project_registry["运行态卡片状态项目"].get("status")

            reopen_action_id = _create_card_action_ref(chat_id, "reopen_project", {"title": "运行态卡片状态项目"})
            reopened = json.loads(_handle_card_action(
                {"action_value": json.dumps({"pilotflow_action_id": reopen_action_id}, ensure_ascii=False)},
                chat_id=chat_id,
            ))
            with _project_registry_lock:
                reopened_status = _project_registry["运行态卡片状态项目"].get("status")
            state_projects = _load_project_state()
        finally:
            runtime_tools._append_project_doc_update = original_append_doc
            runtime_tools._append_bitable_update_record = original_append_history
            runtime_tools._update_bitable_record = original_update_bitable
            runtime_tools._hermes_send = original_send
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    state_updates: list[dict[str, Any]] = []
    for item in state_projects:
        if item.get("title") == "运行态卡片状态项目":
            state_updates = item.get("updates", [])
            break
    feedback_text = "\n".join(sent_messages)
    return {
        "card_status_done_applied": done.get("status") == "project_marked_done" and done_status == "已完成",
        "card_status_reopen_applied": reopened.get("status") == "project_reopened" and reopened_status == "进行中",
        "card_status_bitable_synced": {"状态": "已完成"} in bitable_updates and {"状态": "进行中"} in bitable_updates,
        "card_status_doc_recorded": (
            ("运行态卡片状态项目", "状态", "已完成") in doc_labels
            and ("运行态卡片状态项目", "状态", "进行中") in doc_labels
            and ("app_card_status", "tbl_card_status", "状态", "已完成") in history_labels
            and ("app_card_status", "tbl_card_status", "状态", "进行中") in history_labels
        ),
        "card_status_state_recorded": any(
            item.get("action") == "状态" and item.get("value") == "进行中"
            for item in state_updates
            if isinstance(item, dict)
        ),
        "card_status_feedback_sent": (
            "已标记为完成" in feedback_text
            and "已重新打开" in feedback_text
            and "状态表已同步" in feedback_text
            and "项目文档已更新" in feedback_text
        ),
        "card_status_used_opaque_refs": bool(done_action_id and reopen_action_id),
    }


def _verify_runtime_batch_followup_task(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow can create filtered batch follow-up tasks from a card action."""
    sys.path.insert(0, str(hermes_dir))
    import datetime as dt
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _create_card_action_ref,
        _handle_card_action,
        _load_project_state,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_create_task = runtime_tools._create_task
    original_append_doc = runtime_tools._append_project_doc_update
    original_append_history = runtime_tools._append_bitable_update_record
    original_send = runtime_tools._hermes_send
    created_tasks: list[tuple[str, str, str, str, str, list[str]]] = []
    doc_labels: list[tuple[str, str, str]] = []
    history_labels: list[tuple[str, str, str, str]] = []
    sent_messages: list[str] = []

    def fake_create_task(
        title: str,
        description: str,
        assignee: str,
        deadline: str,
        task_chat_id: str,
        members: list[str],
    ) -> str:
        created_tasks.append((title, description, assignee, deadline, task_chat_id, list(members)))
        return f"{title}: https://example.invalid/task/batch-followup"

    def fake_append_doc(title: str, _project: dict, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        doc_labels.append((title, label, value))
        return True

    def fake_append_history(app_token: str, table_id: str, label: str, value: str, *_args: Any, **_kwargs: Any) -> bool:
        history_labels.append((app_token, table_id, label, value))
        return True

    def fake_send(_chat_id: str, text: str) -> bool:
        sent_messages.append(text)
        return True

    with tempfile.TemporaryDirectory(prefix="pilotflow-batch-followup-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._create_task = fake_create_task
        runtime_tools._append_project_doc_update = fake_append_doc
        runtime_tools._append_bitable_update_record = fake_append_history
        runtime_tools._hermes_send = fake_send
        try:
            overdue = (dt.date.today() - dt.timedelta(days=1)).isoformat()
            future = (dt.date.today() + dt.timedelta(days=10)).isoformat()
            _register_project(
                "运行态批量待办逾期项目",
                ["张三"],
                overdue,
                "进行中",
                ["文档: https://example.invalid/doc/batch-followup-overdue"],
                app_token="app_batch_followup",
                table_id="tbl_batch_followup",
                record_id="rec_batch_followup",
                goal="验证安装后的批量跟进待办",
                deliverables=["初始验收"],
            )
            _register_project(
                "运行态批量待办未到期项目",
                ["李四"],
                future,
                "进行中",
                ["文档: https://example.invalid/doc/batch-followup-future"],
                app_token="app_batch_future",
                table_id="tbl_batch_future",
                record_id="rec_batch_future",
                goal="验证安装后的批量跟进待办过滤",
                deliverables=["初始验收"],
            )
            action_id = _create_card_action_ref(chat_id, "briefing_batch_followup_task", {"filter": "overdue"})
            data = json.loads(_handle_card_action(
                {"action_value": json.dumps({"pilotflow_action_id": action_id}, ensure_ascii=False)},
                chat_id=chat_id,
            ))
            state_projects = _load_project_state()
        finally:
            runtime_tools._create_task = original_create_task
            runtime_tools._append_project_doc_update = original_append_doc
            runtime_tools._append_bitable_update_record = original_append_history
            runtime_tools._hermes_send = original_send
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    state_updates: list[dict[str, Any]] = []
    for item in state_projects:
        if item.get("title") == "运行态批量待办逾期项目":
            state_updates = item.get("updates", [])
            break
    feedback_text = "\n".join(sent_messages)
    task_title = "运行态批量待办逾期项目跟进"
    task_name = f"{task_title}: https://example.invalid/task/batch-followup"
    return {
        "batch_followup_created": data.get("status") == "briefing_batch_followup_task_created"
        and data.get("project_count") == 1,
        "batch_followup_filtered": data.get("projects") == ["运行态批量待办逾期项目"],
        "batch_followup_task_created": created_tasks == [(
            task_title,
            "项目: 运行态批量待办逾期项目",
            "张三",
            overdue,
            chat_id,
            ["张三"],
        )],
        "batch_followup_doc_recorded": ("运行态批量待办逾期项目", "任务", task_name) in doc_labels,
        "batch_followup_history_recorded": (
            "app_batch_followup", "tbl_batch_followup", "任务", task_name
        ) in history_labels,
        "batch_followup_state_recorded": any(
            item.get("action") == "任务" and item.get("value") == task_title
            for item in state_updates
            if isinstance(item, dict)
        ),
        "batch_followup_feedback_sent": (
            "已为 1 个逾期项目创建跟进待办" in feedback_text
            and "运行态批量待办逾期项目" in feedback_text
            and "运行态批量待办未到期项目" not in feedback_text
        ),
        "batch_followup_used_opaque_ref": bool(action_id),
    }


def _verify_runtime_dashboard_navigation(hermes_dir: Path) -> dict[str, Any]:
    """Verify installed PilotFlow can filter and paginate dashboard cards from card actions."""
    sys.path.insert(0, str(hermes_dir))
    import datetime as dt
    import plugins.pilotflow.tools as runtime_tools  # pylint: disable=import-error
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _create_card_action_ref,
        _handle_card_action,
        _project_registry,
        _project_registry_lock,
        _register_project,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    original_page_size = runtime_tools._DASHBOARD_PAGE_SIZE
    original_send_card = runtime_tools._hermes_send_card
    sent_cards: list[dict[str, Any]] = []

    def fake_send_card(_chat_id: str, card: dict[str, Any]) -> str:
        sent_cards.append(card)
        return f"om_dashboard_{len(sent_cards)}"

    def card_text(card: dict[str, Any]) -> str:
        values: list[str] = []

        def visit(value: Any) -> None:
            if isinstance(value, dict):
                for item in value.values():
                    visit(item)
            elif isinstance(value, list):
                for item in value:
                    visit(item)
            elif isinstance(value, str):
                values.append(value)

        visit(card)
        return "\n".join(values)

    with tempfile.TemporaryDirectory(prefix="pilotflow-dashboard-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _project_registry_lock:
            _project_registry.clear()
        runtime_tools._DASHBOARD_PAGE_SIZE = 1
        runtime_tools._hermes_send_card = fake_send_card
        try:
            today = dt.date.today()
            _register_project(
                "运行态看板第一页项目",
                ["张三"],
                (today + dt.timedelta(days=5)).isoformat(),
                "进行中",
                ["文档: https://example.invalid/doc/dashboard-one"],
                goal="验证安装后的看板分页第一页",
                deliverables=["分页验收"],
            )
            _register_project(
                "运行态看板第二页项目",
                ["李四"],
                (today + dt.timedelta(days=7)).isoformat(),
                "进行中",
                ["文档: https://example.invalid/doc/dashboard-two"],
                goal="验证安装后的看板分页第二页",
                deliverables=["分页验收"],
            )
            _register_project(
                "运行态看板风险项目",
                ["王五"],
                (today + dt.timedelta(days=2)).isoformat(),
                "有风险",
                ["文档: https://example.invalid/doc/dashboard-risk"],
                goal="验证安装后的看板风险筛选",
                deliverables=["风险验收"],
            )
            filter_action_id = _create_card_action_ref(
                chat_id,
                "dashboard_filter",
                {"query": "看看风险项目", "filter": "risk"},
            )
            filter_data = json.loads(_handle_card_action(
                {"action_value": json.dumps({"pilotflow_action_id": filter_action_id}, ensure_ascii=False)},
                chat_id=chat_id,
            ))
            page_action_id = _create_card_action_ref(
                chat_id,
                "dashboard_page",
                {"query": "项目进展第2页", "page": 2, "filter": "active"},
            )
            page_data = json.loads(_handle_card_action(
                {"action_value": json.dumps({"pilotflow_action_id": page_action_id}, ensure_ascii=False)},
                chat_id=chat_id,
            ))
        finally:
            runtime_tools._DASHBOARD_PAGE_SIZE = original_page_size
            runtime_tools._hermes_send_card = original_send_card
            with _project_registry_lock:
                _project_registry.clear()
            if original_state_path is None:
                os.environ.pop("PILOTFLOW_STATE_PATH", None)
            else:
                os.environ["PILOTFLOW_STATE_PATH"] = original_state_path

    filter_card_text = card_text(sent_cards[0]) if sent_cards else ""
    page_card_text = card_text(sent_cards[1]) if len(sent_cards) > 1 else ""
    return {
        "dashboard_filter_sent": filter_data.get("status") == "dashboard_filter_sent",
        "dashboard_filter_scoped": (
            "运行态看板风险项目" in filter_card_text
            and "运行态看板第一页项目" not in filter_card_text
            and "运行态看板第二页项目" not in filter_card_text
        ),
        "dashboard_page_sent": page_data.get("status") == "dashboard_page_sent",
        "dashboard_page_scoped": (
            "运行态看板第二页项目" in page_card_text
            and "运行态看板第一页项目" not in page_card_text
            and "第 2/3 页" in page_card_text
        ),
        "dashboard_cards_sent": len(sent_cards) == 2,
        "dashboard_used_opaque_refs": bool(filter_action_id and page_action_id),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify PilotFlow WSL Feishu runtime.")
    parser.add_argument("--hermes-dir", required=True, help="Hermes runtime directory.")
    parser.add_argument("--env-file", default=str(Path.home() / ".hermes" / ".env"))
    parser.add_argument("--config-file", default=str(Path.home() / ".hermes" / "config.yaml"))
    parser.add_argument("--send-card", action="store_true", help="Send one real Feishu plan card.")
    parser.add_argument("--probe-llm", action="store_true", help="Probe configured OpenAI-compatible /models endpoint.")
    parser.add_argument("--verify-health-check", action="store_true", help="Dry-run installed PilotFlow runtime health check.")
    parser.add_argument("--verify-plugin-registration", action="store_true", help="Dry-run installed PilotFlow Hermes tool/command registration.")
    parser.add_argument("--verify-session-initiator", action="store_true", help="Dry-run installed session initiator metadata propagation.")
    parser.add_argument("--verify-history", action="store_true", help="Send real cards that verify history suggestions can be applied.")
    parser.add_argument("--verify-projectization-suggestion", action="store_true", help="Send real cards that verify chat signal projectization suggestion flow.")
    parser.add_argument("--verify-project-creation", action="store_true", help="Dry-run installed create-project resource orchestration.")
    parser.add_argument("--verify-collaboration-resources", action="store_true", help="Dry-run installed doc comment and task collaborator wiring.")
    parser.add_argument("--verify-update-task", action="store_true", help="Dry-run installed update_project task summary behavior.")
    parser.add_argument("--verify-archive-gate", action="store_true", help="Dry-run installed archive confirmation gate behavior.")
    parser.add_argument("--verify-followup-task", action="store_true", help="Dry-run installed card follow-up task behavior.")
    parser.add_argument("--verify-deadline-update", action="store_true", help="Dry-run installed deadline calendar/reminder behavior.")
    parser.add_argument("--verify-member-permissions", action="store_true", help="Dry-run installed add-member permission refresh behavior.")
    parser.add_argument("--verify-member-removal", action="store_true", help="Dry-run installed remove-member confirmation and sync behavior.")
    parser.add_argument("--verify-risk-cycle", action="store_true", help="Dry-run installed risk report/resolve behavior.")
    parser.add_argument("--verify-progress-update", action="store_true", help="Dry-run installed progress recording behavior.")
    parser.add_argument("--verify-project-reminder", action="store_true", help="Dry-run installed single/batch project reminder behavior.")
    parser.add_argument("--verify-briefing-batch-reminder", action="store_true", help="Dry-run installed briefing card batch reminder behavior.")
    parser.add_argument("--verify-card-command-bridge", action="store_true", help="Dry-run installed Hermes card command bridge behavior.")
    parser.add_argument("--verify-card-status-cycle", action="store_true", help="Dry-run installed card complete/reopen behavior.")
    parser.add_argument("--verify-batch-followup-task", action="store_true", help="Dry-run installed briefing batch follow-up task behavior.")
    parser.add_argument("--verify-dashboard-navigation", action="store_true", help="Dry-run installed dashboard filter/pagination behavior.")
    args = parser.parse_args(argv)

    hermes_dir = Path(args.hermes_dir).resolve()
    env_values = _load_env(Path(args.env_file))
    config_result = _read_runtime_config(Path(args.config_file))
    import_result = _check_imports(hermes_dir)
    mode = (
        "dashboard-navigation" if args.verify_dashboard_navigation
        else "batch-followup-task" if args.verify_batch_followup_task
        else "card-status-cycle" if args.verify_card_status_cycle
        else "card-command-bridge" if args.verify_card_command_bridge
        else "briefing-batch-reminder" if args.verify_briefing_batch_reminder
        else "project-reminder" if args.verify_project_reminder
        else "progress-update" if args.verify_progress_update
        else "risk-cycle" if args.verify_risk_cycle
        else "member-removal" if args.verify_member_removal
        else "member-permissions" if args.verify_member_permissions
        else "deadline-update" if args.verify_deadline_update
        else "followup-task" if args.verify_followup_task
        else "archive-gate" if args.verify_archive_gate
        else "update-task" if args.verify_update_task
        else "collaboration-resources" if args.verify_collaboration_resources
        else "project-creation" if args.verify_project_creation
        else "projectization-suggestion" if args.verify_projectization_suggestion
        else "session-initiator" if args.verify_session_initiator
        else "plugin-registration" if args.verify_plugin_registration
        else "health-check" if args.verify_health_check
        else "history" if args.verify_history
        else "send-card" if args.send_card
        else "dry-run"
    )
    output: dict[str, Any] = {
        "mode": mode,
        "would_send_card": bool(args.send_card or args.verify_history or args.verify_projectization_suggestion),
        "has_chat_id": _safe_bool(env_values.get("PILOTFLOW_TEST_CHAT_ID") or os.environ.get("PILOTFLOW_TEST_CHAT_ID")),
        "has_feishu_credentials": _safe_bool(
            (env_values.get("FEISHU_APP_ID") or os.environ.get("FEISHU_APP_ID"))
            and (env_values.get("FEISHU_APP_SECRET") or os.environ.get("FEISHU_APP_SECRET"))
        ),
        **config_result,
        **import_result,
    }
    if args.send_card:
        output.update(_send_runtime_plan_card(hermes_dir))
    if args.verify_health_check:
        output.update(_verify_runtime_health_check(hermes_dir))
    if args.verify_plugin_registration:
        output.update(_verify_runtime_plugin_registration(hermes_dir))
    if args.verify_session_initiator:
        output.update(_verify_runtime_session_initiator(hermes_dir))
    if args.verify_history:
        output.update(_verify_runtime_history_suggestions(hermes_dir))
    if args.verify_projectization_suggestion:
        output.update(_verify_runtime_projectization_suggestion(hermes_dir))
    if args.verify_project_creation:
        output.update(_verify_runtime_project_creation(hermes_dir))
    if args.verify_collaboration_resources:
        output.update(_verify_runtime_collaboration_resources(hermes_dir))
    if args.verify_update_task:
        output.update(_verify_runtime_update_task_summary(hermes_dir))
    if args.verify_archive_gate:
        output.update(_verify_runtime_archive_gate(hermes_dir))
    if args.verify_followup_task:
        output.update(_verify_runtime_followup_task(hermes_dir))
    if args.verify_deadline_update:
        output.update(_verify_runtime_deadline_update(hermes_dir))
    if args.verify_member_permissions:
        output.update(_verify_runtime_member_permissions(hermes_dir))
    if args.verify_member_removal:
        output.update(_verify_runtime_member_removal(hermes_dir))
    if args.verify_risk_cycle:
        output.update(_verify_runtime_risk_cycle(hermes_dir))
    if args.verify_progress_update:
        output.update(_verify_runtime_progress_update(hermes_dir))
    if args.verify_project_reminder:
        output.update(_verify_runtime_project_reminder(hermes_dir))
    if args.verify_briefing_batch_reminder:
        output.update(_verify_runtime_briefing_batch_reminder(hermes_dir))
    if args.verify_card_command_bridge:
        output.update(_verify_runtime_card_command_bridge(hermes_dir))
    if args.verify_card_status_cycle:
        output.update(_verify_runtime_card_status_cycle(hermes_dir))
    if args.verify_batch_followup_task:
        output.update(_verify_runtime_batch_followup_task(hermes_dir))
    if args.verify_dashboard_navigation:
        output.update(_verify_runtime_dashboard_navigation(hermes_dir))
    if args.probe_llm:
        output.update(_probe_llm(config_result))
    print(json.dumps(_sanitize_result(output), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
