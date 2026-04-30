import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildPilotRunArgv, renderPilotRun, runPilotRun } from "../../src/interfaces/cli/pilot-run.js";

test("buildPilotRunArgv adds product surfaces and dry-run latest output by default", () => {
  const argv = buildPilotRunArgv(["--input", "launch"]);

  assert.deepEqual(argv.slice(0, 2), ["--input", "launch"]);
  assert.equal(argv.includes("--dry-run"), true);
  assert.equal(argv.includes("--send-plan-card"), true);
  assert.equal(argv.includes("--send-entry-message"), true);
  assert.equal(argv.includes("--pin-entry-message"), true);
  assert.equal(argv.includes("--send-risk-card"), true);
  assert.equal(argv.includes("--output"), true);
  assert.equal(argv.at(-1), "tmp/runs/latest-manual-run.jsonl");
});

test("buildPilotRunArgv uses latest-live-run output for live mode", () => {
  const argv = buildPilotRunArgv(["--live", "--confirm", "确认执行"]);

  assert.equal(argv.includes("--live"), true);
  assert.equal(argv.includes("--send-plan-card"), true);
  assert.equal(argv.at(-1), "tmp/runs/latest-live-run.jsonl");
});

test("buildPilotRunArgv does not send live confirmation card before confirmation", () => {
  const argv = buildPilotRunArgv(["--live"]);

  assert.equal(argv.includes("--send-plan-card"), false);
  assert.equal(argv.includes("--send-entry-message"), false);
  assert.equal(argv.includes("--pin-entry-message"), false);
  assert.equal(argv.includes("--send-risk-card"), false);
  assert.equal(argv.at(-1), "tmp/runs/latest-live-run.jsonl");
});

test("buildPilotRunArgv preserves explicit output and explicit surface flags", () => {
  const argv: readonly string[] = buildPilotRunArgv(["--output", "tmp/custom.jsonl", "--send-plan-card"]);

  assert.equal(argv.filter((item) => item === "--output").length, 1);
  assert.equal(argv.at(argv.indexOf("--output") + 1), "tmp/custom.jsonl");
  assert.equal(argv.filter((item) => item === "--send-plan-card").length, 1);
});

test("runPilotRun completes the product dry-run path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-pilot-run-"));
  try {
    const output = join(dir, "run.jsonl");
    const result = await runPilotRun({
      argv: [
        "--dry-run",
        "--input",
        "目标: 建立答辩项目空间\n成员: 产品, 技术\n交付物: Brief, Task\n截止时间: 2026-05-03",
        "--output",
        output,
      ],
      env: {},
    });

    assert.equal(result.status, "completed");
    assert.equal(result.mode, "dry-run");
    assert.equal(result.productSurfaces.planCard, true);
    assert.equal(result.productSurfaces.entryMessage, true);
    assert.equal(result.productSurfaces.pinnedEntry, true);
    assert.equal(result.productSurfaces.riskCard, true);
    assert.match(renderPilotRun(result), /next: npm run pilot:recorder/u);
    assert.match(renderPilotRun(result), new RegExp(`review:retrospective -- --input ${escapeRegExp(output)}`));
    assert.match(renderPilotRun(result), new RegExp(`review:retrospective-eval -- --input ${escapeRegExp(output)}`));

    const log = await readFile(output, "utf8");
    assert.match(log, /"type":"run.completed"/u);
    assert.match(log, /"tool":"card.send"/u);
    assert.match(log, /"tool":"entry.pin"/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runPilotRun forces dry-run unless live mode is explicit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-pilot-run-env-"));
  try {
    const output = join(dir, "run.jsonl");
    const result = await runPilotRun({
      argv: ["--input", "目标: 建立答辩项目空间", "--output", output],
      env: { PILOTFLOW_FEISHU_MODE: "live" },
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.status, "completed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runPilotRun loads local .env without overriding explicit dry-run default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-pilot-run-local-env-"));
  try {
    const output = join(dir, "run.jsonl");
    await writeFile(join(dir, ".env"), "PILOTFLOW_FEISHU_MODE=live\nPILOTFLOW_LARK_PROFILE=from-file\n", "utf8");
    const result = await runPilotRun({
      argv: ["--input", "目标: 建立答辩项目空间", "--output", output],
      env: {},
      cwd: dir,
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.status, "completed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
