"""Tests for the WSL Feishu runtime verifier script."""

import importlib.util
import json
from pathlib import Path
from unittest.mock import patch


_SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "verify_wsl_feishu_runtime.py"
_SPEC = importlib.util.spec_from_file_location("verify_wsl_feishu_runtime", _SCRIPT_PATH)
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)


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
    assert output["has_confirm_token"] is True
    assert output["action_ref_count"] == 2
    assert output["pending_plan_recovered"] is True
    assert output["card_action_recovered"] is True
    assert "oc_real_chat_id" not in output_text
