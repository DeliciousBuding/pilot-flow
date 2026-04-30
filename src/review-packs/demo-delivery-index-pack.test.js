import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDemoDeliveryIndexPack, renderDemoDeliveryIndexMarkdown } from "./demo-delivery-index-pack.js";

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-delivery-index-"));

try {
  const sources = {
    readme: await writeTemp("README.md", "Feishu-native AI project operations officer"),
    docsIndex: await writeTemp("docs/README.md", "PilotFlow docs"),
    demoKit: await writeTemp("docs/demo/README.md", "PilotFlow Demo Kit"),
    playbook: await writeTemp("docs/demo/DEMO_PLAYBOOK.md", "6 to 8 minute walkthrough"),
    captureGuide: await writeTemp("docs/demo/CAPTURE_GUIDE.md", "Required Captures"),
    failurePaths: await writeTemp("docs/demo/FAILURE_PATHS.md", "Fallback map"),
    readiness: await writeTemp("tmp/demo-readiness/DEMO_READINESS.md", "- Status: `ready_for_manual_capture`"),
    judge: await writeTemp("tmp/demo-judge/JUDGE_REVIEW.md", "PilotFlow Judge Review Pack"),
    submission: await writeTemp("tmp/demo-submission/SUBMISSION_PACK.md", "PilotFlow Demo Submission Pack\n- Status: `machine_ready_manual_capture_pending`\n- Manual captures: 0/4"),
    callback: await writeTemp("tmp/demo-callback/CALLBACK_VERIFICATION.md", "Verification status: `blocked_on_platform_callback_event`"),
    permissions: await writeTemp("tmp/demo-permissions/PERMISSION_APPENDIX.md", "Event subscribe dry-run"),
    capture: await writeTemp("tmp/demo-capture/CAPTURE_PACK.md", "Required Captures"),
    failure: await writeTemp("tmp/demo-failure/FAILURE_DEMO.md", "DUPLICATE_RUN_BLOCKED"),
    evidence: await writeTemp("tmp/demo-evidence/DEMO_EVIDENCE.md", "Evidence Checklist"),
    evaluation: await writeTemp("tmp/demo-eval/DEMO_EVAL.md", "232097"),
    retrospective: await writeTemp("tmp/run-retrospective/RUN_RETROSPECTIVE.md", "PilotFlow Run Retrospective Pack"),
    flightRecorder: await writeTemp("tmp/flight-recorder/latest.html", "PilotFlow Flight Recorder"),
    runLog: await writeTemp("tmp/runs/latest.jsonl", "run.completed")
  };

  const pendingPack = await buildDemoDeliveryIndexPack({
    sourceOverrides: sources,
    output: join(tempDir, "DELIVERY_INDEX.md")
  });

  assert.equal(pendingPack.status, "ready_for_manual_capture");
  assert.equal(pendingPack.readinessStatus, "ready_for_manual_capture");
  assert.equal(pendingPack.submissionStatus, "machine_ready_manual_capture_pending");
  assert.equal(pendingPack.callbackStatus, "blocked_on_platform_callback_event");
  assert.equal(pendingPack.manualCaptures.ready, 0);
  assert.equal(pendingPack.manualCaptures.total, 4);
  assert.equal(pendingPack.summary.requiredReady, pendingPack.summary.requiredTotal);

  const markdown = renderDemoDeliveryIndexMarkdown(pendingPack);
  assert.match(markdown, /PilotFlow Demo Delivery Index/);
  assert.match(markdown, /Recommended Opening Order/);
  assert.match(markdown, /Demo Submission Pack/);
  assert.match(markdown, /Run Retrospective Pack/);
  assert.match(markdown, /ready_for_manual_capture/);

  const readySources = {
    ...sources,
    submission: await writeTemp("tmp/demo-submission/SUBMISSION_PACK_READY.md", "PilotFlow Demo Submission Pack\n- Status: `ready_for_submission_review`\n- Manual captures: 4/4"),
    callback: await writeTemp("tmp/demo-callback/CALLBACK_VERIFICATION_READY.md", "Verification status: `verified_with_real_callback_event`")
  };
  const readyPack = await buildDemoDeliveryIndexPack({ sourceOverrides: readySources });
  assert.equal(readyPack.status, "ready_for_submission_review");
  assert.equal(readyPack.manualCaptures.ready, 4);

  const missingPack = await buildDemoDeliveryIndexPack({
    sourceOverrides: {
      ...sources,
      evidence: join(tempDir, "missing.md")
    }
  });
  assert.equal(missingPack.status, "needs_regeneration");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("demo delivery index pack tests passed");

async function writeTemp(relativePath, content) {
  const filePath = join(tempDir, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}
