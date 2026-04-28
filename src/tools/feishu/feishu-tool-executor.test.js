import assert from "node:assert/strict";
import { buildToolIdempotencyKey } from "./feishu-tool-executor.js";

const longRunId = "run-e0dc3434-3329-4bbb-907c-6350a56edcc7";
const key = buildToolIdempotencyKey({
  runId: longRunId,
  tool: "card.send",
  sequence: 0
});

assert.equal(key.length <= 50, true);
assert.match(key, /^pf-card-send-0-[a-f0-9]{16}$/);
assert.notEqual(
  key,
  buildToolIdempotencyKey({
    runId: "run-f0dc3434-3329-4bbb-907c-6350a56edcc7",
    tool: "card.send",
    sequence: 0
  })
);
assert.notEqual(
  key,
  buildToolIdempotencyKey({
    runId: longRunId,
    tool: "im.send",
    sequence: 0
  })
);

console.log("feishu tool executor tests passed");
