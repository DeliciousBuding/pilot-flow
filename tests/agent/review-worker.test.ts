import assert from "node:assert/strict";
import test from "node:test";
import { runReviewWorker, type WorkerRequest } from "../../src/agent/review-worker.js";

test("runReviewWorker returns preview-only review artifacts", async () => {
  const request: WorkerRequest = {
    runId: "run-worker",
    workerType: "review",
    objective: "Review PilotFlow run quality before publishing",
    inputs: {
      retrospective: {
        qualitySignals: [
          { key: "optional_fallback_used", severity: "medium", evidence: "announcement.update -> pinned_entry_message" },
          { key: "deadline_tbd", severity: "medium", evidence: "The generated deadline is TBD." },
        ],
        improvementProposals: [
          { area: "Feishu platform fallback", proposal: "Keep pinned entry fallback.", evidence: "232097" },
        ],
      },
      eval: {
        status: "failed",
        summary: { passed: 3, failed: 2, total: 5 },
      },
    },
    allowedTools: ["read.retrospective", "read.eval"],
    outputContract: "preview-only",
    riskLevel: "medium",
  };

  const result = await runReviewWorker(request);

  assert.equal(result.status, "completed");
  assert.match(result.summary, /2 quality signals/u);
  assert.equal(result.artifacts[0]?.type, "worker_review");
  assert.equal(result.proposedFeishuWrites.length, 1);
  assert.equal(result.proposedFeishuWrites[0]?.confirmed, false);
  assert.equal(result.risks.includes("This run has failed eval cases before publishing."), true);
  assert.equal(result.nextConfirmation, "Review proposed Feishu write before publishing.");
});

test("runReviewWorker rejects non-review worker requests", async () => {
  await assert.rejects(
    () => runReviewWorker({
      runId: "run-worker",
      workerType: "doc",
      objective: "Write a doc",
      inputs: {},
      allowedTools: [],
      outputContract: "preview-only",
      riskLevel: "low",
    }),
    /only handles review worker requests/u,
  );
});

test("runReviewWorker fails closed when output contract is not preview-only", async () => {
  await assert.rejects(
    () => runReviewWorker({
      runId: "run-worker",
      workerType: "review",
      objective: "Review",
      inputs: {},
      allowedTools: [],
      outputContract: "publish",
      riskLevel: "low",
    }),
    /preview-only/u,
  );
});
