import assert from "node:assert/strict";
import { buildRetrospectiveEvalPack, renderRetrospectiveEvalMarkdown } from "./retrospective-eval.js";

const events = [
  { ts: "2026-04-30T00:00:00.000Z", run_id: "run-eval", event: "run.created", mode: "live" },
  {
    ts: "2026-04-30T00:00:01.000Z",
    run_id: "run-eval",
    event: "plan.generated",
    plan: {
      goal: "Launch PilotFlow eval loop",
      deadline: "TBD",
      members: [],
      deliverables: ["Eval pack"],
      steps: [{ id: "step-doc", title: "Create doc", tool: "doc.create", status: "pending" }],
      risks: []
    }
  },
  { ts: "2026-04-30T00:00:02.000Z", run_id: "run-eval", event: "plan.validation_failed", validation_errors: [{ path: "members", message: "members required" }] },
  { ts: "2026-04-30T00:00:03.000Z", run_id: "run-eval", event: "tool.failed", tool_call_id: "tool-2", tool: "announcement.update", error: "232097" },
  { ts: "2026-04-30T00:00:04.000Z", run_id: "run-eval", event: "optional_tool.fallback", tool: "announcement.update", fallback: "pinned_entry_message", error: "232097" },
  { ts: "2026-04-30T00:00:05.000Z", run_id: "run-eval", event: "run.completed" }
];

const pack = buildRetrospectiveEvalPack(events, { inputPath: "tmp/runs/run-eval.jsonl" });

assert.equal(pack.runId, "run-eval");
assert.equal(pack.status, "passed");
assert.equal(pack.summary.passed, 5);
assert.equal(pack.summary.total, 5);
assert.equal(pack.cases.find((item) => item.id === "optional-tool-fallback")?.status, "passed");
assert.equal(pack.cases.find((item) => item.id === "missing-owner-clarification")?.status, "passed");
assert.equal(pack.cases.find((item) => item.id === "deadline-tbd-clarification")?.status, "passed");
assert.equal(pack.cases.find((item) => item.id === "planner-validation-fallback")?.status, "passed");
assert.equal(pack.cases.find((item) => item.id === "tool-failure-trace")?.status, "passed");

const cleanPack = buildRetrospectiveEvalPack([
  { run_id: "run-clean", event: "run.created", mode: "dry-run" },
  { run_id: "run-clean", event: "plan.generated", plan: { goal: "Clean", deadline: "2026-05-03", members: ["owner"], deliverables: ["Brief"], steps: [], risks: [] } },
  { run_id: "run-clean", event: "run.completed" }
]);

assert.equal(cleanPack.status, "passed");
assert.equal(cleanPack.summary.passed, 0);
assert.equal(cleanPack.summary.not_applicable, 5);

const markdown = renderRetrospectiveEvalMarkdown(pack);
assert.match(markdown, /PilotFlow Retrospective Eval/);
assert.match(markdown, /optional-tool-fallback/);
assert.match(markdown, /planner-validation-fallback/);
assert.match(markdown, /passed/);

console.log("retrospective eval tests passed");
