import assert from "node:assert/strict";
import { buildBriefMarkdown } from "./project-brief.js";

const markdown = buildBriefMarkdown({
  goal: "Launch PilotFlow",
  members: ["Alice", "Bob"],
  deliverables: ["Brief", "Demo"],
  deadline: "Friday",
  risks: [{ title: "Callback pending" }]
});

assert.match(markdown, /# PilotFlow Project Brief/);
assert.match(markdown, /Launch PilotFlow/);
assert.match(markdown, /- Alice/);
assert.match(markdown, /- Demo/);
assert.match(markdown, /Callback pending/);

const fallbackMarkdown = buildBriefMarkdown({
  goal: "Empty fields",
  members: [],
  deliverables: [],
  deadline: "TBD",
  risks: []
});

assert.match(fallbackMarkdown, /- TBD/);
assert.match(fallbackMarkdown, /- No explicit risks/);

console.log("project brief domain tests passed");
