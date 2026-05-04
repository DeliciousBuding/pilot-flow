"""Verify PilotFlow's WSL Hermes Feishu runtime.

Default mode is a safe dry run. Use --send-card only when you intentionally
want to send a real Feishu interactive card to PILOTFLOW_TEST_CHAT_ID.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
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
        "lark_oapi_import_ok",
        "pilotflow_import_ok",
        "has_confirm_token",
        "has_idempotency_key",
        "trace_has_key",
        "redaction_enabled",
        "action_ref_count",
        "action_refs_have_token",
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


def _send_runtime_plan_card(hermes_dir: Path) -> dict[str, Any]:
    sys.path.insert(0, str(hermes_dir))
    from plugins.pilotflow.tools import (  # pylint: disable=import-error
        _card_action_refs,
        _handle_generate_plan,
        _pending_plans,
        _plan_lock,
    )

    chat_id = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")
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
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify PilotFlow WSL Feishu runtime.")
    parser.add_argument("--hermes-dir", required=True, help="Hermes runtime directory.")
    parser.add_argument("--env-file", default=str(Path.home() / ".hermes" / ".env"))
    parser.add_argument("--send-card", action="store_true", help="Send one real Feishu plan card.")
    args = parser.parse_args(argv)

    hermes_dir = Path(args.hermes_dir).resolve()
    env_values = _load_env(Path(args.env_file))
    import_result = _check_imports(hermes_dir)
    output: dict[str, Any] = {
        "mode": "send-card" if args.send_card else "dry-run",
        "would_send_card": False,
        "has_chat_id": _safe_bool(env_values.get("PILOTFLOW_TEST_CHAT_ID") or os.environ.get("PILOTFLOW_TEST_CHAT_ID")),
        "has_feishu_credentials": _safe_bool(
            (env_values.get("FEISHU_APP_ID") or os.environ.get("FEISHU_APP_ID"))
            and (env_values.get("FEISHU_APP_SECRET") or os.environ.get("FEISHU_APP_SECRET"))
        ),
        **import_result,
    }
    if args.send_card:
        output.update(_send_runtime_plan_card(hermes_dir))
    print(json.dumps(_sanitize_result(output), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
