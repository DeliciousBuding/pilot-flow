import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { buildSubscribeArgs, LarkCliEventSource, LarkCliSubscribeError, parseLarkCliEventLine, type SubscribeProcess } from "../../../src/gateway/feishu/lark-cli-source.js";

test("buildSubscribeArgs uses lark-cli event subscription defaults", () => {
  assert.deepEqual(buildSubscribeArgs({ profile: "pilotflow-contest", eventTypes: ["im.message.receive_v1", "card.action.trigger"] }), [
    "--profile",
    "pilotflow-contest",
    "event",
    "+subscribe",
    "--event-types",
    "im.message.receive_v1,card.action.trigger",
  ]);
});

test("parseLarkCliEventLine normalizes message and card events", () => {
  const message = parseLarkCliEventLine(JSON.stringify({
    header: { event_id: "evt-1", event_type: "im.message.receive_v1" },
    event: { message: { message_id: "om_1", chat_id: "oc_1", chat_type: "group", content: "{\"text\":\"@PilotFlow hi\"}", mentions: [] }, sender: { sender_id: { open_id: "ou_user" } } },
  }));
  assert.equal(message?.kind, "message");
  assert.equal(message?.id, "om_1");
  assert.equal(message?.chatId, "oc_1");

  const card = parseLarkCliEventLine(JSON.stringify({
    header: { event_id: "evt-2", event_type: "card.action.trigger" },
    event: { action: { value: { pilotflow_card: "execution_plan", pilotflow_action: "confirm_execute", pilotflow_run_id: "run-1" } }, operator: { open_id: "ou_user" } },
  }));
  assert.equal(card?.kind, "card");
  assert.equal(card?.id, "evt-2");
});

test("LarkCliEventSource surfaces subscribe command failures with sanitized stderr", async () => {
  const source = new LarkCliEventSource({
    eventTypes: ["card.action.trigger"],
    spawnProcess: () => fakeProcess({
      stderr: "permission denied token=secret-token-123456789\nBearer abcdefghijklmnop",
      code: 1,
    }),
  });

  await assert.rejects(
    async () => {
      for await (const _event of source.events()) {
        // No events expected.
      }
    },
    (error: unknown) => {
      assert.equal(error instanceof LarkCliSubscribeError, true);
      const typed = error as LarkCliSubscribeError;
      assert.match(typed.message, /permission denied/u);
      assert.doesNotMatch(typed.message, /secret-token-123456789/u);
      assert.doesNotMatch(typed.message, /abcdefghijklmnop/u);
      assert.equal(typed.details.exitCode, 1);
      assert.equal(typed.details.command.some((part) => part === "event"), true);
      return true;
    },
  );
});

test("LarkCliEventSource treats explicit close as normal shutdown", async () => {
  const source = new LarkCliEventSource({
    eventTypes: ["card.action.trigger"],
    spawnProcess: () => fakeProcess({
      stdoutLines: [
        JSON.stringify({
          header: { event_id: "evt-1", event_type: "card.action.trigger" },
          event: { action: { value: { pilotflow_action: "confirm_execute", pilotflow_run_id: "run-1" } } },
        }),
      ],
      closeOnKill: true,
    }),
  });

  const iterator = source.events()[Symbol.asyncIterator]();
  const first = await iterator.next();
  assert.equal(first.value?.kind, "card");
  source.close();
  const second = await iterator.next();
  assert.equal(second.done, true);
});

function fakeProcess(options: {
  readonly stdoutLines?: readonly string[];
  readonly stderr?: string;
  readonly code?: number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly closeOnKill?: boolean;
}): SubscribeProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const child = emitter as unknown as SubscribeProcess;
  Object.assign(child, {
    stdout,
    stderr,
    kill: () => {
      if (options.closeOnKill) {
        stdout.end();
        stderr.end();
        emitter.emit("close", null, "SIGTERM");
      }
    },
  });

  process.nextTick(() => {
    for (const line of options.stdoutLines ?? []) stdout.write(`${line}\n`);
    if (!options.closeOnKill) {
      stdout.end();
      stderr.end(options.stderr ?? "");
      emitter.emit("close", options.code ?? 0, options.signal ?? null);
    }
  });
  return child;
}
