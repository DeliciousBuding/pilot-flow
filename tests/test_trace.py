import json
import importlib.util
from pathlib import Path


_TRACE_PATH = Path(__file__).resolve().parents[1] / "plugins" / "pilotflow" / "trace.py"
_SPEC = importlib.util.spec_from_file_location("pilotflow_trace", _TRACE_PATH)
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
PilotFlowTrace = _MODULE.PilotFlowTrace


def test_trace_redacts_sensitive_identifiers_and_urls():
    trace = PilotFlowTrace.start(
        chat_id="oc_real_chat_id",
        message_id="om_real_message_id",
        sender_open_id="ou_real_sender_id",
        source_text="请查看 https://example.feishu.cn/docx/secret?token=abc",
    )

    trace.record_event(
        "tool_result",
        {
            "doc_url": "https://example.feishu.cn/docx/secret?token=abc",
            "open_id": "ou_real_member_id",
            "safe": "created",
        },
    )

    data = trace.to_dict()
    encoded = json.dumps(data, ensure_ascii=False)

    assert data["run_id"].startswith("pf_")
    assert "oc_real_chat_id" not in encoded
    assert "om_real_message_id" not in encoded
    assert "ou_real_sender_id" not in encoded
    assert "ou_real_member_id" not in encoded
    assert "https://example.feishu.cn" not in encoded
    assert "[redacted:chat_id]" in encoded
    assert "[redacted:message_id]" in encoded
    assert "[redacted:open_id]" in encoded
    assert "[redacted:url]" in encoded
    assert data["redaction"]["enabled"] is True
    assert data["redaction"]["masked_count"] >= 5


def test_trace_markdown_summary_is_business_readable():
    trace = PilotFlowTrace.start(
        chat_id="oc_chat",
        message_id="om_msg",
        sender_open_id="ou_sender",
        source_text="创建答辩项目",
    )
    trace.set_intent("project_bootstrap", "创建答辩项目空间")
    trace.set_plan("答辩项目", ["创建文档", "创建任务"])
    trace.set_confirmation(required=True, mode="card_or_text", approved_by="ou_sender")
    trace.record_tool_call("pilotflow_create_project_space", "ok", artifacts=[{"type": "doc", "url": "https://x"}])

    markdown = trace.to_markdown()

    assert "PilotFlow Flight Recorder" in markdown
    assert "project_bootstrap" in markdown
    assert "答辩项目" in markdown
    assert "pilotflow_create_project_space" in markdown
    assert "card_or_text" in markdown
    assert "https://x" not in markdown
