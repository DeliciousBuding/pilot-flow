import assert from "node:assert/strict";
import test from "node:test";
import { createProjectInitPlan } from "../../src/domain/plan.js";
import { buildBriefMarkdown } from "../../src/domain/project-brief.js";

test("buildBriefMarkdown renders core plan fields and artifact links", () => {
  const markdown = buildBriefMarkdown(
    {
      ...createProjectInitPlan("Goal: Launch PilotFlow"),
      goal: "Launch PilotFlow",
      members: ["Alice", "Bob"],
      deliverables: ["Brief", "Demo"],
      deadline: "Friday",
      risks: [{ id: "risk-1", title: "Callback pending", level: "medium", status: "open" }],
    },
    [{ type: "doc", external_id: "doc-1", title: "Brief", url: "https://example.test/doc" }],
  );

  assert.match(markdown, /# PilotFlow Project Brief/);
  assert.match(markdown, /Launch PilotFlow/);
  assert.match(markdown, /- Alice/);
  assert.match(markdown, /- Demo/);
  assert.match(markdown, /Callback pending/);
  assert.match(markdown, /\[Brief\]\(https:\/\/example\.test\/doc\)/);
});

test("buildBriefMarkdown keeps empty fields readable", () => {
  const markdown = buildBriefMarkdown({
    ...createProjectInitPlan("Goal: Empty fields"),
    goal: "Empty fields",
    members: [],
    deliverables: [],
    deadline: "TBD",
    risks: [],
  });

  assert.match(markdown, /- TBD/);
  assert.match(markdown, /- No explicit risks/);
});
