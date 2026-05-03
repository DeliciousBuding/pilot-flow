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
from typing import Any, Dict, List, Optional

from tools.registry import registry, tool_error, tool_result

logger = logging.getLogger(__name__)

# Feishu app credentials — read from env
APP_ID = os.environ.get("FEISHU_APP_ID", "")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")
MEMORY_ENABLED = os.environ.get("PILOTFLOW_MEMORY_ENABLED", "true").lower() not in ("0", "false", "no")
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

# Pending plans (populated by generate_plan, validated by create_project_space)
_pending_plans: Dict[str, dict] = {}  # chat_id -> plan params

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


def _register_project(title: str, members: list, deadline: str, status: str, artifacts: list,
                      app_token: str = "", table_id: str = "", record_id: str = ""):
    """Register a project in the in-memory registry for query_status and update_project."""
    with _project_registry_lock:
        if len(_project_registry) >= _PROJECT_REGISTRY_MAX:
            oldest = min(_project_registry, key=lambda k: _project_registry[k].get("created_at", 0))
            del _project_registry[oldest]
        _project_registry[title] = {
            "members": list(members),
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
    """Send an interactive card via Hermes's send_message tool."""
    result = registry.dispatch("send_message", {
        "action": "send",
        "target": f"feishu:{chat_id}",
        "message": json.dumps(card_json, ensure_ascii=False),
        "msg_type": "interactive",
    })
    ok = _hermes_ok(result)
    if not ok:
        logger.warning("hermes send card error: %s", result)
    return ok


def _save_to_hermes_memory(title: str, goal: str, members: list, deliverables: list, deadline: str):
    """Save project creation pattern to Hermes memory for future suggestions."""
    if not MEMORY_ENABLED:
        return
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
        registry.dispatch("memory", {
            "action": "add",
            "target": "memory",
            "content": content,
        })
        logger.info("已保存项目模式到 Hermes memory: %s", title)
    except Exception as e:
        logger.debug("memory save skipped: %s", e)


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
        logger.info("deadline reminder scheduled: %s at %s", title, schedule)
        return True
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


def _create_bitable(title: str, owner: str, deadline: str, risks: list, chat_id: str) -> Optional[dict]:
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

        for fname in ["类型", "负责人", "截止时间", "状态", "风险等级"]:
            field = AppTableField.builder().field_name(fname).type(1).build()
            field_resp = client.bitable.v1.app_table_field.create(
                CreateAppTableFieldRequest.builder().app_token(app_token).table_id(table_id).request_body(field).build()
            )
            if not field_resp.success():
                logger.warning("create bitable field '%s' failed: %s", fname, field_resp.msg)

        record = AppTableRecord.builder().fields({
            "类型": "project", "负责人": owner or "TBD", "截止时间": deadline or "TBD",
            "状态": "进行中", "风险等级": "高" if risks else "低",
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


def _create_calendar_event(title: str, goal: str, deadline: str) -> Optional[str]:
    """Create a calendar event for the project deadline. Returns description on success."""
    client = _get_client()
    if not client or not deadline:
        return None
    try:
        import datetime
        from lark_oapi.api.calendar.v4 import (
            CreateCalendarEventRequest, CalendarEvent, EventTime,
        )
        # Parse deadline as UTC+8 (China Standard Time) 9:00 AM
        dt = datetime.datetime.strptime(deadline, "%Y-%m-%d")
        dt = dt.replace(hour=9, tzinfo=datetime.timezone(datetime.timedelta(hours=8)))
        ts_start = str(int(dt.timestamp()))
        ts_end = str(int((dt + datetime.timedelta(hours=1)).timestamp()))
        start_time = EventTime.builder().time_stamp(ts_start).build()
        end_time = EventTime.builder().time_stamp(ts_end).build()
        event = (
            CalendarEvent.builder()
            .summary(f"📌 截止: {title}").description(goal)
            .start_event(start_time).end_event(end_time).build()
        )
        req = CreateCalendarEventRequest.builder().calendar_id("primary").request_body(event).build()
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
            "members": {"type": "array", "items": {"type": "string"}, "description": "成员列表（中文名，可为空数组）。"},
            "deliverables": {"type": "array", "items": {"type": "string"}, "description": "交付物列表（可为空数组，会被模板补全）。"},
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

    # Build plan from LLM-extracted fields + template defaults
    import datetime
    plan = {
        "title": params.get("title", "") or "",
        "goal": params.get("goal", "") or "",
        "members": list(params.get("members") or []),
        "deliverables": list(params.get("deliverables") or []),
        "deadline": params.get("deadline", "") or "",
        "risks": [],
    }
    # Template fills in gaps
    if template:
        if not plan["deliverables"]:
            plan["deliverables"] = list(template["deliverables"])
        if not plan["deadline"]:
            suggested = datetime.date.today() + datetime.timedelta(days=template["suggested_deadline_days"])
            plan["deadline"] = suggested.strftime("%Y-%m-%d")

    # Title fallback: use chat name + date if extraction failed
    if not plan["title"]:
        try:
            from gateway.session_context import get_session_env
            chat_name = get_session_env("HERMES_SESSION_CHAT_NAME", "") or "项目"
            plan["title"] = f"{chat_name} - {datetime.date.today().isoformat()}"
        except Exception:
            plan["title"] = f"项目 - {datetime.date.today().isoformat()}"

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
                    ),
                },
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "✅ 确认执行"},
                            "type": "primary",
                            "value": {"pilotflow_action": "confirm_project"},
                        },
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "❌ 取消"},
                            "type": "default",
                            "value": {"pilotflow_action": "cancel_project"},
                        },
                    ],
                },
            ],
        }
        _hermes_send_card(chat_id, card)

    template_hint = ""
    if template:
        template_hint = (
            f"\n\n【模板建议】检测到「{text}」可能适用模板：\n"
            f"- 建议交付物：{', '.join(template['deliverables'])}\n"
            f"- 建议截止时间：{plan['deadline']}（{template['suggested_deadline_days']}天后）\n"
            f"如果用户没有指定，请使用以上建议。"
        )

    return tool_result({
        "status": "plan_generated",
        "input": text,
        "template": template["description"] if template else None,
        "plan": plan,
        "card_sent": bool(chat_id),
        "instructions": (
            "✅ 已提取并存储项目信息（pending plan）。\n"
            "✅ 确认卡片已自动发送到群聊（包含计划摘要、✅确认/❌取消按钮）。\n\n"
            "【你的下一步】\n"
            "简短回复「已生成计划，请在卡片上确认」即可，不要重复展示完整计划内容（卡片里已有）。\n\n"
            "【用户确认路径】\n"
            "- 路径A: 用户点击卡片 ✅ 按钮 → 你会收到 /card button {pilotflow_action:\"confirm_project\"}\n"
            "  → 直接调用 pilotflow_handle_card_action，无需重新提取参数\n"
            "- 路径B: 用户文字回复「确认」「可以」「好的」「行」「ok」\n"
            "  → 调用 pilotflow_create_project_space（使用本次提取的 plan 字段）\n"
            "- 路径C: 用户点击 ❌ 或回复「取消」\n"
            "  → 调用 pilotflow_handle_card_action（action=cancel_project）\n\n"
            "【输出规则 - 必须遵守】\n"
            "1. 绝对不要向用户展示工具名称或英文内容\n"
            "2. 只回复中文，不要显示工具调用过程\n"
            "3. 不要说「正在调用xxx工具」"
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
    members = params.get("members", [])
    deliverables = params.get("deliverables", [])
    deadline = params.get("deadline", "")

    risks = []
    if not members:
        risks.append({"level": "high", "title": "未指定项目成员", "suggestion": "请确认至少一名负责人"})
    if not deliverables:
        risks.append({"level": "high", "title": "未指定交付物", "suggestion": "请明确具体交付物"})
    if not deadline or deadline in ("TBD", "待确认", ""):
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
            "members": {"type": "array", "items": {"type": "string"}, "description": "项目成员列表，写中文名，如[\"张三\", \"李四\"]。"},
            "deliverables": {"type": "array", "items": {"type": "string"}, "description": "交付物列表，如[\"项目简报\", \"PPT\"]。"},
            "deadline": {"type": "string", "description": "截止时间，格式 YYYY-MM-DD，如「2026-05-10」。"},
            "risks": {"type": "array", "items": {"type": "string"}, "description": "已知风险，如[\"时间紧张\"]。"},
        },
        "required": ["title", "goal", "members", "deliverables"],
    },
}


def _handle_create_project_space(params: Dict[str, Any], **kwargs) -> str:
    """Create a complete project space in Feishu."""
    chat_id = _get_chat_id(kwargs)
    if not chat_id:
        return tool_error("无法获取群聊 ID，请确认 PILOTFLOW_TEST_CHAT_ID 已配置。")

    if not _check_plan_gate(chat_id):
        return tool_error("请先调用 pilotflow_generate_plan 生成计划，展示给用户确认后再调用此工具。")
    _clear_plan_gate(chat_id)

    title = params.get("title", "项目")
    goal = params.get("goal", "")
    members = params.get("members", [])
    deliverables = params.get("deliverables", [])
    deadline = params.get("deadline", "")
    risks = params.get("risks", [])

    artifacts = []
    # Use plain names for bitable (no @mention markup)
    member_plain = _member_names_plain(members) if members else "TBD"
    # Use @mention format for docs and messages
    member_display = _format_members(members, chat_id) if members else "TBD"

    # 1. Create doc (lark_oapi) — with @mention in content
    doc_content = f"# {title}\n\n## 目标\n{goal}\n\n"
    if members:
        doc_content += f"## 成员\n{member_display}\n\n"
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
    bitable_meta = _create_bitable(title, member_plain, deadline, risks, chat_id)
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
    link_lines.append(f"⏰ 截止: {deadline or 'TBD'}")

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
                    + "\n".join(link_lines)
                ),
            },
        ],
    }
    if _hermes_send_card(chat_id, entry_card):
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
    )

    # Save project pattern to Hermes memory for later history-based suggestions.
    _save_to_hermes_memory(title, goal, members, deliverables, deadline)

    # Schedule deadline reminder via Hermes cron (if deadline is set)
    if deadline:
        reminder_job = _schedule_deadline_reminder(title, deadline, chat_id)
        if reminder_job:
            artifacts.append("截止提醒已设置")

    # Clean up pending plan
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
    if deliverables:
        display_items.append(f"📋 任务: {', '.join(deliverables)}")
    if deadline:
        display_items.append(f"⏰ 截止: {deadline}")
    if cal_result:
        display_items.append("📅 日历提醒已创建")
    if deadline:
        display_items.append("🔔 截止提醒已设置")
    display_items.append("💬 已通知群成员")

    return tool_result({
        "status": "project_space_created",
        "title": title,
        "artifacts": artifacts,
        "display": display_items,
        "instructions": (
            "用中文回复结果摘要（不要显示工具名或英文）。\n"
            "直接使用 display 列表逐行展示，或自行组织语言。"
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
        "- cancel_project: 清除确认门控和 pending plan，通知用户已取消\n\n"
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

    if pilotflow_action == "cancel_project":
        _clear_plan_gate(chat_id)
        with _plan_lock:
            _pending_plans.pop(chat_id, None)
        _hermes_send(chat_id, "已取消本次项目创建。")
        return tool_result({
            "status": "cancelled",
            "instructions": "回复用户：已取消。不要展示工具名或英文。",
        })

    if pilotflow_action == "confirm_project":
        if not _check_plan_gate(chat_id):
            return tool_error("确认超时，请重新发起项目创建。")

        # Recover plan from pending storage
        with _plan_lock:
            pending = _pending_plans.get(chat_id, {})
        recovered_plan = pending.get("plan", {})
        if not recovered_plan.get("title"):
            return tool_error("无法恢复项目信息，请重新用 pilotflow_generate_plan 生成计划。")

        # Feed recovered plan into create_project_space
        return _handle_create_project_space({
            "title": recovered_plan.get("title", ""),
            "goal": recovered_plan.get("goal", ""),
            "members": recovered_plan.get("members", []),
            "deliverables": recovered_plan.get("deliverables", []),
            "deadline": recovered_plan.get("deadline", ""),
            "risks": recovered_plan.get("risks", []),
        }, **kwargs)

    return tool_error(f"未知的卡片动作: {pilotflow_action}")


# ---------------------------------------------------------------------------
# Tool: pilotflow_query_status
# ---------------------------------------------------------------------------

PILOTFLOW_QUERY_STATUS_SCHEMA = {
    "name": "pilotflow_query_status",
    "description": (
        "查询项目状态并向群聊发送看板卡片。\n"
        "当用户问「项目进展如何」「有哪些项目」「项目状态」「看看进展」时调用。\n"
        "会查询本会话中创建过的项目，构建项目看板互动卡片发送到群聊。\n\n"
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

    projects = []

    # 1. Primary source: in-memory project registry (always works)
    with _project_registry_lock:
        for title, info in _project_registry.items():
            member_str = ", ".join(info.get("members", [])) or "TBD"
            deadline = info.get("deadline", "TBD")
            status = info.get("status", "进行中")
            # Deadline countdown with urgency indicators
            cd = _deadline_countdown(deadline)
            countdown = f" | {cd}" if cd else ""
            projects.append({
                "name": title,
                "source": f"成员: {member_str} | 截止: {deadline}{countdown} | {status}",
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
                        projects.append({"name": t.summary or "无标题", "source": "任务"})
            except Exception as e:
                logger.debug("task API fallback failed: %s", e)

    # Build dashboard card
    if not projects:
        projects.append({"name": "暂无项目记录", "source": "请先创建项目"})

    card_elements = []
    for p in projects:
        card_elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"📌 **{p['name']}** — {p['source']}",
            },
        })

    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": "📊 项目看板"},
            "template": "green",
        },
        "elements": card_elements + [
            {"tag": "hr"},
            {
                "tag": "note",
                "elements": [
                    {"tag": "plain_text", "content": f"查询: {query} | 共 {len(projects)} 个项目"},
                ],
            },
        ],
    }

    if chat_id:
        _hermes_send_card(chat_id, card)

    return tool_result(f"项目看板已发送，共 {len(projects)} 个项目")


# ---------------------------------------------------------------------------
# Bitable update helper
# ---------------------------------------------------------------------------

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

PILOTFLOW_UPDATE_PROJECT_SCHEMA = {
    "name": "pilotflow_update_project",
    "description": (
        "更新已有项目信息。当用户说「改截止时间」「加成员」「改项目状态」「延期」「延期到」时调用。\n"
        "支持三种操作：update_deadline（改截止时间）、add_member（加成员）、update_status（改状态）。\n"
        "会同时更新内存注册表和多维表格记录，并向群聊发送更新通知。\n\n"
        "【输出规则】只用中文回复更新结果，不要展示工具名称或英文内容。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project_name": {"type": "string", "description": "项目名称。"},
            "action": {
                "type": "string",
                "enum": ["update_deadline", "add_member", "update_status"],
                "description": "操作类型。",
            },
            "value": {"type": "string", "description": "新值（新截止时间、新成员名、新状态）。"},
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

    # Look up project in registry (fuzzy match: project_name is substring of registry key)
    with _project_registry_lock:
        project = _project_registry.get(project_name)
        if not project:
            for title, info in _project_registry.items():
                if project_name in title or title in project_name:
                    project = info
                    project_name = title
                    break

    if not project:
        return tool_error(f"项目「{project_name}」未找到。请先创建项目后再更新。")

    action_labels = {
        "update_deadline": "截止时间",
        "add_member": "成员",
        "update_status": "状态",
    }
    action_label = action_labels.get(action, action)

    bitable_updated = False
    registry_updated = False

    # 1. Update in-memory registry
    if project:
        with _project_registry_lock:
            if action == "update_deadline":
                project["deadline"] = value
                registry_updated = True
            elif action == "add_member":
                if value not in project["members"]:
                    project["members"].append(value)
                registry_updated = True
            elif action == "update_status":
                project["status"] = value
                registry_updated = True

        # 2. Update bitable record
        bitable_fields = {}
        if action == "update_deadline":
            bitable_fields["截止时间"] = value
        elif action == "add_member":
            current = ", ".join(project.get("members", []))
            bitable_fields["负责人"] = current
        elif action == "update_status":
            bitable_fields["状态"] = value

        if bitable_fields and project.get("app_token"):
            bitable_updated = _update_bitable_record(
                project["app_token"], project["table_id"], project["record_id"],
                bitable_fields,
            )

    # 3. Send notification via Hermes
    if chat_id:
        member_at = _format_at(value, chat_id) if action == "add_member" else value
        parts = [f"📝 项目更新: {project_name}", f"{action_label} → {member_at}"]
        # Add countdown for deadline updates
        if action == "update_deadline":
            cd = _deadline_countdown(value)
            if cd:
                parts.append(cd)
        if bitable_updated:
            parts.append("✅ 状态表已同步")
        elif project and not bitable_updated:
            parts.append("⚠️ 状态表同步失败")
        msg = "\n".join(parts)
        _hermes_send(chat_id, msg)

    return tool_result({
        "status": "project_updated",
        "project": project_name,
        "action": action,
        "value": value,
        "registry_updated": registry_updated,
        "bitable_updated": bitable_updated,
        "instructions": (
            f"用中文回复：已更新项目「{project_name}」的{action_label}为 {value}。"
            + ("状态表已同步。" if bitable_updated else "")
            + "不要显示工具名或英文。"
        ),
    })
