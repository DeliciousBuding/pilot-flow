import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildLiveCheckReport, renderLiveCheckReport } from "../../src/interfaces/cli/live-check.js";
import type { CommandResult } from "../../src/infrastructure/command-runner.js";

type TestCheck = { readonly name: string; readonly status: string };

test("buildLiveCheckReport checks live targets with redacted details", async () => {
  const calls: string[][] = [];
  const profiles: string[] = [];
  const report = await buildLiveCheckReport({
    argv: ["--profile", "pilotflow-contest"],
    env: {
      PILOTFLOW_TEST_CHAT_ID: "oc_secret_chat_123456",
      PILOTFLOW_BASE_TOKEN: "bascn_secret_base_123456",
      PILOTFLOW_BASE_TABLE_ID: "tbl_secret_table_123456",
    },
    runCommand: async (bin: string, args: readonly string[], options: { readonly profile?: string }) => {
      calls.push([bin, ...args]);
      if (options.profile) profiles.push(options.profile);
      return okResult([bin, ...args]);
    },
  });

  assert.equal(report.summary.failed, 0);
  assert.equal(checkStatus(report.checks, "IM event receive scope"), "pass");
  assert.equal(checkStatus(report.checks, "IM event subscribe dry-run"), "pass");
  assert.equal(checkStatus(report.checks, "card callback subscribe dry-run"), "pass");
  assert.equal(checkStatus(report.checks, "callback probe card dry-run"), "pass");
  assert.equal(checkStatus(report.checks, "event bus status"), "pass");
  assert.equal(checkStatus(report.checks, "chat readable"), "pass");
  assert.equal(checkStatus(report.checks, "base table readable"), "pass");
  assert.equal(checkStatus(report.checks, "bot mention identity"), "warn");

  const rendered = renderLiveCheckReport(report);
  assert.match(rendered, /PilotFlow Live Check/u);
  assert.match(rendered, /pilotflow-contest/u);
  assert.doesNotMatch(rendered, /oc_secret_chat_123456/u);
  assert.doesNotMatch(rendered, /bascn_secret_base_123456/u);
  assert.doesNotMatch(rendered, /tbl_secret_table_123456/u);
  assert.doesNotMatch(rendered, /Bearer|sk-/iu);
  assert.equal(calls.some((call) => call.includes("/open-apis/im/v1/chats/oc_secret_chat_123456")), true);
  assert.equal(calls.some((call) => call.join(" ").includes("im +messages-send --as user --chat-id oc_secret_chat_123456 --msg-type interactive")), true);
  assert.equal(calls.some((call) => call.some((arg) => arg.includes('"pilotflow_action":"confirm_execute"'))), true);
  assert.equal(calls.some((call) => call.join(" ") === "lark-cli base +table-get --base-token bascn_secret_base_123456 --table-id tbl_secret_table_123456 --as user"), true);
  assert.equal(calls.some((call) => call.includes("--format")), false);
  assert.equal(profiles.includes("pilotflow-contest"), true);
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
  assert.equal(checkStatus(report.checks, "callback probe card dry-run"), "warn");
  assert.equal(checkStatus(report.checks, "bot mention identity"), "warn");
  assert.equal(commandCount, 6);
});

test("buildLiveCheckReport warns when the IM event receive scope is missing", async () => {
  const report = await buildLiveCheckReport({
    env: {},
    runCommand: async (bin: string, args: readonly string[]) => {
      if (args.join(" ") === "auth check --scope im:message.p2p_msg:readonly") {
        throw new Error("missing scope");
      }
      return okResult([bin, ...args]);
    },
  });

  const scopeCheck = report.checks.find((item) => item.name === "IM event receive scope");
  assert.equal(scopeCheck?.status, "warn");
  assert.match(scopeCheck?.detail ?? "", /im:message\.p2p_msg:readonly/u);
  assert.equal(report.nextActions.length, 2);
  assert.match(report.nextActions[0]?.action ?? "", /lark-cli auth login --profile pilotflow-contest --scope "im:message\.p2p_msg:readonly"/u);
  assert.match(renderLiveCheckReport(report), /Next actions:/u);
});

test("buildLiveCheckReport fails when the IM event subscribe command cannot be constructed", async () => {
  const report = await buildLiveCheckReport({
    env: {},
    runCommand: async (bin: string, args: readonly string[]) => {
      if (args.join(" ") === "event +subscribe --as bot --event-types im.message.receive_v1 --dry-run") {
        throw new Error("subscribe dry-run failed");
      }
      return okResult([bin, ...args]);
    },
  });

  const subscribeCheck = report.checks.find((item) => item.name === "IM event subscribe dry-run");
  assert.equal(subscribeCheck?.status, "fail");
  assert.match(subscribeCheck?.detail ?? "", /subscribe dry-run failed/u);
  assert.equal(report.nextActions.some((item) => /event subscription command/u.test(item.reason)), true);
});

test("buildLiveCheckReport fails when the card callback subscribe command cannot be constructed", async () => {
  const report = await buildLiveCheckReport({
    env: {},
    runCommand: async (bin: string, args: readonly string[]) => {
      if (args.join(" ") === "event +subscribe --as bot --event-types card.action.trigger --dry-run") {
        throw new Error("card subscribe dry-run failed");
      }
      return okResult([bin, ...args]);
    },
  });

  const subscribeCheck = report.checks.find((item) => item.name === "card callback subscribe dry-run");
  assert.equal(subscribeCheck?.status, "fail");
  assert.match(subscribeCheck?.detail ?? "", /card subscribe dry-run failed/u);
  assert.equal(report.nextActions.some((item) => /card callback subscription/u.test(item.reason)), true);
  assert.equal(report.nextActions.some((item) => /card\.action\.trigger/u.test(item.action)), true);
});

test("buildLiveCheckReport fails when the callback probe card command cannot be constructed", async () => {
  const report = await buildLiveCheckReport({
    env: {
      PILOTFLOW_TEST_CHAT_ID: "oc_probe_chat_123456",
    },
    runCommand: async (bin: string, args: readonly string[]) => {
      if (args.join(" ").includes("im +messages-send --as user --chat-id oc_probe_chat_123456 --msg-type interactive")) {
        throw new Error("probe card dry-run failed");
      }
      return okResult([bin, ...args]);
    },
  });

  const probeCheck = report.checks.find((item) => item.name === "callback probe card dry-run");
  assert.equal(probeCheck?.status, "fail");
  assert.match(probeCheck?.detail ?? "", /probe card dry-run failed/u);
  assert.equal(report.nextActions.some((item) => /probe card command/u.test(item.reason)), true);
  assert.equal(report.nextActions.some((item) => /pilot:callback-proof/u.test(item.action)), true);
});

test("buildLiveCheckReport warns when the event bus is already running", async () => {
  const report = await buildLiveCheckReport({
    env: {},
    runCommand: async (bin: string, args: readonly string[]) => {
      if (args.join(" ") === "event status") {
        return okResult([bin, ...args], "Bus: running");
      }
      return okResult([bin, ...args]);
    },
  });

  const busCheck = report.checks.find((item) => item.name === "event bus status");
  assert.equal(busCheck?.status, "warn");
  assert.match(busCheck?.detail ?? "", /avoid multiple event subscribers/u);
  assert.equal(report.nextActions.some((item) => /single subscriber/u.test(item.action)), true);
});

test("buildLiveCheckReport ignores partial LLM env because it only checks Feishu live targets", async () => {
  const report = await buildLiveCheckReport({
    env: { PILOTFLOW_LLM_API_KEY: "sk-local-test-secret" },
    runCommand: async (bin: string, args: readonly string[]) => okResult([bin, ...args]),
  });

  assert.equal(report.summary.failed, 0);
});

test("buildLiveCheckReport loads local .env targets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-live-check-env-"));
  const calls: string[][] = [];
  try {
    await writeFile(join(dir, ".env"), [
      "PILOTFLOW_TEST_CHAT_ID=oc_from_env_file",
      "PILOTFLOW_BASE_TOKEN=bascn_from_env_file",
      "PILOTFLOW_BASE_TABLE_ID=tbl_from_env_file",
    ].join("\n"), "utf8");

    const report = await buildLiveCheckReport({
      cwd: dir,
      env: {},
      runCommand: async (bin: string, args: readonly string[]) => {
        calls.push([bin, ...args]);
        return okResult([bin, ...args]);
      },
    });

    assert.equal(report.summary.failed, 0);
    assert.equal(checkStatus(report.checks, "chat readable"), "pass");
    assert.equal(checkStatus(report.checks, "base table readable"), "pass");
    assert.equal(calls.some((call) => call.includes("/open-apis/im/v1/chats/oc_from_env_file")), true);
    assert.equal(calls.some((call) => call.join(" ") === "lark-cli base +table-get --base-token bascn_from_env_file --table-id tbl_from_env_file --as user"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildLiveCheckReport reports configured bot mention identity without printing it", async () => {
  const report = await buildLiveCheckReport({
    env: {
      PILOTFLOW_BOT_USER_ID: "u_secret_bot_123456",
    },
    runCommand: async (bin: string, args: readonly string[]) => okResult([bin, ...args]),
  });

  assert.equal(checkStatus(report.checks, "bot mention identity"), "pass");
  const rendered = renderLiveCheckReport(report);
  assert.match(rendered, /PILOTFLOW_BOT_USER_ID is set/u);
  assert.doesNotMatch(rendered, /u_secret_bot_123456/u);
});

function okResult(command: readonly string[], stdout = "{}"): CommandResult {
  return {
    ok: true,
    exitCode: 0,
    exit_code: 0,
    stdout,
    stderr: "",
    command,
    json: {},
  };
}

function checkStatus(checks: readonly TestCheck[], name: string): string | undefined {
  return checks.find((item) => item.name === name)?.status;
}
