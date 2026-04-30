import assert from "node:assert/strict";
import { test } from "node:test";
import { preflight, preflightProjectInit } from "../../src/safety/preflight.js";
import type { RuntimeConfig } from "../../src/types/config.js";

const baseConfig: RuntimeConfig = {
  mode: "dry-run",
  profile: "pilotflow-contest",
  feishuTargets: {},
  duplicateGuard: { enabled: false, storagePath: "tmp/test.json", ttlMs: 1000, allowDuplicateRun: false },
  autoConfirm: false,
  verbose: false,
};

test("preflight allows dry-run without targets", () => {
  assert.deepEqual(preflight(baseConfig, "base.write", ["baseToken", "baseTableId"]), { ok: true, missing: [], warnings: [] });
});

test("preflight checks only requested live targets", () => {
  const result = preflight({ ...baseConfig, mode: "live" }, "base.write", ["baseToken", "baseTableId"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["PILOTFLOW_BASE_TOKEN", "PILOTFLOW_BASE_TABLE_ID"]);
});

test("task.create warns without tasklist instead of blocking", () => {
  const result = preflight({ ...baseConfig, mode: "live" }, "task.create");
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
});

test("project-init preflight checks the full live target set before writes", () => {
  const result = preflightProjectInit({ ...baseConfig, mode: "live" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["PILOTFLOW_BASE_TOKEN", "PILOTFLOW_BASE_TABLE_ID", "PILOTFLOW_TEST_CHAT_ID"]);
});
