import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDemoSafetyAuditPack, renderDemoSafetyAuditMarkdown } from "./demo-safety-audit-pack.js";

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-safety-audit-"));

try {
  const cleanTargets = await createCleanTargets();
  const cleanPack = await buildDemoSafetyAuditPack({
    targetOverrides: cleanTargets,
    output: join(tempDir, "SAFETY_AUDIT.md")
  });

  assert.equal(cleanPack.status, "passed");
  assert.equal(cleanPack.summary.findings, 0);
  assert.equal(cleanPack.summary.missingRequired, 0);
  assert.ok(cleanPack.summary.scannedFiles >= 5);

  const cleanMarkdown = renderDemoSafetyAuditMarkdown(cleanPack);
  assert.match(cleanMarkdown, /PilotFlow Demo Safety Audit Pack/);
  assert.match(cleanMarkdown, /No secret-like findings detected/);

  const dirtyReadme = await writeTemp("dirty/README.md", `Do not publish ${["Bearer", "abcdefghijklmnopqrstuvwxyz123456"].join(" ")}`);
  const dirtyTargets = {
    ...cleanTargets,
    readme: dirtyReadme
  };
  const dirtyPack = await buildDemoSafetyAuditPack({ targetOverrides: dirtyTargets });
  assert.equal(dirtyPack.status, "blocked_secret_findings");
  assert.equal(dirtyPack.summary.highFindings, 1);
  assert.equal(dirtyPack.findings[0].rule, "bearer_token");
  assert.match(renderDemoSafetyAuditMarkdown(dirtyPack), /\[redacted\]/);

  const openIdDoc = await writeTemp("open-id/README.md", `User open id: ${["ou", "1234567890abcdef1234567890abcdef"].join("_")}`);
  const mediumPack = await buildDemoSafetyAuditPack({
    targetOverrides: {
      ...cleanTargets,
      readme: openIdDoc
    }
  });
  assert.equal(mediumPack.status, "review_findings_present");
  assert.equal(mediumPack.summary.mediumFindings, 1);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("demo safety audit pack tests passed");

async function createCleanTargets() {
  const docsDir = join(tempDir, "docs");
  const srcDir = join(tempDir, "src");
  await mkdir(docsDir, { recursive: true });
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(docsDir, "README.md"), "PilotFlow docs without secrets.", "utf8");
  await writeFile(join(docsDir, "demo.md"), "App Secret must be hidden, but no value is present.", "utf8");
  await writeFile(join(srcDir, "index.js"), "export const placeholder = 'ou_xxx';\n", "utf8");

  return {
    readme: await writeTemp("README.md", "Feishu-native AI project operations officer"),
    package: await writeTemp("package.json", "{\"name\":\"pilot-flow\"}"),
    docs: docsDir,
    src: srcDir,
    readiness: await writeTemp("tmp/demo-readiness/DEMO_READINESS.md", "ready_for_manual_capture"),
    judge: await writeTemp("tmp/demo-judge/JUDGE_REVIEW.md", "PilotFlow Judge Review Pack"),
    submission: await writeTemp("tmp/demo-submission/SUBMISSION_PACK.md", "PilotFlow Demo Submission Pack"),
    deliveryIndex: await writeTemp("tmp/demo-delivery/DELIVERY_INDEX.md", "PilotFlow Demo Delivery Index"),
    permissions: await writeTemp("tmp/demo-permissions/PERMISSION_APPENDIX.md", "Event subscribe dry-run"),
    callback: await writeTemp("tmp/demo-callback/CALLBACK_VERIFICATION.md", "Verification status"),
    capture: await writeTemp("tmp/demo-capture/CAPTURE_PACK.md", "Required Captures"),
    failure: await writeTemp("tmp/demo-failure/FAILURE_DEMO.md", "DUPLICATE_RUN_BLOCKED"),
    evidence: await writeTemp("tmp/demo-evidence/DEMO_EVIDENCE.md", "Evidence Checklist"),
    evaluation: await writeTemp("tmp/demo-eval/DEMO_EVAL.md", "232097"),
    flightRecorder: await writeTemp("tmp/flight-recorder/latest.html", "PilotFlow Flight Recorder")
  };
}

async function writeTemp(relativePath, content) {
  const filePath = join(tempDir, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}
