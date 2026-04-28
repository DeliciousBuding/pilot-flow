import assert from "node:assert/strict";
import { buildRiskDecisionCard } from "./risk-decision-card.js";

const card = buildRiskDecisionCard({
  runId: "run-risk",
  plan: { goal: "Launch PilotFlow MVP" },
  summary: { total: 2, open: 2, highest_level: "high" },
  risks: [
    {
      title: "No project members were captured",
      level: "high",
      status: "open",
      owner: "TBD",
      recommendation: "Ask the group to confirm an owner."
    }
  ]
});

assert.equal(card.header.title.content, "PilotFlow 风险裁决卡");
assert.equal(card.header.template, "red");

const content = JSON.stringify(card);
assert.match(content, /Launch PilotFlow MVP/);
assert.match(content, /No project members were captured/);
assert.match(content, /确认负责人/);
assert.match(content, /adjust_deadline/);
assert.match(content, /文本确认/);

console.log("risk decision card tests passed");
