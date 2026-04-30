import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveCheckReport, renderLiveCheckReport } from "../../src/interfaces/cli/live-check.js";
import type { CommandResult } from "../../src/infrastructure/command-runner.js";

type TestCheck = { readonly name: string; readonly status: string };

test("buildLiveCheckReport checks live targets with redacted details", async () => {
  const calls: readonly string[][] = [];
  const report = await buildLiveCheckReport({
    argv: ["--profile", "pilotflow-contest"],
    env: {
      PILOTFLOW_TEST_CHAT_ID: "oc_secret_chat_123456",
      PILOTFLOW_BASE_TOKEN: "bascn_secret_base_123456",
      PILOTFLOW_BASE_TABLE_ID: "tbl_secret_table_123456",
    },
    runCommand: async (bin: string, args: readonly string[], options: { readonly profile?: string }) => {
      (calls as string[][]).push([bin, ...args, options.profile ?? ""]);
      return okResult([bin, ...args]);
    },
  });

  assert.equal(report.summary.failed, 0);
  assert.equal(checkStatus(report.checks, "chat readable"), "pass");
  assert.equal(checkStatus(report.checks, "base table readable"), "pass");

  const rendered = renderLiveCheckReport(report);
  assert.match(rendered, /PilotFlow Live Check/u);
  assert.match(rendered, /pilotflow-contest/u);
  assert.doesNotMatch(rendered, /oc_secret_chat_123456/u);
  assert.doesNotMatch(rendered, /bascn_secret_base_123456/u);
  assert.doesNotMatch(rendered, /tbl_secret_table_123456/u);
  assert.doesNotMatch(rendered, /Bearer|sk-/iu);
  assert.equal(calls.some((call) => call.includes("/open-apis/im/v1/chats/oc_secret_chat_123456")), true);
  assert.equal(calls.some((call) => call.includes("/open-apis/bitable/v1/apps/bascn_secret_base_123456/tables/tbl_secret_table_123456")), true);
});

test("buildLiveCheckReport reports missing env without live API calls", async () => {
  let commandCount = 0;
  const report = await buildLiveCheckReport({
    env: {},
    runCommand: async (bin: string, args: readonly string[]) => {
      commandCount += 1;
      return okResult([bin, ...args]);
    },
  });

  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.warned > 0, true);
  assert.equal(checkStatus(report.checks, "chat readable"), "warn");
  assert.equal(checkStatus(report.checks, "base table readable"), "warn");
  assert.equal(commandCount, 2);
});

test("buildLiveCheckReport ignores partial LLM env because it only checks Feishu live targets", async () => {
  const report = await buildLiveCheckReport({
    env: { PILOTFLOW_LLM_API_KEY: "sk-local-test-secret" },
    runCommand: async (bin: string, args: readonly string[]) => okResult([bin, ...args]),
  });

  assert.equal(report.summary.failed, 0);
});

function okResult(command: readonly string[]): CommandResult {
  return {
    ok: true,
    exitCode: 0,
    exit_code: 0,
    stdout: "{}",
    stderr: "",
    command,
    json: {},
  };
}

function checkStatus(checks: readonly TestCheck[], name: string): string | undefined {
  return checks.find((item) => item.name === name)?.status;
}
