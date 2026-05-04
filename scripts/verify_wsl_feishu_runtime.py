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
        "history_suggestion_found",
        "history_apply_action_found",
        "history_apply_card_sent",
        "history_privacy_members_ignored",
        "history_deliverables_recovered",
        "history_pending_recovered",
        "history_card_count",
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify PilotFlow WSL Feishu runtime.")
    parser.add_argument("--hermes-dir", required=True, help="Hermes runtime directory.")
    parser.add_argument("--env-file", default=str(Path.home() / ".hermes" / ".env"))
    parser.add_argument("--config-file", default=str(Path.home() / ".hermes" / "config.yaml"))
    parser.add_argument("--send-card", action="store_true", help="Send one real Feishu plan card.")
    parser.add_argument("--probe-llm", action="store_true", help="Probe configured OpenAI-compatible /models endpoint.")
    parser.add_argument("--verify-history", action="store_true", help="Send real cards that verify history suggestions can be applied.")
    parser.add_argument("--verify-update-task", action="store_true", help="Dry-run installed update_project task summary behavior.")
    parser.add_argument("--verify-archive-gate", action="store_true", help="Dry-run installed archive confirmation gate behavior.")
    parser.add_argument("--verify-followup-task", action="store_true", help="Dry-run installed card follow-up task behavior.")
    parser.add_argument("--verify-deadline-update", action="store_true", help="Dry-run installed deadline calendar/reminder behavior.")
    args = parser.parse_args(argv)

    hermes_dir = Path(args.hermes_dir).resolve()
    env_values = _load_env(Path(args.env_file))
    config_result = _read_runtime_config(Path(args.config_file))
    import_result = _check_imports(hermes_dir)
    mode = (
        "deadline-update" if args.verify_deadline_update
        else "followup-task" if args.verify_followup_task
        else "archive-gate" if args.verify_archive_gate
        else "update-task" if args.verify_update_task
        else "history" if args.verify_history
        else "send-card" if args.send_card
        else "dry-run"
    )
    output: dict[str, Any] = {
        "mode": mode,
        "would_send_card": bool(args.send_card or args.verify_history),
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
    if args.verify_history:
        output.update(_verify_runtime_history_suggestions(hermes_dir))
    if args.verify_update_task:
        output.update(_verify_runtime_update_task_summary(hermes_dir))
    if args.verify_archive_gate:
        output.update(_verify_runtime_archive_gate(hermes_dir))
    if args.verify_followup_task:
        output.update(_verify_runtime_followup_task(hermes_dir))
    if args.verify_deadline_update:
        output.update(_verify_runtime_deadline_update(hermes_dir))
    if args.probe_llm:
        output.update(_probe_llm(config_result))
    print(json.dumps(_sanitize_result(output), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
