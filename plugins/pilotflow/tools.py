"""PilotFlow project management tools.

Orchestration layer that uses Hermes's built-in capabilities:
- Messaging: via registry.dispatch("send_message")
- Feishu API (doc/task/bitable): via lark_oapi SDK (Hermes doesn't have native tools for these)
- Permissions, @mention: via lark_oapi SDK
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from tools.registry import registry, tool_error, tool_result

logger = logging.getLogger(__name__)

# Feishu app credentials — read from env
APP_ID = os.environ.get("FEISHU_APP_ID", "")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")
MEMORY_ENABLED = os.environ.get("PILOTFLOW_MEMORY_ENABLED", "true").lower() not in ("0", "false", "no")
MEMORY_READ_ENABLED = os.environ.get("PILOTFLOW_MEMORY_READ_ENABLED", "true").lower() not in ("0", "false", "no")
MEMORY_INCLUDE_MEMBERS = os.environ.get("PILOTFLOW_MEMORY_INCLUDE_MEMBERS", "false").lower() in ("1", "true", "yes")

# Lazy-loaded lark client (only for doc/task/bitable — NOT for messaging)
_client = None
_client_lock = threading.Lock()
_client_ready = False  # cache _check_available result

# Confirmation gate (per-chat_id, thread-safe)
_plan_lock = threading.Lock()
_plan_generated: Dict[str, float] = {}  # chat_id -> timestamp
_PLAN_GATE_TTL = 600  # 10 minutes

# @mention regex
_AT_PATTERN = re.compile(r'<at user_id="(ou_[^"]+)">([^<]+)</at>')

# Member cache with TTL and thread-safe eviction
_member_cache: Dict[str, tuple] = {}  # name -> (open_id, timestamp)
_member_cache_lock = threading.Lock()
_MEMBER_CACHE_TTL = 300
_last_cache_eviction = 0.0
_CACHE_EVICTION_INTERVAL = 300

# Max editors to add per document (prevent unbounded API calls)
_MAX_EDITORS = 20

# In-memory project registry (populated by create_project_space, read by query_status)
_project_registry: Dict[str, dict] = {}  # title -> {members, deadline, status, created_at, artifacts}
_project_registry_lock = threading.Lock()
_PROJECT_REGISTRY_MAX = 50


def _env_positive_int(name: str, default: int) -> int:
    """Read a positive integer env var without making plugin import fragile."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.warning("Ignoring invalid integer env var %s=%r", name, raw)
        return default
    if value < 1:
        logger.warning("Ignoring non-positive integer env var %s=%r", name, raw)
        return default
    return value


_DASHBOARD_PAGE_SIZE = _env_positive_int("PILOTFLOW_DASHBOARD_PAGE_SIZE", 10)

# Pending plans (populated by generate_plan, validated by create_project_space)
_pending_plans: Dict[str, dict] = {}  # chat_id -> plan params
_card_action_refs: Dict[str, dict] = {}  # action_id -> {chat_id, action, message_id, timestamp}

# lark_oapi client timeout (seconds)
_CLIENT_TIMEOUT = 10


# ---------------------------------------------------------------------------
# Cache management (thread-safe)
# ---------------------------------------------------------------------------

def _evict_caches():
    """Periodically clean expired entries from all caches."""
    global _last_cache_eviction
    now = time.time()
    if now - _last_cache_eviction < _CACHE_EVICTION_INTERVAL:
        return
    _last_cache_eviction = now

    evicted_members = 0
    with _member_cache_lock:
        expired = [k for k, (_, ts) in _member_cache.items() if now - ts >= _MEMBER_CACHE_TTL]
        for k in expired:
            del _member_cache[k]
        evicted_members = len(expired)

    evicted_plans = 0
    with _plan_lock:
        expired_plans = [k for k, ts in _plan_generated.items() if now - ts >= _PLAN_GATE_TTL]
        for k in expired_plans:
            del _plan_generated[k]
        # Evict stale pending plans (abandoned generate_plan calls)
        expired_pending = [k for k in _pending_plans if k not in _plan_generated]
        for k in expired_pending:
            del _pending_plans[k]
        expired_action_refs = [
            k for k, ref in _card_action_refs.items()
            if now - ref.get("timestamp", 0) >= _PLAN_GATE_TTL
        ]
        for k in expired_action_refs:
            del _card_action_refs[k]
        evicted_plans = len(expired_plans) + len(expired_pending)

    if evicted_members or evicted_plans:
        logger.info("cache eviction: %d members, %d plans", evicted_members, evicted_plans)


def _check_plan_gate(chat_id: str) -> bool:
    """Check if a plan was generated for this chat_id within TTL."""
    with _plan_lock:
        ts = _plan_generated.get(chat_id)
        if ts and time.time() - ts < _PLAN_GATE_TTL:
            return True
        return False


def _set_plan_gate(chat_id: str):
    """Mark plan as generated for this chat_id."""
    with _plan_lock:
        _plan_generated[chat_id] = time.time()


def _clear_plan_gate(chat_id: str):
    """Clear the plan gate for this chat_id after execution."""
    with _plan_lock:
        _plan_generated.pop(chat_id, None)


def _consume_plan_gate(chat_id: str) -> bool:
    """Atomically consume the text-confirmation gate for a chat."""
    with _plan_lock:
        ts = _plan_generated.get(chat_id)
        if not ts or time.time() - ts >= _PLAN_GATE_TTL:
            _plan_generated.pop(chat_id, None)
            return False
        _plan_generated.pop(chat_id, None)
        return True


def _create_card_action_ref(chat_id: str, action: str, plan: Optional[dict] = None) -> str:
    """Create an opaque short-lived card action reference."""
    action_id = uuid.uuid4().hex
    with _plan_lock:
        _card_action_refs[action_id] = {
            "chat_id": chat_id,
            "action": action,
            "plan": dict(plan or {}),
            "timestamp": time.time(),
        }
    return action_id


def _resolve_card_action_ref(action_id: str, *, consume: bool = False) -> Optional[dict]:
    """Resolve a card action reference if it is still within the plan TTL."""
    if not action_id:
        return None
    with _plan_lock:
        ref = _card_action_refs.get(action_id)
        if not ref:
            return None
        if time.time() - ref.get("timestamp", 0) >= _PLAN_GATE_TTL:
            _card_action_refs.pop(action_id, None)
            return None
        resolved = dict(ref)
        if consume:
            _card_action_refs.pop(action_id, None)
            message_id = resolved.get("message_id")
            if message_id:
                stale_ids = [
                    k for k, v in _card_action_refs.items()
                    if v.get("message_id") == message_id
                ]
                for k in stale_ids:
                    _card_action_refs.pop(k, None)
        return resolved


def _attach_card_message_id(action_ids: list[str], message_id: str) -> None:
    """Attach the sent Feishu message_id to the card action refs."""
    if not message_id:
        return
    with _plan_lock:
        for action_id in action_ids:
            if action_id in _card_action_refs:
                _card_action_refs[action_id]["message_id"] = message_id


def _clear_pending_plan_if_matches(chat_id: str, plan: Optional[dict]) -> None:
    """Clear chat-level pending state only when it still refers to this plan."""
    if not plan:
        return
    with _plan_lock:
        pending = _pending_plans.get(chat_id, {})
        if pending.get("plan") == plan:
            _pending_plans.pop(chat_id, None)
            _plan_generated.pop(chat_id, None)


def _register_project(title: str, members: list, deadline: str, status: str, artifacts: list,
                      app_token: str = "", table_id: str = "", record_id: str = "",
                      goal: str = "", deliverables: Optional[list] = None):
    """Register a project in the in-memory registry for query_status and update_project."""
    with _project_registry_lock:
        if len(_project_registry) >= _PROJECT_REGISTRY_MAX:
            oldest = min(_project_registry, key=lambda k: _project_registry[k].get("created_at", 0))
            del _project_registry[oldest]
        _project_registry[title] = {
            "goal": goal,
            "members": list(members),
            "deliverables": list(deliverables or []),
            "deadline": deadline,
            "status": status,
            "created_at": time.time(),
            "artifacts": artifacts,
            "app_token": app_token,
            "table_id": table_id,
            "record_id": record_id,
        }


# ---------------------------------------------------------------------------
# Hermes integration: messaging via registry.dispatch
# ---------------------------------------------------------------------------

def _hermes_ok(result: str) -> bool:
    """Check if a registry.dispatch result indicates success."""
    try:
        data = json.loads(result)
        return not (isinstance(data, dict) and "error" in data)
    except (json.JSONDecodeError, TypeError):
        return isinstance(result, str) and bool(result)


def _hermes_send(chat_id: str, text: str) -> bool:
    """Send a message via Hermes's send_message tool."""
    result = registry.dispatch("send_message", {
        "action": "send",
        "target": f"feishu:{chat_id}",
        "message": text,
    })
    ok = _hermes_ok(result)
    if not ok:
        logger.warning("hermes send error: %s", result)
    return ok


def _hermes_send_card(chat_id: str, card_json: dict) -> bool:
    """Send an interactive card directly via Feishu.

    Hermes's `send_message` path normalizes outbound content as text/post, so
    raw interactive card JSON would be downgraded to a plain text bubble.
    Cards must be sent through the Feishu IM API directly.
    """
    return _send_interactive_card_via_feishu(chat_id, card_json)


def _send_interactive_card_via_feishu(chat_id: str, card_json: dict) -> bool | str:
    """Send an interactive card with the Feishu IM API.

    Returns Feishu message_id on success. Existing boolean callers can treat
    the return value as truthy.
    """
    client = _get_client()
    if not client:
        logger.warning("interactive card send skipped: Feishu client unavailable")
        return False

    try:
        from types import SimpleNamespace
        import uuid as _uuid

        payload = json.dumps(card_json, ensure_ascii=False)
        try:
            from lark_oapi.api.im.v1 import CreateMessageRequest, CreateMessageRequestBody
            body = (
                CreateMessageRequestBody.builder()
                .receive_id(chat_id)
                .msg_type("interactive")
                .content(payload)
                .uuid(str(_uuid.uuid4()))
                .build()
            )
            req = (
                CreateMessageRequest.builder()
                .receive_id_type("chat_id")
                .request_body(body)
                .build()
            )
        except ImportError:
            body = SimpleNamespace(
                receive_id=chat_id,
                msg_type="interactive",
                content=payload,
                uuid=str(_uuid.uuid4()),
            )
            req = SimpleNamespace(receive_id_type="chat_id", request_body=body)
        resp = client.im.v1.message.create(req)
        if resp.success():
            logger.info("interactive card sent: %s", chat_id)
            data = getattr(resp, "data", None)
            message_id = getattr(data, "message_id", "") if data else ""
            return message_id or True
        logger.warning("interactive card send failed: %s", getattr(resp, "msg", "unknown error"))
        return False
    except Exception as e:
        logger.warning("interactive card send error: %s", e)
        return False


def _build_action_feedback_card(title: str, content: str, template: str) -> dict:
    """Build a read-only card that replaces the original action card."""
    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title},
            "template": template,
        },
        "elements": [
            {
                "tag": "markdown",
                "content": content,
            }
        ],
    }


def _project_detail_header_template(status: str) -> str:
    status = str(status).strip()
    if status == "有风险":
        return "red"
    if status == "已完成":
        return "green"
    if _is_archived_status(status):
        return "grey"
    return "blue"


def _build_project_detail_card(chat_id: str, title: str, project: dict) -> tuple[dict, list[str]]:
    """Build an actionable project detail card for Feishu."""
    member_text = "、".join(project.get("members", [])) or "待确认"
    deliverable_text = "、".join(project.get("deliverables", [])) or "待确认"
    deadline = project.get("deadline") or "待确认"
    countdown = _deadline_countdown(deadline)
    deadline_line = deadline + (f"（{countdown}）" if countdown else "")
    status = project.get("status", "进行中")
    if status == "有风险":
        next_action = "resolve_risk"
        next_text = "解除风险"
        next_type = "primary"
    else:
        next_action = "reopen_project" if status == "已完成" or _is_archived_status(status) else "mark_project_done"
        next_text = "重新打开" if next_action == "reopen_project" else "标记完成"
        next_type = "default" if next_action == "reopen_project" else "primary"
    next_action_id = _create_card_action_ref(chat_id, next_action, {"title": title})
    resource_lines = []
    for item in project.get("artifacts", []):
        text = str(item)
        if text.startswith("文档: "):
            resource_lines.append(f"[项目文档]({text.split('文档: ', 1)[1].strip()})")
        elif text.startswith("多维表格: "):
            resource_lines.append(f"[状态表]({text.split('多维表格: ', 1)[1].strip()})")
    resource_text = f"\n**资源：** {' | '.join(resource_lines)}" if resource_lines else ""
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": "📌 项目详情"},
            "template": _project_detail_header_template(status),
        },
        "elements": [
            {
                "tag": "markdown",
                "content": (
                    f"**项目：** {title}\n"
                    f"**目标：** {project.get('goal') or '待确认'}\n"
                    f"**状态：** {project.get('status', '进行中')}\n"
                    f"**成员：** {member_text}\n"
                    f"**交付物：** {deliverable_text}\n"
                    f"**截止：** {deadline_line}"
                    f"{resource_text}"
                ),
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": next_text},
                        "type": next_type,
                        "value": {"pilotflow_action_id": next_action_id},
                    },
                ],
            },
        ],
    }
    return card, [next_action_id]


def _build_project_reminder_text(chat_id: str, title: str, project: dict) -> str:
    deadline = project.get("deadline") or "待确认"
    countdown = _deadline_countdown(deadline)
    deadline_text = deadline + (f"（{countdown}）" if countdown else "")
    members = project.get("members", [])
    owner_text = _format_members(members, chat_id) if members else "相关负责人"
    status = project.get("status", "进行中")
    return (
        f"项目催办：请关注项目「{title}」。\n"
        f"负责人：{owner_text}\n"
        f"截止：{deadline_text}\n"
        f"当前状态：{status}\n"
        "请在群里同步最新进展；如已完成，请点击项目卡片标记完成。"
    )


def _update_interactive_card_via_feishu(message_id: str, card_json: dict) -> bool:
    """Update an existing Feishu interactive card message."""
    client = _get_client()
    if not client or not message_id:
        return False

    try:
        from types import SimpleNamespace

        payload = json.dumps(card_json, ensure_ascii=False)
        try:
            from lark_oapi.api.im.v1 import PatchMessageRequest, PatchMessageRequestBody
            body = (
                PatchMessageRequestBody.builder()
                .content(payload)
                .build()
            )
            req = (
                PatchMessageRequest.builder()
                .message_id(message_id)
                .request_body(body)
                .build()
            )
        except ImportError:
            body = SimpleNamespace(content=payload)
            req = SimpleNamespace(message_id=message_id, request_body=body)
        resp = client.im.v1.message.patch(req)
        if resp.success():
            logger.info("interactive card updated: %s", message_id)
            return True
        logger.warning("interactive card update failed: %s", getattr(resp, "msg", "unknown error"))
        return False
    except Exception as e:
        logger.warning("interactive card update error: %s", e)
        return False


def _mark_card_action_message(action_id: str, title: str, content: str, template: str) -> bool:
    """Replace the original confirmation card with a read-only status card."""
    ref = _resolve_card_action_ref(action_id)
    if not ref:
        return False
    message_id = ref.get("message_id", "")
    if not message_id:
        return False
    return _update_interactive_card_via_feishu(
        message_id,
        _build_action_feedback_card(title, content, template),
    )


def _mark_card_message(message_id: str, title: str, content: str, template: str) -> bool:
    """Replace a known Feishu card message with a read-only status card."""
    if not message_id:
        return False
    return _update_interactive_card_via_feishu(
        message_id,
        _build_action_feedback_card(title, content, template),
    )


def _save_to_hermes_memory(title: str, goal: str, members: list, deliverables: list, deadline: str) -> bool:
    """Save project creation pattern to Hermes memory for future suggestions."""
    if not MEMORY_ENABLED:
        return False
    try:
        if MEMORY_INCLUDE_MEMBERS:
            member_str = "、".join(members) if members else "无"
        else:
            member_str = f"{len(members)} 人" if members else "无"
        deliverable_str = "、".join(deliverables) if deliverables else "无"
        content = (
            f"【项目创建】{title}：目标={goal}，成员={member_str}，"
            f"交付物={deliverable_str}，截止={deadline or '未设'}"
        )
        result = registry.dispatch("memory", {
            "action": "add",
            "target": "memory",
            "content": content,
        })
        if _hermes_ok(result):
            logger.info("已保存项目模式到 Hermes memory: %s", title)
            return True
        logger.debug("memory save skipped: %s", result)
        return False
    except Exception as e:
        logger.debug("memory save skipped: %s", e)
        return False


def _project_state_path() -> Path:
    """Return the portable PilotFlow state path under Hermes home by default."""
    override = os.environ.get("PILOTFLOW_STATE_PATH", "").strip()
    if override:
        return Path(override).expanduser()
    hermes_home = os.environ.get("HERMES_HOME", "").strip()
    base = Path(hermes_home).expanduser() if hermes_home else Path.home() / ".hermes"
    return base / "pilotflow_projects.json"


def _save_project_state(title: str, goal: str, members: list, deliverables: list, deadline: str,
                        status: str, artifacts: Optional[list] = None, app_token: str = "",
                        table_id: str = "", record_id: str = "") -> bool:
    """Persist a sanitized project summary for restart-safe dashboards."""
    if not title:
        return False
    path = _project_state_path()
    try:
        existing = _load_project_state()
        record = {
            "title": title,
            "goal": goal or "",
            "deliverables": _clean_plan_list(deliverables),
            "deadline": deadline or "",
            "status": status or "进行中",
            "updated_at": int(time.time()),
        }
        by_title = {item.get("title"): item for item in existing if item.get("title")}
        by_title[title] = record
        records = sorted(by_title.values(), key=lambda item: item.get("updated_at", 0), reverse=True)[:_PROJECT_REGISTRY_MAX]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"projects": records}, ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    except Exception as e:
        logger.debug("project state save skipped: %s", e)
        return False


def _load_project_state() -> list[dict]:
    """Load sanitized project summaries persisted by PilotFlow."""
    path = _project_state_path()
    try:
        if not path.exists():
            return []
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.debug("project state load skipped: %s", e)
        return []
    items = payload.get("projects", payload if isinstance(payload, list) else [])
    projects = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not item.get("title"):
            continue
        projects.append({
            "title": str(item.get("title", "")),
            "goal": str(item.get("goal", "")),
            "deliverables": _clean_plan_list(item.get("deliverables")),
            "deadline": str(item.get("deadline", "")),
            "status": str(item.get("status", "进行中")) or "进行中",
            "source": "state",
        })
    return projects


def _find_project_state(title: str) -> Optional[dict]:
    """Find a sanitized project summary by exact or fuzzy title match."""
    if not title:
        return None
    for item in _load_project_state():
        item_title = item.get("title", "")
        if title == item_title or title in item_title or item_title in title:
            return item
    return None


def _extract_memory_items(result: Any) -> list[str]:
    """Normalize assorted Hermes memory read payloads into strings."""
    if result is None:
        return []
    payload = result
    if isinstance(result, str):
        try:
            payload = json.loads(result)
        except (json.JSONDecodeError, TypeError):
            return [result]

    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        for key in ("items", "entries", "results", "content", "data"):
            if key in payload:
                items = payload[key]
                break
        else:
            items = [payload]
    else:
        items = [payload]

    if isinstance(items, dict):
        for key in ("items", "entries", "results", "content"):
            if key in items and isinstance(items[key], list):
                items = items[key]
                break

    normalized: list[str] = []
    for item in items if isinstance(items, list) else [items]:
        if isinstance(item, str):
            normalized.append(item)
            continue
        if isinstance(item, dict):
            for key in ("content", "text", "message", "summary", "title", "value"):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    normalized.append(value)
                    break
            else:
                try:
                    normalized.append(json.dumps(item, ensure_ascii=False))
                except TypeError:
                    normalized.append(str(item))
            continue
        normalized.append(str(item))
    return normalized


def _parse_memory_project_entry(text: str) -> Optional[dict]:
    """Parse a stored project memory line into structured fields."""
    if not text:
        return None
    patterns = [
        r"【项目创建】(?P<title>[^：:]+)：目标=(?P<goal>.*?)，成员=(?P<members>.*?)，交付物=(?P<deliverables>.*?)，截止=(?P<deadline>[^，。\n]*)",
        r"\[(?P<title>[^\]]+)\]\s*目标=(?P<goal>.*?)\s*成员=(?P<members>.*?)\s*交付物=(?P<deliverables>.*?)\s*截止=(?P<deadline>[^\s,。]*)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        members_raw = match.group("members").strip()
        deliverables_raw = match.group("deliverables").strip()
        members = [] if members_raw in ("无", "待确认", "") else [m.strip() for m in re.split(r"[、,，]", members_raw) if m.strip()]
        deliverables = [] if deliverables_raw in ("无", "待确认", "") else [d.strip() for d in re.split(r"[、,，]", deliverables_raw) if d.strip()]
        return {
            "title": match.group("title").strip(),
            "goal": match.group("goal").strip(),
            "members": members,
            "deliverables": deliverables,
            "deadline": match.group("deadline").strip(),
            "raw": text,
            "source": "memory",
        }
    return None


def _project_keyword_tokens(text: str) -> set[str]:
    """Extract short keywords for fuzzy project matching."""
    tokens = set()
    for token in re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z0-9_]{3,}", text or ""):
        if token in {"项目", "计划", "创建", "确认", "执行", "帮我", "请帮", "请", "一下", "进行", "准备"}:
            continue
        tokens.add(token)
    return tokens


def _is_placeholder_value(value: str) -> bool:
    """Detect LLM/example placeholders that must not become project data."""
    text = (value or "").strip()
    if not text:
        return True
    if "示例" in text or "占位" in text:
        return True
    return bool(re.fullmatch(r"(成员|负责人|同学|用户|测试成员)[A-Za-zＡ-Ｚａ-ｚ一二三四五六七八九甲乙丙丁0-9]*", text))


def _clean_plan_list(values: Any) -> list[str]:
    """Keep only non-placeholder string values from Agent/tool inputs."""
    if not values:
        return []
    if isinstance(values, str):
        values = re.split(r"[、,，]", values)
    cleaned: list[str] = []
    for value in values if isinstance(values, list) else [values]:
        item = str(value).strip()
        if item and not _is_placeholder_value(item) and item not in cleaned:
            cleaned.append(item)
    return cleaned


def _is_execution_confirmation(text: str) -> bool:
    """Return True only for explicit execution confirmations, not card requests."""
    normalized = (text or "").strip().lower()
    if not normalized:
        return False
    if any(blocked in normalized for blocked in ("确认卡片", "确认计划", "确认按钮")):
        return False
    return normalized in {
        "确认",
        "确认执行",
        "可以",
        "可以执行",
        "好的",
        "好",
        "行",
        "执行",
        "执行吧",
        "开始执行",
        "ok",
        "okay",
        "yes",
    }


def _score_history_project(query: str, project: dict, plan: Optional[dict] = None) -> int:
    """Score how closely a history project matches the current request."""
    haystack = " ".join([
        project.get("title", ""),
        project.get("goal", ""),
        " ".join(project.get("members", [])),
        " ".join(project.get("deliverables", [])),
        project.get("deadline", ""),
    ])
    plan_text = ""
    if plan:
        plan_text = " ".join([
            plan.get("title", ""),
            plan.get("goal", ""),
            " ".join(plan.get("deliverables", [])),
        ])
    tokens = _project_keyword_tokens(" ".join([query or "", plan_text]))
    if not tokens:
        return 0
    score = 0
    for token in tokens:
        if token and token in haystack:
            score += 3 if token in (project.get("title", "") or "") else 2
    return score


def _load_history_projects(query: str) -> list[dict]:
    """Load project patterns from Hermes memory and local registry."""
    candidates: list[dict] = []
    if MEMORY_READ_ENABLED:
        for action in ("scan", "search"):
            try:
                result = registry.dispatch("memory", {
                    "action": action,
                    "target": "memory",
                    "query": query,
                    "limit": 10,
                })
            except Exception as e:
                logger.debug("memory %s skipped: %s", action, e)
                continue
            for item in _extract_memory_items(result):
                parsed = _parse_memory_project_entry(item)
                if parsed:
                    candidates.append(parsed)
            if candidates:
                break

    with _project_registry_lock:
        for title, info in _project_registry.items():
            candidates.append({
                "title": title,
                "goal": info.get("goal", ""),
                "members": list(info.get("members", [])),
                "deliverables": list(info.get("deliverables", [])),
                "deadline": info.get("deadline", ""),
                "raw": title,
                "source": "registry",
            })

    dedup: dict[str, dict] = {}
    for item in candidates:
        key = item.get("title") or item.get("raw") or json.dumps(item, ensure_ascii=False)
        if key not in dedup:
            dedup[key] = item
    return list(dedup.values())


def _history_suggestions_for_plan(plan: dict, query: str) -> tuple[list[str], dict]:
    """Return history suggestions without silently mutating the plan."""
    history = _load_history_projects(query)
    if not history:
        return [], {}
    scored = sorted(
        ((_score_history_project(query, item, plan), item) for item in history),
        key=lambda pair: pair[0],
        reverse=True,
    )
    best_score, best = scored[0]
    if best_score <= 0:
        return [], {}

    suggestions: list[str] = []
    suggested_fields: dict[str, Any] = {}
    if not plan.get("members") and best.get("members"):
        suggested_fields["members"] = list(best["members"])
        suggestions.append(f"可参考历史项目成员：{', '.join(best['members'])}")
    if not plan.get("deliverables") and best.get("deliverables"):
        suggested_fields["deliverables"] = list(best["deliverables"])
        suggestions.append(f"可参考历史项目交付物：{', '.join(best['deliverables'])}")
    if best.get("deadline") and not plan.get("deadline"):
        suggested_fields["deadline"] = best["deadline"]
        suggestions.append(f"历史项目曾使用截止时间：{best['deadline']}")
    if suggestions:
        suggested_fields["source_title"] = best.get("title", "")
        suggested_fields["source"] = best.get("source", "history")
        suggested_fields["confidence"] = "medium" if best_score < 5 else "high"
        suggested_fields["agent_guidance"] = (
            "把这些作为历史上下文。用户说类似、复用、照上次时可主动建议采用；"
            "不要在用户未确认时静默替换计划字段。"
        )
        logger.info("history suggestion loaded from %s", best.get("title", "unknown"))
    return suggestions, suggested_fields


def _schedule_deadline_reminder(title: str, deadline: str, chat_id: str) -> bool:
    """Schedule a deadline reminder via Hermes cron job."""
    try:
        import datetime as _dt
        dl = _dt.date.fromisoformat(deadline)
        days_left = (dl - _dt.date.today()).days
        if days_left <= 0:
            return False  # Already overdue, no reminder needed

        # Schedule reminder for 1 day before deadline
        reminder_date = dl - _dt.timedelta(days=1)
        if reminder_date <= _dt.date.today():
            # If deadline is tomorrow or today, remind in 1 hour
            schedule = "1h"
        else:
            # Schedule at 9:00 AM on the reminder date
            schedule = f"{reminder_date.isoformat()}T09:00:00"

        result = registry.dispatch("cronjob", {
            "action": "create",
            "name": f"截止提醒: {title}",
            "schedule": schedule,
            "prompt": f"项目「{title}」明天截止（{deadline}），请发送提醒到群聊。",
            "repeat": 1,
            "deliver": f"feishu:{chat_id}",
            "skills": ["pilotflow"],
        })
        if _hermes_ok(result):
            logger.info("deadline reminder scheduled: %s at %s", title, schedule)
            return True
        logger.debug("deadline reminder skipped: %s", result)
        return False
    except Exception as e:
        logger.debug("deadline reminder skipped: %s", e)
        return False


# ---------------------------------------------------------------------------
# lark_oapi client (for doc/task/bitable — Hermes doesn't have these)
# ---------------------------------------------------------------------------

def _get_client():
    """Get or create a lark_oapi client with explicit timeout."""
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        try:
            import lark_oapi as lark
            from lark_oapi.core.const import FEISHU_DOMAIN
        except ImportError:
            logger.warning("lark_oapi not installed. Run: uv sync --extra feishu")
            return None
        if not APP_ID or not APP_SECRET:
            logger.warning("FEISHU_APP_ID / FEISHU_APP_SECRET not set")
            return None
        _client = (
            lark.Client.builder()
            .app_id(APP_ID).app_secret(APP_SECRET)
            .domain(FEISHU_DOMAIN).log_level(lark.LogLevel.WARNING)
            .timeout(_CLIENT_TIMEOUT)
            .build()
        )
        return _client


def _check_available() -> bool:
    """Check if PilotFlow dependencies are available (cached)."""
    global _client_ready
    if _client_ready:
        return True
    _client_ready = _get_client() is not None
    return _client_ready


PILOTFLOW_HEALTH_CHECK_SCHEMA = {
    "name": "pilotflow_health_check",
    "description": (
        "检查 PilotFlow 在当前 Hermes/Feishu 环境中的运行健康状态。\n"
        "当用户说「检查配置」「为什么不能发卡片」「PilotFlow 状态」「诊断一下」时调用。\n"
        "只返回脱敏中文状态，不展示 app id、secret、chat_id、token、本地绝对路径或 message_id。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "include_details": {
                "type": "boolean",
                "description": "是否返回更完整的检查项；默认 true。",
            },
        },
        "required": [],
    },
}


def _lark_sdk_status() -> str:
    try:
        import lark_oapi  # noqa: F401
        return "已安装"
    except ImportError:
        return "未安装"


def _state_path_status() -> str:
    if os.environ.get("PILOTFLOW_STATE_PATH"):
        return "已配置"
    if os.environ.get("HERMES_HOME"):
        return "跟随 HERMES_HOME"
    return "默认位置"


def _handle_health_check(params: Dict[str, Any], **kwargs) -> str:
    """Return a sanitized runtime health report for PilotFlow."""
    chat_id = _get_chat_id(kwargs)
    lark_sdk = _lark_sdk_status()
    client = _get_client()
    checks = {
        "feishu_credentials": "已配置" if APP_ID and APP_SECRET else "缺失",
        "lark_oapi": lark_sdk,
        "feishu_client": "可用" if client else "不可用",
        "chat_context": "已检测" if chat_id else "缺失",
        "state_path": _state_path_status(),
        "memory_write": "开启" if MEMORY_ENABLED else "关闭",
        "memory_read": "开启" if MEMORY_READ_ENABLED else "关闭",
        "card_bridge": "已注册",
    }
    blocking = [
        name for name in ("feishu_credentials", "lark_oapi", "feishu_client")
        if checks[name] in ("缺失", "未安装", "不可用")
    ]
    status = "ok" if not blocking and chat_id else "warning"
    suggestions = []
    if checks["feishu_credentials"] == "缺失":
        suggestions.append("请在 Hermes 环境中配置 Feishu 应用凭据。")
    if checks["lark_oapi"] == "未安装":
        suggestions.append("请安装 Feishu SDK 依赖后重启 Hermes。")
    if checks["chat_context"] == "缺失":
        suggestions.append("请从飞书群聊触发，或提供当前会话 chat 上下文。")
    if not suggestions:
        suggestions.append("核心配置可用，可以继续创建或更新项目。")

    return tool_result({
        "status": status,
        "checks": checks,
        "summary": "PilotFlow 运行检查完成",
        "suggestions": suggestions,
        "instructions": "用中文回复健康检查结果；不要展示任何密钥、ID、token、URL 或本地绝对路径。",
    })


# ---------------------------------------------------------------------------
# Chat ID resolution (from kwargs, session context, or env)
# ---------------------------------------------------------------------------

def _get_chat_id(kwargs: dict) -> str:
    """Get chat_id from kwargs, session context, or env var fallback."""
    # 1. From tool kwargs (gateway may inject)
    chat_id = kwargs.get("chat_id", "")
    if chat_id:
        return chat_id
    # 2. From Hermes session context
    try:
        from gateway.session_context import get_session_env
        session_chat_id = get_session_env("HERMES_SESSION_CHAT_ID", "")
        if session_chat_id:
            return session_chat_id
    except Exception:
        logger.debug("session context unavailable, using fallback")
    # 3. From env var (testing fallback)
    return os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")


def _get_session_value(name: str, default: str = "") -> str:
    """Read Hermes gateway session context without depending on local env paths."""
    try:
        from gateway.session_context import get_session_env
        return get_session_env(name, default) or default
    except Exception:
        return default


# ---------------------------------------------------------------------------
# @mention helpers
# ---------------------------------------------------------------------------


def _resolve_member(name: str, chat_id: str) -> Optional[str]:
    """Resolve a display name to open_id via chat member list (with TTL cache)."""
    _evict_caches()
    now = time.time()
    # Check cache with TTL (thread-safe)
    with _member_cache_lock:
        entry = _member_cache.get(name)
        if entry and now - entry[1] < _MEMBER_CACHE_TTL:
            return entry[0]

    if not chat_id:
        return None

    client = _get_client()
    if not client:
        return None

    try:
        from lark_oapi.api.im.v1 import GetChatMembersRequest

        req = (
            GetChatMembersRequest.builder()
            .chat_id(chat_id).member_id_type("open_id").page_size(100).build()
        )
        resp = client.im.v1.chat_members.get(req)
        if not resp.success():
            logger.warning("get chat members failed: %s", resp.msg)
            return None

        items = resp.data.items if resp.data else []
        with _member_cache_lock:
            for m in items:
                mname = (m.name or "").strip()
                mid = m.member_id or ""
                if mname and mid:
                    _member_cache[mname] = (mid, now)
            entry = _member_cache.get(name)
            return entry[0] if entry else None
    except Exception as e:
        logger.warning("resolve member failed: %s", e)
        return None


def _format_at(name: str, chat_id: str) -> str:
    """Format a name as a Feishu @mention tag if possible."""
    open_id = _resolve_member(name, chat_id)
    if open_id:
        return f'<at user_id="{open_id}">{name}</at>'
    return name


def _format_members(members: List[str], chat_id: str) -> str:
    """Format member names with @mentions (for docs and messages)."""
    return ", ".join(_format_at(m, chat_id) for m in members)


def _find_unresolved_members(members: List[str], chat_id: str) -> List[str]:
    """Return member names that could not be resolved to Feishu open_id."""
    unresolved = []
    if not members or not chat_id:
        return unresolved
    for name in members:
        if not _resolve_member(name, chat_id):
            unresolved.append(name)
    return unresolved


def _member_names_plain(members: List[str]) -> str:
    """Format member names as plain text (for bitable, no @mention markup)."""
    return ", ".join(members)


# ---------------------------------------------------------------------------
# Feishu API: doc/task/bitable (lark_oapi — no Hermes equivalent)
# ---------------------------------------------------------------------------

def _set_permission(token: str, doc_type: str):
    """Set permission: anyone with link can view."""
    client = _get_client()
    if not client:
        return
    try:
        from lark_oapi.api.drive.v1 import (
            PatchPermissionPublicRequest,
            PermissionPublicRequest,
        )
        body = PermissionPublicRequest.builder().link_share_entity("anyone_readable").build()
        req = (
            PatchPermissionPublicRequest.builder()
            .token(token).type(doc_type)
            .request_body(body).build()
        )
        resp = client.drive.v1.permission_public.patch(req)
        if resp.success():
            logger.info("permission set: %s %s", doc_type, token)
        else:
            logger.warning("set permission failed: %s", resp.msg)
    except Exception as e:
        logger.warning("set permission error: %s", e)


def _add_editors(token: str, doc_type: str, chat_id: str):
    """Add chat members as editors (capped at _MAX_EDITORS)."""
    if not chat_id:
        return
    client = _get_client()
    if not client:
        return
    try:
        from lark_oapi.api.drive.v1 import CreatePermissionMemberRequest, Member
        from lark_oapi.api.im.v1 import GetChatMembersRequest

        req = (
            GetChatMembersRequest.builder()
            .chat_id(chat_id).member_id_type("open_id").page_size(100).build()
        )
        resp = client.im.v1.chat_members.get(req)
        if not resp.success():
            logger.warning("get members for editors failed: %s", resp.msg)
            return
        members = [m.member_id for m in (resp.data.items if resp.data else []) if m.member_id]
        added = 0
        for mid in members[:_MAX_EDITORS]:
            member = Member.builder().member_type("openid").member_id(mid).perm("full_access").build()
            r = (
                CreatePermissionMemberRequest.builder()
                .token(token).type(doc_type).need_notification(False)
                .request_body(member).build()
            )
            perm_resp = client.drive.v1.permission_member.create(r)
            if perm_resp.success():
                added += 1
            else:
                logger.warning("add editor %s failed: %s", mid, perm_resp.msg)
        logger.info("added %d/%d editors to %s %s", added, len(members), doc_type, token)
    except Exception as e:
        logger.warning("add editors error: %s", e)


def _make_text_elements(text: str):
    """Create TextElement list, splitting <at> tags into mention_user elements."""
    from lark_oapi.api.docx.v1 import TextElement, TextRun, MentionUser
    parts = _AT_PATTERN.split(text)
    if len(parts) == 1:
        return [TextElement.builder().text_run(TextRun.builder().content(text).build()).build()]
    elements = []
    i = 0
    while i < len(parts):
        if parts[i]:
            elements.append(TextElement.builder().text_run(TextRun.builder().content(parts[i]).build()).build())
        if i + 2 < len(parts):
            mention = MentionUser.builder().user_id(parts[i + 1]).build()
            elements.append(TextElement.builder().mention_user(mention).build())
            i += 3
        else:
            i += 1
    return elements


def _markdown_to_blocks(markdown: str):
    """Convert markdown to Feishu docx Block objects."""
    from lark_oapi.api.docx.v1 import Block, Text, Divider as DocDivider
    blocks = []
    for line in markdown.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("### "):
            h = Text.builder().elements(_make_text_elements(stripped[4:])).build()
            blocks.append(Block.builder().block_type(5).heading3(h).build())
        elif stripped.startswith("## "):
            h = Text.builder().elements(_make_text_elements(stripped[3:])).build()
            blocks.append(Block.builder().block_type(4).heading2(h).build())
        elif stripped.startswith("# "):
            h = Text.builder().elements(_make_text_elements(stripped[2:])).build()
            blocks.append(Block.builder().block_type(3).heading1(h).build())
        elif stripped.startswith("- ") or stripped.startswith("* "):
            t = Text.builder().elements(_make_text_elements(stripped[2:])).build()
            blocks.append(Block.builder().block_type(12).bullet(t).build())
        elif len(stripped) > 2 and stripped[0].isdigit() and ". " in stripped:
            t = Text.builder().elements(_make_text_elements(stripped[stripped.find(". ") + 2:])).build()
            blocks.append(Block.builder().block_type(13).ordered(t).build())
        elif stripped in ("---", "***", "___"):
            blocks.append(Block.builder().block_type(22).divider(DocDivider.builder().build()).build())
        else:
            t = Text.builder().elements(_make_text_elements(stripped)).build()
            blocks.append(Block.builder().block_type(2).text(t).build())
    return blocks


def _create_doc(title: str, markdown_content: str, chat_id: str) -> Optional[str]:
    """Create a Feishu document with formatted content, permissions, and editors."""
    client = _get_client()
    if not client:
        return None
    try:
        from lark_oapi.api.docx.v1 import CreateDocumentRequest, CreateDocumentRequestBody

        req = CreateDocumentRequest.builder().request_body(
            CreateDocumentRequestBody.builder().title(title).build()
        ).build()
        resp = client.docx.v1.document.create(req)
        if not resp.success():
            logger.warning("create doc failed: %s", resp.msg)
            return None

        doc_id = resp.data.document.document_id
        url = f"https://feishu.cn/docx/{doc_id}"
        logger.info("doc created: %s", url)

        # Write content
        from lark_oapi.api.docx.v1 import CreateDocumentBlockChildrenRequest, CreateDocumentBlockChildrenRequestBody
        children = _markdown_to_blocks(markdown_content)
        if children:
            body = CreateDocumentBlockChildrenRequestBody.builder().children(children).index(0).build()
            r = CreateDocumentBlockChildrenRequest.builder().document_id(doc_id).block_id(doc_id).request_body(body).build()
            write_resp = client.docx.v1.document_block_children.create(r)
            if not write_resp.success():
                logger.warning("write doc content failed: %s", write_resp.msg)

        # Permissions + editors
        _set_permission(doc_id, "docx")
        _add_editors(doc_id, "docx", chat_id)
        return url
    except Exception as e:
        logger.warning("create doc error: %s", e)
        return None


def _doc_url_from_artifacts(artifacts: list) -> str:
    """Extract the first Feishu docx URL from project artifacts."""
    for item in artifacts or []:
        text = str(item)
        if text.startswith("文档: ") and "/docx/" in text:
            return text.split("文档: ", 1)[1].strip()
    return ""


def _refresh_project_resource_permissions(project: dict, chat_id: str) -> bool:
    """Refresh editable access for known project resources using the current chat members."""
    if not chat_id:
        return False
    refreshed = False
    doc_url = _doc_url_from_artifacts(project.get("artifacts", []))
    doc_match = re.search(r"/docx/([^/?#]+)", doc_url or "")
    if doc_match:
        doc_token = doc_match.group(1)
        _set_permission(doc_token, "docx")
        _add_editors(doc_token, "docx", chat_id)
        refreshed = True
    app_token = project.get("app_token", "")
    if app_token:
        _set_permission(app_token, "bitable")
        _add_editors(app_token, "bitable", chat_id)
        refreshed = True
    return refreshed


def _append_doc_update(doc_url: str, markdown_content: str) -> bool:
    """Write an update block to an existing Feishu docx document."""
    client = _get_client()
    if not client or not doc_url:
        return False
    match = re.search(r"/docx/([^/?#]+)", doc_url)
    if not match:
        return False
    doc_id = match.group(1)
    try:
        from lark_oapi.api.docx.v1 import CreateDocumentBlockChildrenRequest, CreateDocumentBlockChildrenRequestBody
        children = _markdown_to_blocks(markdown_content)
        if not children:
            return False
        body = CreateDocumentBlockChildrenRequestBody.builder().children(children).index(0).build()
        req = (
            CreateDocumentBlockChildrenRequest.builder()
            .document_id(doc_id).block_id(doc_id).request_body(body).build()
        )
        resp = client.docx.v1.document_block_children.create(req)
        if resp.success():
            logger.info("doc update appended: %s", doc_id)
            return True
        logger.warning("append doc update failed: %s", resp.msg)
        return False
    except Exception as e:
        logger.warning("append doc update error: %s", e)
        return False


def _append_project_doc_update(project_name: str, project: dict, action_label: str, value: str) -> bool:
    """Append a concise project update record to the project document when available."""
    doc_url = _doc_url_from_artifacts(project.get("artifacts", []))
    if not doc_url:
        return False
    status = project.get("status", "进行中")
    deadline = project.get("deadline") or "待确认"
    deliverables = "、".join(project.get("deliverables", [])) or "待确认"
    markdown = (
        f"## 项目更新记录\n"
        f"- 项目：{project_name}\n"
        f"- 更新：{action_label} → {value}\n"
        f"- 当前状态：{status}\n"
        f"- 当前截止：{deadline}\n"
        f"- 当前交付物：{deliverables}\n"
    )
    return _append_doc_update(doc_url, markdown)


def _create_task(summary: str, description: str,
                 assignee_name: str = "", deadline: str = "",
                 chat_id: str = "") -> Optional[str]:
    """Create a Feishu task with optional assignee and deadline. Returns summary on success."""
    client = _get_client()
    if not client:
        return None
    try:
        import datetime as _dt
        from lark_oapi.api.task.v2 import CreateTaskRequest, InputTask

        builder = InputTask.builder().summary(summary).description(description)

        # Set deadline
        if deadline:
            try:
                dt = _dt.datetime.strptime(deadline, "%Y-%m-%d")
                dt = dt.replace(hour=18, tzinfo=_dt.timezone(_dt.timedelta(hours=8)))
                builder = builder.due({
                    "timestamp": str(int(dt.timestamp())),
                    "is_all_day": False,
                })
            except (ValueError, AttributeError) as e:
                logger.debug("task deadline skipped: %s", e)

        # Assign member
        if assignee_name and chat_id:
            try:
                open_id = _resolve_member(assignee_name, chat_id)
                if open_id:
                    builder = builder.members([{
                        "id": open_id,
                        "type": "user",
                        "role": "assignee",
                    }])
            except (TypeError, AttributeError) as e:
                logger.debug("task assign skipped: %s", e)

        task = builder.build()
        req = CreateTaskRequest.builder().request_body(task).build()
        resp = client.task.v2.task.create(req)
        if resp.success():
            logger.info("task created: %s (assignee=%s, deadline=%s)", summary, assignee_name, deadline)
            return summary
        logger.warning("create task failed: %s", resp.msg)
        return None
    except Exception as e:
        logger.warning("create task error: %s", e)
        return None


def _create_bitable(
    title: str,
    owner: str,
    deadline: str,
    risks: list,
    chat_id: str,
    deliverables: Optional[list] = None,
) -> Optional[dict]:
    """Create a Feishu Bitable with project status record. Returns metadata dict or None."""
    client = _get_client()
    if not client:
        return None
    try:
        from lark_oapi.api.bitable.v1 import (
            CreateAppRequest, App, CreateAppTableRecordRequest,
            AppTableRecord, CreateAppTableFieldRequest, AppTableField,
        )

        app_body = App.builder().name(f"{title} - 项目状态").build()
        app_resp = client.bitable.v1.app.create(CreateAppRequest.builder().request_body(app_body).build())
        if not app_resp.success():
            logger.warning("create bitable failed: %s", app_resp.msg)
            return None

        app_token = app_resp.data.app.app_token
        table_id = app_resp.data.app.default_table_id
        url = app_resp.data.app.url
        logger.info("bitable created: %s", url)

        for fname in ["类型", "负责人", "截止时间", "状态", "风险等级", "交付物", "更新内容"]:
            field = AppTableField.builder().field_name(fname).type(1).build()
            field_resp = client.bitable.v1.app_table_field.create(
                CreateAppTableFieldRequest.builder().app_token(app_token).table_id(table_id).request_body(field).build()
            )
            if not field_resp.success():
                logger.warning("create bitable field '%s' failed: %s", fname, field_resp.msg)

        deliverable_text = ", ".join(deliverables or []) or "待确认"
        record = AppTableRecord.builder().fields({
            "类型": "project", "负责人": owner or "待确认", "截止时间": deadline or "待确认",
            "状态": "进行中", "风险等级": "高" if risks else "低", "交付物": deliverable_text,
            "更新内容": "创建项目",
        }).build()
        rec_resp = client.bitable.v1.app_table_record.create(
            CreateAppTableRecordRequest.builder().app_token(app_token).table_id(table_id).request_body(record).build()
        )
        record_id = ""
        if rec_resp.success():
            record_id = rec_resp.data.record.record_id or ""
            logger.info("bitable record created: %s", record_id)

        _set_permission(app_token, "bitable")
        _add_editors(app_token, "bitable", chat_id)
        return {"url": url, "app_token": app_token, "table_id": table_id, "record_id": record_id}
    except Exception as e:
        logger.warning("create bitable error: %s", e)
        return None


def _deadline_countdown(iso_date: str) -> str:
    """Return a countdown string with urgency emoji, or '' if unparseable."""
    import datetime as _dt
    try:
        dl = _dt.date.fromisoformat(iso_date)
        days_left = (dl - _dt.date.today()).days
        if days_left < 0:
            return f"\U0001f534 已逾期 {abs(days_left)} 天"
        elif days_left <= 3:
            return f"\U0001f534 剩余 {days_left} 天"
        elif days_left <= 7:
            return f"\U0001f7e1 剩余 {days_left} 天"
        else:
            return f"\U0001f7e2 剩余 {days_left} 天"
    except (ValueError, TypeError):
        return ""


def _status_filter_from_query(query: str) -> str:
    """Infer a dashboard status filter from the user's Chinese query."""
    q = query or ""
    if any(word in q for word in ("所有项目", "全部项目", "显示所有", "全部")):
        return "all"
    if any(word in q for word in ("归档", "已归档")):
        return "archived"
    if any(word in q for word in ("风险", "阻塞", "卡住")):
        return "risk"
    if any(word in q for word in ("逾期", "过期", "超期")):
        return "overdue"
    if any(word in q for word in ("快到期", "即将到期", "快截止", "近期截止", "本周到期", "本周截止", "七天内", "7天内", "三天内", "3天内")):
        return "due_soon"
    if any(word in q for word in ("未完成", "没完成", "进行中", "待完成", "待办", "还剩")):
        return "active"
    if any(word in q for word in ("已完成", "完成的", "完成项目", "完结")):
        return "completed"
    return ""


def _display_query_text(query: str) -> str:
    """Render a user query safely for cards without raw Feishu mention markup."""
    return _AT_PATTERN.sub(lambda m: f"@{m.group(2).strip()}", query or "")


def _project_member_names(project: dict) -> list[str]:
    detail = project.get("detail_project") or {}
    members = detail.get("members") or project.get("members") or []
    return [str(member).strip() for member in members if str(member).strip()]


def _member_filters_from_query(query: str, projects: list[dict]) -> list[str]:
    """Infer member filters from Feishu mentions or natural-language owner queries."""
    q = query or ""
    mentioned = [m.group(2).strip() for m in _AT_PATTERN.finditer(q) if m.group(2).strip()]
    if mentioned:
        return mentioned
    if not any(word in q for word in ("负责", "负责人", "成员", "参与", "跟进", "哪些项目", "的项目")):
        return []
    candidates = sorted(
        {member for project in projects for member in _project_member_names(project)},
        key=len,
        reverse=True,
    )
    return [member for member in candidates if member and member in q]


def _dashboard_page_from_query(query: str) -> int:
    """Infer dashboard page from Chinese query text."""
    q = query or ""
    match = re.search(r"第\s*(\d+)\s*页", q)
    if match:
        return max(1, int(match.group(1)))
    if "下一页" in q:
        return 2
    return 1


def _dashboard_query_for_page(query: str, page: int) -> str:
    """Build a Chinese dashboard query that preserves filters and targets a page."""
    base = (query or "项目进展").strip()
    target = max(1, int(page))
    if re.search(r"第\s*\d+\s*页", base):
        return re.sub(r"第\s*\d+\s*页", f"第{target}页", base, count=1)
    if "下一页" in base:
        return base.replace("下一页", f"第{target}页", 1)
    return f"{base} 第{target}页"


def _is_archived_status(status: str) -> bool:
    return str(status).strip() in ("已归档", "归档", "archived")


def _dashboard_header_template(status_filter: str) -> str:
    if status_filter in ("risk", "overdue"):
        return "red"
    if status_filter == "due_soon":
        return "yellow"
    if status_filter == "archived":
        return "grey"
    if status_filter == "all":
        return "blue"
    return "green"


def _project_matches_status_filter(project: dict, status_filter: str) -> bool:
    """Return whether a dashboard project matches the requested filter."""
    status = str(project.get("status", ""))
    if status_filter == "all":
        return True
    if status_filter == "archived":
        return _is_archived_status(status)
    if not status_filter:
        return not _is_archived_status(status)
    if status_filter == "completed":
        return status == "已完成"
    if status_filter == "active":
        return status != "已完成" and not _is_archived_status(status)
    if status_filter == "risk":
        return status in ("有风险", "风险", "blocked")
    if status_filter == "overdue":
        import datetime as _dt
        try:
            deadline = _dt.date.fromisoformat(str(project.get("deadline", "")))
            return deadline < _dt.date.today() and status != "已完成" and not _is_archived_status(status)
        except (TypeError, ValueError):
            return False
    if status_filter == "due_soon":
        import datetime as _dt
        try:
            deadline = _dt.date.fromisoformat(str(project.get("deadline", "")))
            today = _dt.date.today()
            return today <= deadline <= today + _dt.timedelta(days=7) and status != "已完成" and not _is_archived_status(status)
        except (TypeError, ValueError):
            return False
    return True


def _find_named_project_query_match(query: str, projects: list) -> Optional[dict]:
    """Return an actionable project when the query explicitly contains its title."""
    if not query:
        return None
    matches = [
        p for p in projects
        if p.get("actionable") and p.get("name") and p["name"] in query and p.get("detail_project")
    ]
    if len(matches) == 1:
        return matches[0]
    return None


def _resolve_calendar_id(client: Any) -> str:
    """Resolve the writable Feishu calendar id without tenant-specific hardcoding."""
    configured = os.getenv("PILOTFLOW_FEISHU_CALENDAR_ID", "").strip()
    if configured:
        return configured
    try:
        from lark_oapi.api.calendar.v4 import PrimaryCalendarRequest

        req = PrimaryCalendarRequest.builder().build()
        resp = client.calendar.v4.calendar.primary(req)
        if resp.success():
            calendars = getattr(resp.data, "calendars", None) or []
            for item in calendars:
                calendar = getattr(item, "calendar", None)
                calendar_id = getattr(calendar, "calendar_id", "")
                if calendar_id:
                    return calendar_id
    except Exception as e:
        logger.warning("resolve primary calendar failed: %s", e)
    return "primary"


def _create_calendar_event(title: str, goal: str, deadline: str) -> Optional[str]:
    """Create a calendar event for the project deadline. Returns description on success."""
    client = _get_client()
    if not client or not deadline:
        return None
    try:
        import datetime
        from lark_oapi.api.calendar.v4 import (
            CreateCalendarEventRequest, CalendarEvent, TimeInfo,
        )
        # Parse deadline as UTC+8 (China Standard Time) 9:00 AM
        dt = datetime.datetime.strptime(deadline, "%Y-%m-%d")
        dt = dt.replace(hour=9, tzinfo=datetime.timezone(datetime.timedelta(hours=8)))
        ts_start = str(int(dt.timestamp()))
        ts_end = str(int((dt + datetime.timedelta(hours=1)).timestamp()))
        start_time = TimeInfo.builder().timestamp(ts_start).build()
        end_time = TimeInfo.builder().timestamp(ts_end).build()
        event = (
            CalendarEvent.builder()
            .summary(f"📌 截止: {title}").description(goal)
            .start_time(start_time).end_time(end_time).build()
        )
        req = (
            CreateCalendarEventRequest.builder()
            .calendar_id(_resolve_calendar_id(client))
            .request_body(event)
            .build()
        )
        resp = client.calendar.v4.calendar_event.create(req)
        if resp.success():
            logger.info("calendar event created for %s", deadline)
            return f"日历事件: {deadline}"
        else:
            logger.warning("create calendar event failed: %s", resp.msg)
            return None
    except Exception as e:
        logger.warning("create calendar event error: %s", e)
        return None



# ---------------------------------------------------------------------------
# Tool: pilotflow_generate_plan
# ---------------------------------------------------------------------------

PILOTFLOW_GENERATE_PLAN_SCHEMA = {
    "name": "pilotflow_generate_plan",
    "description": (
        "【创建项目的第一步 — 必须首先调用】\n"
        "当用户在群里 @机器人 并提到项目、答辩、任务、计划、创建、准备等关键词时，必须先调用此工具。\n\n"
        "此工具会：\n"
        "1. 设置确认门控（允许后续调用 pilotflow_create_project_space）\n"
        "2. 检测项目模板（答辩/sprint/活动/上线）并提供建议\n"
        "3. 自动发送确认卡片到群聊，包含计划摘要和确认/取消按钮\n"
        "4. 把你提取的字段存入 pending plan，用户点击确认按钮即可一键创建（无需重新提取）\n\n"
        "调用时你必须从用户消息中提取并传入：title、goal、members、deliverables、deadline。\n"
        "成员只能来自用户明确提到的真实姓名、@提及或飞书可解析上下文；不确定就传空数组，禁止编造成员A/示例成员。\n"
        "提取不全也要传，能提多少传多少，剩余字段留空字符串或空数组。\n"
        "模板会补全缺失的 deliverables 和 deadline 默认值。\n\n"
        "调用后，你必须：\n"
        "- 简短回复「已生成计划，请在卡片上确认」（卡片已自动发送）\n"
        "- 等用户确认（点击按钮 / 回复「确认」「可以」「好的」「行」「ok」）\n"
        "- 用户确认后调用 pilotflow_create_project_space 或 pilotflow_handle_card_action\n\n"
        "【输出规则 - 必须遵守】\n"
        "- 绝对不要向用户展示工具名称、英文内容或 JSON\n"
        "- 只用中文回复，不要显示工具调用过程\n"
        "- 不要说「正在调用xxx工具」"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "input_text": {"type": "string", "description": "用户的原始输入文本，包含项目描述。"},
            "title": {"type": "string", "description": "项目标题（从用户消息提取，可为空字符串）。"},
            "goal": {"type": "string", "description": "项目目标（从用户消息提取，可为空字符串）。"},
            "members": {
                "type": "array",
                "items": {"type": "string"},
                "description": "真实成员列表。只填写用户明确提到或飞书可解析的成员；不确定传空数组，禁止示例成员。",
            },
            "deliverables": {
                "type": "array",
                "items": {"type": "string"},
                "description": "交付物列表。只填写用户明确要求或上下文合理确定的交付物；不确定可为空数组，由模板或历史建议补充。",
            },
            "deadline": {"type": "string", "description": "截止时间 YYYY-MM-DD（可为空字符串，会被模板补全）。"},
        },
        "required": ["input_text"],
    },
}


# Project templates for intelligent suggestions
_TEMPLATES = {
    "答辩": {
        "deliverables": ["项目简报", "PPT", "演示脚本"],
        "suggested_deadline_days": 7,
        "description": "答辩项目模板：包含项目简报、PPT和演示脚本",
    },
    "sprint": {
        "deliverables": ["需求文档", "技术方案", "测试用例"],
        "suggested_deadline_days": 14,
        "description": "Sprint 模板：包含需求文档、技术方案和测试用例",
    },
    "活动": {
        "deliverables": ["活动方案", "预算表", "宣传物料"],
        "suggested_deadline_days": 10,
        "description": "活动策划模板：包含活动方案、预算表和宣传物料",
    },
    "上线": {
        "deliverables": ["上线方案", "回滚方案", "监控配置"],
        "suggested_deadline_days": 3,
        "description": "产品上线模板：包含上线方案、回滚方案和监控配置",
    },
}


def _detect_template(text: str) -> Optional[dict]:
    """Detect project template from user input."""
    for keyword, template in _TEMPLATES.items():
        if keyword in text:
            return template
    return None


def _handle_generate_plan(params: Dict[str, Any], **kwargs) -> str:
    """Parse user input and return a structured project plan with pre-populated scaffold."""
    chat_id = _get_chat_id(kwargs)
    if chat_id:
        _set_plan_gate(chat_id)

    text = params.get("input_text", "")
    template = _detect_template(text)
    session_chat_name = _get_session_value("HERMES_SESSION_CHAT_NAME", "")
    session_user_name = _get_session_value("HERMES_SESSION_USER_NAME", "")
    session_context_used = {
        "chat_name": False,
        "initiator": False,
    }

    # Build plan from LLM-extracted fields + template defaults
    import datetime
    plan = {
        "title": params.get("title", "") or "",
        "goal": params.get("goal", "") or "",
        "members": _clean_plan_list(params.get("members")),
        "deliverables": _clean_plan_list(params.get("deliverables")),
        "deadline": params.get("deadline", "") or "",
        "risks": [],
    }
    if not plan["members"] and session_user_name:
        plan["members"] = [session_user_name]
        session_context_used["initiator"] = True

    # History is context for the Agent/user, not a silent overwrite. Templates
    # may fill generic defaults; history is shown explicitly as suggestions.
    history_suggestions, history_suggested_fields = _history_suggestions_for_plan(plan, text)

    # Template fills generic gaps.
    if template:
        if not plan["deliverables"]:
            plan["deliverables"] = list(template["deliverables"])
        if not plan["deadline"]:
            suggested = datetime.date.today() + datetime.timedelta(days=template["suggested_deadline_days"])
            plan["deadline"] = suggested.strftime("%Y-%m-%d")

    # Title fallback: use chat name + date if extraction failed
    if not plan["title"]:
        chat_name = session_chat_name or "项目"
        plan["title"] = f"{chat_name} - {datetime.date.today().isoformat()}"
        session_context_used["chat_name"] = bool(session_chat_name)

    # Store full pending plan for card-button-driven creation
    if chat_id:
        with _plan_lock:
            _pending_plans[chat_id] = {
                "input": text,
                "template": template["description"] if template else None,
                "plan": dict(plan),
            }

    # Send confirmation card with interactive buttons (always send if we have chat_id)
    if chat_id:
        member_text = ", ".join(plan["members"]) if plan["members"] else "待确认"
        deliverable_text = ", ".join(plan["deliverables"]) if plan["deliverables"] else "待确认"
        deadline_text = plan["deadline"] or "待确认"
        history_text = ""
        if history_suggestions:
            history_text = "\n\n**历史建议：**\n" + "\n".join(f"- {s}" for s in history_suggestions)
        confirm_action_id = _create_card_action_ref(chat_id, "confirm_project", plan)
        cancel_action_id = _create_card_action_ref(chat_id, "cancel_project", plan)
        card = {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"content": "📋 执行计划", "tag": "plain_text"},
                "template": "blue",
            },
            "elements": [
                {
                    "tag": "markdown",
                    "content": (
                        f"**成员：** {member_text}\n"
                        f"**交付物：** {deliverable_text}\n"
                        f"**截止时间：** {deadline_text}"
                        f"{history_text}"
                    ),
                },
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "✅ 确认执行"},
                            "type": "primary",
                            "value": {"pilotflow_action_id": confirm_action_id},
                        },
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "❌ 取消"},
                            "type": "default",
                            "value": {"pilotflow_action_id": cancel_action_id},
                        },
                    ],
                },
            ],
        }
        sent_message_id = _hermes_send_card(chat_id, card)
        if isinstance(sent_message_id, str):
            _attach_card_message_id([confirm_action_id, cancel_action_id], sent_message_id)

    template_hint = ""
    if template:
        template_hint = (
            f"\n\n【模板建议】检测到「{text}」可能适用模板：\n"
            f"- 建议交付物：{', '.join(template['deliverables'])}\n"
            f"- 建议截止时间：{plan['deadline']}（{template['suggested_deadline_days']}天后）\n"
            f"如果用户没有指定，请使用以上建议。"
        )
    history_hint = ""
    if history_suggestions:
        history_hint = "\n\n【历史建议】\n" + "\n".join(f"- {s}" for s in history_suggestions)

    return tool_result({
        "status": "plan_generated",
        "input": text,
        "template": template["description"] if template else None,
        "plan": plan,
        "history_suggestions": history_suggestions,
        "history_suggested_fields": history_suggested_fields,
        "session_context_used": session_context_used,
        "card_sent": bool(chat_id),
        "instructions": (
            "✅ 已提取并存储项目信息（pending plan）。\n"
            "✅ 确认卡片已自动发送到群聊（包含计划摘要、✅确认/❌取消按钮）。\n\n"
            "【你的下一步】\n"
            "简短回复「已生成计划，请在卡片上确认」即可，不要重复展示完整计划内容（卡片里已有）。\n\n"
            "【用户确认路径】\n"
            "- 路径A: 用户点击卡片 ✅ 按钮 → PilotFlow 的 /card 插件命令会自动续跑\n"
            "- 路径B: 用户文字回复「确认」「可以」「好的」「行」「ok」\n"
            "  → 调用 pilotflow_create_project_space（使用本次提取的 plan 字段，并把用户最新回复原文填入 confirmation_text）\n"
            "- 路径C: 用户点击 ❌ 或文字回复「取消」\n"
            "  → 调用 pilotflow_handle_card_action（action=cancel_project）\n\n"
            "【输出规则 - 必须遵守】\n"
            "1. 绝对不要向用户展示工具名称或英文内容\n"
            "2. 只回复中文，不要显示工具调用过程\n"
            "3. 不要说「正在调用xxx工具」"
            f"{history_hint}"
            f"{template_hint}"
        ),
    })


# ---------------------------------------------------------------------------
# Tool: pilotflow_detect_risks
# ---------------------------------------------------------------------------

PILOTFLOW_DETECT_RISKS_SCHEMA = {
    "name": "pilotflow_detect_risks",
    "description": (
        "检测项目计划中的潜在风险。检查：成员是否为空、交付物是否为空、截止时间是否明确。\n"
        "返回风险列表和处理建议。\n"
        "在展示计划给用户时可以调用此工具进行风险预检，也可独立使用。\n\n"
        "【输出规则】只用中文回复风险信息，不要展示工具名称或英文内容。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "members": {"type": "array", "items": {"type": "string"}, "description": "项目成员列表。"},
            "deliverables": {"type": "array", "items": {"type": "string"}, "description": "交付物列表。"},
            "deadline": {"type": "string", "description": "截止时间。"},
        },
        "required": ["members", "deliverables", "deadline"],
    },
}


def _handle_detect_risks(params: Dict[str, Any], **kwargs) -> str:
    """Detect risks in a project plan."""
    members = _clean_plan_list(params.get("members"))
    deliverables = _clean_plan_list(params.get("deliverables"))
    deadline = params.get("deadline", "")

    risks = []
    if not members:
        risks.append({"level": "high", "title": "未指定项目成员", "suggestion": "请确认至少一名负责人"})
    if not deliverables:
        risks.append({"level": "high", "title": "未指定交付物", "suggestion": "请明确具体交付物"})
    if not deadline or deadline in ("待确认", ""):
        risks.append({"level": "medium", "title": "截止时间不明确", "suggestion": "请确认具体截止日期"})

    if not risks:
        return tool_result("未检测到风险，计划信息完整。")
    return tool_result({
        "risks_found": len(risks), "risks": risks,
        "instructions": "请将以上风险发送到群里，让用户确认处理方式。",
    })


# ---------------------------------------------------------------------------
# Tool: pilotflow_create_project_space
# ---------------------------------------------------------------------------

PILOTFLOW_CREATE_PROJECT_SPACE_SCHEMA = {
    "name": "pilotflow_create_project_space",
    "description": (
        "【必须在用户确认后调用 — 禁止跳过确认步骤】\n"
        "一键创建飞书项目空间，包含以下产物：\n"
        "1. 飞书文档（格式化 markdown + @提及成员 + 自动开链接权限 + 给成员加编辑权）\n"
        "2. 多维表格（项目状态台账 + 记录 + 自动开权限）\n"
        "3. 飞书任务（每个交付物一个任务）\n"
        "4. 群入口消息（@成员 + 文档/表格/截止时间链接）\n"
        "5. 日历事件（截止时间提醒）\n\n"
        "前置条件：必须先调用 pilotflow_generate_plan 并等用户回复「确认」。\n"
        "如果用户没确认就调用，会返回错误。\n\n"
        "文本确认路径必须传入用户最新回复 confirmation_text，且只能是「确认」「确认执行」「可以」「好的」「行」「ok」等明确执行语义。\n"
        "用户说「确认卡片」「给我确认卡片」只表示要看卡片，不是确认执行。\n\n"
        "【输出规则 - 必须遵守】\n"
        "- 用中文回复结果摘要，直接使用返回的 display 列表逐行展示\n"
        "- 绝对不要向用户展示工具名称、英文内容或 JSON\n"
        "- 不要说「正在调用xxx工具」或显示技术细节"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "项目标题（必填），如「答辩项目」。"},
            "goal": {"type": "string", "description": "项目目标（必填），一句话描述项目要达成什么。"},
            "members": {
                "type": "array",
                "items": {"type": "string"},
                "description": "项目成员列表。只填写用户明确提到或飞书可解析的真实成员；不确定就传空数组，禁止编造示例成员。",
            },
            "deliverables": {
                "type": "array",
                "items": {"type": "string"},
                "description": "交付物列表。只填写用户明确要求或根据上下文可合理确定的交付物；禁止使用示例占位。",
            },
            "deadline": {"type": "string", "description": "截止时间，格式 YYYY-MM-DD，如「2026-05-10」。"},
            "risks": {"type": "array", "items": {"type": "string"}, "description": "已知风险，如[\"时间紧张\"]。"},
            "confirmation_text": {
                "type": "string",
                "description": "用户最新的独立确认回复。只有用户明确回复确认执行时填写，例如「确认」「确认执行」「可以」「好的」「行」「ok」。",
            },
        },
        "required": ["title", "goal", "members", "deliverables", "confirmation_text"],
    },
}


def _handle_create_project_space(params: Dict[str, Any], **kwargs) -> str:
    """Create a complete project space in Feishu."""
    chat_id = _get_chat_id(kwargs)
    if not chat_id:
        return tool_error("无法获取群聊 ID，请确认 PILOTFLOW_TEST_CHAT_ID 已配置。")

    skip_gate = bool(kwargs.get("_pilotflow_gate_consumed"))
    if not skip_gate:
        confirmation_text = params.get("confirmation_text", "")
        if not _is_execution_confirmation(confirmation_text):
            return tool_error("请等待用户明确回复「确认执行」或点击卡片确认按钮后再创建项目。")
        if not _consume_plan_gate(chat_id):
            return tool_error("请先调用 pilotflow_generate_plan 生成计划，展示给用户确认后再调用此工具。")

    title = params.get("title", "项目")
    goal = params.get("goal", "")
    members = _clean_plan_list(params.get("members"))
    deliverables = _clean_plan_list(params.get("deliverables"))
    deadline = params.get("deadline", "")
    risks = params.get("risks", [])

    artifacts = []
    unresolved_members = _find_unresolved_members(members, chat_id)
    unresolved_text = "、".join(unresolved_members)
    member_warning = (
        f"⚠️ 成员解析提醒：{unresolved_text} 未能 @，请确认这些成员已在群内。"
        if unresolved_members else ""
    )
    # Use plain names for bitable (no @mention markup)
    member_plain = _member_names_plain(members) if members else "待确认"
    # Use @mention format for docs and messages
    member_display = _format_members(members, chat_id) if members else "待确认"

    # 1. Create doc (lark_oapi) — with @mention in content
    doc_content = f"# {title}\n\n## 目标\n{goal}\n\n"
    if members:
        doc_content += f"## 成员\n{member_display}\n\n"
    if member_warning:
        doc_content += f"## 成员解析提醒\n{member_warning}\n\n"
    if deliverables:
        doc_content += "## 交付物\n" + "\n".join(f"- {d}" for d in deliverables) + "\n\n"
    if deadline:
        doc_content += f"## 截止时间\n{deadline}\n\n"
    if risks:
        doc_content += "## 风险\n" + "\n".join(f"- {r}" for r in risks) + "\n\n"

    doc_url = _create_doc(f"{title} - 项目简报", doc_content, chat_id)
    if doc_url:
        artifacts.append(f"文档: {doc_url}")

    # 2. Create bitable (lark_oapi) — plain names for data fields
    bitable_meta = _create_bitable(title, member_plain, deadline, risks, chat_id, deliverables)
    bitable_url = bitable_meta["url"] if bitable_meta else None
    if bitable_url:
        artifacts.append(f"多维表格: {bitable_url}")

    # 3. Create tasks (lark_oapi) — with assignee + deadline
    if deliverables:
        created_tasks = 0
        max_tasks = 10
        for i, d in enumerate(deliverables[:max_tasks]):
            assignee = members[i % len(members)] if members else ""
            task_name = _create_task(d, f"项目: {title}", assignee, deadline, chat_id)
            if task_name:
                artifacts.append(f"任务: {task_name}")
                created_tasks += 1
        if len(deliverables) > max_tasks:
            logger.warning("deliverables capped: %d -> %d tasks created", len(deliverables), created_tasks)

    # 4. Send entry card (via Hermes) — interactive card with clickable links
    link_lines = []
    if doc_url:
        link_lines.append(f"📄 [项目文档]({doc_url})")
    if bitable_url:
        link_lines.append(f"📊 [状态表]({bitable_url})")
    link_lines.append(f"⏰ 截止: {deadline or '待确认'}")

    status_action_id = _create_card_action_ref(chat_id, "project_status", {"title": title})
    done_action_id = _create_card_action_ref(chat_id, "mark_project_done", {"title": title})
    entry_card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"content": f"📌 {title}", "tag": "plain_text"},
            "template": "green",
        },
        "elements": [
            {
                "tag": "markdown",
                "content": (
                    f"**目标：** {goal}\n"
                    f"**成员：** {member_display}\n"
                    + (f"{member_warning}\n" if member_warning else "")
                    + "\n".join(link_lines)
                ),
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "查看状态"},
                        "type": "default",
                        "value": {"pilotflow_action_id": status_action_id},
                    },
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "标记完成"},
                        "type": "primary",
                        "value": {"pilotflow_action_id": done_action_id},
                    },
                ],
            },
        ],
    }
    sent_entry_message_id = _hermes_send_card(chat_id, entry_card)
    if isinstance(sent_entry_message_id, str):
        _attach_card_message_id([status_action_id, done_action_id], sent_entry_message_id)
    if sent_entry_message_id:
        artifacts.append("项目入口卡片")

    # 5. Calendar event (best effort)
    cal_result = _create_calendar_event(title, goal, deadline)
    if cal_result:
        artifacts.append(cal_result)

    if not artifacts:
        return tool_error("创建失败，请检查飞书应用凭证配置。")

    # Register in memory for query_status and update_project
    _register_project(
        title, members, deadline, "进行中", artifacts,
        app_token=bitable_meta.get("app_token", "") if bitable_meta else "",
        table_id=bitable_meta.get("table_id", "") if bitable_meta else "",
        record_id=bitable_meta.get("record_id", "") if bitable_meta else "",
        goal=goal,
        deliverables=deliverables,
    )

    # Save project pattern to Hermes memory for later history-based suggestions.
    _save_to_hermes_memory(title, goal, members, deliverables, deadline)
    _save_project_state(
        title, goal, members, deliverables, deadline, "进行中", artifacts,
        app_token=bitable_meta.get("app_token", "") if bitable_meta else "",
        table_id=bitable_meta.get("table_id", "") if bitable_meta else "",
        record_id=bitable_meta.get("record_id", "") if bitable_meta else "",
    )

    # Schedule deadline reminder via Hermes cron (if deadline is set)
    reminder_job = False
    if deadline:
        reminder_job = _schedule_deadline_reminder(title, deadline, chat_id)
        if reminder_job:
            artifacts.append("截止提醒已设置")

    # Clean up only text-confirmation pending state. Card confirmations carry
    # their own plan snapshot, so they must not delete a newer plan in the same chat.
    if not bool(kwargs.get("_pilotflow_plan_override")):
        with _plan_lock:
            _pending_plans.pop(chat_id, None)

    # Pre-formatted display lines for LLM to present directly
    display_items = [f"✅ 项目空间已创建: {title}"]
    if doc_url:
        display_items.append(f"📄 文档: {doc_url}")
    if bitable_url:
        display_items.append(f"📊 状态表: {bitable_url}")
    if members:
        display_items.append(f"👥 成员: {', '.join(members)}")
    if member_warning:
        display_items.append(member_warning)
    if deliverables:
        display_items.append(f"📋 任务: {', '.join(deliverables)}")
    if deadline:
        display_items.append(f"⏰ 截止: {deadline}")
    if cal_result:
        display_items.append("📅 日历提醒已创建")
    if deadline:
        display_items.append("🔔 截止提醒已设置" if reminder_job else "⚠️ 截止提醒未设置")
    display_items.append("💬 已通知群成员")

    return tool_result({
        "status": "project_space_created",
        "title": title,
        "artifacts": artifacts,
        "display": display_items,
        "unresolved_members": unresolved_members,
        "instructions": (
            "用中文回复结果摘要（不要显示工具名或英文）。\n"
            "直接使用 display 列表逐行展示，或自行组织语言。"
            + (f"\n成员解析提醒：{unresolved_text} 未能 @，请提示用户确认这些成员已在群内。" if unresolved_members else "")
        ),
        "message": f"已创建 {len(artifacts)} 个产物: {', '.join(artifacts)}",
    })


# ---------------------------------------------------------------------------
# Tool: pilotflow_handle_card_action
# ---------------------------------------------------------------------------

PILOTFLOW_HANDLE_CARD_ACTION_SCHEMA = {
    "name": "pilotflow_handle_card_action",
    "description": (
        "【处理卡片按钮点击 — 用户点击确认卡片按钮时调用】\n"
        "当用户点击卡片上的 ✅确认执行 或 ❌取消 按钮时，Hermes 会将点击路由为合成命令\n"
        "/card button {\"pilotflow_action\": \"confirm_project\"}\n\n"
        "此工具会：\n"
        "- confirm_project: 从 _pending_plans 恢复已提取的项目信息，自动调用创建流程\n"
        "- cancel_project: 清除确认门控和 pending plan，通知用户已取消\n"
        "- project_status: 从入口卡片查看单个项目状态\n"
        "- mark_project_done: 从入口卡片把项目标记为完成\n\n"
        "- reopen_project: 从入口卡片把已完成项目重新打开\n\n"
        "收到 /card button 格式的消息时必须调用此工具，不需要重新提取项目参数。\n\n"
        "【输出规则】只用中文回复结果，不要展示工具名称或英文内容。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action_value": {
                "type": "string",
                "description": (
                    "卡片按钮的值，JSON 字符串，如 '{\"pilotflow_action\":\"confirm_project\"}'。"
                    "从 /card button {...} 合成消息中提取。"
                ),
            },
        },
        "required": ["action_value"],
    },
}


def _handle_card_action(params: Dict[str, Any], **kwargs) -> str:
    """Handle card button clicks routed as synthetic /card button commands."""
    chat_id = _get_chat_id(kwargs)
    if not chat_id:
        return tool_error("无法获取群聊 ID")

    action_value_str = params.get("action_value", "{}")
    try:
        action_data = json.loads(action_value_str)
    except (json.JSONDecodeError, TypeError):
        return tool_error("无法解析卡片按钮值")

    pilotflow_action = action_data.get("pilotflow_action", "")

    recovered_plan_override = kwargs.pop("_pilotflow_plan_override", None)
    gate_consumed = bool(kwargs.get("_pilotflow_gate_consumed"))

    if pilotflow_action == "cancel_project":
        if not gate_consumed:
            _clear_plan_gate(chat_id)
            with _plan_lock:
                _pending_plans.pop(chat_id, None)
        _hermes_send(chat_id, "已取消本次项目创建。")
        return tool_result({
            "status": "cancelled",
            "instructions": "回复用户：已取消。不要展示工具名或英文。",
        })

    if pilotflow_action == "confirm_project":
        if not gate_consumed and not _consume_plan_gate(chat_id):
            return tool_error("确认超时，请重新发起项目创建。")
        kwargs["_pilotflow_gate_consumed"] = True

        # Recover plan from pending storage
        if recovered_plan_override:
            recovered_plan = dict(recovered_plan_override)
        else:
            with _plan_lock:
                pending = _pending_plans.get(chat_id, {})
            recovered_plan = pending.get("plan", {})
        if not recovered_plan.get("title"):
            return tool_error("无法恢复项目信息，请重新用 pilotflow_generate_plan 生成计划。")

        # Feed recovered plan into create_project_space
        if recovered_plan_override:
            kwargs["_pilotflow_plan_override"] = True
        return _handle_create_project_space({
            "title": recovered_plan.get("title", ""),
            "goal": recovered_plan.get("goal", ""),
            "members": recovered_plan.get("members", []),
            "deliverables": recovered_plan.get("deliverables", []),
            "deadline": recovered_plan.get("deadline", ""),
            "risks": recovered_plan.get("risks", []),
        }, **kwargs)

    if pilotflow_action in ("project_status", "mark_project_done", "reopen_project", "resolve_risk", "send_project_reminder"):
        project_title = action_data.get("title") or action_data.get("project_name")
        if not project_title:
            return tool_error("无法识别项目，请在群里直接询问项目状态。")

        bitable_updated = False
        doc_updated = False
        with _project_registry_lock:
            project = _project_registry.get(project_title)
            if project and pilotflow_action == "mark_project_done":
                project["status"] = "已完成"
            elif project and pilotflow_action == "reopen_project":
                project["status"] = "进行中"
            elif project and pilotflow_action == "resolve_risk":
                project["status"] = "进行中"

        if not project:
            state_project = _find_project_state(project_title)
            if not state_project:
                return tool_error("没有找到这个项目，可能需要先在当前会话创建项目。")
            project = {
                "goal": state_project.get("goal", ""),
                "members": [],
                "deliverables": state_project.get("deliverables", []),
                "deadline": state_project.get("deadline", ""),
                "status": state_project.get("status", "进行中"),
                "artifacts": [],
                "app_token": "",
                "table_id": "",
                "record_id": "",
            }
            project_title = state_project.get("title", project_title)

        if pilotflow_action == "project_status":
            detail_card, action_ids = _build_project_detail_card(chat_id, project_title, project)
            sent_detail_message_id = _hermes_send_card(chat_id, detail_card)
            if isinstance(sent_detail_message_id, str):
                _attach_card_message_id(action_ids, sent_detail_message_id)
            if not sent_detail_message_id:
                return tool_error("项目详情卡发送失败，请检查 Feishu 连接。")
            return tool_result({
                "status": "project_status_sent",
                "project": project_title,
                "card_sent": True,
                "instructions": "已发送项目状态。不要展示工具名或英文。",
            })

        if pilotflow_action == "send_project_reminder":
            reminder_sent = _hermes_send(chat_id, _build_project_reminder_text(chat_id, project_title, project))
            if not reminder_sent:
                return tool_error("项目催办提醒发送失败，请检查 Feishu 连接。")
            doc_updated = _append_project_doc_update(project_title, project, "催办", "已发送催办提醒")
            bitable_history_created = False
            if project.get("app_token") and project.get("table_id"):
                bitable_history_created = _append_bitable_update_record(
                    project["app_token"], project["table_id"], "催办", "已发送催办提醒", project,
                )
            return tool_result({
                "status": "project_reminder_sent",
                "project": project_title,
                "reminder_sent": True,
                "doc_updated": doc_updated,
                "bitable_history_created": bitable_history_created,
                "instructions": "已发送项目催办提醒。不要展示工具名或英文。",
            })

        target_status = "已完成" if pilotflow_action == "mark_project_done" else "进行中"
        if project.get("app_token") and project.get("table_id") and project.get("record_id"):
            bitable_fields = {"状态": target_status}
            if pilotflow_action == "resolve_risk":
                bitable_fields["风险等级"] = "低"
            bitable_updated = _update_bitable_record(
                project["app_token"], project["table_id"], project["record_id"],
                bitable_fields,
            )
        _save_project_state(
            project_title, project.get("goal", ""), project.get("members", []),
            project.get("deliverables", []), project.get("deadline", ""), target_status,
            project.get("artifacts", []),
        )
        doc_label = "风险解除" if pilotflow_action == "resolve_risk" else "状态"
        doc_value = "风险已解除" if pilotflow_action == "resolve_risk" else target_status
        doc_updated = _append_project_doc_update(project_title, project, doc_label, doc_value)

        suffix_parts = []
        if bitable_updated:
            suffix_parts.append("状态表已同步")
        if doc_updated:
            suffix_parts.append("项目文档已更新")
        suffix = "，" + "，".join(suffix_parts) + "。" if suffix_parts else "。"
        if pilotflow_action == "mark_project_done":
            _hermes_send(chat_id, f"项目「{project_title}」已标记为完成{suffix}")
            result_status = "project_marked_done"
            instruction = "回复用户：已标记完成。不要展示工具名或英文。"
        elif pilotflow_action == "reopen_project":
            _hermes_send(chat_id, f"项目「{project_title}」已重新打开，状态改为进行中{suffix}")
            result_status = "project_reopened"
            instruction = "回复用户：已重新打开项目。不要展示工具名或英文。"
        else:
            _hermes_send(chat_id, f"项目「{project_title}」风险已解除，状态恢复为进行中{suffix}")
            result_status = "project_risk_resolved"
            instruction = "回复用户：风险已解除。不要展示工具名或英文。"
        return tool_result({
            "status": result_status,
            "project": project_title,
            "bitable_updated": bitable_updated,
            "doc_updated": doc_updated,
            "instructions": instruction,
        })

    if pilotflow_action == "dashboard_page":
        page_query = action_data.get("query") or _dashboard_query_for_page("项目进展", action_data.get("page", 1))
        sent_result = _handle_query_status({"query": page_query}, chat_id=chat_id)
        if isinstance(sent_result, str) and "项目看板已发送" in sent_result:
            return tool_result({
                "status": "dashboard_page_sent",
                "query": page_query,
                "instructions": "已发送项目看板分页。不要展示工具名或英文。",
            })
        return sent_result

    return tool_error(f"未知的卡片动作: {pilotflow_action}")


def _handle_card_command(raw_args: str) -> str:
    """Bridge Hermes plugin slash command `/card button {...}` to PilotFlow.

    Hermes exposes plugin slash commands with only raw arguments, so PilotFlow
    puts only an opaque short-lived action id in the private button value.
    """
    raw = (raw_args or "").strip()
    if raw.startswith("button"):
        raw = raw[len("button"):].strip()
    if not raw:
        return "无法解析卡片按钮，请回复「确认」或「取消」。"

    try:
        action_data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return "无法解析卡片按钮，请回复「确认」或「取消」。"

    chat_id = action_data.get("pilotflow_chat_id", "")
    action_id = action_data.get("pilotflow_action_id", "")
    action_ref = None
    if action_id:
        action_ref = _resolve_card_action_ref(action_id, consume=True)
        if not action_ref:
            return "卡片操作已过期或已处理，请重新发起项目创建。"
        chat_id = action_ref["chat_id"]
        action_data["pilotflow_action"] = action_ref["action"]
        action_data.update(action_ref.get("plan") or {})
    elif not chat_id:
        ref = _resolve_card_action_ref(action_id)
        if not ref:
            return "卡片操作已过期，请重新发起项目创建。"
        chat_id = ref["chat_id"]
        action_data["pilotflow_action"] = ref["action"]

    pilotflow_action = action_data.get("pilotflow_action", "")
    message_id = action_ref.get("message_id", "") if action_ref else ""
    if action_id and pilotflow_action == "confirm_project":
        _mark_card_message(
            message_id,
            "⏳ 正在创建项目空间",
            "已收到确认，正在创建飞书文档、状态表、任务和项目入口卡片。",
            "blue",
        )
    elif action_id and pilotflow_action == "cancel_project":
        _mark_card_message(
            message_id,
            "已取消项目创建",
            "本次计划已取消，未创建任何项目产物。",
            "grey",
        )
    elif action_id and pilotflow_action == "mark_project_done":
        _mark_card_message(
            message_id,
            "项目已完成",
            f"**{action_data.get('title', '项目')}** 已标记为完成。",
            "green",
        )
    elif action_id and pilotflow_action == "reopen_project":
        _mark_card_message(
            message_id,
            "项目已重新打开",
            f"**{action_data.get('title', '项目')}** 已恢复为进行中。",
            "blue",
        )
    elif action_id and pilotflow_action == "resolve_risk":
        _mark_card_message(
            message_id,
            "风险已解除",
            f"**{action_data.get('title', '项目')}** 已恢复为进行中。",
            "green",
        )
    elif action_id and pilotflow_action == "send_project_reminder":
        _mark_card_message(
            message_id,
            "已发送催办提醒",
            f"**{action_data.get('title', '项目')}** 的催办提醒已发送到群聊。",
            "yellow",
        )

    action_value = json.dumps(action_data, ensure_ascii=False)
    action_kwargs = {"chat_id": chat_id}
    if action_ref:
        action_kwargs["_pilotflow_gate_consumed"] = True
        if action_ref.get("plan"):
            action_kwargs["_pilotflow_plan_override"] = action_ref["plan"]
    result = _handle_card_action({"action_value": action_value}, **action_kwargs)
    try:
        data = json.loads(result)
    except (json.JSONDecodeError, TypeError):
        return result

    if data.get("error"):
        return str(data["error"])
    if data.get("status") == "cancelled":
        if action_ref:
            _clear_pending_plan_if_matches(chat_id, action_ref.get("plan"))
        return None
    if data.get("status") == "project_space_created":
        if action_id:
            title = data.get("title", "项目")
            _mark_card_message(
                message_id,
                "✅ 已确认并创建",
                f"**{title}** 已创建完成。\n\n项目入口卡片已发送到群聊。",
                "green",
            )
        if action_ref:
            _clear_pending_plan_if_matches(chat_id, action_ref.get("plan"))
        return None
    if data.get("status") in ("project_status_sent", "project_marked_done", "project_reopened", "project_risk_resolved", "project_reminder_sent", "dashboard_page_sent"):
        return None
    if data.get("display"):
        return "\n".join(str(item) for item in data["display"])
    return "已处理卡片操作。"


# ---------------------------------------------------------------------------
# Tool: pilotflow_query_status
# ---------------------------------------------------------------------------

PILOTFLOW_QUERY_STATUS_SCHEMA = {
    "name": "pilotflow_query_status",
    "description": (
        "查询项目状态并向群聊发送看板卡片。\n"
        "当用户问「项目进展如何」「有哪些项目」「项目状态」「看看进展」时调用。\n"
        "会查询本会话中创建过的项目，构建项目看板互动卡片发送到群聊。\n"
        "默认隐藏已归档项目；用户说「显示所有项目」或「看看归档项目」时才显示归档项目。\n"
        "用户问「逾期项目」「快到期」「近期截止」「本周截止」时，发送对应催办看板。\n\n"
        "项目超过一页时，用户说「第2页」或「下一页」继续查看后续项目。\n\n"
        "【输出规则】只用中文回复看板信息，不要展示工具名称或英文内容。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "用户的查询内容。"},
        },
        "required": ["query"],
    },
}


def _handle_query_status(params: Dict[str, Any], **kwargs) -> str:
    """Query project status and send a dashboard card."""
    query = params.get("query", "")
    chat_id = _get_chat_id(kwargs)
    status_filter = _status_filter_from_query(query)

    projects = []

    # 1. Primary source: in-memory project registry (always works)
    with _project_registry_lock:
        for title, info in _project_registry.items():
            member_str = ", ".join(info.get("members", [])) or "待确认"
            deadline = info.get("deadline", "待确认")
            status = info.get("status", "进行中")
            # Deadline countdown with urgency indicators
            cd = _deadline_countdown(deadline)
            countdown = f" | {cd}" if cd else ""
            projects.append({
                "name": title,
                "source": f"成员: {member_str} | 截止: {deadline}{countdown} | {status}",
                "actionable": True,
                "status": status,
                "deadline": deadline,
                "members": list(info.get("members", [])),
                "detail_project": info.copy(),
            })

    # 2. Secondary: try Feishu task API (requires user token, may fail)
    if not projects:
        client = _get_client()
        if client:
            try:
                from lark_oapi.api.task.v2 import ListTaskRequest
                req = ListTaskRequest.builder().page_size(20).build()
                resp = client.task.v2.task.list(req)
                if resp.success() and resp.data and resp.data.items:
                    for t in resp.data.items[:5]:
                        projects.append({
                            "name": t.summary or "无标题",
                            "source": "任务",
                            "actionable": False,
                            "status": "进行中",
                            "deadline": "",
                        })
            except Exception as e:
                logger.debug("task API fallback failed: %s", e)

    # 3. Portable plugin state survives gateway restarts even when Hermes
    # memory is unavailable in a minimal runtime.
    if not projects:
        for item in _load_project_state():
            deadline = item.get("deadline") or "待确认"
            cd = _deadline_countdown(deadline)
            countdown = f" | {cd}" if cd else ""
            deliverables = "、".join(item.get("deliverables", [])) or "待确认"
            projects.append({
                "name": item.get("title") or "历史项目",
                "source": f"来源: 本地状态 | 交付物: {deliverables} | 截止: {deadline}{countdown} | {item.get('status', '进行中')}",
                "actionable": True,
                "status": item.get("status", "进行中"),
                "deadline": deadline,
                "detail_project": {
                    "goal": item.get("goal", ""),
                    "members": [],
                    "deliverables": item.get("deliverables", []),
                    "deadline": item.get("deadline", ""),
                    "status": item.get("status", "进行中"),
                    "artifacts": [],
                },
            })
            if len(projects) >= 5:
                break

    # 4. Hermes memory fallback when the runtime exposes it.
    if not projects:
        for item in _load_history_projects(query):
            deadline = item.get("deadline") or "待确认"
            cd = _deadline_countdown(deadline)
            countdown = f" | {cd}" if cd else ""
            deliverables = "、".join(item.get("deliverables", [])) or "待确认"
            projects.append({
                "name": item.get("title") or "历史项目",
                "source": f"来源: 历史记录 | 交付物: {deliverables} | 截止: {deadline}{countdown} | 进行中",
                "actionable": False,
                "status": "进行中",
                "deadline": deadline,
            })
            if len(projects) >= 5:
                break

    named_match = _find_named_project_query_match(query, projects)
    if named_match and chat_id:
        card, action_ids = _build_project_detail_card(
            chat_id,
            named_match["name"],
            named_match["detail_project"],
        )
        sent = _hermes_send_card(chat_id, card)
        if isinstance(sent, str):
            _attach_card_message_id(action_ids, sent)
        if sent:
            return tool_result(f"项目详情已发送：{named_match['name']}")
        return tool_error(f"项目详情已生成：{named_match['name']}，但发送到群聊失败。请检查 Feishu 连接。")

    # Build dashboard card
    had_projects_before_filter = bool(projects)
    member_filters = _member_filters_from_query(query, projects)
    projects = [p for p in projects if _project_matches_status_filter(p, status_filter)]
    if member_filters:
        projects = [
            p for p in projects
            if any(member in set(_project_member_names(p)) for member in member_filters)
        ]
    total_projects = len(projects)
    page = 1
    total_pages = 1

    if not projects:
        if had_projects_before_filter and status_filter:
            projects.append({"name": "暂无匹配项目", "source": "可以调整筛选条件", "actionable": False})
        else:
            projects.append({"name": "暂无项目记录", "source": "请先创建项目", "actionable": False})
    else:
        page_size = max(1, _DASHBOARD_PAGE_SIZE)
        total_pages = max(1, (total_projects + page_size - 1) // page_size)
        page = min(_dashboard_page_from_query(query), total_pages)
        start = (page - 1) * page_size
        projects = projects[start:start + page_size]

    card_elements = []
    action_ids = []
    for p in projects:
        card_elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"📌 **{p['name']}** — {p['source']}",
            },
        })
        if chat_id and p.get("actionable"):
            status_action_id = _create_card_action_ref(chat_id, "project_status", {"title": p["name"]})
            if p.get("status") == "有风险":
                next_action = "resolve_risk"
                next_text = "解除风险"
                next_type = "primary"
            else:
                next_action = "reopen_project" if p.get("status") == "已完成" or _is_archived_status(p.get("status", "")) else "mark_project_done"
                next_text = "重新打开" if next_action == "reopen_project" else "标记完成"
                next_type = "default" if next_action == "reopen_project" else "primary"
            next_action_id = _create_card_action_ref(chat_id, next_action, {"title": p["name"]})
            action_ids.extend([status_action_id, next_action_id])
            reminder_action = None
            if status_filter in ("overdue", "due_soon"):
                reminder_action = _create_card_action_ref(chat_id, "send_project_reminder", {"title": p["name"]})
                action_ids.append(reminder_action)
            actions = [
                {
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": "查看状态"},
                    "type": "default",
                    "value": {"pilotflow_action_id": status_action_id},
                },
                {
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": next_text},
                    "type": next_type,
                    "value": {"pilotflow_action_id": next_action_id},
                },
            ]
            if reminder_action:
                actions.append({
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": "发送提醒"},
                    "type": "primary",
                    "value": {"pilotflow_action_id": reminder_action},
                })
            card_elements.append({
                "tag": "action",
                "actions": actions,
            })

    if chat_id and total_pages > 1:
        nav_actions = []
        if page > 1:
            prev_query = _dashboard_query_for_page(query, page - 1)
            prev_action_id = _create_card_action_ref(chat_id, "dashboard_page", {"query": prev_query, "page": page - 1})
            action_ids.append(prev_action_id)
            nav_actions.append({
                "tag": "button",
                "text": {"tag": "plain_text", "content": "上一页"},
                "type": "default",
                "value": {"pilotflow_action_id": prev_action_id},
            })
        if page < total_pages:
            next_query = _dashboard_query_for_page(query, page + 1)
            next_action_id = _create_card_action_ref(chat_id, "dashboard_page", {"query": next_query, "page": page + 1})
            action_ids.append(next_action_id)
            nav_actions.append({
                "tag": "button",
                "text": {"tag": "plain_text", "content": "下一页"},
                "type": "primary",
                "value": {"pilotflow_action_id": next_action_id},
            })
        if nav_actions:
            card_elements.append({
                "tag": "action",
                "actions": nav_actions,
            })

    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": "📊 项目看板"},
            "template": _dashboard_header_template(status_filter),
        },
        "elements": card_elements + [
            {"tag": "hr"},
            {
                "tag": "note",
                "elements": [
                    {"tag": "plain_text", "content": f"查询: {_display_query_text(query)} | 第 {page}/{total_pages} 页 | 共 {total_projects if total_projects else len(projects)} 个项目"},
                ],
            },
        ],
    }

    sent = _hermes_send_card(chat_id, card) if chat_id else False
    if isinstance(sent, str):
        _attach_card_message_id(action_ids, sent)
    if sent:
        return tool_result(f"项目看板已发送，共 {total_projects if total_projects else len(projects)} 个项目，第 {page}/{total_pages} 页")
    return tool_error(f"项目看板已生成，共 {total_projects if total_projects else len(projects)} 个项目，但发送到群聊失败。请检查 Feishu 连接。")


# ---------------------------------------------------------------------------
# Bitable update helper
# ---------------------------------------------------------------------------

def _append_bitable_update_record(app_token: str, table_id: str, action_label: str, value: str, project: dict) -> bool:
    """Append an update history row to the project Bitable when possible."""
    client = _get_client()
    if not client or not app_token or not table_id:
        return False
    try:
        from lark_oapi.api.bitable.v1 import CreateAppTableRecordRequest, AppTableRecord

        fields = {
            "类型": "update",
            "负责人": ", ".join(project.get("members", [])) or "待确认",
            "截止时间": project.get("deadline") or "待确认",
            "状态": project.get("status", "进行中"),
            "风险等级": "低",
            "交付物": ", ".join(project.get("deliverables", [])) or "待确认",
            "更新内容": f"{action_label} → {value}",
        }
        record = AppTableRecord.builder().fields(fields).build()
        resp = client.bitable.v1.app_table_record.create(
            CreateAppTableRecordRequest.builder().app_token(app_token).table_id(table_id).request_body(record).build()
        )
        if resp.success():
            logger.info("bitable update history appended: %s", action_label)
            return True
        logger.warning("append bitable update history failed: %s", resp.msg)
        return False
    except Exception as e:
        logger.warning("append bitable update history error: %s", e)
        return False


def _update_bitable_record(app_token: str, table_id: str, record_id: str, fields: dict) -> bool:
    """Update a bitable record with new field values."""
    client = _get_client()
    if not client or not app_token or not table_id or not record_id:
        return False
    try:
        from lark_oapi.api.bitable.v1 import UpdateAppTableRecordRequest, AppTableRecord
        record = AppTableRecord.builder().fields(fields).build()
        req = (
            UpdateAppTableRecordRequest.builder()
            .app_token(app_token).table_id(table_id).record_id(record_id)
            .request_body(record).build()
        )
        resp = client.bitable.v1.app_table_record.update(req)
        if resp.success():
            logger.info("bitable record updated: %s %s", record_id, fields)
            return True
        else:
            logger.warning("update bitable record failed: %s", resp.msg)
            return False
    except Exception as e:
        logger.warning("update bitable record error: %s", e)
        return False


# ---------------------------------------------------------------------------
# Tool: pilotflow_update_project
# ---------------------------------------------------------------------------

def _risk_level_from_text(text: str) -> str:
    """Infer a simple Feishu status-table risk level from Chinese risk text."""
    value = text or ""
    if any(word in value for word in ("高", "严重", "阻塞", "卡住", "无法", "延期")):
        return "高"
    if any(word in value for word in ("低", "轻微", "可控")):
        return "低"
    return "中"


def _parse_deliverable_assignment(value: str, members: list[str]) -> tuple[str, str]:
    """Parse 'member: deliverable' only when the prefix is a known project member."""
    text = str(value or "").strip()
    match = re.match(r"^\s*([^:：]+)\s*[:：]\s*(.+)$", text)
    if not match:
        return text, ""
    assignee = match.group(1).strip()
    at_match = _AT_PATTERN.fullmatch(assignee)
    if at_match:
        assignee = at_match.group(2).strip()
    deliverable = match.group(2).strip()
    if assignee and deliverable and assignee in set(members or []):
        return deliverable, assignee
    return text, ""


def _clean_member_update_value(value: str) -> str:
    """Convert a Feishu @mention used as an add_member value into a plain name."""
    text = str(value or "").strip()
    at_match = _AT_PATTERN.fullmatch(text)
    if at_match:
        return at_match.group(2).strip()
    return text


PILOTFLOW_UPDATE_PROJECT_SCHEMA = {
    "name": "pilotflow_update_project",
    "description": (
        "更新已有项目信息。当用户说「改截止时间」「加成员」「新增任务」「新增交付物」「记录进展」「项目有新进展」「项目有风险」「项目卡住了」「风险解除」「阻塞已解决」「改项目状态」「归档项目」「延期」「延期到」时调用。\n"
        "支持七种操作：update_deadline（改截止时间）、add_member（加成员）、add_deliverable（新增交付物/任务）、add_progress（记录进展）、add_risk（上报风险/阻塞）、resolve_risk（解除风险/阻塞）、update_status（改状态）。\n"
        "归档项目时使用 action=update_status 且 value=已归档；归档后默认看板会隐藏该项目。\n"
        "会更新内存注册表、脱敏本地状态；可定位状态表时同步多维表格，新增交付物时会尽量创建飞书任务。\n\n"
        "【输出规则】只用中文回复更新结果，不要展示工具名称或英文内容。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project_name": {"type": "string", "description": "项目名称。"},
            "action": {
                "type": "string",
                "enum": ["update_deadline", "add_member", "add_deliverable", "add_progress", "add_risk", "resolve_risk", "update_status"],
                "description": "操作类型。",
            },
            "value": {"type": "string", "description": "新值（新截止时间、新成员名、新交付物/任务、新状态）。"},
        },
        "required": ["project_name", "action", "value"],
    },
}


def _handle_update_project(params: Dict[str, Any], **kwargs) -> str:
    """Update a project: modify registry, update bitable, send notification."""
    project_name = params.get("project_name", "")
    action = params.get("action", "")
    value = params.get("value", "")
    chat_id = _get_chat_id(kwargs)

    if not project_name:
        return tool_error("请指定项目名称")
    if not action or not value:
        return tool_error("请指定操作类型和新值")
    if action == "add_member":
        value = _clean_member_update_value(value)

    # Look up project in registry (fuzzy match: project_name is substring of registry key)
    with _project_registry_lock:
        project = _project_registry.get(project_name)
        if not project:
            for title, info in _project_registry.items():
                if project_name in title or title in project_name:
                    project = info
                    project_name = title
                    break

    state_project = None
    if not project:
        state_project = _find_project_state(project_name)
        if not state_project:
            return tool_error(f"项目「{project_name}」未找到。请先创建项目后再更新。")
        if action == "add_member":
            return tool_error("重启后的脱敏状态不保存成员名单。请在项目创建会话内加成员，或重新指定完整项目成员。")
        project_name = state_project.get("title", project_name)
        project = {
            "goal": state_project.get("goal", ""),
            "members": [],
            "deliverables": state_project.get("deliverables", []),
            "deadline": state_project.get("deadline", ""),
            "status": state_project.get("status", "进行中"),
            "artifacts": [],
            "app_token": "",
            "table_id": "",
            "record_id": "",
        }

    assignee_override = ""
    if action == "add_deliverable":
        value, assignee_override = _parse_deliverable_assignment(value, project.get("members", []))

    action_labels = {
        "update_deadline": "截止时间",
        "add_member": "成员",
        "add_deliverable": "交付物",
        "add_progress": "进展",
        "add_risk": "风险",
        "resolve_risk": "风险解除",
        "update_status": "状态",
    }
    action_label = action_labels.get(action, action)
    risk_level = _risk_level_from_text(value) if action == "add_risk" else ("低" if action == "resolve_risk" else "")

    bitable_updated = False
    bitable_history_created = False
    registry_updated = False
    state_updated = False
    task_created = False
    doc_updated = False
    permission_refreshed = False
    calendar_event_created = False
    reminder_scheduled = False

    # 1. Update in-memory registry
    if project:
        if state_project:
            if action == "update_deadline":
                project["deadline"] = value
            elif action == "add_deliverable":
                if value not in project["deliverables"]:
                    project["deliverables"].append(value)
            elif action == "update_status":
                project["status"] = value
            elif action == "add_risk":
                project["status"] = "有风险"
            elif action == "resolve_risk":
                project["status"] = "进行中"
        else:
            with _project_registry_lock:
                if action == "update_deadline":
                    project["deadline"] = value
                    registry_updated = True
                elif action == "add_member":
                    if value not in project["members"]:
                        project["members"].append(value)
                    registry_updated = True
                elif action == "add_deliverable":
                    if value not in project["deliverables"]:
                        project["deliverables"].append(value)
                    registry_updated = True
                elif action == "update_status":
                    project["status"] = value
                    registry_updated = True
                elif action == "add_risk":
                    project["status"] = "有风险"
                    registry_updated = True
                elif action == "resolve_risk":
                    project["status"] = "进行中"
                    registry_updated = True

            if action == "add_deliverable" and chat_id:
                assignee = assignee_override or (project.get("members", [""])[0] if project.get("members") else "")
                task_name = _create_task(
                    value, f"项目: {project_name}", assignee,
                    project.get("deadline", ""), chat_id,
                )
                if task_name:
                    project.setdefault("artifacts", []).append(f"任务: {task_name}")
                    task_created = True

        if action in ("update_deadline", "add_deliverable", "add_progress", "add_risk", "resolve_risk", "update_status"):
            state_updated = _save_project_state(
                project_name, project.get("goal", ""), project.get("members", []),
                project.get("deliverables", []), project.get("deadline", ""),
                project.get("status", "进行中"), project.get("artifacts", []),
            )
            if not state_project:
                doc_updated = _append_project_doc_update(project_name, project, action_label, value)

        # 2. Update bitable record
        bitable_fields = {}
        if action == "update_deadline":
            bitable_fields["截止时间"] = value
        elif action == "add_member":
            current = ", ".join(project.get("members", []))
            bitable_fields["负责人"] = current
        elif action == "add_deliverable":
            bitable_fields["交付物"] = ", ".join(project.get("deliverables", [])) or "待确认"
        elif action == "add_risk":
            bitable_fields["状态"] = "有风险"
            bitable_fields["风险等级"] = risk_level
        elif action == "resolve_risk":
            bitable_fields["状态"] = "进行中"
            bitable_fields["风险等级"] = risk_level
        elif action == "update_status":
            bitable_fields["状态"] = value

        if bitable_fields and project.get("app_token"):
            bitable_updated = _update_bitable_record(
                project["app_token"], project["table_id"], project["record_id"],
                bitable_fields,
            )
        if project.get("app_token") and project.get("table_id"):
            bitable_history_created = _append_bitable_update_record(
                project["app_token"], project["table_id"], action_label, value, project,
            )
        if action == "add_member" and chat_id and not state_project:
            permission_refreshed = _refresh_project_resource_permissions(project, chat_id)
        if action == "update_deadline" and chat_id:
            cal_result = _create_calendar_event(project_name, project.get("goal", ""), value)
            calendar_event_created = bool(cal_result)
            reminder_scheduled = _schedule_deadline_reminder(project_name, value, chat_id)

    # 3. Send notification via Hermes
    if chat_id:
        member_at = _format_at(value, chat_id) if action == "add_member" else value
        parts = [f"📝 项目更新: {project_name}", f"{action_label} → {member_at}"]
        if action == "add_deliverable" and assignee_override:
            parts.append(f"负责人 → {_format_at(assignee_override, chat_id)}")
        # Add countdown for deadline updates
        if action == "update_deadline":
            cd = _deadline_countdown(value)
            if cd:
                parts.append(cd)
        if action == "add_risk":
            parts.append("✅ 状态已切换为有风险")
        if action == "resolve_risk":
            parts.append("✅ 状态已恢复为进行中")
        if task_created:
            parts.append("✅ 飞书任务已创建")
        if doc_updated:
            parts.append("✅ 项目文档已更新")
        if permission_refreshed:
            parts.append("✅ 项目资源权限已刷新")
        if calendar_event_created:
            parts.append("✅ 日历事件已更新")
        if reminder_scheduled:
            parts.append("✅ 截止提醒已设置")
        if bitable_updated:
            parts.append("✅ 状态表已同步")
        if bitable_history_created:
            parts.append("✅ 状态表记录已追加")
        elif state_updated:
            parts.append("✅ 本地状态已更新")
        elif project and not bitable_updated:
            parts.append("⚠️ 状态表同步失败")
        msg = "\n".join(parts)
        _hermes_send(chat_id, msg)

    return tool_result({
        "status": "project_updated",
        "project": project_name,
        "action": action,
        "value": value,
        "assignee": assignee_override,
        "risk_level": risk_level,
        "registry_updated": registry_updated,
        "state_updated": state_updated,
        "bitable_updated": bitable_updated,
        "bitable_history_created": bitable_history_created,
        "task_created": task_created,
        "doc_updated": doc_updated,
        "permission_refreshed": permission_refreshed,
        "calendar_event_created": calendar_event_created,
        "reminder_scheduled": reminder_scheduled,
        "instructions": (
            f"用中文回复：已更新项目「{project_name}」的{action_label}为 {value}。"
            + ("飞书任务已创建。" if task_created else "")
            + ("项目文档已更新。" if doc_updated else "")
            + ("项目资源权限已刷新。" if permission_refreshed else "")
            + ("日历事件已更新。" if calendar_event_created else "")
            + ("截止提醒已设置。" if reminder_scheduled else "")
            + ("状态表已同步。" if bitable_updated else "本地状态已更新。" if state_updated else "")
            + ("状态表记录已追加。" if bitable_history_created else "")
            + "不要显示工具名或英文。"
        ),
    })
