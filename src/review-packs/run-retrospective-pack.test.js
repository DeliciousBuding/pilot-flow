import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRunRetrospectivePack, renderRunRetrospectiveMarkdown, selectDefaultInputPath } from "./run-retrospective-pack.js";

const pack = buildRunRetrospectivePack(
  [
    { ts: "2026-04-30T00:00:00.000Z", run_id: "run-retro", event: "run.created", mode: "live" },
    {
      ts: "2026-04-30T00:00:01.000Z",
      run_id: "run-retro",
      event: "plan.generated",
      plan: {
        goal: "Launch PilotFlow reviewer package",
        deadline: "TBD",
        members: [],
        deliverables: ["Evidence pack"],
        steps: [{ id: "step-doc", title: "Create doc", tool: "doc.create", status: "pending" }],
        risks: [{ title: "callback delivery pending", level: "medium" }]
      }
    },
    { ts: "2026-04-30T00:00:02.000Z", run_id: "run-retro", event: "plan.validation_failed", validation_errors: [{ path: "members", message: "members required" }] },
    { ts: "2026-04-30T00:00:03.000Z", run_id: "run-retro", event: "tool.called", tool_call_id: "tool-1", tool: "doc.create" },
    { ts: "2026-04-30T00:00:04.000Z", run_id: "run-retro", event: "tool.succeeded", tool_call_id: "tool-1", tool: "doc.create" },
    { ts: "2026-04-30T00:00:05.000Z", run_id: "run-retro", event: "tool.called", tool_call_id: "tool-2", tool: "announcement.update" },
    { ts: "2026-04-30T00:00:06.000Z", run_id: "run-retro", event: "tool.failed", tool_call_id: "tool-2", tool: "announcement.update", error: "232097 Unable to operate docx type chat announcement" },
    { ts: "2026-04-30T00:00:07.000Z", run_id: "run-retro", event: "optional_tool.fallback", tool: "announcement.update", fallback: "pinned_entry_message", error: "232097" },
    { ts: "2026-04-30T00:00:08.000Z", run_id: "run-retro", event: "artifact.created", artifact: { type: "doc", title: "Brief", status: "created", url: "https://example.feishu.cn/docx/demo" } },
    { ts: "2026-04-30T00:00:09.000Z", run_id: "run-retro", event: "artifact.failed", artifact: { type: "announcement", title: "Announcement", status: "failed", error: "232097 Unable to operate docx type chat announcement" } },
    { ts: "2026-04-30T00:00:10.000Z", run_id: "run-retro", event: "run.completed" }
  ],
  { inputPath: "tmp/runs/run-retro.jsonl", output: "tmp/run-retrospective/RUN_RETROSPECTIVE.md" }
);

assert.equal(pack.runId, "run-retro");
assert.equal(pack.status, "completed");
assert.equal(pack.summary.toolSucceeded, 1);
assert.equal(pack.summary.toolFailed, 1);
assert.equal(pack.qualitySignals.some((item) => item.key === "missing_members"), true);
assert.equal(pack.qualitySignals.some((item) => item.key === "deadline_tbd"), true);
assert.equal(pack.qualitySignals.some((item) => item.key === "optional_fallback_used"), true);
assert.match(pack.qualitySignals.find((item) => item.key === "plan_validation_failed")?.evidence || "", /members required/);
assert.equal(pack.improvementProposals.some((item) => item.area === "Feishu platform fallback"), true);
assert.equal(pack.evaluationSeeds.some((item) => item.id === "optional-tool-fallback"), true);

const markdown = renderRunRetrospectiveMarkdown(pack);
assert.match(markdown, /PilotFlow Run Retrospective Pack/);
assert.match(markdown, /Launch PilotFlow reviewer package/);
assert.match(markdown, /optional_fallback_used/);
assert.match(markdown, /Feishu platform fallback/);
assert.match(markdown, /optional-tool-fallback/);
assert.match(markdown, /members required/);
assert.match(markdown, /Human Review/);

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-retrospective-"));

try {
  const manualPath = join(tempDir, "tmp", "runs", "latest-manual-run.jsonl");
  const livePath = join(tempDir, "tmp", "runs", "latest-live-run.jsonl");
  await mkdir(join(tempDir, "tmp", "runs"), { recursive: true });
  await writeFile(manualPath, "", "utf8");
  assert.equal(selectDefaultInputPath(tempDir), manualPath);
  await writeFile(livePath, "", "utf8");
  assert.equal(selectDefaultInputPath(tempDir), livePath);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("run retrospective pack tests passed");
