import assert from "node:assert/strict";
import { detectProjectRisks, summarizeRiskDecision } from "./risk-detector.js";

const risks = detectProjectRisks({
  members: ["Product Owner", "Agent Engineer"],
  deliverables: ["Project brief"],
  deadline: "TBD",
  risks: [{ id: "risk-1", title: "card callback delay", level: "medium", status: "open" }]
});

assert.equal(risks.some((risk) => risk.title === "card callback delay"), true);
assert.equal(risks.some((risk) => risk.id === "derived-missing-deadline"), true);
assert.equal(risks.some((risk) => risk.id === "derived-owner-text-fallback"), true);
assert.equal(risks.find((risk) => risk.id === "derived-owner-text-fallback").owner, "Feishu Integration Owner");

const summary = summarizeRiskDecision(risks);
assert.equal(summary.total, risks.length);
assert.equal(summary.open, risks.length);
assert.equal(summary.highest_level, "medium");
assert.equal(summary.recommended_action, "accept_with_followup");

const highRisks = detectProjectRisks({
  members: [],
  deliverables: [],
  deadline: "TBD",
  risks: []
});
const highSummary = summarizeRiskDecision(highRisks);
assert.equal(highRisks.some((risk) => risk.level === "high"), true);
assert.equal(highSummary.recommended_action, "confirm_owner_or_deadline");

console.log("risk detector tests passed");
