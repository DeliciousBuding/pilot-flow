import assert from "node:assert/strict";
import { RunOrchestrator } from "./run-orchestrator.js";

class MemoryRecorder {
  constructor() {
    this.events = [];
  }

  async record(event) {
    this.events.push(event);
  }
}

const recorder = new MemoryRecorder();
const orchestrator = new RunOrchestrator({
  recorder,
  dryRun: false,
  mode: "live",
  planner: () => ({
    intent: "project_init",
    goal: "Invalid plan",
    members: "not an array",
    deliverables: [],
    deadline: "TBD",
    steps: [],
    confirmations: [],
    risks: []
  })
});

const result = await orchestrator.startProjectInit("Goal: Invalid plan", {
  autoConfirm: true
});

assert.equal(result.status, "needs_clarification");
assert.equal(result.plan_validation.ok, false);
assert.equal(result.duplicate_guard.reason, "invalid_plan");
assert.equal(recorder.events.some((event) => event.event === "plan.validation_failed"), true);
assert.equal(recorder.events.some((event) => event.event === "run.waiting_clarification"), true);
assert.equal(recorder.events.some((event) => event.event === "tool.called"), false);

console.log("run orchestrator tests passed");
