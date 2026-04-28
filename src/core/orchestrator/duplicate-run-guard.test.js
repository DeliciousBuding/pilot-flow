import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildProjectInitDedupeKey,
  duplicateGuardSummary,
  DuplicateRunGuard
} from "./duplicate-run-guard.js";

const filePath = resolve("tmp/tests/duplicate-run-guard-test.json");
await rm(filePath, { force: true });

const plan = {
  goal: "Launch PilotFlow MVP",
  deadline: "2026-05-02",
  deliverables: ["Project brief", "task board"]
};

const key = buildProjectInitDedupeKey({
  inputText: " Launch  PilotFlow MVP ",
  plan,
  profile: "pilotflow-contest",
  targets: {
    chatId: "oc_secret_chat",
    baseToken: "base_secret_token",
    baseTableId: "tbl_demo"
  }
});

assert.match(key, /^project_init:[a-f0-9]{24}$/);
assert.equal(key.includes("base_secret_token"), false);
assert.equal(
  key,
  buildProjectInitDedupeKey({
    inputText: "Launch PilotFlow MVP",
    plan,
    profile: "pilotflow-contest",
    targets: {
      chatId: "oc_secret_chat",
      baseToken: "base_secret_token",
      baseTableId: "tbl_demo"
    }
  })
);
assert.equal(
  buildProjectInitDedupeKey({ explicitKey: "manual-demo-key", inputText: "x", plan }),
  "manual-demo-key"
);

const guard = new DuplicateRunGuard({ filePath, enabled: true });
const started = await guard.start({
  key,
  runId: "run-1",
  summary: duplicateGuardSummary({ plan, mode: "live", profile: "pilotflow-contest" })
});
assert.equal(started.status, "started");

await guard.mark({ key, runId: "run-1", status: "completed", artifacts: [{ id: "doc-1" }] });

await assert.rejects(
  () => guard.start({ key, runId: "run-2", summary: {} }),
  (error) => {
    assert.equal(error.code, "DUPLICATE_RUN_BLOCKED");
    assert.equal(error.existingRun.run_id, "run-1");
    assert.equal(error.existingRun.status, "completed");
    assert.equal(error.existingRun.artifact_count, 1);
    return true;
  }
);

const bypassed = await new DuplicateRunGuard({ filePath, enabled: true, allowDuplicate: true }).start({
  key,
  runId: "run-3",
  summary: {}
});
assert.equal(bypassed.status, "bypassed");

console.log("duplicate run guard tests passed");
