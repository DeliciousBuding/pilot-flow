import assert from "node:assert/strict";
import { buildDeliverySummaryText } from "./summary-builder.js";

const text = buildDeliverySummaryText({
  runId: "run-test",
  plan: {
    goal: "Launch PilotFlow MVP"
  },
  artifacts: [
    {
      type: "doc",
      title: "PilotFlow Project Brief",
      url: "https://example.feishu.cn/docx/doc_123"
    },
    {
      type: "base_record",
      title: "Project brief",
      external_id: "rec_1"
    },
    {
      type: "base_record",
      title: "Risk list",
      external_id: "rec_2"
    },
    {
      type: "task",
      title: "Project brief",
      url: "https://applink.feishu.cn/client/todo/detail?guid=task_123"
    },
    {
      type: "entry_message",
      title: "PilotFlow project entry",
      external_id: "om_entry"
    },
    {
      type: "pinned_message",
      title: "Pinned PilotFlow project entry",
      external_id: "om_entry"
    }
  ]
});

assert.match(text, /PilotFlow 已完成项目起飞/);
assert.match(text, /Run ID: run-test/);
assert.match(text, /目标: Launch PilotFlow MVP/);
assert.match(text, /Doc: PilotFlow Project Brief - https:\/\/example\.feishu\.cn\/docx\/doc_123/);
assert.match(text, /Base records: 2 条 \(rec_1, rec_2\)/);
assert.match(text, /Task: Project brief - https:\/\/applink\.feishu\.cn\/client\/todo\/detail\?guid=task_123/);
assert.match(text, /Project entry: pinned, PilotFlow project entry \(om_entry\)/);

assert.match(
  buildDeliverySummaryText({
    runId: "run-dry",
    plan: { goal: "Dry run" },
    artifacts: [{ type: "base_record", title: "Project brief", status: "planned" }]
  }),
  /Base records: 1 条 \(planned\)/
);

console.log("summary builder tests passed");
