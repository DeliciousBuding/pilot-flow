import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskDescription } from "../../src/domain/task-description.js";

test("buildTaskDescription renders mapped Feishu assignee", () => {
  assert.match(
    buildTaskDescription({
      runId: "run-1",
      plan: { goal: "Ship the demo" },
      taskAssignee: { owner: "Alice", assignee: "ou_123", source: "owner_map" },
    }),
    /Feishu assignee: ou_123 \(owner_map\)/,
  );
});

test("buildTaskDescription renders text owner fallback and artifacts", () => {
  const text = buildTaskDescription({
    runId: "run-2",
    plan: { goal: "Ship the demo" },
    taskAssignee: { owner: "Bob", source: "text_owner_fallback" },
    artifacts: [{ type: "doc", external_id: "doc-1", title: "Brief" }],
  });

  assert.match(text, /using text owner fallback/);
  assert.match(text, /doc: Brief/);
});
