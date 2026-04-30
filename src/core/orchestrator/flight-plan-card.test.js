import assert from "node:assert/strict";
import { buildFlightPlanCard } from "./flight-plan-card.js";

const card = buildFlightPlanCard({
  runId: "run-test",
  confirmationText: "确认执行",
  plan: {
    goal: "Launch PilotFlow MVP",
    members: ["Product Owner", "Agent Engineer"],
    deliverables: ["Project brief", "task board"],
    deadline: "2026-05-02",
    risks: [{ title: "card callback delay", level: "medium" }]
  }
});

assert.equal(card.header.title.content, "PilotFlow 项目执行计划");
assert.equal(card.header.template, "blue");
assert.equal(card.config.wide_screen_mode, true);

const content = JSON.stringify(card);
assert.match(content, /Launch PilotFlow MVP/);
assert.match(content, /Product Owner/);
assert.match(content, /Project brief/);
assert.match(content, /2026-05-02/);
assert.match(content, /card callback delay/);
assert.match(content, /确认执行/);
assert.match(content, /confirm_execute/);
assert.match(content, /edit_plan/);
assert.match(content, /doc_only/);
assert.match(content, /cancel/);
assert.match(content, /execution_plan/);

console.log("execution plan card tests passed");
