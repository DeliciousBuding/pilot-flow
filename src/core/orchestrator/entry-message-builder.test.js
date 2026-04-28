import assert from "node:assert/strict";
import { buildProjectEntryMessageText } from "./entry-message-builder.js";

const text = buildProjectEntryMessageText({
  runId: "run-entry",
  plan: { goal: "Launch PilotFlow MVP" },
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
    }
  ]
});

assert.match(text, /PilotFlow 项目入口已就绪/);
assert.match(text, /Run ID: run-entry/);
assert.match(text, /目标: Launch PilotFlow MVP/);
assert.match(text, /Brief: PilotFlow Project Brief - https:\/\/example\.feishu\.cn\/docx\/doc_123/);
assert.match(text, /状态台账: 2 条 Base records \(rec_1, rec_2\)/);
assert.match(text, /首个任务: Project brief - https:\/\/applink\.feishu\.cn\/client\/todo\/detail\?guid=task_123/);
assert.match(text, /置顶或升级为群公告/);

console.log("entry message builder tests passed");
