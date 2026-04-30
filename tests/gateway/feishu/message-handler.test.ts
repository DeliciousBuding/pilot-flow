import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "../../../src/agent/session-manager.js";
import { ChatQueue } from "../../../src/gateway/feishu/chat-queue.js";
import { EventDedupe } from "../../../src/gateway/feishu/dedupe.js";
import { handleMessageEvent } from "../../../src/gateway/feishu/message-handler.js";

test("handleMessageEvent filters mentions, dedupes, queues, and stores session messages", async () => {
  const sessions = new SessionManager({ ttlMs: 1000, maxTurns: 10, maxSessions: 5 }, () => 1_000);
  const dedupe = new EventDedupe({ ttlMs: 1000, maxEntries: 10 }, () => 1_000);
  const calls: string[] = [];

  const result = await handleMessageEvent({
    kind: "message",
    id: "om_1",
    chatId: "oc_1",
    chatType: "group",
    text: "@PilotFlow 建一个项目",
    mentions: [{ id: { open_id: "ou_bot" } }],
    senderOpenId: "ou_user",
    raw: {},
  }, {
    bot: { openId: "ou_bot", userId: "u_bot", name: "PilotFlow" },
    sessions,
    dedupe,
    queue: new ChatQueue(),
    runAgent: async (text, session) => {
      calls.push(`${text}|${session.chatId}`);
      return { finalResponse: "ok", messages: [], iterations: 1, toolCallsMade: 0 };
    },
  });

  assert.equal(result.status, "processed");
  assert.deepEqual(calls, ["建一个项目|oc_1"]);
  assert.equal(sessions.get("oc_1")?.messages.at(-1)?.content, "ok");

  const duplicate = await handleMessageEvent({
    kind: "message",
    id: "om_1",
    chatId: "oc_1",
    chatType: "group",
    text: "@PilotFlow again",
    mentions: [{ id: { open_id: "ou_bot" } }],
    raw: {},
  }, {
    bot: { openId: "ou_bot", userId: "u_bot", name: "PilotFlow" },
    sessions,
    dedupe,
    queue: new ChatQueue(),
    runAgent: async () => { throw new Error("should not run"); },
  });
  assert.equal(duplicate.status, "ignored");
  assert.equal(duplicate.reason, "duplicate_event");
});

test("handleMessageEvent ignores group messages without bot mention", async () => {
  const result = await handleMessageEvent({
    kind: "message",
    id: "om_2",
    chatId: "oc_1",
    chatType: "group",
    text: "建项目",
    mentions: [],
    raw: {},
  }, {
    bot: { openId: "ou_bot", userId: "u_bot", name: "PilotFlow" },
    sessions: new SessionManager({ ttlMs: 1000, maxTurns: 10, maxSessions: 5 }),
    dedupe: new EventDedupe(),
    queue: new ChatQueue(),
    runAgent: async () => { throw new Error("should not run"); },
  });
  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "not_mentioned");
});
