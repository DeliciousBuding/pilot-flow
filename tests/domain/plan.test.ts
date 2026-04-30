import assert from "node:assert/strict";
import test from "node:test";
import {
  DeterministicPlanner,
  buildFallbackPlan,
  createProjectInitPlannerProvider,
  createProjectInitPlan,
  parseDemoInput,
  validatePlan,
} from "../../src/domain/plan.js";

test("DeterministicPlanner builds the project-init skeleton and validates it", () => {
  const plan = createProjectInitPlan(`Goal: Ship MVP
Members: Product Owner, Agent Engineer
Deliverables: Project brief, task board
Deadline: 2026-05-02
Risks: callback delay`);

  assert.equal(plan.intent, "project_init");
  assert.deepEqual(plan.members, ["Product Owner", "Agent Engineer"]);
  assert.equal(plan.steps.some((step) => step.tool === "doc.create"), true);
  assert.equal(validatePlan(plan).ok, true);

  const provider = createProjectInitPlannerProvider();
  assert.equal(provider instanceof DeterministicPlanner, true);
  assert.equal(validatePlan(provider.plan("Goal: Ship MVP")).ok, true);
  assert.throws(() => createProjectInitPlannerProvider({ type: "llm" }), /Unsupported project-init planner provider/);
});

test("parseDemoInput accepts Chinese field names and underscores", () => {
  const fields = parseDemoInput(`目标: 产品答辩
负责人: 唐丁，产品同学
deliverables_v2: brief; demo`);

  assert.equal(fields["目标"], "产品答辩");
  assert.equal(fields["负责人"], "唐丁，产品同学");
  assert.equal(fields.deliverables_v2, "brief; demo");
});

test("validatePlan rejects invalid shape and length limits", () => {
  const validation = validatePlan({
    intent: "project_init",
    goal: "x".repeat(501),
    members: "Product Owner",
    deliverables: ["Project brief"],
    deadline: "2026-05-02",
    steps: [{ id: "step-doc", title: "Create doc", status: "unknown" }],
    confirmations: [],
    risks: [],
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.path === "members"), true);
  assert.equal(validation.errors.some((error) => error.path === "steps[0].status"), true);
  assert.equal(validation.errors.some((error) => error.path === "goal"), true);
});

test("validatePlan preserves legacy enum contracts", () => {
  const plan = createProjectInitPlan("Goal: Ship MVP");
  const withExpiredConfirmation = {
    ...plan,
    confirmations: [{ ...plan.confirmations[0], status: "expired" }],
    steps: [{ ...plan.steps[0], depends_on: ["step-plan"] }],
  };
  assert.equal(validatePlan(withExpiredConfirmation).ok, true);

  assert.equal(validatePlan({ ...plan, steps: [{ ...plan.steps[0], status: "completed" }] }).ok, false);
  assert.equal(validatePlan({ ...plan, confirmations: [{ ...plan.confirmations[0], status: "timeout" }] }).ok, false);
  assert.equal(validatePlan({ ...plan, steps: [{ ...plan.steps[0], depends_on: [1] }] }).ok, false);
});

test("buildFallbackPlan returns a safe clarification plan", () => {
  const validation = validatePlan({ intent: "project_init" });
  assert.equal(validation.ok, false);

  const fallback = buildFallbackPlan(validation.errors, "Goal: Ship MVP");
  assert.equal(validatePlan(fallback).ok, true);
  assert.equal(fallback.deadline, "TBD");
  assert.equal(fallback.missing_info.includes("valid plan schema"), true);
  assert.equal(fallback.missing_info.filter((item) => item === "steps").length <= 1, true);
  assert.equal(fallback.risks[0]?.level, "high");
});
