import assert from "node:assert/strict";
import test from "node:test";
import { buildToolIdempotencyKey } from "../../src/tools/idempotency.js";

test("buildToolIdempotencyKey is stable and changes with every component", () => {
  const key = buildToolIdempotencyKey({ runId: "run-secret-chat-123", tool: "card.send", sequence: 0 });

  assert.equal(key, buildToolIdempotencyKey({ runId: "run-secret-chat-123", tool: "card.send", sequence: 0 }));
  assert.notEqual(key, buildToolIdempotencyKey({ runId: "other-run", tool: "card.send", sequence: 0 }));
  assert.notEqual(key, buildToolIdempotencyKey({ runId: "run-secret-chat-123", tool: "doc.create", sequence: 0 }));
  assert.notEqual(key, buildToolIdempotencyKey({ runId: "run-secret-chat-123", tool: "card.send", sequence: 1 }));
});

test("buildToolIdempotencyKey preserves the JS live key surface", () => {
  const key = buildToolIdempotencyKey({ runId: "run-1", tool: "card.send", sequence: 0 });

  assert.match(key, /^pf-card-send-0-[a-f0-9]{16}$/);
  assert.equal(key.length <= 50, true);
});

test("buildToolIdempotencyKey sanitizes tool names and does not leak raw inputs", () => {
  const key = buildToolIdempotencyKey({
    runId: "run-with-chat-oc_secret-and-content",
    tool: "weird.tool name/with:chars",
    sequence: "0; rm",
  });

  assert.match(key, /^pf-weird-toolnamewithch-0rm-[a-f0-9]{16}$/);
  assert.equal(key.includes("oc_secret"), false);
  assert.equal(key.includes("content"), false);
  assert.equal(key.length <= 50, true);
});
