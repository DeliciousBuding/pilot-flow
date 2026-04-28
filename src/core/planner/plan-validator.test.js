import assert from "node:assert/strict";
import { createProjectInitPlan } from "./project-init-planner.js";
import { buildPlanValidationFallbackPlan, validateProjectInitPlan } from "./plan-validator.js";

const validPlan = createProjectInitPlan(`Goal: Ship MVP
Members: Product Owner, Agent Engineer
Deliverables: Project brief, task board
Deadline: 2026-05-02
Risks: callback delay`);

assert.equal(validateProjectInitPlan(validPlan).ok, true);

const invalidPlan = {
  intent: "project_init",
  goal: "Ship MVP",
  members: "Product Owner",
  deliverables: ["Project brief"],
  deadline: "2026-05-02",
  steps: [{ id: "step-doc", title: "Create doc", status: "unknown" }],
  confirmations: [],
  risks: []
};
const validation = validateProjectInitPlan(invalidPlan);
assert.equal(validation.ok, false);
assert.equal(validation.errors.some((error) => error.path === "members"), true);
assert.equal(validation.errors.some((error) => error.path === "steps[0].status"), true);

const fallback = buildPlanValidationFallbackPlan("Goal: Ship MVP", validation.errors);
assert.equal(validateProjectInitPlan(fallback).ok, true);
assert.equal(fallback.deadline, "TBD");
assert.equal(fallback.missing_info.includes("valid plan schema"), true);
assert.equal(fallback.risks[0].level, "high");

console.log("plan validator tests passed");
