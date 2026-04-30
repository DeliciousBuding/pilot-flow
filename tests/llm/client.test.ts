import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient, LlmError, RetryableLlmError } from "../../src/llm/client.js";

test("createLlmClient sends OpenAI-compatible chat completions requests", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const client = createLlmClient({
    baseUrl: "https://llm.example.test/",
    apiKey: "sk-test",
    model: "gpt-test",
    maxTokens: 123,
    temperature: 0.2,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: "Need a tool",
            tool_calls: [{ id: "call-1", type: "function", function: { name: "doc_create", arguments: "{\"title\":\"A\"}" } }],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await client.call([{ role: "user", content: "hello" }], [{ type: "function", function: { name: "doc_create", description: "", parameters: { type: "object", properties: {} } } }]);

  assert.equal(requests[0]?.url, "https://llm.example.test/v1/chat/completions");
  const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>;
  assert.equal(body.model, "gpt-test");
  assert.equal(body.tool_choice, "auto");
  assert.equal(result.finish_reason, "tool_calls");
  assert.equal(result.tool_calls?.[0]?.function.name, "doc_create");
  assert.deepEqual(result.usage, { prompt_tokens: 10, completion_tokens: 5 });
});

test("createLlmClient classifies retryable and non-retryable provider failures", async () => {
  const retryable = createLlmClient({
    baseUrl: "https://llm.example.test",
    apiKey: "sk-test",
    model: "gpt-test",
    fetch: async () => new Response("rate limit", { status: 429 }),
  });
  await assert.rejects(() => retryable.call([{ role: "user", content: "hello" }]), RetryableLlmError);

  const auth = createLlmClient({
    baseUrl: "https://llm.example.test",
    apiKey: "sk-test",
    model: "gpt-test",
    fetch: async () => new Response("bad key", { status: 401 }),
  });
  await assert.rejects(() => auth.call([{ role: "user", content: "hello" }]), LlmError);
});
