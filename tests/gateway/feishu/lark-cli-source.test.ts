import assert from "node:assert/strict";
import test from "node:test";
import { buildSubscribeArgs, parseLarkCliEventLine } from "../../../src/gateway/feishu/lark-cli-source.js";

test("buildSubscribeArgs uses v2 event subscription defaults", () => {
  assert.deepEqual(buildSubscribeArgs({ profile: "pilotflow-contest", eventTypes: ["im.message.receive_v1", "card.action.trigger"] }), [
    "--profile",
    "pilotflow-contest",
    "event",
    "+subscribe",
    "--api-version",
    "v2",
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
