"""Business-readable PilotFlow run traces.

This module is intentionally independent from Hermes runtime imports so it can
be used in tests, offline demos, and future Flight Recorder rendering.
"""

from __future__ import annotations

import copy
import datetime as dt
import json
import re
import uuid
from typing import Any


_REDACTION_PATTERNS = (
    ("url", re.compile(r"https?://[^\s)>\"]+", re.IGNORECASE), "[redacted:url]"),
    ("chat_id", re.compile(r"\boc_[A-Za-z0-9_-]+\b"), "[redacted:chat_id]"),
    ("message_id", re.compile(r"\bom[t]?_[A-Za-z0-9_-]+\b"), "[redacted:message_id]"),
    ("open_id", re.compile(r"\bou_[A-Za-z0-9_-]+\b"), "[redacted:open_id]"),
    ("app_token", re.compile(r"\bapp[_-]?token[=:][A-Za-z0-9_-]+", re.IGNORECASE), "[redacted:app_token]"),
    ("secret", re.compile(r"\b(secret|token|ticket|authorization)=?[A-Za-z0-9._~+/=-]+", re.IGNORECASE), "[redacted:secret]"),
)


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")


def _new_run_id() -> str:
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime("%Y%m%d_%H%M%S")
    return f"pf_{stamp}_{uuid.uuid4().hex[:8]}"


def _redact_value(value: Any, stats: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {str(k): _redact_value(v, stats) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact_value(item, stats) for item in value]
    if not isinstance(value, str):
        return value

    redacted = value
    for name, pattern, replacement in _REDACTION_PATTERNS:
        redacted, count = pattern.subn(replacement, redacted)
        if count:
            stats["masked_count"] += count
            if name not in stats["masked_fields"]:
                stats["masked_fields"].append(name)
    return redacted


def redact_payload(payload: Any) -> tuple[Any, dict[str, Any]]:
    """Return a redacted copy plus redaction metadata."""
    stats = {"enabled": True, "masked_count": 0, "masked_fields": []}
    return _redact_value(copy.deepcopy(payload), stats), stats


class PilotFlowTrace:
    """Small append-only trace builder for PilotFlow business actions."""

    def __init__(self, data: dict[str, Any]):
        self._data = data

    @classmethod
    def start(
        cls,
        *,
        chat_id: str = "",
        message_id: str = "",
        sender_open_id: str = "",
        source_text: str = "",
    ) -> "PilotFlowTrace":
        now = _now_iso()
        return cls({
            "trace_version": "0.1.0",
            "run_id": _new_run_id(),
            "source": {
                "channel": "feishu",
                "chat_id": chat_id,
                "message_id": message_id,
                "sender_open_id": sender_open_id,
                "source_text": source_text,
            },
            "timestamps": {
                "received_at": now,
                "updated_at": now,
            },
            "intent": {},
            "plan": {},
            "confirmation": {},
            "events": [],
            "tool_calls": [],
            "final_status": "running",
        })

    def _touch(self) -> None:
        self._data.setdefault("timestamps", {})["updated_at"] = _now_iso()

    def set_intent(self, label: str, summary: str = "", confidence: float | None = None) -> None:
        self._data["intent"] = {
            "label": label,
            "summary": summary,
            "confidence": confidence,
        }
        self._touch()

    def set_plan(self, title: str, milestones: list[str] | None = None) -> None:
        self._data["plan"] = {
            "title": title,
            "milestones": list(milestones or []),
        }
        self._touch()

    def set_confirmation(
        self,
        *,
        required: bool,
        mode: str,
        approved_by: str = "",
        ttl_seconds: int | None = None,
    ) -> None:
        self._data["confirmation"] = {
            "required": required,
            "mode": mode,
            "approved_by": approved_by,
            "ttl_seconds": ttl_seconds,
        }
        self._touch()

    def record_event(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
        self._data.setdefault("events", []).append({
            "type": event_type,
            "at": _now_iso(),
            "payload": payload or {},
        })
        self._touch()

    def record_tool_call(
        self,
        tool: str,
        status: str,
        *,
        latency_ms: int | None = None,
        artifacts: list[dict[str, Any]] | None = None,
        error: str = "",
    ) -> None:
        self._data.setdefault("tool_calls", []).append({
            "tool": tool,
            "status": status,
            "latency_ms": latency_ms,
            "artifacts": list(artifacts or []),
            "error": error,
        })
        if status in ("error", "failed"):
            self._data["final_status"] = "failed"
        self._touch()

    def finish(self, status: str = "success") -> None:
        self._data["final_status"] = status
        self._data.setdefault("timestamps", {})["finished_at"] = _now_iso()
        self._touch()

    def to_dict(self) -> dict[str, Any]:
        payload, redaction = redact_payload(self._data)
        payload["redaction"] = redaction
        return payload

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)

    def to_markdown(self) -> str:
        data = self.to_dict()
        lines = [
            "# PilotFlow Flight Recorder",
            "",
            f"- Run ID: `{data.get('run_id', '')}`",
            f"- Status: `{data.get('final_status', '')}`",
        ]
        intent = data.get("intent") or {}
        if intent:
            lines.append(f"- Intent: `{intent.get('label', '')}` {intent.get('summary', '')}".rstrip())
        plan = data.get("plan") or {}
        if plan:
            lines.extend(["", "## Plan", f"- Title: {plan.get('title', '')}"])
            for item in plan.get("milestones") or []:
                lines.append(f"- {item}")
        confirmation = data.get("confirmation") or {}
        if confirmation:
            lines.extend([
                "",
                "## Confirmation",
                f"- Required: {confirmation.get('required')}",
                f"- Mode: {confirmation.get('mode', '')}",
                f"- Approved by: {confirmation.get('approved_by', '')}",
            ])
        tool_calls = data.get("tool_calls") or []
        if tool_calls:
            lines.extend(["", "## Tool Calls"])
            for call in tool_calls:
                lines.append(f"- `{call.get('tool')}`: {call.get('status')}")
        return "\n".join(lines).strip() + "\n"
