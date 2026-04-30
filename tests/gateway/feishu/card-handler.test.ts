import assert from "node:assert/strict";
import test from "node:test";
import { ChatQueue } from "../../../src/gateway/feishu/chat-queue.js";
import { EventDedupe } from "../../../src/gateway/feishu/dedupe.js";
import { handleCardEvent } from "../../../src/gateway/feishu/card-handler.js";

test("handleCardEvent dedupes card callbacks and returns PilotFlow decisions", async () => {
  const dedupe = new EventDedupe({ ttlMs: 1000, maxEntries: 10 }, () => 1_000);
  const event = {
    kind: "card" as const,
    id: "evt-1",
    raw: { event: { action: { value: { pilotflow_card: "execution_plan", pilotflow_action: "confirm_execute", pilotflow_run_id: "run-1" } }, operator: { open_id: "ou_user" } } },
  };

  const first = await handleCardEvent(event, { dedupe });
  assert.equal(first.status, "processed");
  assert.equal(first.action?.decision.next, "run_full_project_init");

  const second = await handleCardEvent(event, { dedupe });
  assert.equal(second.status, "ignored");
  assert.equal(second.reason, "duplicate_event");
});

test("handleCardEvent dedupes repeated business actions across different event ids", async () => {
  const dedupe = new EventDedupe({ ttlMs: 1000, maxEntries: 10 }, () => 1_000);
  let actions = 0;
  const raw = { event: { action: { value: { pilotflow_card: "execution_plan", pilotflow_action: "confirm_execute", pilotflow_run_id: "run-1" } }, context: { open_chat_id: "oc_1" } } };

  const first = await handleCardEvent({ kind: "card", id: "evt-1", raw }, { dedupe, queue: new ChatQueue(), onAction: async () => { actions++; } });
  const second = await handleCardEvent({ kind: "card", id: "evt-2", raw }, { dedupe, queue: new ChatQueue(), onAction: async () => { actions++; } });

  assert.equal(first.status, "processed");
  assert.equal(second.status, "ignored");
  assert.equal(actions, 1);
});
