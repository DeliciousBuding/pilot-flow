import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDemoReadinessPack, renderDemoReadinessMarkdown } from "./demo-readiness-pack.js";

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-readiness-pack-"));

try {
  const runLog = join(tempDir, "run.jsonl");
  const flightRecorder = join(tempDir, "flight.html");
  const evidence = join(tempDir, "evidence.md");
  const evaluation = join(tempDir, "eval.md");
  const capture = join(tempDir, "capture.md");
  const failure = join(tempDir, "failure.md");
  const permissions = join(tempDir, "permissions.md");
  const callback = join(tempDir, "callback.md");
  const docsDir = join(tempDir, "docs");
  await mkdir(docsDir, { recursive: true });

  await writeFile(runLog, JSON.stringify({ event: "run.completed" }), "utf8");
  await writeFile(flightRecorder, "<title>PilotFlow Flight Recorder</title>", "utf8");
  await writeFile(evidence, "# Demo Evidence\n\n## Evidence Checklist\n", "utf8");
  await writeFile(evaluation, "# Demo Eval\n\nAPI error: [232097] Unable to operate docx type chat announcement.", "utf8");
  await writeFile(capture, "# Capture\n\n## Required Captures\n", "utf8");
  await writeFile(failure, "# Failure\n\nDUPLICATE_RUN_BLOCKED\n", "utf8");
  await writeFile(permissions, "# Permission Appendix\n\n| Event subscribe dry-run | ready | ok |", "utf8");
  await writeFile(callback, "# Callback Verification\n\n- Verification status: `blocked_on_platform_callback_event`", "utf8");

  const docOverrides = {
    "Demo playbook": await writeDoc(docsDir, "playbook.md", "6 to 8 minute walkthrough"),
    "Demo Q&A": await writeDoc(docsDir, "qa.md", "PilotFlow answers"),
    "Failure paths": await writeDoc(docsDir, "failure-paths.md", "fallback paths"),
    "Evaluation workflow": await writeDoc(docsDir, "evaluation.md", "npm run demo:eval"),
    "Capture guide": await writeDoc(docsDir, "capture-guide.md", "npm run demo:capture"),
    "Failure demo guide": await writeDoc(docsDir, "failure-demo.md", "npm run demo:failure"),
    "Permission appendix guide": await writeDoc(docsDir, "permissions.md", "npm run demo:permissions"),
    "Callback verification guide": await writeDoc(docsDir, "callback.md", "npm run demo:callback-verification")
  };

  const pack = await buildDemoReadinessPack({
    evidenceOverrides: {
      runLog,
      flightRecorder,
      evidence,
      evaluation,
      capture,
      failure,
      permissions,
      callback
    },
    docOverrides,
    output: join(tempDir, "DEMO_READINESS_TEST.md")
  });

  assert.equal(pack.status, "ready_for_manual_capture");
  assert.equal(pack.summary.evidenceReady, 8);
  assert.equal(pack.summary.docsReady, 8);
  assert.equal(pack.manualCaptures.length, 4);

  const markdown = renderDemoReadinessMarkdown(pack);
  assert.match(markdown, /PilotFlow Demo Readiness Pack/);
  assert.match(markdown, /ready_for_manual_capture/);
  assert.match(markdown, /Happy-path walkthrough recording/);
  assert.match(markdown, /card\.action\.trigger/);
  assert.match(markdown, /not prove that videos or screenshots already exist/);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("demo readiness pack tests passed");

async function writeDoc(dir, fileName, content) {
  const filePath = join(dir, fileName);
  await writeFile(filePath, content, "utf8");
  return filePath;
}
