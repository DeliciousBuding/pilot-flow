"""Tests for the WSL Feishu runtime verifier script."""

import importlib.util
import json
import shutil
import sys
import types
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError


_SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "verify_wsl_feishu_runtime.py"
_SPEC = importlib.util.spec_from_file_location("verify_wsl_feishu_runtime", _SCRIPT_PATH)
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)


def _install_runtime_fixture(tmp_path, monkeypatch):
    hermes_dir = tmp_path / "hermes"
    plugin_root = hermes_dir / "plugins" / "pilotflow"
    plugin_root.parent.mkdir(parents=True)
    shutil.copytree(Path(__file__).resolve().parents[1] / "plugins" / "pilotflow", plugin_root)
    (hermes_dir / "plugins" / "__init__.py").write_text("", encoding="utf-8")
    sent_cards = []

    fake_registry_module = types.ModuleType("tools.registry")
    fake_registry_module.registry = types.SimpleNamespace(dispatch=lambda name, args, **kwargs: json.dumps({"success": True}))
    fake_registry_module.tool_error = lambda msg: json.dumps({"error": msg})
    fake_registry_module.tool_result = lambda msg: msg if isinstance(msg, str) else json.dumps(msg)
    monkeypatch.setitem(sys.modules, "tools.registry", fake_registry_module)
    monkeypatch.setenv("PILOTFLOW_TEST_CHAT_ID", "oc_runtime_card")

    for name in list(sys.modules):
        if name == "plugins.pilotflow" or name.startswith("plugins.pilotflow."):
            monkeypatch.delitem(sys.modules, name, raising=False)
    sys.path.insert(0, str(hermes_dir))
    import plugins.pilotflow.tools as runtime_tools

    def fake_send_card(chat_id, card):
        sent_cards.append({"chat_id": chat_id, "card": card})
        return "om_runtime_card"

    monkeypatch.setattr(runtime_tools, "_send_interactive_card_via_feishu", fake_send_card)
    return hermes_dir, sent_cards


def test_verifier_defaults_to_dry_run_and_does_not_send_card(tmp_path, capsys):
    env_file = tmp_path / ".env"
    config_file = tmp_path / "config.yaml"
    env_file.write_text(
        "\n".join([
            "PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id",
            "FEISHU_APP_ID=cli_real_app",
            "FEISHU_APP_SECRET=real_secret",
        ]),
        encoding="utf-8",
    )
    config_file.write_text(
        "\n".join([
            "model:",
            "  default: mimo-v2.5-pro",
            "  provider: vectorcontrol",
            "gateway:",
            "  default_platform: feishu",
        ]),
        encoding="utf-8",
    )

    with patch.object(_MODULE, "_send_runtime_plan_card") as send_card:
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--config-file", str(config_file),
        ])

    output = json.loads(capsys.readouterr().out)
    assert exit_code == 0
    assert output["mode"] == "dry-run"
    assert output["would_send_card"] is False
    assert output["has_chat_id"] is True
    assert output["has_feishu_credentials"] is True
    assert output["has_config_file"] is True
    assert output["config_model"] == "mimo-v2.5-pro"
    assert output["config_provider"] == "vectorcontrol"
    assert output["config_has_feishu_gateway"] is True
    assert "oc_real_chat_id" not in json.dumps(output)
    send_card.assert_not_called()


def test_verifier_send_card_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_send_runtime_plan_card", return_value={
        "status": "plan_generated",
        "card_sent": True,
        "card_has_initiator": True,
        "has_confirm_token": True,
        "has_idempotency_key": True,
        "trace_has_key": True,
        "redaction_enabled": True,
        "action_ref_count": 2,
        "action_refs_have_token": True,
        "pending_plan_recovered": True,
        "card_action_recovered": True,
        "raw_chat_id": "oc_real_chat_id",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--send-card",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "send-card"
    assert output["card_sent"] is True
    assert output["card_has_initiator"] is True
    assert output["has_confirm_token"] is True
    assert output["action_ref_count"] == 2
    assert output["pending_plan_recovered"] is True
    assert output["card_action_recovered"] is True
    assert "oc_real_chat_id" not in output_text


def test_send_runtime_plan_card_verifies_visible_confirmation_content(tmp_path, monkeypatch):
    hermes_dir, sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._send_runtime_plan_card(hermes_dir)

    assert result["status"] == "plan_generated"
    assert result["card_sent"] is True
    assert result["card_has_title"] is True
    assert result["card_has_goal"] is True
    assert result["card_has_initiator"] is True
    assert result["card_has_risk"] is True
    assert sent_cards


def test_verify_runtime_history_suggestions_applies_without_member_leak(tmp_path, monkeypatch):
    hermes_dir, sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_history_suggestions(hermes_dir)

    assert result["history_suggestion_found"] is True
    assert result["history_apply_action_found"] is True
    assert result["history_apply_card_sent"] is True
    assert result["history_privacy_members_ignored"] is True
    assert result["history_deliverables_recovered"] is True
    assert result["history_assignees_recovered"] is True
    assert result["history_assignees_card_shown"] is True
    assert result["history_pending_recovered"] is True
    assert result["history_card_count"] == 2
    assert sent_cards


def test_verify_runtime_project_creation_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_project_creation(hermes_dir)

    assert result["project_create_gate_created"] is True
    assert result["project_create_confirmed"] is True
    assert result["project_create_doc_created"] is True
    assert result["project_create_bitable_created"] is True
    assert result["project_create_task_created"] is True
    assert result["project_create_structured_assignees_used"] is True
    assert result["project_create_schema_assignees_exposed"] is True
    assert result["project_create_idempotency_includes_assignees"] is True
    assert result["project_create_detail_assignees_shown"] is True
    assert result["project_create_memory_assignees_saved"] is True
    assert result["project_create_calendar_created"] is True
    assert result["project_create_reminder_scheduled"] is True
    assert result["project_create_entry_card_sent"] is True
    assert result["project_create_state_recorded"] is True
    assert result["project_create_memory_saved"] is True
    assert result["project_create_trace_redacted"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_session_initiator_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_session_initiator(hermes_dir)

    assert result["session_initiator_plan_recorded"] is True
    assert result["session_initiator_project_created"] is True
    assert result["session_initiator_registry_recorded"] is True
    assert result["session_initiator_state_recorded"] is True
    assert result["session_initiator_detail_card_shown"] is True
    assert result["session_initiator_context_marked_with_explicit_members"] is True
    sanitized = _MODULE._sanitize_result(result)
    assert sanitized == result
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_collaboration_resources_are_wired(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_collaboration_resources(hermes_dir)

    assert result["collab_doc_created"] is True
    assert result["collab_doc_comment_created"] is True
    assert result["collab_doc_permission_refreshed"] is True
    assert result["collab_task_created"] is True
    assert result["collab_task_assignee_bound"] is True
    assert result["collab_task_followers_bound"] is True
    assert result["collab_task_collaborators_created"] is True
    assert result["collab_task_url_returned"] is True
    assert "oc_collab_runtime" not in json.dumps(result, ensure_ascii=False)
    assert "ou_zhang" not in json.dumps(result, ensure_ascii=False)
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_update_task_summary_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_update_task_summary(hermes_dir)

    assert result["update_task_created"] is True
    assert result["update_task_name_returned"] is True
    assert result["update_task_structured_assignee_used"] is True
    assert result["update_task_schema_assignee_exposed"] is True
    assert result["update_task_feedback_includes_summary"] is True
    assert result["update_task_artifact_recorded"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_archive_gate_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_archive_gate(hermes_dir)

    assert result["archive_gate_required"] is True
    assert result["archive_gate_no_write"] is True
    assert result["archive_gate_confirmed"] is True
    assert result["archive_gate_feedback_sent"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_followup_task_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_followup_task(hermes_dir)

    assert result["followup_task_created"] is True
    assert result["followup_task_feedback_sent"] is True
    assert result["followup_task_artifact_recorded"] is True
    assert result["followup_task_public_update_recorded"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_deadline_update_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_deadline_update(hermes_dir)

    assert result["deadline_update_applied"] is True
    assert result["deadline_calendar_created"] is True
    assert result["deadline_attendees_added"] is True
    assert result["deadline_reminder_scheduled"] is True
    assert result["deadline_feedback_sent"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_member_permissions_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_member_permissions(hermes_dir)

    assert result["member_added"] is True
    assert result["member_mention_cleaned"] is True
    assert result["member_permissions_refreshed"] is True
    assert result["member_bitable_owner_synced"] is True
    assert result["member_feedback_sent"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_member_removal_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_member_removal(hermes_dir)

    assert result["member_remove_gate_required"] is True
    assert result["member_remove_gate_no_write"] is True
    assert result["member_removed"] is True
    assert result["member_remove_bitable_synced"] is True
    assert result["member_remove_doc_recorded"] is True
    assert result["member_remove_history_recorded"] is True
    assert result["member_remove_feedback_sent"] is True
    assert result["member_remove_mention_cleaned"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_risk_cycle_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_risk_cycle(hermes_dir)

    assert result["risk_reported"] is True
    assert result["risk_level_high"] is True
    assert result["risk_bitable_synced"] is True
    assert result["risk_history_recorded"] is True
    assert result["risk_feedback_sent"] is True
    assert result["risk_resolved"] is True
    assert result["risk_level_low"] is True
    assert result["risk_resolve_feedback_sent"] is True
    assert result["risk_detail_reminder_action_shown"] is True
    assert result["risk_detail_reminder_opaque"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_progress_update_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_progress_update(hermes_dir)

    assert result["progress_update_applied"] is True
    assert result["progress_doc_updated"] is True
    assert result["progress_history_recorded"] is True
    assert result["progress_state_recorded"] is True
    assert result["progress_state_initiator_preserved"] is True
    assert result["progress_feedback_sent"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_project_reminder_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_project_reminder(hermes_dir)

    assert result["reminder_single_sent"] is True
    assert result["reminder_single_doc_updated"] is True
    assert result["reminder_single_history_recorded"] is True
    assert result["reminder_single_state_recorded"] is True
    assert result["reminder_batch_sent"] is True
    assert result["reminder_batch_filtered"] is True
    assert result["reminder_batch_history_recorded"] is True
    assert result["reminder_feedback_sanitized"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_projectization_suggestion_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_projectization_suggestion(hermes_dir)

    assert result["projectization_suggestion_sent"] is True
    assert result["projectization_action_found"] is True
    assert result["projectization_plan_generated"] is True
    assert result["projectization_plan_card_sent"] is True
    assert result["projectization_risks_preserved"] is True
    assert result["projectization_action_items_preserved"] is True
    assert result["projectization_assignees_preserved"] is True
    assert result["projectization_assignees_card_shown"] is True
    assert result["projectization_schema_assignees_exposed"] is True
    assert result["projectization_pending_recovered"] is True
    assert result["projectization_cards_sent"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_health_check_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)
    import plugins.pilotflow.tools as runtime_tools

    monkeypatch.setenv("FEISHU_APP_ID", "sentinel_app_id_should_not_leak")
    monkeypatch.setenv("FEISHU_APP_SECRET", "sentinel_secret_should_not_leak")
    monkeypatch.setenv("PILOTFLOW_TEST_CHAT_ID", "oc_runtime_chat_should_not_leak")
    monkeypatch.setenv("PILOTFLOW_STATE_PATH", "sentinel_state_path_should_not_leak")
    monkeypatch.setattr(runtime_tools, "APP_ID", "sentinel_app_id_should_not_leak")
    monkeypatch.setattr(runtime_tools, "APP_SECRET", "sentinel_secret_should_not_leak")
    monkeypatch.setattr(runtime_tools, "_get_client", lambda: object())
    monkeypatch.setattr(runtime_tools, "_lark_sdk_status", lambda: "已安装")

    result = _MODULE._verify_runtime_health_check(hermes_dir)

    assert result["health_check_ok"] is True
    assert result["health_check_sanitized"] is True
    assert result["health_has_credentials"] is True
    assert result["health_has_client"] is True
    assert result["health_has_chat_context"] is True
    assert result["health_has_state_path_status"] is True
    assert result["health_memory_flags_reported"] is True
    assert result["health_card_bridge_registered"] is True
    assert result["health_skill_guidance_current"] is True
    serialized = json.dumps(result, ensure_ascii=False)
    assert "sentinel_app_id_should_not_leak" not in serialized
    assert "sentinel_secret_should_not_leak" not in serialized
    assert "oc_runtime_chat_should_not_leak" not in serialized
    assert "sentinel_state_path_should_not_leak" not in serialized


def test_verify_runtime_plugin_registration_exposes_tools_and_card_command(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_plugin_registration(hermes_dir)

    assert result["registration_tools_exposed"] is True
    assert result["registration_expected_tool_count"] is True
    assert result["registration_schemas_match_names"] is True
    assert result["registration_check_fns_present"] is True
    assert result["registration_card_command_exposed"] is True
    assert result["registration_handlers_present"] is True
    assert result["registration_initiator_schema_exposed"] is True


def test_verify_runtime_briefing_batch_reminder_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_briefing_batch_reminder(hermes_dir)

    assert result["briefing_batch_reminder_sent"] is True
    assert result["briefing_batch_reminder_filtered"] is True
    assert result["briefing_batch_reminder_doc_recorded"] is True
    assert result["briefing_batch_reminder_history_recorded"] is True
    assert result["briefing_batch_reminder_state_recorded"] is True
    assert result["briefing_batch_reminder_feedback_sent"] is True
    assert result["briefing_batch_reminder_used_opaque_ref"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_card_command_bridge_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_card_command_bridge(hermes_dir)

    assert result["card_command_bridge_executed"] is True
    assert result["card_command_bridge_suppressed_text"] is True
    assert result["card_command_bridge_marked_origin"] is True
    assert result["card_command_bridge_doc_recorded"] is True
    assert result["card_command_bridge_history_recorded"] is True
    assert result["card_command_bridge_state_recorded"] is True
    assert result["card_command_bridge_used_opaque_ref"] is True
    assert result["card_command_bridge_feedback_sanitized"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_card_status_cycle_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_card_status_cycle(hermes_dir)

    assert result["card_status_done_applied"] is True
    assert result["card_status_reopen_applied"] is True
    assert result["card_status_bitable_synced"] is True
    assert result["card_status_doc_recorded"] is True
    assert result["card_status_state_recorded"] is True
    assert result["card_status_feedback_sent"] is True
    assert result["card_status_used_opaque_refs"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_batch_followup_task_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_batch_followup_task(hermes_dir)

    assert result["batch_followup_created"] is True
    assert result["batch_followup_filtered"] is True
    assert result["batch_followup_task_created"] is True
    assert result["batch_followup_doc_recorded"] is True
    assert result["batch_followup_history_recorded"] is True
    assert result["batch_followup_state_recorded"] is True
    assert result["batch_followup_feedback_sent"] is True
    assert result["batch_followup_used_opaque_ref"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verify_runtime_dashboard_navigation_is_sanitized(tmp_path, monkeypatch):
    hermes_dir, _sent_cards = _install_runtime_fixture(tmp_path, monkeypatch)

    result = _MODULE._verify_runtime_dashboard_navigation(hermes_dir)

    assert result["dashboard_filter_sent"] is True
    assert result["dashboard_filter_scoped"] is True
    assert result["dashboard_page_sent"] is True
    assert result["dashboard_page_scoped"] is True
    assert result["dashboard_cards_sent"] is True
    assert result["dashboard_used_opaque_refs"] is True
    assert "example.invalid" not in json.dumps(result, ensure_ascii=False)


def test_verifier_update_task_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_update_task_summary", return_value={
        "update_task_created": True,
        "update_task_name_returned": True,
        "update_task_structured_assignee_used": True,
        "update_task_schema_assignee_exposed": True,
        "update_task_feedback_includes_summary": True,
        "update_task_artifact_recorded": True,
        "raw_task_url": "https://example.invalid/task/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-update-task",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "update-task"
    assert output["would_send_card"] is False
    assert output["update_task_created"] is True
    assert output["update_task_name_returned"] is True
    assert output["update_task_structured_assignee_used"] is True
    assert output["update_task_schema_assignee_exposed"] is True
    assert output["update_task_feedback_includes_summary"] is True
    assert output["update_task_artifact_recorded"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_project_creation_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_project_creation", return_value={
        "project_create_gate_created": True,
        "project_create_confirmed": True,
        "project_create_doc_created": True,
        "project_create_bitable_created": True,
        "project_create_task_created": True,
        "project_create_structured_assignees_used": True,
        "project_create_schema_assignees_exposed": True,
        "project_create_idempotency_includes_assignees": True,
        "project_create_detail_assignees_shown": True,
        "project_create_memory_assignees_saved": True,
        "project_create_calendar_created": True,
        "project_create_reminder_scheduled": True,
        "project_create_entry_card_sent": True,
        "project_create_state_recorded": True,
        "project_create_memory_saved": True,
        "project_create_trace_redacted": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-project-creation",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "project-creation"
    assert output["would_send_card"] is False
    assert output["project_create_gate_created"] is True
    assert output["project_create_confirmed"] is True
    assert output["project_create_doc_created"] is True
    assert output["project_create_bitable_created"] is True
    assert output["project_create_task_created"] is True
    assert output["project_create_structured_assignees_used"] is True
    assert output["project_create_schema_assignees_exposed"] is True
    assert output["project_create_idempotency_includes_assignees"] is True
    assert output["project_create_detail_assignees_shown"] is True
    assert output["project_create_memory_assignees_saved"] is True
    assert output["project_create_calendar_created"] is True
    assert output["project_create_reminder_scheduled"] is True
    assert output["project_create_entry_card_sent"] is True
    assert output["project_create_state_recorded"] is True
    assert output["project_create_memory_saved"] is True
    assert output["project_create_trace_redacted"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_archive_gate_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_archive_gate", return_value={
        "archive_gate_required": True,
        "archive_gate_no_write": True,
        "archive_gate_confirmed": True,
        "archive_gate_feedback_sent": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-archive-gate",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "archive-gate"
    assert output["would_send_card"] is False
    assert output["archive_gate_required"] is True
    assert output["archive_gate_no_write"] is True
    assert output["archive_gate_confirmed"] is True
    assert output["archive_gate_feedback_sent"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_followup_task_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_followup_task", return_value={
        "followup_task_created": True,
        "followup_task_feedback_sent": True,
        "followup_task_artifact_recorded": True,
        "followup_task_public_update_recorded": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_task_url": "https://example.invalid/task/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-followup-task",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "followup-task"
    assert output["would_send_card"] is False
    assert output["followup_task_created"] is True
    assert output["followup_task_feedback_sent"] is True
    assert output["followup_task_artifact_recorded"] is True
    assert output["followup_task_public_update_recorded"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_deadline_update_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_deadline_update", return_value={
        "deadline_update_applied": True,
        "deadline_calendar_created": True,
        "deadline_attendees_added": True,
        "deadline_reminder_scheduled": True,
        "deadline_feedback_sent": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_calendar_url": "https://example.invalid/calendar/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-deadline-update",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "deadline-update"
    assert output["would_send_card"] is False
    assert output["deadline_update_applied"] is True
    assert output["deadline_calendar_created"] is True
    assert output["deadline_attendees_added"] is True
    assert output["deadline_reminder_scheduled"] is True
    assert output["deadline_feedback_sent"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_member_permissions_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_member_permissions", return_value={
        "member_added": True,
        "member_mention_cleaned": True,
        "member_permissions_refreshed": True,
        "member_bitable_owner_synced": True,
        "member_feedback_sent": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-member-permissions",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "member-permissions"
    assert output["would_send_card"] is False
    assert output["member_added"] is True
    assert output["member_mention_cleaned"] is True
    assert output["member_permissions_refreshed"] is True
    assert output["member_bitable_owner_synced"] is True
    assert output["member_feedback_sent"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_member_removal_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_member_removal", return_value={
        "member_remove_gate_required": True,
        "member_remove_gate_no_write": True,
        "member_removed": True,
        "member_remove_bitable_synced": True,
        "member_remove_doc_recorded": True,
        "member_remove_history_recorded": True,
        "member_remove_feedback_sent": True,
        "member_remove_mention_cleaned": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-member-removal",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "member-removal"
    assert output["would_send_card"] is False
    assert output["member_remove_gate_required"] is True
    assert output["member_remove_gate_no_write"] is True
    assert output["member_removed"] is True
    assert output["member_remove_bitable_synced"] is True
    assert output["member_remove_doc_recorded"] is True
    assert output["member_remove_history_recorded"] is True
    assert output["member_remove_feedback_sent"] is True
    assert output["member_remove_mention_cleaned"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_risk_cycle_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_risk_cycle", return_value={
        "risk_reported": True,
        "risk_level_high": True,
        "risk_bitable_synced": True,
        "risk_history_recorded": True,
        "risk_feedback_sent": True,
        "risk_resolved": True,
        "risk_level_low": True,
        "risk_resolve_feedback_sent": True,
        "risk_detail_reminder_action_shown": True,
        "risk_detail_reminder_opaque": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-risk-cycle",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "risk-cycle"
    assert output["would_send_card"] is False
    assert output["risk_reported"] is True
    assert output["risk_level_high"] is True
    assert output["risk_bitable_synced"] is True
    assert output["risk_history_recorded"] is True
    assert output["risk_feedback_sent"] is True
    assert output["risk_resolved"] is True
    assert output["risk_level_low"] is True
    assert output["risk_resolve_feedback_sent"] is True
    assert output["risk_detail_reminder_action_shown"] is True
    assert output["risk_detail_reminder_opaque"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_progress_update_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_progress_update", return_value={
        "progress_update_applied": True,
        "progress_doc_updated": True,
        "progress_history_recorded": True,
        "progress_state_recorded": True,
        "progress_feedback_sent": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-progress-update",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "progress-update"
    assert output["would_send_card"] is False
    assert output["progress_update_applied"] is True
    assert output["progress_doc_updated"] is True
    assert output["progress_history_recorded"] is True
    assert output["progress_state_recorded"] is True
    assert output["progress_feedback_sent"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_project_reminder_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_project_reminder", return_value={
        "reminder_single_sent": True,
        "reminder_single_doc_updated": True,
        "reminder_single_history_recorded": True,
        "reminder_single_state_recorded": True,
        "reminder_batch_sent": True,
        "reminder_batch_filtered": True,
        "reminder_batch_history_recorded": True,
        "reminder_feedback_sanitized": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-project-reminder",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "project-reminder"
    assert output["would_send_card"] is False
    assert output["reminder_single_sent"] is True
    assert output["reminder_single_doc_updated"] is True
    assert output["reminder_single_history_recorded"] is True
    assert output["reminder_single_state_recorded"] is True
    assert output["reminder_batch_sent"] is True
    assert output["reminder_batch_filtered"] is True
    assert output["reminder_batch_history_recorded"] is True
    assert output["reminder_feedback_sanitized"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_projectization_suggestion_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_projectization_suggestion", return_value={
        "projectization_suggestion_sent": True,
        "projectization_action_found": True,
        "projectization_plan_generated": True,
        "projectization_plan_card_sent": True,
        "projectization_risks_preserved": True,
        "projectization_action_items_preserved": True,
        "projectization_assignees_preserved": True,
        "projectization_assignees_card_shown": True,
        "projectization_schema_assignees_exposed": True,
        "projectization_pending_recovered": True,
        "projectization_cards_sent": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-projectization-suggestion",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "projectization-suggestion"
    assert output["would_send_card"] is True
    assert output["projectization_suggestion_sent"] is True
    assert output["projectization_action_found"] is True
    assert output["projectization_plan_generated"] is True
    assert output["projectization_plan_card_sent"] is True
    assert output["projectization_risks_preserved"] is True
    assert output["projectization_action_items_preserved"] is True
    assert output["projectization_assignees_preserved"] is True
    assert output["projectization_assignees_card_shown"] is True
    assert output["projectization_schema_assignees_exposed"] is True
    assert output["projectization_pending_recovered"] is True
    assert output["projectization_cards_sent"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_health_check_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_health_check", return_value={
        "health_check_ok": True,
        "health_check_sanitized": True,
        "health_has_credentials": True,
        "health_has_client": True,
        "health_has_chat_context": True,
        "health_has_state_path_status": True,
        "health_memory_flags_reported": True,
        "health_card_bridge_registered": True,
        "health_skill_guidance_current": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_secret": "real_secret",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-health-check",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "health-check"
    assert output["would_send_card"] is False
    assert output["health_check_ok"] is True
    assert output["health_check_sanitized"] is True
    assert output["health_has_credentials"] is True
    assert output["health_has_client"] is True
    assert output["health_has_chat_context"] is True
    assert output["health_has_state_path_status"] is True
    assert output["health_memory_flags_reported"] is True
    assert output["health_card_bridge_registered"] is True
    assert output["health_skill_guidance_current"] is True
    assert "oc_real_chat_id" not in output_text
    assert "real_secret" not in output_text


def test_verifier_plugin_registration_mode_outputs_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_plugin_registration", return_value={
        "registration_tools_exposed": True,
        "registration_expected_tool_count": True,
        "registration_schemas_match_names": True,
        "registration_check_fns_present": True,
        "registration_card_command_exposed": True,
        "registration_handlers_present": True,
        "registration_initiator_schema_exposed": True,
        "raw_chat_id": "oc_real_chat_id",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-plugin-registration",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "plugin-registration"
    assert output["would_send_card"] is False
    assert output["registration_tools_exposed"] is True
    assert output["registration_expected_tool_count"] is True
    assert output["registration_schemas_match_names"] is True
    assert output["registration_check_fns_present"] is True
    assert output["registration_card_command_exposed"] is True
    assert output["registration_handlers_present"] is True
    assert output["registration_initiator_schema_exposed"] is True
    assert "oc_real_chat_id" not in output_text


def test_verifier_collaboration_resources_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_collaboration_resources", return_value={
        "collab_doc_created": True,
        "collab_doc_comment_created": True,
        "collab_doc_permission_refreshed": True,
        "collab_task_created": True,
        "collab_task_assignee_bound": True,
        "collab_task_followers_bound": True,
        "collab_task_collaborators_created": True,
        "collab_task_url_returned": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_open_id": "ou_real_user",
        "raw_url": "https://example.invalid/task",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-collaboration-resources",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "collaboration-resources"
    assert output["would_send_card"] is False
    assert output["collab_doc_created"] is True
    assert output["collab_doc_comment_created"] is True
    assert output["collab_doc_permission_refreshed"] is True
    assert output["collab_task_created"] is True
    assert output["collab_task_assignee_bound"] is True
    assert output["collab_task_followers_bound"] is True
    assert output["collab_task_collaborators_created"] is True
    assert output["collab_task_url_returned"] is True
    assert "oc_real_chat_id" not in output_text
    assert "ou_real_user" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_briefing_batch_reminder_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_briefing_batch_reminder", return_value={
        "briefing_batch_reminder_sent": True,
        "briefing_batch_reminder_filtered": True,
        "briefing_batch_reminder_doc_recorded": True,
        "briefing_batch_reminder_history_recorded": True,
        "briefing_batch_reminder_state_recorded": True,
        "briefing_batch_reminder_feedback_sent": True,
        "briefing_batch_reminder_used_opaque_ref": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-briefing-batch-reminder",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "briefing-batch-reminder"
    assert output["would_send_card"] is False
    assert output["briefing_batch_reminder_sent"] is True
    assert output["briefing_batch_reminder_filtered"] is True
    assert output["briefing_batch_reminder_doc_recorded"] is True
    assert output["briefing_batch_reminder_history_recorded"] is True
    assert output["briefing_batch_reminder_state_recorded"] is True
    assert output["briefing_batch_reminder_feedback_sent"] is True
    assert output["briefing_batch_reminder_used_opaque_ref"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_card_command_bridge_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_card_command_bridge", return_value={
        "card_command_bridge_executed": True,
        "card_command_bridge_suppressed_text": True,
        "card_command_bridge_marked_origin": True,
        "card_command_bridge_doc_recorded": True,
        "card_command_bridge_history_recorded": True,
        "card_command_bridge_state_recorded": True,
        "card_command_bridge_used_opaque_ref": True,
        "card_command_bridge_feedback_sanitized": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-card-command-bridge",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "card-command-bridge"
    assert output["would_send_card"] is False
    assert output["card_command_bridge_executed"] is True
    assert output["card_command_bridge_suppressed_text"] is True
    assert output["card_command_bridge_marked_origin"] is True
    assert output["card_command_bridge_doc_recorded"] is True
    assert output["card_command_bridge_history_recorded"] is True
    assert output["card_command_bridge_state_recorded"] is True
    assert output["card_command_bridge_used_opaque_ref"] is True
    assert output["card_command_bridge_feedback_sanitized"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_card_status_cycle_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_card_status_cycle", return_value={
        "card_status_done_applied": True,
        "card_status_reopen_applied": True,
        "card_status_bitable_synced": True,
        "card_status_doc_recorded": True,
        "card_status_state_recorded": True,
        "card_status_feedback_sent": True,
        "card_status_used_opaque_refs": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-card-status-cycle",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "card-status-cycle"
    assert output["would_send_card"] is False
    assert output["card_status_done_applied"] is True
    assert output["card_status_reopen_applied"] is True
    assert output["card_status_bitable_synced"] is True
    assert output["card_status_doc_recorded"] is True
    assert output["card_status_state_recorded"] is True
    assert output["card_status_feedback_sent"] is True
    assert output["card_status_used_opaque_refs"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_batch_followup_task_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_batch_followup_task", return_value={
        "batch_followup_created": True,
        "batch_followup_filtered": True,
        "batch_followup_task_created": True,
        "batch_followup_doc_recorded": True,
        "batch_followup_history_recorded": True,
        "batch_followup_state_recorded": True,
        "batch_followup_feedback_sent": True,
        "batch_followup_used_opaque_ref": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_task_url": "https://example.invalid/task/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-batch-followup-task",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "batch-followup-task"
    assert output["would_send_card"] is False
    assert output["batch_followup_created"] is True
    assert output["batch_followup_filtered"] is True
    assert output["batch_followup_task_created"] is True
    assert output["batch_followup_doc_recorded"] is True
    assert output["batch_followup_history_recorded"] is True
    assert output["batch_followup_state_recorded"] is True
    assert output["batch_followup_feedback_sent"] is True
    assert output["batch_followup_used_opaque_ref"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_dashboard_navigation_mode_outputs_sanitized_runtime_result(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("PILOTFLOW_TEST_CHAT_ID=oc_real_chat_id\n", encoding="utf-8")

    with patch.object(_MODULE, "_verify_runtime_dashboard_navigation", return_value={
        "dashboard_filter_sent": True,
        "dashboard_filter_scoped": True,
        "dashboard_page_sent": True,
        "dashboard_page_scoped": True,
        "dashboard_cards_sent": True,
        "dashboard_used_opaque_refs": True,
        "raw_chat_id": "oc_real_chat_id",
        "raw_doc_url": "https://example.invalid/doc/1",
    }):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--verify-dashboard-navigation",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["mode"] == "dashboard-navigation"
    assert output["would_send_card"] is False
    assert output["dashboard_filter_sent"] is True
    assert output["dashboard_filter_scoped"] is True
    assert output["dashboard_page_sent"] is True
    assert output["dashboard_page_scoped"] is True
    assert output["dashboard_cards_sent"] is True
    assert output["dashboard_used_opaque_refs"] is True
    assert "oc_real_chat_id" not in output_text
    assert "example.invalid" not in output_text


def test_verifier_probe_llm_outputs_sanitized_success(tmp_path, capsys):
    env_file = tmp_path / ".env"
    config_file = tmp_path / "config.yaml"
    env_file.write_text("OPENAI_API_KEY=sk-real-secret\n", encoding="utf-8")
    config_file.write_text(
        "\n".join([
            "model:",
            "  default: mimo-v2.5-pro",
            "  provider: vectorcontrol",
            "providers:",
            "  vectorcontrol:",
            "    base_url: https://llm.example.invalid/v1",
            "    key_env: OPENAI_API_KEY",
            "gateway:",
            "  default_platform: feishu",
        ]),
        encoding="utf-8",
    )

    class _Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return b'{"data":[]}'

    with patch.object(_MODULE.request, "urlopen", return_value=_Response()) as urlopen:
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--config-file", str(config_file),
            "--probe-llm",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["llm_probe_ok"] is True
    assert output["llm_probe_status"] == 200
    assert output["llm_probe_provider"] == "vectorcontrol"
    assert "sk-real-secret" not in output_text
    assert "llm.example.invalid" not in output_text
    urlopen.assert_called_once()


def test_verifier_probe_llm_reports_auth_failure_without_secret(tmp_path, capsys):
    env_file = tmp_path / ".env"
    config_file = tmp_path / "config.yaml"
    env_file.write_text("OPENAI_API_KEY=sk-real-secret\n", encoding="utf-8")
    config_file.write_text(
        "\n".join([
            "model:",
            "  default: gpt-5.5",
            "  provider: openai",
            "providers:",
            "  openai:",
            "    base_url: https://api.example.invalid/v1",
            "    key_env: OPENAI_API_KEY",
        ]),
        encoding="utf-8",
    )
    error = HTTPError(
        "https://api.example.invalid/v1/models",
        401,
        "Unauthorized",
        hdrs=None,
        fp=None,
    )

    with patch.object(_MODULE.request, "urlopen", side_effect=error):
        exit_code = _MODULE.main([
            "--hermes-dir", str(tmp_path),
            "--env-file", str(env_file),
            "--config-file", str(config_file),
            "--probe-llm",
        ])

    output_text = capsys.readouterr().out
    output = json.loads(output_text)
    assert exit_code == 0
    assert output["llm_probe_ok"] is False
    assert output["llm_probe_status"] == 401
    assert output["llm_probe_error"] == "http_error"
    assert "sk-real-secret" not in output_text
    assert "api.example.invalid" not in output_text
