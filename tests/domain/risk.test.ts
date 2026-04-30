import assert from "node:assert/strict";
import test from "node:test";
import { createProjectInitPlan } from "../../src/domain/plan.js";
import { detectRisks, highestRiskLevel, summarizeRiskDecision } from "../../src/domain/risk.js";

test("detectRisks preserves planner risks and adds derived risk signals", () => {
  const risks = detectRisks({
    ...createProjectInitPlan("Goal: Ship demo"),
    members: ["Product Owner", "Agent Engineer"],
    deliverables: ["Project brief"],
    deadline: "TBD",
    risks: [{ id: "risk-1", title: "card callback delay", level: "medium", status: "open" }],
  });

  assert.equal(risks.some((risk) => risk.title === "card callback delay"), true);
  assert.equal(risks.some((risk) => risk.id === "derived-missing-deadline"), true);
  assert.equal(risks.some((risk) => risk.id === "derived-owner-text-fallback"), true);
  assert.equal(risks.find((risk) => risk.id === "derived-owner-text-fallback")?.owner, "Feishu Integration Owner");
});

test("summarizeRiskDecision recommends human confirmation for high risk", () => {
  const risks = detectRisks({
    ...createProjectInitPlan("Goal: Ship demo"),
    members: [],
    deliverables: [],
    deadline: "TBD",
    risks: [],
  });
  const summary = summarizeRiskDecision(risks);

  assert.equal(risks.some((risk) => risk.level === "high"), true);
  assert.equal(summary.recommended_action, "confirm_owner_or_deadline");
  assert.equal(summary.highest_level, "high");
});

test("highestRiskLevel is stable for empty and mixed inputs", () => {
  assert.equal(highestRiskLevel([]), "low");
  assert.equal(highestRiskLevel([{ level: "medium" }, { level: "critical" }, { level: "high" }]), "critical");
});

test("detectRisks tolerates partial planner output", () => {
  const risks = detectRisks({ deadline: "soon" });

  assert.equal(risks.some((risk) => risk.id === "derived-missing-members"), true);
  assert.equal(risks.some((risk) => risk.id === "derived-missing-deliverables"), true);
  assert.equal(risks.some((risk) => risk.id === "derived-missing-deadline"), true);
});
