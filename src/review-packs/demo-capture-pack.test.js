import assert from "node:assert/strict";
import { buildDemoCapturePack, renderDemoCaptureMarkdown } from "./demo-capture-pack.js";

const pack = await buildDemoCapturePack({
  runLog: "tmp/runs/latest-live-run.jsonl",
  flightRecorder: "tmp/flight-recorder/latest-live-run.html",
  evidence: "tmp/demo-evidence/DEMO_EVIDENCE.md",
  evaluation: "tmp/demo-eval/DEMO_EVAL.md",
  output: "tmp/demo-capture/CAPTURE_PACK_TEST.md"
});

assert.equal(pack.requiredCaptures.length, 7);
assert.equal(pack.evidenceFiles.length, 4);
assert.equal(pack.evidenceFiles.every((item) => typeof item.exists === "boolean"), true);
assert.equal(pack.requiredCaptures.some((item) => item.title === "Permission and callback appendix"), true);

const markdown = renderDemoCaptureMarkdown(pack);
assert.match(markdown, /PilotFlow Demo Capture Pack/);
assert.match(markdown, /Required Captures/);
assert.match(markdown, /card callback delivery is not yet fully verified/i);
assert.match(markdown, /This file is a capture plan, not proof/);

console.log("demo capture pack tests passed");
