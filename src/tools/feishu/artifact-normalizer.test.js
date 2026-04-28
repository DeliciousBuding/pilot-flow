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
        fields: ["type", "title", "status", "source_run"],
        rows: [["task", "Project brief", "todo", runId]]
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
      record_type: "task"
    }
  ]
);

assert.equal(
  normalizeFeishuArtifacts("task.create", { summary: "Project brief" }, { dry_run: true }, { runId })[0].status,
  "planned"
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

console.log("artifact normalizer tests passed");
