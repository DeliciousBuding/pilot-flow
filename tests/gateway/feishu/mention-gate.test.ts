import assert from "node:assert/strict";
import test from "node:test";
import { shouldAcceptMessage, stripSelfMention } from "../../../src/gateway/feishu/mention-gate.js";

const bot = { openId: "ou_bot", userId: "u_bot", name: "PilotFlow" };

test("shouldAcceptMessage accepts DMs and mentioned group messages", () => {
  assert.equal(shouldAcceptMessage({ chatType: "p2p", text: "hello" }, bot), true);
  assert.equal(shouldAcceptMessage({ chatType: "group", mentions: [{ id: { open_id: "ou_bot" } }] }, bot), true);
  assert.equal(shouldAcceptMessage({ chatType: "group", mentions: [{ key: "@_all" }] }, bot), true);
  assert.equal(shouldAcceptMessage({ chatType: "group", mentions: [{ id: { open_id: "someone" } }] }, bot), false);
});

test("stripSelfMention removes leading and trailing bot mention text", () => {
  assert.equal(stripSelfMention("@PilotFlow 帮我建项目", "PilotFlow"), "帮我建项目");
  assert.equal(stripSelfMention("帮我建项目 @PilotFlow", "PilotFlow"), "帮我建项目");
});

test("shouldAcceptMessage matches group mentions by user_id when open_id is absent", () => {
  assert.equal(shouldAcceptMessage({ chatType: "group", mentions: [{ id: { user_id: "u_bot" } }] }, bot), true);
  assert.equal(shouldAcceptMessage({ chatType: "group", mentions: [{ id: { user_id: "someone_else" } }] }, bot), false);
});

test("shouldAcceptMessage matches group mentions by name", () => {
  assert.equal(shouldAcceptMessage({ chatType: "group", mentions: [{ name: "PilotFlow" }] }, bot), true);
  assert.equal(shouldAcceptMessage({ chatType: "group", mentions: [{ name: "OtherBot" }] }, bot), false);
});
