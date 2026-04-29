import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCaptureManifestTemplate, buildDemoSubmissionPack, renderDemoSubmissionMarkdown } from "./demo-submission-pack.js";

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-submission-pack-"));

try {
  const sources = {
    readiness: await writeTemp("readiness.md", "ready_for_manual_capture"),
    judge: await writeTemp("judge.md", "PilotFlow Judge Review Pack"),
    callback: await writeTemp("callback.md", "Verification status: `blocked_on_platform_callback_event`"),
    capture: await writeTemp("capture.md", "Required Captures"),
    permissions: await writeTemp("permissions.md", "Event subscribe dry-run"),
    failure: await writeTemp("failure.md", "DUPLICATE_RUN_BLOCKED")
  };

  const pendingPack = await buildDemoSubmissionPack({
    sourceOverrides: sources,
    output: join(tempDir, "PENDING.md")
  });

  assert.equal(pendingPack.status, "machine_ready_manual_capture_pending");
  assert.equal(pendingPack.summary.sourceReady, 6);
  assert.equal(pendingPack.summary.manualReady, 0);

  const captureDir = join(tempDir, "captures");
  await mkdir(captureDir, { recursive: true });
  const captureFiles = await Promise.all([
    writeTemp("captures/happy.mp4", "video"),
    writeTemp("captures/failure.mp4", "video"),
    writeTemp("captures/permissions.png", "image"),
    writeTemp("captures/callback.png", "image")
  ]);
  const manifest = await writeTemp(
    "capture-manifest.json",
    JSON.stringify(
      {
        captures: [
          capture("Happy-path walkthrough recording", captureFiles[0]),
          capture("Failure-path walkthrough recording or screenshots", captureFiles[1]),
          capture("Open Platform permission screenshots", captureFiles[2]),
          capture("Callback configuration proof", captureFiles[3])
        ]
      },
      null,
      2
    )
  );

  const readyPack = await buildDemoSubmissionPack({
    sourceOverrides: sources,
    captureManifest: manifest,
    output: join(tempDir, "READY.md")
  });

  assert.equal(readyPack.status, "ready_for_submission_review");
  assert.equal(readyPack.summary.manualReady, 4);
  assert.equal(readyPack.manualCaptures[0].sizeBytes, 5);
  assert.equal(readyPack.manualCaptures[0].sha256, sha256("video"));

  const markdown = renderDemoSubmissionMarkdown(readyPack);
  assert.match(markdown, /PilotFlow Demo Submission Pack/);
  assert.match(markdown, /ready_for_submission_review/);
  assert.match(markdown, /Manual Capture Manifest/);
  assert.match(markdown, /SHA-256/);
  assert.match(markdown, /Do not include App Secret/);

  const template = buildCaptureManifestTemplate();
  assert.equal(template.version, 1);
  assert.equal(template.captures.length, 4);
  assert.equal(template.captures.every((item) => item.status === "pending"), true);
  assert.equal(template.captures.every((item) => item.redacted === false), true);
  assert.equal(template.captures.every((item) => item.reviewed_at === ""), true);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("demo submission pack tests passed");

async function writeTemp(relativePath, content) {
  const filePath = join(tempDir, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}

function capture(label, filePath) {
  return {
    label,
    status: "ready",
    path: filePath,
    redacted: true
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
