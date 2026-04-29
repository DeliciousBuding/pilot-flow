import assert from "node:assert/strict";
import { buildDemoEvidenceModel, renderDemoEvidenceMarkdown } from "./demo-evidence.js";

const model = buildDemoEvidenceModel(
  [
    { ts: "2026-04-29T00:00:00.000Z", run_id: "run-evidence", event: "run.created", mode: "live" },
    {
      ts: "2026-04-29T00:00:01.000Z",
      run_id: "run-evidence",
      event: "plan.generated",
      plan: {
        goal: "Launch PilotFlow MVP",
        deadline: "2026-05-02",
        members: ["Product Owner"],
        deliverables: ["Project brief"],
        steps: [{ id: "step-doc", title: "Create doc", tool: "doc.create", status: "pending" }]
      }
    },
    { ts: "2026-04-29T00:00:02.000Z", run_id: "run-evidence", event: "tool.called", tool_call_id: "tool-1", tool: "doc.create" },
    { ts: "2026-04-29T00:00:03.000Z", run_id: "run-evidence", event: "tool.succeeded", tool_call_id: "tool-1", tool: "doc.create" },
    { ts: "2026-04-29T00:00:04.000Z", run_id: "run-evidence", event: "artifact.created", artifact: { type: "doc", title: "Brief", status: "created", url: "https://example.feishu.cn/docx/demo" } },
    { ts: "2026-04-29T00:00:05.000Z", run_id: "run-evidence", event: "artifact.created", artifact: { type: "base_record", title: "Project brief", status: "created", external_id: "rec_1" } },
    { ts: "2026-04-29T00:00:06.000Z", run_id: "run-evidence", event: "artifact.created", artifact: { type: "task", title: "Project brief", status: "created", external_id: "task_1" } },
    { ts: "2026-04-29T00:00:07.000Z", run_id: "run-evidence", event: "artifact.created", artifact: { type: "card", title: "PilotFlow 风险裁决卡", status: "created", external_id: "om_card" } },
    { ts: "2026-04-29T00:00:08.000Z", run_id: "run-evidence", event: "artifact.created", artifact: { type: "pinned_message", title: "Pinned entry", status: "created", message_id: "om_entry" } },
    { ts: "2026-04-29T00:00:09.000Z", run_id: "run-evidence", event: "artifact.failed", artifact: { type: "announcement", title: "Announcement", status: "failed", error: "232097 Unable to operate docx type chat announcement" } },
    { ts: "2026-04-29T00:00:10.000Z", run_id: "run-evidence", event: "artifact.created", artifact: { type: "message", title: "Summary", status: "created", external_id: "om_summary" } },
    { ts: "2026-04-29T00:00:11.000Z", run_id: "run-evidence", event: "run.completed" }
  ],
  { inputPath: "tmp/runs/demo.jsonl" }
);

assert.equal(model.runId, "run-evidence");
assert.equal(model.status, "completed");
assert.equal(model.failedOptionalArtifacts.length, 1);
assert.equal(model.evidenceChecklist.every((item) => item.ok), true);

const markdown = renderDemoEvidenceMarkdown(model);
assert.match(markdown, /PilotFlow Demo Evidence Pack/);
assert.match(markdown, /Announcement fallback recorded/);
assert.match(markdown, /232097 Unable to operate docx type chat announcement/);
assert.match(markdown, /Flight Recorder HTML view/);

console.log("demo evidence tests passed");
