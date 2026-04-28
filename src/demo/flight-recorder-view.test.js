import assert from "node:assert/strict";
import { buildFlightRecorderModel } from "./flight-recorder-view.js";

const model = buildFlightRecorderModel([
  { ts: "2026-04-28T00:00:00.000Z", run_id: "run-view", event: "run.created", mode: "dry-run" },
  {
    ts: "2026-04-28T00:00:01.000Z",
    run_id: "run-view",
    event: "plan.generated",
    plan: {
      goal: "Launch PilotFlow MVP",
      members: ["Product Owner"],
      deliverables: ["Project brief"],
      deadline: "2026-05-02",
      steps: [{ id: "step-doc", title: "Create doc", tool: "doc.create", status: "pending" }]
    }
  },
  { ts: "2026-04-28T00:00:02.000Z", run_id: "run-view", event: "step.status_changed", step_id: "step-doc", status: "running" },
  { ts: "2026-04-28T00:00:03.000Z", run_id: "run-view", event: "tool.called", tool_call_id: "tool-1", tool: "doc.create", input: { title: "Brief" } },
  { ts: "2026-04-28T00:00:04.000Z", run_id: "run-view", event: "tool.succeeded", tool_call_id: "tool-1", tool: "doc.create", output: { ok: true } },
  {
    ts: "2026-04-28T00:00:05.000Z",
    run_id: "run-view",
    event: "artifact.planned",
    tool_call_id: "tool-1",
    artifact: { id: "doc-1", type: "doc", title: "Brief", status: "planned" }
  },
  { ts: "2026-04-28T00:00:06.000Z", run_id: "run-view", event: "step.status_changed", step_id: "step-doc", status: "succeeded" },
  { ts: "2026-04-28T00:00:07.000Z", run_id: "run-view", event: "run.completed" }
]);

assert.equal(model.runId, "run-view");
assert.equal(model.status, "completed");
assert.equal(model.mode, "dry-run");
assert.equal(model.steps[0].status, "succeeded");
assert.equal(model.tools[0].status, "succeeded");
assert.equal(model.artifacts[0].title, "Brief");
assert.equal(model.timeline.length, 8);

console.log("flight recorder view tests passed");
