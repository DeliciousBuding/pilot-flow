import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDedupeKey, buildIdempotencyKey } from "../../src/shared/id.js";
import { samplePlan } from "../helpers/fixtures.js";

test("buildIdempotencyKey is short and stable", () => {
  const key = buildIdempotencyKey("run-1", "doc.create", 1);
  assert.equal(key, buildIdempotencyKey("run-1", "doc.create", 1));
  assert.match(key, /^pf-[a-f0-9]{24}$/);
  assert.ok(key.length <= 50);
});

test("buildDedupeKey normalizes text and does not expose raw target ids", () => {
  const key = buildDedupeKey(samplePlan({ goal: "  Build   demo " }), { chatId: "oc_secret_chat" });
  assert.match(key, /^project_init:[a-f0-9]{24}$/);
  assert.doesNotMatch(key, /oc_secret_chat/);
});
