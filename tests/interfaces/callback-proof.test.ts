import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCallbackProof, renderCallbackProof } from "../../src/interfaces/cli/callback-proof.js";
import type { FeishuGatewayEvent } from "../../src/gateway/feishu/event-source.js";
import { LarkCliSubscribeError } from "../../src/gateway/feishu/lark-cli-source.js";
import type { CommandResult } from "../../src/infrastructure/command-runner.js";

test("runCallbackProof records observed card callbacks without raw payloads by default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-callback-proof-"));
  const output = join(dir, "callback-proof.jsonl");

  try {
    const result = await runCallbackProof({
      argv: ["--output", output, "--max-events", "1"],
      source: eventSource([cardEvent("evt-1", "run-1")]),
      now: () => "2026-05-01T00:00:00.000Z",
    });

    assert.equal(result.status, "observed");
    assert.equal(result.observedCallbacks, 1);
    assert.match(renderCallbackProof(result), /observed_callbacks: 1/u);

    const log = await readFile(output, "utf8");
    assert.match(log, /"type":"callback_proof.callback_observed"/u);
    assert.match(log, /"runId":"run-1"/u);
    assert.doesNotMatch(log, /"raw"/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runCallbackProof records timeout and fails only in strict mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-callback-proof-timeout-"));
  const output = join(dir, "callback-proof.jsonl");

  try {
    const loose = await runCallbackProof({
      argv: ["--output", output, "--max-events", "0"],
      source: eventSource([]),
      now: () => "2026-05-01T00:00:00.000Z",
    });
    assert.equal(loose.status, "timeout_no_callback");
    assert.equal(loose.exitCode, 0);
    assert.match(loose.nextActions[0]?.action ?? "", /--send-probe-card/u);

    const strict = await runCallbackProof({
      argv: ["--output", output, "--max-events", "0", "--strict"],
      source: eventSource([]),
      now: () => "2026-05-01T00:00:00.000Z",
    });
    assert.equal(strict.status, "timeout_no_callback");
    assert.equal(strict.exitCode, 1);
    assert.match(renderCallbackProof(strict), /next_actions:/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runCallbackProof starts listening before sending a callback probe card", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-callback-proof-probe-"));
  const output = join(dir, "callback-proof.jsonl");
  const calls: string[][] = [];
  let listenerStarted = false;

  try {
    const result = await runCallbackProof({
      argv: [
        "--output", output,
        "--send-probe-card",
        "--dry-run",
        "--chat-id", "oc_probe",
        "--probe-run-id", "callback-proof-test",
        "--max-events", "0",
      ],
      env: {},
      source: observableEventSource({
        onNext: () => {
          listenerStarted = true;
        },
      }),
      runCommand: async (bin, args, options = {}) => {
        assert.equal(listenerStarted, true);
        calls.push([bin, ...args, `dryRun=${String(options.dryRun)}`]);
        return okResult([bin, ...args]);
      },
      now: () => "2026-05-01T00:00:00.000Z",
    });

    assert.equal(result.probe.status, "dry_run");
    assert.equal(result.status, "timeout_no_callback");
    assert.match(result.nextActions[0]?.action ?? "", /without --dry-run/u);
    assert.equal(result.probe.runId, "callback-proof-test");
    assert.equal(result.probe.messageId, "om_probe");
    assert.match(renderCallbackProof(result), /probe_status: dry_run/u);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.includes("--msg-type"), true);
    assert.equal(calls[0]?.includes("interactive"), true);
    assert.equal(calls[0]?.some((arg) => arg.includes('"pilotflow_action":"confirm_execute"')), true);
    assert.equal(calls[0]?.includes("dryRun=true"), true);

    const log = await readFile(output, "utf8");
    assert.match(log, /"type":"callback_proof.probe_card_sent"/u);
    assert.match(log, /"runId":"callback-proof-test"/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runCallbackProof returns probe_failed when the probe card send fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-callback-proof-probe-failed-"));
  const output = join(dir, "callback-proof.jsonl");
  let closed = false;

  try {
    const result = await runCallbackProof({
      argv: [
        "--output", output,
        "--send-probe-card",
        "--chat-id", "oc_probe",
        "--probe-run-id", "callback-proof-failed",
        "--timeout", "1s",
      ],
      env: {},
      source: observableEventSource({
        onClose: () => {
          closed = true;
        },
      }),
      runCommand: async () => {
        throw new Error("im +messages-send failed: permission denied");
      },
      now: () => "2026-05-01T00:00:00.000Z",
    });

    assert.equal(result.status, "probe_failed");
    assert.equal(result.exitCode, 2);
    assert.equal(result.probe.status, "failed");
    assert.equal(result.probe.runId, "callback-proof-failed");
    assert.match(result.probe.error ?? "", /permission denied/u);
    assert.match(result.nextActions[0]?.action ?? "", /target chat id/u);
    assert.match(renderCallbackProof(result), /probe_error: im \+messages-send failed/u);
    assert.equal(closed, true);

    const log = await readFile(output, "utf8");
    assert.match(log, /"type":"callback_proof.probe_card_failed"/u);
    assert.doesNotMatch(log, /"type":"callback_proof.timeout_no_callback"/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runCallbackProof does not send a probe card when the listener fails during startup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-callback-proof-startup-failed-"));
  const output = join(dir, "callback-proof.jsonl");
  let sendCount = 0;

  try {
    const result = await runCallbackProof({
      argv: [
        "--output", output,
        "--send-probe-card",
        "--chat-id", "oc_probe",
        "--probe-run-id", "callback-proof-startup-failed",
      ],
      env: {},
      source: failingEventSource(),
      runCommand: async () => {
        sendCount += 1;
        return okResult(["lark-cli"]);
      },
      now: () => "2026-05-01T00:00:00.000Z",
    });

    assert.equal(result.status, "subscribe_failed");
    assert.equal(result.exitCode, 2);
    assert.equal(result.probe.status, "not_sent");
    assert.equal(sendCount, 0);

    const log = await readFile(output, "utf8");
    assert.match(log, /"type":"callback_proof.subscribe_failed"/u);
    assert.doesNotMatch(log, /"type":"callback_proof.probe_card_sent"/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runCallbackProof loads probe chat id from local env when cwd is provided", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-callback-proof-env-"));
  const output = join(dir, "callback-proof.jsonl");
  const calls: string[][] = [];

  try {
    await writeFile(join(dir, ".env"), "PILOTFLOW_TEST_CHAT_ID=oc_from_env\nPILOTFLOW_LARK_PROFILE=pilotflow-test\n", "utf8");
    await runCallbackProof({
      argv: ["--output", output, "--send-probe-card", "--dry-run", "--probe-run-id", "callback-proof-env", "--max-events", "0"],
      cwd: dir,
      env: {},
      source: eventSource([]),
      runCommand: async (bin, args, options = {}) => {
        calls.push([bin, ...args, `profile=${options.profile ?? ""}`]);
        return okResult([bin, ...args]);
      },
      now: () => "2026-05-01T00:00:00.000Z",
    });

    assert.equal(calls[0]?.includes("oc_from_env"), true);
    assert.equal(calls[0]?.includes("profile=pilotflow-test"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runCallbackProof returns structured subscribe failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-callback-proof-failure-"));
  const output = join(dir, "callback-proof.jsonl");

  try {
    const result = await runCallbackProof({
      argv: ["--output", output],
      source: failingEventSource(),
      now: () => "2026-05-01T00:00:00.000Z",
    });

    assert.equal(result.status, "subscribe_failed");
    assert.equal(result.exitCode, 2);
    assert.equal(result.failure?.exitCode, 2);
    assert.match(result.nextActions[0]?.action ?? "", /card\.action\.trigger --dry-run/u);
    assert.match(renderCallbackProof(result), /failure: lark-cli event subscription failed/u);

    const log = await readFile(output, "utf8");
    assert.match(log, /"type":"callback_proof.subscribe_failed"/u);
    assert.doesNotMatch(log, /secret-token/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function cardEvent(id: string, runId: string): FeishuGatewayEvent {
  return {
    kind: "card",
    id,
    raw: {
      header: { event_id: id, event_type: "card.action.trigger" },
      event: {
        action: {
          value: {
            pilotflow_card: "execution_plan",
            pilotflow_action: "confirm_execute",
            pilotflow_run_id: runId,
          },
        },
        operator: { open_id: "ou_user" },
        context: { open_chat_id: "oc_1" },
      },
    },
  };
}

function eventSource(events: readonly FeishuGatewayEvent[]) {
  return {
    async *events() {
      for (const event of events) yield event;
    },
    async close() {},
  };
}

function observableEventSource(hooks: {
  readonly onNext?: () => void;
  readonly onClose?: () => void;
} = {}) {
  return {
    events(): AsyncIterable<FeishuGatewayEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<FeishuGatewayEvent>> {
              hooks.onNext?.();
              return { done: true, value: undefined };
            },
          };
        },
      };
    },
    async close() {
      hooks.onClose?.();
    },
  };
}

function okResult(command: readonly string[]): CommandResult {
  return {
    ok: true,
    exitCode: 0,
    exit_code: 0,
    stdout: JSON.stringify({ data: { message: { message_id: "om_probe" } } }),
    stderr: "",
    command,
    json: { data: { message: { message_id: "om_probe" } } },
  };
}

function failingEventSource() {
  return {
    async *events(): AsyncIterable<FeishuGatewayEvent> {
      throw new LarkCliSubscribeError("lark-cli event subscription failed: token=[REDACTED]", {
        command: ["lark-cli", "event", "+subscribe"],
        exitCode: 2,
        stderr: "token=[REDACTED]",
      });
    },
    async close() {},
  };
}
