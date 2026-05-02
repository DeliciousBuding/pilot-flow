"""PilotFlow project management tools.

These tools provide project management workflow capabilities.
They use lark_oapi SDK for Feishu API operations.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from tools.registry import tool_error, tool_result

logger = logging.getLogger(__name__)

# Feishu app credentials — read from env, shared with Hermes gateway
APP_ID = os.environ.get("FEISHU_APP_ID", "")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")
CHAT_ID = os.environ.get("PILOTFLOW_TEST_CHAT_ID", "")

# Lazy-loaded lark client
_client = None

# Confirmation gate: tracks whether generate_plan was called
_plan_generated = False


def _get_client():
    """Get or create a lark_oapi client."""
    global _client
    if _client is not None:
        return _client
    try:
        import lark_oapi as lark
        from lark_oapi.core.const import FEISHU_DOMAIN
    except ImportError:
        return None

    app_id = APP_ID
    app_secret = APP_SECRET
    if not app_id or not app_secret:
        logger.warning("FEISHU_APP_ID / FEISHU_APP_SECRET not set")
        return None

    _client = (
        lark.Client.builder()
        .app_id(app_id)
        .app_secret(app_secret)
        .domain(FEISHU_DOMAIN)
        .log_level(lark.LogLevel.WARNING)
        .build()
    )
    return _client


def _check_available() -> bool:
    """Check if PilotFlow dependencies are available."""
    return _get_client() is not None


# ---------------------------------------------------------------------------
# @mention helpers
# ---------------------------------------------------------------------------

_member_cache: Dict[str, str] = {}  # name -> open_id


def _resolve_member(name: str) -> Optional[str]:
    """Resolve a display name to open_id via chat member list. Returns None if not found."""
    if name in _member_cache:
        return _member_cache[name]
    if not CHAT_ID:
        return None

    client = _get_client()
    if not client:
        return None

    try:
        from lark_oapi.api.im.v1 import GetChatMembersRequest

        req = (
            GetChatMembersRequest.builder()
            .chat_id(CHAT_ID)
            .member_id_type("open_id")
            .page_size(100)
            .build()
        )
        resp = client.im.v1.chat_members.get(req)
        if not resp.success():
            logger.warning("get chat members failed: %s", resp.msg)
            return None

        items = resp.data.items or []
        for m in items:
            mname = (m.name or "").strip()
            mid = m.member_id or ""
            if mname and mid:
                _member_cache[mname] = mid
        return _member_cache.get(name)
    except Exception as e:
        logger.warning("resolve member failed: %s", e)
        return None


def _format_at(name: str) -> str:
    """Format a name as a Feishu @mention tag if possible, else plain text."""
    open_id = _resolve_member(name)
    if open_id:
        return f'<at user_id="{open_id}">{name}</at>'
    return name


def _format_members(members: List[str]) -> str:
    """Format a list of member names with @mentions."""
    return ", ".join(_format_at(m) for m in members)


# ---------------------------------------------------------------------------
# Feishu API wrappers
# ---------------------------------------------------------------------------

import time


def _send_message(chat_id: str, text: str) -> bool:
    """Send a text message to a Feishu chat. Retries once on failure."""
    client = _get_client()
    if not client:
        return False
    try:
        from lark_oapi.api.im.v1 import (
            CreateMessageRequest,
            CreateMessageRequestBody,
        )

        body = (
            CreateMessageRequestBody.builder()
            .receive_id(chat_id)
            .msg_type("text")
            .content(json.dumps({"text": text}))
            .build()
        )
        req = (
            CreateMessageRequest.builder()
            .receive_id_type("chat_id")
            .request_body(body)
            .build()
        )
        for attempt in range(2):
            resp = client.im.v1.message.create(req)
            if resp.success():
                logger.info("message sent to %s", chat_id)
                return True
            logger.warning("send message attempt %d failed: %s", attempt + 1, resp.msg)
            if attempt == 0:
                time.sleep(1)
        return False
    except Exception as e:
        logger.warning("send message error: %s", e)
        return False


def _send_confirmation_card(chat_id: str, title: str, goal: str, members: list,
                            deliverables: list, deadline: str) -> bool:
    """Send an interactive confirmation card with a button."""
    client = _get_client()
    if not client:
        return False
    try:
        from lark_oapi.api.im.v1 import CreateMessageRequest, CreateMessageRequestBody

        member_text = ", ".join(members) if members else "TBD"
        deliverable_text = ", ".join(deliverables) if deliverables else "TBD"

        card = {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": "📋 执行计划"},
                "template": "blue",
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": (
                            f"**项目：** {title}\n"
                            f"**目标：** {goal}\n"
                            f"**成员：** {member_text}\n"
                            f"**交付物：** {deliverable_text}\n"
                            f"**截止时间：** {deadline or 'TBD'}"
                        ),
                    },
                },
                {"tag": "hr"},
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "✅ 确认执行"},
                            "type": "primary",
                            "value": {"action": "confirm_project", "title": title},
                        },
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "❌ 取消"},
                            "type": "default",
                            "value": {"action": "cancel_project"},
                        },
                    ],
                },
            ],
        }

        body = (
            CreateMessageRequestBody.builder()
            .receive_id(chat_id)
            .msg_type("interactive")
            .content(json.dumps(card, ensure_ascii=False))
            .build()
        )
        req = (
            CreateMessageRequest.builder()
            .receive_id_type("chat_id")
            .request_body(body)
            .build()
        )
        resp = client.im.v1.message.create(req)
        if resp.success():
            logger.info("confirmation card sent to %s", chat_id)
            return True
        logger.warning("send card failed: %s", resp.msg)
        return False
    except Exception as e:
        logger.warning("send card error: %s", e)
        return False


def _set_doc_permission(doc_id: str):
    """Set document permission: anyone with link can view."""
    client = _get_client()
    if not client:
        return
    try:
        from lark_oapi.api.drive.v1 import (
            PatchPermissionPublicRequest,
            PermissionPublicRequest,
        )

        body = (
            PermissionPublicRequest.builder()
            .link_share_entity("anyone_readable")
            .build()
        )
        req = (
            PatchPermissionPublicRequest.builder()
            .token(doc_id)
            .type("docx")
            .request_body(body)
            .build()
        )
        resp = client.drive.v1.permission_public.patch(req)
        if resp.success():
            logger.info("doc permission set: %s", doc_id)
        else:
            logger.warning("set doc permission failed: %s", resp.msg)
    except Exception as e:
        logger.warning("set doc permission error: %s", e)


def _create_doc(title: str, markdown_content: str) -> Optional[str]:
    """Create a Feishu document. Returns document URL or None."""
    client = _get_client()
    if not client:
        return None
    try:
        import lark_oapi as lark
        from lark_oapi.api.docx.v1 import (
            CreateDocumentRequest,
            CreateDocumentRequestBody,
        )

        body = (
            CreateDocumentRequestBody.builder()
            .title(title)
            .build()
        )
        req = (
            CreateDocumentRequest.builder()
            .request_body(body)
            .build()
        )
        resp = client.docx.v1.document.create(req)
        if resp.success():
            doc = resp.data.document
            doc_id = doc.document_id
            url = f"https://feishu.cn/docx/{doc_id}"
            logger.info("doc created: %s", url)

            # Write content blocks
            _write_doc_content(doc_id, markdown_content)
            # Set permission: anyone with link can view + chat members as editors
            _set_doc_permission(doc_id)
            _add_chat_members_as_editors(doc_id, "docx")
            return url
        logger.warning("create doc failed: %s", resp.msg)
        return None
    except Exception as e:
        logger.warning("create doc error: %s", e)
        return None


import re

_AT_PATTERN = re.compile(r'<at user_id="(ou_[^"]+)">([^<]+)</at>')


def _make_text_elements(text: str):
    """Create TextElement list, splitting <at> tags into mention_user elements."""
    from lark_oapi.api.docx.v1 import TextElement, TextRun, MentionUser

    parts = _AT_PATTERN.split(text)  # [before, uid, name, after, uid, name, ...]
    if len(parts) == 1:
        # No <at> tags
        return [TextElement.builder().text_run(TextRun.builder().content(text).build()).build()]

    elements = []
    i = 0
    while i < len(parts):
        if parts[i]:
            # Plain text segment
            elements.append(
                TextElement.builder().text_run(TextRun.builder().content(parts[i]).build()).build()
            )
        if i + 2 < len(parts):
            # <at user_id="parts[i+1]">parts[i+2]</at>
            user_id = parts[i + 1]
            mention = MentionUser.builder().user_id(user_id).build()
            elements.append(TextElement.builder().mention_user(mention).build())
            i += 3
        else:
            i += 1
    return elements


def _markdown_to_blocks(markdown: str):
    """Convert markdown text to a list of Feishu docx Block objects."""
    from lark_oapi.api.docx.v1 import Block, Text, TextElement, TextRun

    lines = markdown.split("\n")
    blocks = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Heading: # ## ###
        if stripped.startswith("### "):
            content = stripped[4:]
            heading = Text.builder().elements(_make_text_elements(content)).build()
            blocks.append(Block.builder().block_type(5).heading3(heading).build())
        elif stripped.startswith("## "):
            content = stripped[3:]
            heading = Text.builder().elements(_make_text_elements(content)).build()
            blocks.append(Block.builder().block_type(4).heading2(heading).build())
        elif stripped.startswith("# "):
            content = stripped[2:]
            heading = Text.builder().elements(_make_text_elements(content)).build()
            blocks.append(Block.builder().block_type(3).heading1(heading).build())
        # Bullet list: - or *
        elif stripped.startswith("- ") or stripped.startswith("* "):
            content = stripped[2:]
            bullet_text = Text.builder().elements(_make_text_elements(content)).build()
            blocks.append(Block.builder().block_type(12).bullet(bullet_text).build())
        # Ordered list: 1. 2. etc.
        elif len(stripped) > 2 and stripped[0].isdigit() and stripped.find(". ") > 0:
            idx = stripped.find(". ")
            content = stripped[idx + 2:]
            ordered_text = Text.builder().elements(_make_text_elements(content)).build()
            blocks.append(Block.builder().block_type(13).ordered(ordered_text).build())
        # Divider: ---
        elif stripped in ("---", "***", "___"):
            blocks.append(Block.builder().block_type(22).divider({}).build())
        # Normal text
        else:
            text = Text.builder().elements(_make_text_elements(stripped)).build()
            blocks.append(Block.builder().block_type(2).text(text).build())

    return blocks


def _write_doc_content(doc_id: str, markdown: str):
    """Write markdown content to a Feishu document with proper formatting."""
    client = _get_client()
    if not client:
        return
    try:
        from lark_oapi.api.docx.v1 import (
            CreateDocumentBlockChildrenRequest,
            CreateDocumentBlockChildrenRequestBody,
        )

        children = _markdown_to_blocks(markdown)
        if not children:
            return

        body = (
            CreateDocumentBlockChildrenRequestBody.builder()
            .children(children)
            .index(0)
            .build()
        )
        req = (
            CreateDocumentBlockChildrenRequest.builder()
            .document_id(doc_id)
            .block_id(doc_id)
            .request_body(body)
            .build()
        )
        resp = client.docx.v1.document_block_children.create(req)
        if not resp.success():
            logger.warning("write doc content failed: %s", resp.msg)
    except Exception as e:
        logger.warning("write doc content error: %s", e)


def _create_task(summary: str, description: str) -> bool:
    """Create a Feishu task. Retries once on failure."""
    client = _get_client()
    if not client:
        return False
    try:
        from lark_oapi.api.task.v2 import (
            CreateTaskRequest,
            InputTask,
        )

        task = (
            InputTask.builder()
            .summary(summary)
            .description(description)
            .build()
        )
        req = CreateTaskRequest.builder().request_body(task).build()
        for attempt in range(2):
            resp = client.task.v2.task.create(req)
            if resp.success():
                logger.info("task created: %s", summary)
                return True
            logger.warning("create task attempt %d failed: %s", attempt + 1, resp.msg)
            if attempt == 0:
                time.sleep(1)
        return False
    except Exception as e:
        logger.warning("create task error: %s", e)
        return False


def _create_bitable(title: str, owner: str, deadline: str, risks: list) -> Optional[str]:
    """Create a new Feishu Bitable with project status record. Returns URL or None."""
    client = _get_client()
    if not client:
        return None
    try:
        from lark_oapi.api.bitable.v1 import (
            CreateAppRequest,
            App,
            CreateAppTableRecordRequest,
            AppTableRecord,
            CreateAppTableFieldRequest,
            AppTableField,
        )

        # 1. Create bitable app
        app_body = App.builder().name(f"{title} - 项目状态").build()
        app_req = CreateAppRequest.builder().request_body(app_body).build()
        app_resp = client.bitable.v1.app.create(app_req)
        if not app_resp.success():
            logger.warning("create bitable failed: %s (code=%s)", app_resp.msg, app_resp.code)
            return None

        app_token = app_resp.data.app.app_token
        table_id = app_resp.data.app.default_table_id
        url = app_resp.data.app.url
        logger.info("bitable created: %s", url)

        # 2. Add fields to default table
        for fname in ["类型", "负责人", "截止时间", "状态", "风险等级"]:
            field = AppTableField.builder().field_name(fname).type(1).build()
            freq = (
                CreateAppTableFieldRequest.builder()
                .app_token(app_token)
                .table_id(table_id)
                .request_body(field)
                .build()
            )
            client.bitable.v1.app_table_field.create(freq)

        # 3. Write project record
        record_fields = {
            "类型": "project",
            "负责人": owner or "TBD",
            "截止时间": deadline or "TBD",
            "状态": "进行中",
            "风险等级": "高" if risks else "低",
        }
        record = AppTableRecord.builder().fields(record_fields).build()
        rec_req = (
            CreateAppTableRecordRequest.builder()
            .app_token(app_token)
            .table_id(table_id)
            .request_body(record)
            .build()
        )
        rec_resp = client.bitable.v1.app_table_record.create(rec_req)
        if rec_resp.success():
            logger.info("bitable record created")
        else:
            logger.warning("create bitable record failed: %s", rec_resp.msg)

        # 4. Set permission: anyone with link can view + chat members as editors
        _set_bitable_permission(app_token)
        _add_chat_members_as_editors(app_token, "bitable")

        return url
    except Exception as e:
        logger.warning("create bitable error: %s", e)
        return None


def _set_bitable_permission(app_token: str):
    """Set bitable permission: anyone with link can view."""
    client = _get_client()
    if not client:
        return
    try:
        from lark_oapi.api.drive.v1 import (
            PatchPermissionPublicRequest,
            PermissionPublicRequest,
        )

        body = (
            PermissionPublicRequest.builder()
            .link_share_entity("anyone_readable")
            .build()
        )
        req = (
            PatchPermissionPublicRequest.builder()
            .token(app_token)
            .type("bitable")
            .request_body(body)
            .build()
        )
        resp = client.drive.v1.permission_public.patch(req)
        if resp.success():
            logger.info("bitable permission set: %s", app_token)
        else:
            logger.warning("set bitable permission failed: %s", resp.msg)
    except Exception as e:
        logger.warning("set bitable permission error: %s", e)


def _add_chat_members_as_editors(token: str, doc_type: str):
    """Add all chat members as editors to a doc or bitable."""
    if not CHAT_ID:
        return
    client = _get_client()
    if not client:
        return
    try:
        from lark_oapi.api.drive.v1 import CreatePermissionMemberRequest, Member

        # Get chat members
        members = _get_chat_members()
        for m in members:
            member = (
                Member.builder()
                .member_type("openid")
                .member_id(m)
                .perm("full_access")
                .build()
            )
            req = (
                CreatePermissionMemberRequest.builder()
                .token(token)
                .type(doc_type)
                .need_notification(False)
                .request_body(member)
                .build()
            )
            resp = client.drive.v1.permission_member.create(req)
            if not resp.success():
                logger.debug("add editor %s failed: %s", m, resp.msg)
        logger.info("added %d editors to %s %s", len(members), doc_type, token)
    except Exception as e:
        logger.warning("add editors error: %s", e)


def _get_chat_members() -> list:
    """Get open_ids of all chat members."""
    if not CHAT_ID:
        return []
    client = _get_client()
    if not client:
        return []
    try:
        from lark_oapi.api.im.v1 import GetChatMembersRequest

        req = (
            GetChatMembersRequest.builder()
            .chat_id(CHAT_ID)
            .member_id_type("open_id")
            .page_size(100)
            .build()
        )
        resp = client.im.v1.chat_members.get(req)
        if resp.success():
            return [m.member_id for m in (resp.data.items or []) if m.member_id]
        return []
    except Exception:
        return []

PILOTFLOW_GENERATE_PLAN_SCHEMA = {
    "name": "生成项目计划",
    "description": (
        "从用户的自然语言输入中提取项目信息，生成结构化的项目执行计划。"
        "返回提取结果和确认门控指令。必须在用户确认后才能执行创建操作。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "input_text": {
                "type": "string",
                "description": "用户的原始输入文本。",
            },
        },
        "required": ["input_text"],
    },
}


def _handle_generate_plan(params: Dict[str, Any], **kwargs) -> str:
    """Parse user input and return a structured project plan."""
    global _plan_generated
    text = params.get("input_text", "")
    _plan_generated = True

    # Store plan data for the card (extracted by LLM from input)
    # The LLM should pass structured data, but we return instructions
    return tool_result(json.dumps({
        "status": "plan_generated",
        "input": text,
        "instructions": (
            "请从输入中提取项目信息，然后调用「创建项目空间」工具。\n\n"
            "【输出规则 - 必须遵守】\n"
            "1. 绝对不要向用户展示工具名称或英文内容\n"
            "2. 只回复中文摘要，不要显示工具调用过程\n"
            "3. 执行完成后回复结果摘要：✅ 已创建 + 产物链接"
        ),
    }, ensure_ascii=False))


# ---------------------------------------------------------------------------
# pilotflow_detect_risks
# ---------------------------------------------------------------------------

PILOTFLOW_DETECT_RISKS_SCHEMA = {
    "name": "检测项目风险",
    "description": (
        "检测项目计划中的潜在风险：负责人缺失、截止时间模糊、交付物不明确等。"
        "返回风险列表和建议处理方式。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "members": {
                "type": "array",
                "items": {"type": "string"},
                "description": "项目成员列表。",
            },
            "deliverables": {
                "type": "array",
                "items": {"type": "string"},
                "description": "交付物列表。",
            },
            "deadline": {
                "type": "string",
                "description": "截止时间。",
            },
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
        "risks_found": len(risks),
        "risks": risks,
        "instructions": "请将以上风险发送到群里，让用户确认处理方式。",
    }, ensure_ascii=False))


# ---------------------------------------------------------------------------
# pilotflow_create_project_space
# ---------------------------------------------------------------------------

PILOTFLOW_CREATE_PROJECT_SPACE_SCHEMA = {
    "name": "创建项目空间",
    "description": (
        "一键创建项目空间：飞书文档 + 多维表格记录 + 飞书任务 + 项目入口消息。"
        "成员名称会自动 @提及。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "项目标题。",
            },
            "goal": {
                "type": "string",
                "description": "项目目标。",
            },
            "members": {
                "type": "array",
                "items": {"type": "string"},
                "description": "项目成员。",
            },
            "deliverables": {
                "type": "array",
                "items": {"type": "string"},
                "description": "交付物列表。",
            },
            "deadline": {
                "type": "string",
                "description": "截止时间。",
            },
            "risks": {
                "type": "array",
                "items": {"type": "string"},
                "description": "已知风险。",
            },
        },
        "required": ["title", "goal"],
    },
}


def _handle_create_project_space(params: Dict[str, Any], **kwargs) -> str:
    """Create a complete project space in Feishu."""
    global _plan_generated
    if not _plan_generated:
        return tool_error(
            "请先调用「生成项目计划」工具，展示给用户确认后再调用此工具。"
            "直接执行会被拦截。"
        )
    _plan_generated = False  # Reset gate

    title = params.get("title", "项目")
    goal = params.get("goal", "")
    members = params.get("members", [])
    deliverables = params.get("deliverables", [])
    deadline = params.get("deadline", "")
    risks = params.get("risks", [])

    if not CHAT_ID:
        return tool_error("缺少 PILOTFLOW_TEST_CHAT_ID 环境变量")

    artifacts = []
    member_display = _format_members(members) if members else "TBD"

    # 0. Send confirmation card
    _send_confirmation_card(CHAT_ID, title, goal, members, deliverables, deadline)

    # 1. Create project doc
    doc_content = f"# {title}\n\n## 目标\n{goal}\n\n"
    if members:
        doc_content += f"## 成员\n{_format_members(members)}\n\n"
    if deliverables:
        doc_content += "## 交付物\n" + "\n".join(f"- {d}" for d in deliverables) + "\n\n"
    if deadline:
        doc_content += f"## 截止时间\n{deadline}\n\n"
    if risks:
        doc_content += "## 风险\n" + "\n".join(f"- {r}" for r in risks) + "\n\n"

    doc_url = _create_doc(f"{title} - 项目简报", doc_content)
    if doc_url:
        artifacts.append(f"文档: {doc_url}")
    else:
        logger.warning("doc create failed, continuing")

    # 2. Create bitable with project status
    bitable_url = _create_bitable(title, member_display, deadline, risks)
    if bitable_url:
        artifacts.append(f"多维表格: {bitable_url}")

    # 3. Create tasks
    if deliverables:
        for d in deliverables[:3]:
            if _create_task(d, f"项目: {title}\n负责人: {member_display}"):
                artifacts.append(f"任务: {d}")

    # 4. Send entry message with @mentions
    entry_text = f"📌 项目入口: {title}\n🎯 目标: {goal}"
    if members:
        entry_text += f"\n👥 成员: {member_display}"
    if deadline:
        entry_text += f"\n⏰ 截止: {deadline}"
    if doc_url:
        entry_text += f"\n📄 文档: {doc_url}"
    if bitable_url:
        entry_text += f"\n📊 状态: {bitable_url}"

    if _send_message(CHAT_ID, entry_text):
        artifacts.append("项目入口消息")

    if not artifacts:
        return tool_error("未能创建任何产物，请检查 FEISHU_APP_ID / FEISHU_APP_SECRET 配置。")

    return tool_result(json.dumps({
        "status": "project_space_created",
        "title": title,
        "artifacts": artifacts,
        "instructions": "用中文回复结果摘要，格式如下（不要显示工具名或英文）：\n✅ 项目空间已创建\n📄 文档：（链接）\n📊 状态表：（链接）\n📋 任务：xxx、xxx\n💬 已通知群成员",
        "message": f"已创建 {len(artifacts)} 个产物: {', '.join(artifacts)}",
    }, ensure_ascii=False))


# ---------------------------------------------------------------------------
# pilotflow_send_summary
# ---------------------------------------------------------------------------

PILOTFLOW_SEND_SUMMARY_SCHEMA = {
    "name": "发送项目总结",
    "description": "向飞书群发送项目执行总结，包含已创建的产物列表。",
    "parameters": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "项目标题。"},
            "artifacts": {
                "type": "array",
                "items": {"type": "string"},
                "description": "已创建的产物列表。",
            },
            "status": {"type": "string", "description": "项目状态（如 completed, in_progress）。"},
        },
        "required": ["title", "artifacts"],
    },
}


def _handle_send_summary(params: Dict[str, Any], **kwargs) -> str:
    """Send a delivery summary to the Feishu group."""
    title = params.get("title", "")
    artifacts = params.get("artifacts", [])
    status = params.get("status", "completed")

    if not CHAT_ID:
        return tool_error("缺少 PILOTFLOW_TEST_CHAT_ID 环境变量")

    summary = f"✅ {title} — 执行完成\n\n已创建产物:\n"
    for a in artifacts:
        summary += f"  • {a}\n"
    summary += f"\n状态: {status}"

    if not _send_message(CHAT_ID, summary):
        return tool_error("发送总结失败")

    return tool_result(f"已发送项目总结到群聊: {title}")
