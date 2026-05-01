import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "../../src/agent/session-manager.js";

test("SessionManager reuses sessions and expires idle entries", () => {
  let now = 1_000;
  const manager = new SessionManager({ ttlMs: 100, maxTurns: 10, maxSessions: 5 }, () => now);

  const first = manager.getOrCreate("chat-1");
  first.messages.push({ role: "user", content: "hello" });
  assert.equal(manager.getOrCreate("chat-1"), first);

  now += 101;
  const second = manager.getOrCreate("chat-1");
  assert.notEqual(second, first);
  assert.equal(second.messages.length, 0);
});

test("SessionManager evicts least-recent sessions over capacity", () => {
  let now = 1_000;
  const manager = new SessionManager({ ttlMs: 10_000, maxTurns: 10, maxSessions: 2 }, () => now++);

  const a = manager.getOrCreate("a");
  manager.getOrCreate("b");
  manager.getOrCreate("a");
  manager.getOrCreate("c");

  assert.equal(manager.get("a"), a);
  assert.equal(manager.get("b"), undefined);
  assert.equal(manager.size, 2);
});

test("SessionManager.addMessage enforces maxTurns history cap", () => {
  let now = 1_000;
  const manager = new SessionManager({ ttlMs: 10_000, maxTurns: 2, maxSessions: 5 }, () => now++);

  manager.addMessage("chat-1", { role: "user", content: "1" });
  manager.addMessage("chat-1", { role: "assistant", content: "2" });
  manager.addMessage("chat-1", { role: "user", content: "3" });
  manager.addMessage("chat-1", { role: "assistant", content: "4" });
  manager.addMessage("chat-1", { role: "user", content: "5" });

  assert.deepEqual(manager.get("chat-1")?.messages.map((message) => message.content), ["2", "3", "4", "5"]);
  assert.equal(manager.get("chat-1")?.turnCount, 5);
});

test("SessionManager.get returns undefined and lazily deletes expired session", () => {
  let now = 1_000;
  const manager = new SessionManager({ ttlMs: 100, maxTurns: 10, maxSessions: 5 }, () => now);

  manager.getOrCreate("chat-1");
  assert.equal(manager.size, 1);

  now += 101;
  assert.equal(manager.get("chat-1"), undefined);
  assert.equal(manager.size, 0);
});

test("SessionManager.getOrCreate resets turnCount when session expires and is recreated", () => {
  let now = 1_000;
  const manager = new SessionManager({ ttlMs: 100, maxTurns: 10, maxSessions: 5 }, () => now);

  const first = manager.getOrCreate("chat-1");
  manager.addMessage("chat-1", { role: "user", content: "1" });
  manager.addMessage("chat-1", { role: "assistant", content: "2" });
  assert.equal(first.turnCount, 2);

  now += 101;
  const second = manager.getOrCreate("chat-1");
  assert.notEqual(second, first);
  assert.equal(second.turnCount, 0);
  assert.equal(second.messages.length, 0);
});
