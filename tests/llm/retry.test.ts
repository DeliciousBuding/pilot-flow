import assert from "node:assert/strict";
import test from "node:test";
import { classifyError, RetryableLlmError } from "../../src/llm/error-classifier.js";
import { withRetry } from "../../src/llm/retry.js";

test("withRetry retries retryable LLM failures with exponential jitter", async () => {
  const sleeps: number[] = [];
  let calls = 0;

  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new RetryableLlmError(classifyError(429, "rate limit"), 429, "rate limit");
      return "ok";
    },
    { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000, random: () => 0.5, sleep: async (ms) => { sleeps.push(ms); } },
  );

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [125, 250]);
});

test("withRetry does not retry non-retryable errors", async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => {
      calls++;
      throw new Error("bad request");
    }, { maxRetries: 3, sleep: async () => undefined }),
    /bad request/,
  );
  assert.equal(calls, 1);
});
