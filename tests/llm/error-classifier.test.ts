import assert from "node:assert/strict";
import test from "node:test";
import { classifyError, classifyThrowable, LlmError, RetryableLlmError } from "../../src/llm/error-classifier.js";

test("classifyError maps auth, rate limits, billing, context, and server failures", () => {
  assert.deepEqual(classifyError(401, "invalid api key"), {
    reason: "auth",
    retryable: false,
    shouldRotate: true,
    shouldFallback: true,
    shouldCompress: false,
  });
  assert.deepEqual(classifyError(402, "rate limit, resets at 12:00"), {
    reason: "rate_limit",
    retryable: true,
    shouldRotate: true,
    shouldFallback: false,
    shouldCompress: false,
  });
  assert.deepEqual(classifyError(402, "insufficient_quota"), {
    reason: "billing",
    retryable: false,
    shouldRotate: true,
    shouldFallback: true,
    shouldCompress: false,
  });
  assert.equal(classifyError(413, "too large").reason, "context_overflow");
  assert.equal(classifyError(413, "too large").shouldCompress, true);
  assert.equal(classifyError(503, "overloaded").retryable, true);
});

test("classifyThrowable recognizes abort and retryable LLM errors", () => {
  const retryable = new RetryableLlmError(classifyError(429, "slow down"), 429, "slow down");
  assert.equal(classifyThrowable(retryable).reason, "rate_limit");
  assert.equal(classifyThrowable(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })).reason, "timeout");
  assert.equal(classifyThrowable(new LlmError("bad key", 401, "bad")).retryable, false);
});
