import assert from "node:assert/strict";
import { test } from "node:test";
import { basename } from "node:path";
import { loadRuntimeConfig } from "../../src/config/runtime-config.js";

test("loadRuntimeConfig preserves CLI and env names", () => {
  const config = loadRuntimeConfig(["--live", "--chat-id", "oc_1"], {
    PILOTFLOW_LARK_PROFILE: "pilotflow-contest",
    PILOTFLOW_BASE_TOKEN: "base-token",
    PILOTFLOW_BASE_TABLE_ID: "tbl_1",
  });
  assert.equal(config.mode, "live");
  assert.equal(config.profile, "pilotflow-contest");
  assert.equal(config.feishuTargets.chatId, "oc_1");
  assert.equal(config.feishuTargets.baseToken, "base-token");
  assert.equal(config.duplicateGuard.enabled, true);
  assert.equal(basename(config.duplicateGuard.storagePath), "project-init-runs");
  assert.equal(config.autoConfirm, false);
  assert.equal(config.verbose, false);
});

test("loadRuntimeConfig accepts the public Task assignee env alias", () => {
  const config = loadRuntimeConfig([], {
    PILOTFLOW_TASK_ASSIGNEE_OPEN_ID: "ou_owner",
  });
  assert.equal(config.feishuTargets.ownerOpenId, "ou_owner");
});

test("loadRuntimeConfig loads complete LLM env", () => {
  const config = loadRuntimeConfig([], {
    PILOTFLOW_LLM_BASE_URL: "https://api.example.test",
    PILOTFLOW_LLM_API_KEY: "local-key",
    PILOTFLOW_LLM_MODEL: "gpt-test",
  });
  assert.equal(config.llm?.model, "gpt-test");
});

test("loadRuntimeConfig rejects invalid mode", () => {
  assert.throws(() => loadRuntimeConfig([], { PILOTFLOW_FEISHU_MODE: "prod" }), /Unsupported PILOTFLOW_FEISHU_MODE/);
});
