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
        _load_pending_plan,
        _pending_plans,
        _plan_lock,
        _resolve_card_action_ref,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
    original_state_path = os.environ.get("PILOTFLOW_STATE_PATH")
    with tempfile.TemporaryDirectory(prefix="pilotflow-runtime-verify-") as tmpdir:
        os.environ["PILOTFLOW_STATE_PATH"] = str(Path(tmpdir) / "pilotflow_state.json")
        with _plan_lock:
            _pending_plans.clear()
            _card_action_refs.clear()
        raw = _handle_generate_plan(
            {
                "input_text": "PilotFlow runtime verifier: send one confirmation card only",
                "title": "确认幂等验证项目",
                "goal": "验证真实 Feishu 卡片发送后返回 confirm token 和 idempotency key",
                "members": [],
                "deliverables": ["验证记录"],
                "deadline": "2026-05-10",
            },
            chat_id=chat_id,
        )
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
    return {
        "status": data.get("status"),
        "card_sent": _safe_bool(data.get("card_sent")),
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify PilotFlow WSL Feishu runtime.")
    parser.add_argument("--hermes-dir", required=True, help="Hermes runtime directory.")
    parser.add_argument("--env-file", default=str(Path.home() / ".hermes" / ".env"))
    parser.add_argument("--config-file", default=str(Path.home() / ".hermes" / "config.yaml"))
    parser.add_argument("--send-card", action="store_true", help="Send one real Feishu plan card.")
    parser.add_argument("--probe-llm", action="store_true", help="Probe configured OpenAI-compatible /models endpoint.")
    args = parser.parse_args(argv)

    hermes_dir = Path(args.hermes_dir).resolve()
    env_values = _load_env(Path(args.env_file))
    config_result = _read_runtime_config(Path(args.config_file))
    import_result = _check_imports(hermes_dir)
    output: dict[str, Any] = {
        "mode": "send-card" if args.send_card else "dry-run",
        "would_send_card": False,
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
    if args.probe_llm:
        output.update(_probe_llm(config_result))
    print(json.dumps(_sanitize_result(output), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
