import assert from "node:assert/strict";
import {
  buildProjectStateRows,
  firstTaskFallbackOwner,
  firstTaskSummary,
  normalizeDueDate,
  normalizeDueDateText,
  PROJECT_STATE_FIELD_DEFINITIONS,
  PROJECT_STATE_FIELDS
} from "./project-state-builder.js";

assert.deepEqual(PROJECT_STATE_FIELDS, [
  "type",
  "title",
  "owner",
  "due_date",
  "status",
  "risk_level",
  "source_run",
  "source_message",
  "url"
]);
assert.equal(PROJECT_STATE_FIELD_DEFINITIONS.every((field) => field.type === "text"), true);

const plan = {
  goal: "Launch PilotFlow MVP",
  members: ["Product Owner", "Agent Engineer"],
  deliverables: ["Project brief", "task board", "risk list"],
  deadline: "2026-05-02",
  risks: [{ title: "missing Feishu group scope", level: "medium", status: "open" }]
};

const rows = buildProjectStateRows(plan, {
  runId: "run-state",
  sourceMessage: "om_source",
  risks: [
    { title: "missing Feishu group scope", level: "medium", status: "open", owner: "Feishu Integration Owner" },
    { title: "derived owner text fallback", level: "medium", status: "open", owner: "Integration Lead" }
  ],
  artifacts: [
    {
      type: "doc",
      title: "PilotFlow Project Brief",
      status: "created",
      url: "https://example.feishu.cn/docx/demo"
    }
  ]
});

assert.equal(rows.length, 6);
assert.deepEqual(rows[0], ["task", "Project brief", "Product Owner", "2026-05-02", "todo", "", "run-state", "om_source", ""]);
assert.deepEqual(rows[1], ["task", "task board", "Agent Engineer", "2026-05-02", "todo", "", "run-state", "om_source", ""]);
assert.deepEqual(rows[2], ["task", "risk list", "Product Owner", "2026-05-02", "todo", "", "run-state", "om_source", ""]);
assert.deepEqual(rows[3], [
  "risk",
  "missing Feishu group scope",
  "Feishu Integration Owner",
  "2026-05-02",
  "open",
  "medium",
  "run-state",
  "om_source",
  ""
]);
assert.deepEqual(rows[4], [
  "risk",
  "derived owner text fallback",
  "Integration Lead",
  "2026-05-02",
  "open",
  "medium",
  "run-state",
  "om_source",
  ""
]);
assert.deepEqual(rows[5], [
  "artifact",
  "Project brief document",
  "Product Owner",
  "2026-05-02",
  "created",
  "",
  "run-state",
  "om_source",
  "https://example.feishu.cn/docx/demo"
]);

assert.equal(firstTaskSummary(plan), "Project brief");
assert.equal(firstTaskFallbackOwner(plan), "Product Owner");
assert.equal(normalizeDueDate("2026-05-02"), "2026-05-02");
assert.equal(normalizeDueDate("TBD"), undefined);
assert.equal(normalizeDueDateText("TBD"), "TBD");

assert.deepEqual(
  buildProjectStateRows({ ...plan, members: [], deadline: "TBD", risks: [] }, { runId: "run-empty" })[0],
  ["task", "Project brief", "TBD", "TBD", "todo", "", "run-empty", "manual-trigger", ""]
);

console.log("project state builder tests passed");
