import assert from "node:assert/strict";
import { normalizeFeishuArtifacts } from "./artifact-normalizer.js";

const runId = "run-test";

assert.deepEqual(
  normalizeFeishuArtifacts(
    "doc.create",
    { title: "Brief" },
    {
      json: {
        data: {
          document: {
            document_id: "doc_123",
            url: "https://example.feishu.cn/docx/doc_123"
          }
        }
      }
    },
    { runId }
  ),
  [
    {
      id: "doc-doc_123",
      type: "doc",
      title: "Brief",
      status: "created",
      url: "https://example.feishu.cn/docx/doc_123",
      external_id: "doc_123"
    }
  ]
);

assert.deepEqual(
  normalizeFeishuArtifacts(
    "base.write",
    {
      body: {
        fields: ["type", "title", "owner", "due_date", "status", "risk_level", "source_run", "source_message", "url"],
        rows: [["task", "Project brief", "Product Owner", "2026-05-02", "todo", "", runId, "manual-trigger", ""]]
      }
    },
    { json: { data: { record_id_list: ["rec_123"] } } },
    { runId }
  ),
  [
    {
      id: "base-record-rec_123",
      type: "base_record",
      title: "Project brief",
      status: "created",
      external_id: "rec_123",
      record_type: "task",
      owner: "Product Owner",
      due_date: "2026-05-02",
      source_run: runId,
      source_message: "manual-trigger"
    }
  ]
);

assert.equal(
  normalizeFeishuArtifacts(
    "task.create",
    { summary: "Project brief", owner: "Product Owner", assignee: "ou_product", assignee_source: "owner_open_id_map" },
    { dry_run: true },
    { runId }
  )[0].status,
  "planned"
);
assert.deepEqual(
  normalizeFeishuArtifacts(
    "task.create",
    { summary: "Project brief", owner: "Product Owner", assignee: "ou_product", assignee_source: "owner_open_id_map" },
    { dry_run: true },
    { runId }
  )[0],
  {
    id: "artifact-run-test-task",
    type: "task",
    title: "Project brief",
    status: "planned",
    owner: "Product Owner",
    assignee: "ou_product",
    assignee_source: "owner_open_id_map"
  }
);

assert.equal(
  normalizeFeishuArtifacts(
    "im.send",
    { text: "PilotFlow summary" },
    { json: { data: { message_id: "om_123" } } },
    { runId }
  )[0].external_id,
  "om_123"
);

assert.deepEqual(
  normalizeFeishuArtifacts(
    "entry.send",
    { text: "PilotFlow project entry" },
    { json: { data: { message_id: "om_entry" } } },
    { runId }
  ),
  [
    {
      id: "entry_message-om_entry",
      type: "entry_message",
      title: "PilotFlow project entry",
      status: "created",
      external_id: "om_entry"
    }
  ]
);

assert.deepEqual(
  normalizeFeishuArtifacts(
    "card.send",
    { title: "PilotFlow 项目飞行计划", card: { header: { title: { content: "Ignored fallback" } } } },
    { dry_run: true },
    { runId }
  ),
  [
    {
      id: "artifact-run-test-card",
      type: "card",
      title: "PilotFlow 项目飞行计划",
      status: "planned"
    }
  ]
);

assert.deepEqual(
  normalizeFeishuArtifacts(
    "entry.pin",
    { title: "Pinned project entry", messageId: "om_entry" },
    { json: { data: { pin: { message_id: "om_entry", chat_id: "oc_demo", create_time: "1770000000000" } } } },
    { runId }
  ),
  [
    {
      id: "pin-om_entry",
      type: "pinned_message",
      title: "Pinned project entry",
      status: "created",
      external_id: "om_entry",
      message_id: "om_entry",
      chat_id: "oc_demo",
      created_at: "1770000000000"
    }
  ]
);

assert.deepEqual(
  normalizeFeishuArtifacts(
    "announcement.update",
    { title: "PilotFlow group announcement", revision: "0", html: "<p>entry</p>" },
    { dry_run: true },
    { runId }
  ),
  [
    {
      id: "announcement-run-test",
      type: "announcement",
      title: "PilotFlow group announcement",
      status: "planned",
      revision: "0"
    }
  ]
);

console.log("artifact normalizer tests passed");
