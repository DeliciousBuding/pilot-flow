import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCallbackProof, renderCallbackProof } from "../../src/interfaces/cli/callback-proof.js";
import type { FeishuGatewayEvent } from "../../src/gateway/feishu/event-source.js";

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

    const strict = await runCallbackProof({
      argv: ["--output", output, "--max-events", "0", "--strict"],
      source: eventSource([]),
      now: () => "2026-05-01T00:00:00.000Z",
    });
    assert.equal(strict.status, "timeout_no_callback");
    assert.equal(strict.exitCode, 1);
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
