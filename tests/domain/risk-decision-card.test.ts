import assert from "node:assert/strict";
import test from "node:test";
import { buildRiskDecisionCard } from "../../src/domain/risk-decision-card.js";
import { summarizeRiskDecision, type DetectedRisk } from "../../src/domain/risk.js";

test("buildRiskDecisionCard preserves button action protocol", () => {
  const risks: DetectedRisk[] = [
    {
      id: "risk-1",
      title: "Owner missing",
      level: "high",
      status: "open",
      source: "derived",
      owner: "TBD",
      recommendation: "Assign owner",
      decision_options: [],
    },
  ];
  const card = buildRiskDecisionCard({ runId: "run-1", plan: { goal: "Ship demo" }, risks, summary: summarizeRiskDecision(risks) });
  const root = card as { header: { template: string; title: { content: string } }; elements: Array<Record<string, unknown>> };

  assert.equal(root.header.template, "red");
  assert.equal(root.header.title.content, "PilotFlow 风险裁决卡");

  const actionBlock = root.elements.find((element) => element.tag === "action") as { actions: Array<{ value: Record<string, string> }> };
  assert.deepEqual(
    actionBlock.actions.map((action) => action.value),
    [
      { pilotflow_card: "risk_decision", pilotflow_run_id: "run-1", pilotflow_action: "assign_owner" },
      { pilotflow_card: "risk_decision", pilotflow_run_id: "run-1", pilotflow_action: "adjust_deadline" },
      { pilotflow_card: "risk_decision", pilotflow_run_id: "run-1", pilotflow_action: "accept_risk" },
      { pilotflow_card: "risk_decision", pilotflow_run_id: "run-1", pilotflow_action: "defer" },
    ],
  );
});

test("buildRiskDecisionCard caps top risks and renders empty fallback", () => {
  const manyRisks = Array.from({ length: 6 }, (_, index): DetectedRisk => ({
    id: `risk-${index}`,
    title: `Risk ${index}`,
    level: "medium",
    status: "open",
    source: "planner",
    recommendation: "Track",
    decision_options: [],
  }));
  const card = buildRiskDecisionCard({ runId: "run-2", plan: { goal: "Ship demo" }, risks: manyRisks, summary: summarizeRiskDecision(manyRisks) });
  const encoded = JSON.stringify(card);
  assert.equal(encoded.includes("Risk 5"), false);
  assert.equal(encoded.includes("Risk 4"), true);

  const emptyCard = buildRiskDecisionCard({
    runId: "run-3",
    plan: { goal: "Ship demo" },
    risks: [],
    summary: summarizeRiskDecision([]),
  });
  assert.match(JSON.stringify(emptyCard), /暂无待裁决风险/);
});
