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

def _hermes_send(chat_id: str, text: str) -> bool:
    """Send a message via Hermes's send_message tool.

    registry.dispatch returns JSON: {"error": "..."} on failure, or the
    handler's raw return string on success.
    """
    result = registry.dispatch("send_message", {
        "action": "send",
        "target": f"feishu:{chat_id}",
        "message": text,
    })
    try:
        data = json.loads(result)
        if isinstance(data, dict) and "error" in data:
            logger.warning("hermes send error: %s", data["error"])
            return False
        return True
    except (json.JSONDecodeError, TypeError):
        return isinstance(result, str) and bool(result)


def _hermes_send_card(chat_id: str, card_json: dict) -> bool:
    """Send an interactive card via Hermes's send_message tool."""
    result = registry.dispatch("send_message", {
        "action": "send",
        "target": f"feishu:{chat_id}",
        "message": json.dumps(card_json, ensure_ascii=False),
        "msg_type": "interactive",
    })
    try:
        data = json.loads(result)
        if isinstance(data, dict) and "error" in data:
            logger.warning("hermes send card error: %s", data["error"])
            return False
        return True
    except (json.JSONDecodeError, TypeError):
        return isinstance(result, str) and bool(result)


def _save_to_hermes_memory(title: str, goal: str, members: list, deliverables: list, deadline: str):
    """Save project creation pattern to Hermes memory for future suggestions."""
    try:
        member_str = ", ".join(members) if members else "none"
        deliverable_str = ", ".join(deliverables) if deliverables else "none"
        content = (
            f"[Project Created] {title}: goal={goal}, members=[{member_str}], "
            f"deliverables=[{deliverable_str}], deadline={deadline or 'none'}"
        )
        registry.dispatch("memory", {
            "action": "add",
            "target": "memory",
            "content": content,
        })
        logger.info("saved project pattern to hermes memory: %s", title)
    except Exception as e:
        logger.debug("memory save skipped: %s", e)


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
        "【创建项目的第一步 — 必须首先调用】当用户在群里 @机器人 并提到项目、答辩、任务、计划、"
        "创建、准备等关键词时，必须先调用此工具。此工具会：\n"
        "1. 设置确认门控（允许后续调用 create_project_space）\n"
        "2. 检测项目模板（答辩/sprint/活动/上线）并提供建议\n"
        "3. 返回结构化指令，指导你从用户消息中提取：项目标题、目标、成员、交付物、截止时间\n\n"
        "调用后，你必须：\n"
        "- 向用户展示提取到的项目信息（中文）\n"
        "- 询问「确认执行？」\n"
        "- 等用户明确回复「确认」「可以」「好的」「行」「ok」后，才能调用 pilotflow_create_project_space"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "input_text": {"type": "string", "description": "用户的原始输入文本，包含项目描述。"},
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
        if keyword in text.lower():
            return template
    return None


def _handle_generate_plan(params: Dict[str, Any], **kwargs) -> str:
    """Parse user input and return a structured project plan with pre-populated scaffold."""
    chat_id = _get_chat_id(kwargs)
    if chat_id:
        _set_plan_gate(chat_id)

    text = params.get("input_text", "")
    template = _detect_template(text)

    # Build pre-populated plan scaffold from template
    import datetime
    plan = {"title": "", "goal": "", "members": [], "deliverables": [], "deadline": "", "risks": []}
    if template:
        plan["deliverables"] = list(template["deliverables"])
        suggested = datetime.date.today() + datetime.timedelta(days=template["suggested_deadline_days"])
        plan["deadline"] = suggested.strftime("%Y-%m-%d")

    # Store pending plan for validation in create_project_space
    if chat_id:
        with _plan_lock:
            _pending_plans[chat_id] = {"input": text, "template": template["description"] if template else None}

    template_hint = ""
    if template:
        template_hint = (
            f"\n\n【模板建议】检测到「{text}」可能适用模板：\n"
            f"- 建议交付物：{', '.join(template['deliverables'])}\n"
            f"- 建议截止时间：{plan['deadline']}（{template['suggested_deadline_days']}天后）\n"
            f"如果用户没有指定，请使用以上建议。"
        )

    return tool_result(json.dumps({
        "status": "plan_generated",
        "input": text,
        "template": template["description"] if template else None,
        "plan": plan,
        "instructions": (
            "请从输入中提取项目信息，填入 plan 对象的各字段。\n"
            "- title: 项目标题\n- goal: 项目目标\n"
            "- members: 成员列表（中文名）\n"
            "- deliverables: 交付物列表\n- deadline: 截止时间（YYYY-MM-DD格式）\n\n"
            "提取后向用户展示计划，问「确认执行？」。"
            "用户确认后调用 pilotflow_create_project_space，传入 plan 中的所有字段。\n\n"
            "【输出规则 - 必须遵守】\n"
            "1. 绝对不要向用户展示工具名称或英文内容\n"
            "2. 只回复中文，不要显示工具调用过程\n"
            "3. 执行完成后回复结果摘要：已创建 + 产物链接"
            f"{template_hint}"
        ),
    }, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Tool: pilotflow_detect_risks
# ---------------------------------------------------------------------------

PILOTFLOW_DETECT_RISKS_SCHEMA = {
    "name": "pilotflow_detect_risks",
    "description": (
        "检测项目计划中的潜在风险。检查：成员是否为空、交付物是否为空、截止时间是否明确。"
        "返回风险列表和处理建议。在展示计划给用户时可以调用此工具进行风险预检。"
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
    return tool_result(json.dumps({
        "risks_found": len(risks), "risks": risks,
        "instructions": "请将以上风险发送到群里，让用户确认处理方式。",
    }, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Tool: pilotflow_create_project_space
# ---------------------------------------------------------------------------

PILOTFLOW_CREATE_PROJECT_SPACE_SCHEMA = {
    "name": "pilotflow_create_project_space",
    "description": (
        "【必须在用户确认后调用】一键创建飞书项目空间，包含以下产物：\n"
        "1. 飞书文档（格式化 markdown + @提及成员 + 自动开链接权限 + 给成员加编辑权）\n"
        "2. 多维表格（项目状态台账 + 记录 + 自动开权限）\n"
        "3. 飞书任务（每个交付物一个任务）\n"
        "4. 群入口消息（@成员 + 文档/表格/截止时间链接）\n"
        "5. 日历事件（截止时间提醒）\n\n"
        "前置条件：必须先调用 pilotflow_generate_plan 并等用户回复「确认」。"
        "如果用户没确认就调用，会返回错误。"
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

    # 3. Create tasks (lark_oapi)
    # 3. Create tasks (lark_oapi) — with assignee + deadline
    if deliverables:
        for i, d in enumerate(deliverables[:3]):
            assignee = members[i % len(members)] if members else ""
            task_name = _create_task(d, f"项目: {title}", assignee, deadline, chat_id)
            if task_name:
                artifacts.append(f"任务: {task_name}")

    # 4. Send entry message (via Hermes) — @mention members
    entry_text = f"📌 项目入口: {title}\n🎯 目标: {goal}"
    if members:
        entry_text += f"\n👥 成员: {member_display}"
    if deadline:
        entry_text += f"\n⏰ 截止: {deadline}"
    if doc_url:
        entry_text += f"\n📄 文档: {doc_url}"
    if bitable_url:
        entry_text += f"\n📊 状态: {bitable_url}"
    if _hermes_send(chat_id, entry_text):
        artifacts.append("项目入口消息")

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

    # Save project pattern to Hermes memory (越用越聪明)
    _save_to_hermes_memory(title, goal, members, deliverables, deadline)

    # Clean up pending plan
    with _plan_lock:
        _pending_plans.pop(chat_id, None)

    return tool_result(json.dumps({
        "status": "project_space_created",
        "title": title,
        "artifacts": artifacts,
        "instructions": (
            "用中文回复结果摘要（不要显示工具名或英文）：\n"
            "✅ 项目空间已创建\n"
            "📄 文档：（链接）\n📊 状态表：（链接）\n"
            "📋 任务：xxx、xxx\n💬 已通知群成员"
        ),
        "message": f"已创建 {len(artifacts)} 个产物: {', '.join(artifacts)}",
    }, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Tool: pilotflow_send_summary
# ---------------------------------------------------------------------------

PILOTFLOW_SEND_SUMMARY_SCHEMA = {
    "name": "pilotflow_send_summary",
    "description": (
        "向飞书群发送项目执行总结消息。包含已创建的产物列表和项目状态。"
        "通常在 pilotflow_create_project_space 之后调用，发送一条汇总消息到群聊。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "项目标题。"},
            "artifacts": {"type": "array", "items": {"type": "string"}, "description": "已创建的产物列表。"},
            "status": {"type": "string", "description": "项目状态，默认 completed。"},
        },
        "required": ["title", "artifacts"],
    },
}


def _handle_send_summary(params: Dict[str, Any], **kwargs) -> str:
    """Send a delivery summary via Hermes."""
    title = params.get("title", "")
    artifacts = params.get("artifacts", [])
    status = params.get("status", "completed")

    chat_id = _get_chat_id(kwargs)
    if not chat_id:
        return tool_error("无法获取群聊 ID")

    summary = f"✅ {title} — 执行完成\n\n已创建产物:\n"
    for a in artifacts:
        summary += f"  • {a}\n"
    summary += f"\n状态: {status}"

    if not _hermes_send(chat_id, summary):
        return tool_error("发送总结失败")
    return tool_result(f"已发送项目总结到群聊: {title}")


# ---------------------------------------------------------------------------
# Tool: pilotflow_query_status
# ---------------------------------------------------------------------------

PILOTFLOW_QUERY_STATUS_SCHEMA = {
    "name": "pilotflow_query_status",
    "description": (
        "查询项目状态并向群聊发送看板卡片。当用户问「项目进展如何」「有哪些项目」「项目状态」时调用。"
        "会查询本会话中创建过的项目，构建项目看板卡片发送到群聊。"
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
            projects.append({
                "name": title,
                "source": f"成员: {member_str} | 截止: {deadline} | {status}",
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

    summary = "📊 项目看板\n\n"
    for p in projects:
        summary += f"  • {p['name']} ({p['source']})\n"

    return tool_result(summary)


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
        "发送项目更新通知到群聊。当用户说「改截止时间」「加成员」「改项目状态」时调用。"
        "会向群聊发送一条更新通知消息，@提及相关成员。"
        "支持三种操作：update_deadline（改截止时间）、add_member（加成员）、update_status（改状态）。"
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
        if bitable_updated:
            parts.append("✅ 状态表已同步")
        elif project and not bitable_updated:
            parts.append("⚠️ 状态表同步失败")
        msg = "\n".join(parts)
        _hermes_send(chat_id, msg)

    return tool_result(json.dumps({
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
    }, ensure_ascii=False))
