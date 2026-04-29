import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDemoJudgePack, renderDemoJudgeMarkdown } from "./demo-judge-pack.js";

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-judge-pack-"));

try {
  const files = {
    readme: await writeTemp("README.md", "Feishu-native AI project operations officer"),
    roadmap: await writeTemp("ROADMAP.md", "## Phase 3: Demo Hardening"),
    playbook: await writeTemp("DEMO_PLAYBOOK.md", "6 to 8 minute script"),
    qa: await writeTemp("DEMO_QA.md", "PilotFlow answers"),
    readiness: await writeTemp("DEMO_READINESS.md", "- Status: `ready_for_manual_capture`"),
    permissions: await writeTemp("PERMISSION_APPENDIX.md", "# Permission Appendix Pack\n\n| Event subscribe dry-run | ready | ok |"),
    callback: await writeTemp("CALLBACK_VERIFICATION.md", "# Callback Verification Pack\n\n- Verification status: `blocked_on_platform_callback_event`"),
    evidence: await writeTemp("DEMO_EVIDENCE.md", "## Evidence Checklist"),
    failure: await writeTemp("FAILURE_DEMO.md", "DUPLICATE_RUN_BLOCKED")
  };

  const pack = await buildDemoJudgePack({
    inputOverrides: files,
    output: join(tempDir, "JUDGE_REVIEW_TEST.md")
  });

  assert.equal(pack.readinessStatus, "ready_for_manual_capture");
  assert.equal(pack.permissionStatus, "event_dry_run_ready");
  assert.equal(pack.sources.every((item) => item.ready), true);
  assert.equal(pack.coreCapabilities.length >= 8, true);

  const markdown = renderDemoJudgeMarkdown(pack);
  assert.match(markdown, /PilotFlow Judge Review Pack/);
  assert.match(markdown, /One-Line Product/);
  assert.match(markdown, /Capability Snapshot/);
  assert.match(markdown, /Callback Verification Pack/);
  assert.match(markdown, /card callback delivery remains pending/i);
  assert.match(markdown, /npm run demo:judge/);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("demo judge pack tests passed");

async function writeTemp(fileName, content) {
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, content, "utf8");
  return filePath;
}
