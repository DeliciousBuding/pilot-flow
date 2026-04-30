import assert from "node:assert/strict";
import test from "node:test";
import { EventDedupe } from "../../../src/gateway/feishu/dedupe.js";

test("EventDedupe blocks duplicates until ttl expires", () => {
  let now = 1_000;
  const dedupe = new EventDedupe({ ttlMs: 100, maxEntries: 10 }, () => now);

  assert.equal(dedupe.seen("event-1"), false);
  assert.equal(dedupe.seen("event-1"), true);
  now += 101;
  assert.equal(dedupe.seen("event-1"), false);
});
