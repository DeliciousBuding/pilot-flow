import assert from "node:assert/strict";
import { renderDoctorReport } from "./doctor.js";

const report = {
  generatedAt: "2026-04-30T00:00:00.000Z",
  profile: "pilotflow-contest",
  checks: [
    { name: "Node.js", status: "pass", detail: "v20.0.0; expected >=20" },
    { name: "runtime env names", status: "warn", detail: "missing: PILOTFLOW_TEST_CHAT_ID" }
  ],
  summary: { passed: 1, warned: 1, failed: 0 }
};

const markdown = renderDoctorReport(report);
assert.match(markdown, /PilotFlow Doctor/);
assert.match(markdown, /pilotflow-contest/);
assert.match(markdown, /PILOTFLOW_TEST_CHAT_ID/);
assert.doesNotMatch(markdown, /secret|sk-/i);

console.log("doctor tests passed");
