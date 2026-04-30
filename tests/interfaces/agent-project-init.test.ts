import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { renderAgentProjectInit, runAgentProjectInit } from "../../src/interfaces/cli/agent-project-init.js";

test("runAgentProjectInit completes the TS orchestrator dry-run bridge", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-agent-project-"));
  try {
    const output = join(dir, "run.jsonl");
    const result = await runAgentProjectInit({
      argv: [
        "--dry-run",
        "--input",
        "目标: 建立答辩项目空间\n成员: 产品, 技术\n交付物: Brief, Task\n截止时间: 2026-05-03",
        "--output",
        output,
        "--send-entry-message",
        "--send-risk-card",
      ],
      env: {},
    });

    assert.equal(result.status, "completed");
    assert.equal(result.mode, "dry-run");
    assert.equal(result.artifactCount > 0, true);
    assert.match(renderAgentProjectInit(result), /status: completed/u);

    const log = await readFile(output, "utf8");
    assert.match(log, /"type":"run.completed"/u);
    assert.match(log, /"tool":"doc.create"/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runAgentProjectInit live mode waits for explicit confirmation before side effects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-agent-project-"));
  try {
    const output = join(dir, "waiting.jsonl");
    const result = await runAgentProjectInit({
      argv: ["--live", "--input", "launch", "--output", output],
      env: { PILOTFLOW_FEISHU_MODE: "live" },
    });

    assert.equal(result.status, "waiting_confirmation");
    assert.equal(result.artifactCount, 0);
    const log = await readFile(output, "utf8");
    assert.match(log, /"type":"run.waiting_confirmation"/u);
    assert.doesNotMatch(log, /"type":"tool.called"/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runAgentProjectInit live mode preflights all targets before confirmed writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-agent-project-"));
  try {
    const output = join(dir, "preflight.jsonl");
    await assert.rejects(
      () => runAgentProjectInit({
        argv: ["--live", "--confirm", "确认执行", "--input", "launch", "--output", output],
        env: { PILOTFLOW_FEISHU_MODE: "live" },
      }),
      /Missing required Feishu targets before side effects/u,
    );
    const log = await readFile(output, "utf8");
    assert.doesNotMatch(log, /"type":"tool.called"/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runAgentProjectInit ignores partial LLM env because Day 6 uses deterministic planner", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-agent-project-"));
  try {
    const result = await runAgentProjectInit({
      argv: ["--dry-run", "--output", join(dir, "run.jsonl")],
      env: { PILOTFLOW_LLM_BASE_URL: "https://partial.example.test" },
    });

    assert.equal(result.status, "completed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
