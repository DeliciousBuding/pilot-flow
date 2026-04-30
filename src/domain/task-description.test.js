import assert from "node:assert/strict";
import { buildTaskDescription } from "./task-description.js";

const plan = { goal: "Ship the demo" };

assert.match(
  buildTaskDescription({
    runId: "run-1",
    plan,
    taskAssignee: { owner: "Alice", assignee: "ou_123", source: "owner_map" }
  }),
  /Feishu assignee: ou_123 \(owner_map\)/
);

assert.match(
  buildTaskDescription({
    runId: "run-2",
    plan,
    taskAssignee: { owner: "Bob", source: "text_owner_fallback" }
  }),
  /using text owner fallback/
);

console.log("task description domain tests passed");
