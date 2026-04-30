import assert from "node:assert/strict";
import { buildDemoEvalReport, renderDemoEvalMarkdown } from "./demo-eval.js";

const report = await buildDemoEvalReport({ guardPath: "tmp/tests/demo-eval-test-guard.json" });

assert.equal(report.cases.length, 5);
assert.equal(report.summary.fail, 0);
assert.equal(report.summary.pass, 5);
assert.equal(report.cases.some((item) => item.name === "Missing owner and deliverables"), true);
assert.equal(report.cases.some((item) => item.name === "Duplicate live run"), true);
assert.equal(report.cases.some((item) => item.name === "Optional tool failure fallback"), true);

const markdown = renderDemoEvalMarkdown(report);
assert.match(markdown, /PilotFlow Demo Evaluation Pack/);
assert.match(markdown, /Invalid planner schema/);
assert.match(markdown, /DUPLICATE_RUN_BLOCKED/);
assert.match(markdown, /232097/);

console.log("demo eval tests passed");
