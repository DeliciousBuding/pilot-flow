import assert from "node:assert/strict";
import test from "node:test";
import { buildMockMessageEventLine, renderAgentSmoke, runAgentSmoke } from "../../src/interfaces/cli/agent-smoke.js";

test("runAgentSmoke completes the TS gateway to Agent dry-run path", async () => {
  const result = await runAgentSmoke({ input: "@PilotFlow 建立答辩项目空间" });

  assert.equal(result.status, "processed");
  assert.equal(result.finalResponse, "TS gateway -> session -> Agent loop -> ToolRegistry dry-run completed.");
  assert.equal(result.toolCalls, 2);
  assert.equal(result.artifacts.length, 2);
  assert.equal(result.artifacts.every((artifact) => typeof (artifact as { external_id?: unknown }).external_id === "string" && String((artifact as { external_id: string }).external_id).startsWith("dry-agent-")), true);
  assert.equal(result.session.messageCount, 2);
  assert.equal(result.recorderEvents.some((event) => event.type === "agent.iteration"), true);
  assert.equal(result.recorderEvents.some((event) => event.type === "tool.called" && event.tool === "doc.create"), true);
});

test("runAgentSmoke ignores partial real LLM env because it uses a mock client", async () => {
  const previous = {
    baseUrl: process.env.PILOTFLOW_LLM_BASE_URL,
    apiKey: process.env.PILOTFLOW_LLM_API_KEY,
    model: process.env.PILOTFLOW_LLM_MODEL,
  };
  process.env.PILOTFLOW_LLM_BASE_URL = "https://partial.example.test";
  delete process.env.PILOTFLOW_LLM_API_KEY;
  delete process.env.PILOTFLOW_LLM_MODEL;
  try {
    const result = await runAgentSmoke({ input: "@PilotFlow dry run" });
    assert.equal(result.status, "processed");
    assert.equal(result.toolCalls, 2);
  } finally {
    restoreEnv("PILOTFLOW_LLM_BASE_URL", previous.baseUrl);
    restoreEnv("PILOTFLOW_LLM_API_KEY", previous.apiKey);
    restoreEnv("PILOTFLOW_LLM_MODEL", previous.model);
  }
});

test("runAgentSmoke can consume an explicit lark-cli NDJSON event line", async () => {
  const result = await runAgentSmoke({ eventLine: buildMockMessageEventLine("@PilotFlow 做一次 dry run") });

  assert.equal(result.status, "processed");
  assert.match(renderAgentSmoke(result), /tool_calls: 2/);
});

test("runAgentSmoke ignores unmentioned group events", async () => {
  const line = JSON.stringify({
    header: { event_id: "evt_unmentioned", event_type: "im.message.receive_v1" },
    event: {
      message: {
        message_id: "om_unmentioned",
        chat_id: "oc_agent_smoke",
        chat_type: "group",
        content: JSON.stringify({ text: "没有 at bot" }),
        mentions: [],
      },
    },
  });

  const result = await runAgentSmoke({ eventLine: line });

  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "not_mentioned");
  assert.equal(result.toolCalls, 0);
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
