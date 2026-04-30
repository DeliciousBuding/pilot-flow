import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FeishuGatewayEvent } from "../../src/gateway/feishu/event-source.js";
import { PendingRunStore } from "../../src/gateway/feishu/pending-run-store.js";
import { runAgentGateway } from "../../src/interfaces/cli/agent-gateway.js";
import type { ToolDefinition } from "../../src/types/tool.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { MemoryRecorder } from "../helpers/memory-recorder.js";

test("runAgentGateway completes a dry-run mention path", async () => {
  const dir = join(process.cwd(), "tmp", "tests", `pilotflow-agent-gateway-${Date.now()}-a`);
  await mkdir(dir, { recursive: true });
  const recorder = new MemoryRecorder();
  const registry = createGatewayRegistry();

  try {
    const result = await runAgentGateway({
      argv: ["--dry-run", "--pending-store", join(dir, "pending.json"), "--output", join(dir, "gateway.jsonl")],
      source: eventSource([
        messageEvent("@PilotFlow 帮我建立项目空间", "om_1", "oc_1"),
      ]),
      registry,
      recorder,
    });

    assert.equal(result.processedMessages, 1);
    assert.equal(result.processedCards, 0);
    assert.equal(result.pendingRuns, 0);
    assert.equal(recorder.ofType("run.completed").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runAgentGateway stores waiting live runs and resumes them from card callbacks", async () => {
  const dir = join(process.cwd(), "tmp", "tests", `pilotflow-agent-gateway-live-${Date.now()}-b`);
  await mkdir(dir, { recursive: true });
  const storePath = join(dir, "pending.json");

  try {
    const firstRecorder = new MemoryRecorder();
    const firstRegistry = createGatewayRegistry();
    const first = await runAgentGateway({
      argv: [
        "--live",
        "--pending-store", storePath,
        "--chat-id", "oc_live",
        "--base-token", "base_live",
        "--base-table-id", "tbl_live",
        "--storage-path", join(dir, "guard-live-1"),
        "--send-plan-card",
      ],
      source: eventSource([messageEvent("@PilotFlow 建一个项目", "om_live_1", "oc_live")]),
      registry: firstRegistry,
      recorder: firstRecorder,
    });

    assert.equal(first.processedMessages, 1);
    assert.equal(first.pendingRuns, 1);
    assert.equal(firstRecorder.ofType("run.waiting_confirmation").length, 1);

    const pending = await new PendingRunStore({ storagePath: storePath }).list();
    assert.equal(pending.length, 1);
    const runId = pending[0]?.runId ?? "";
    assert.ok(runId.length > 0);

    const secondRecorder = new MemoryRecorder();
    const secondRegistry = createGatewayRegistry();
    const second = await runAgentGateway({
      argv: [
        "--live",
        "--pending-store", storePath,
        "--chat-id", "oc_live",
        "--base-token", "base_live",
        "--base-table-id", "tbl_live",
        "--storage-path", join(dir, "guard-live-2"),
      ],
      source: eventSource([cardEvent(runId)]),
      registry: secondRegistry,
      recorder: secondRecorder,
    });

    assert.equal(second.processedCards, 1);
    assert.equal(second.pendingRuns, 0);
    assert.equal(secondRecorder.ofType("run.completed").length, 1);
    assert.equal(secondRecorder.ofType("gateway.card_continuation_completed").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runAgentGateway resumes pending live runs from plain text confirmation in the same chat", async () => {
  const dir = join(process.cwd(), "tmp", "tests", `pilotflow-agent-gateway-live-${Date.now()}-c`);
  await mkdir(dir, { recursive: true });
  const storePath = join(dir, "pending.json");

  try {
    const firstRecorder = new MemoryRecorder();
    const firstRegistry = createGatewayRegistry();
    const first = await runAgentGateway({
      argv: [
        "--live",
        "--pending-store", storePath,
        "--chat-id", "oc_live",
        "--base-token", "base_live",
        "--base-table-id", "tbl_live",
        "--storage-path", join(dir, "guard-live-1"),
        "--send-plan-card",
      ],
      source: eventSource([messageEvent("@PilotFlow 建一个项目", "om_live_2", "oc_live")]),
      registry: firstRegistry,
      recorder: firstRecorder,
    });

    assert.equal(first.processedMessages, 1);
    assert.equal(first.pendingRuns, 1);

    const secondRecorder = new MemoryRecorder();
    const secondRegistry = createGatewayRegistry();
    const second = await runAgentGateway({
      argv: [
        "--live",
        "--pending-store", storePath,
        "--chat-id", "oc_live",
        "--base-token", "base_live",
        "--base-table-id", "tbl_live",
        "--storage-path", join(dir, "guard-live-2"),
      ],
      source: eventSource([plainMessageEvent("确认执行", "om_live_3", "oc_live")]),
      registry: secondRegistry,
      recorder: secondRecorder,
    });

    assert.equal(second.processedMessages, 1);
    assert.equal(second.pendingRuns, 0);
    assert.equal(secondRecorder.ofType("run.completed").length, 1);
    assert.equal(secondRecorder.ofType("gateway.text_continuation_completed").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runAgentGateway ignores confirmation text without a pending run", async () => {
  const dir = join(process.cwd(), "tmp", "tests", `pilotflow-agent-gateway-live-${Date.now()}-d`);
  await mkdir(dir, { recursive: true });

  try {
    const recorder = new MemoryRecorder();
    const registry = createGatewayRegistry();
    const result = await runAgentGateway({
      argv: [
        "--live",
        "--pending-store", join(dir, "pending.json"),
        "--chat-id", "oc_live",
        "--base-token", "base_live",
        "--base-table-id", "tbl_live",
        "--storage-path", join(dir, "guard-live"),
      ],
      source: eventSource([plainMessageEvent("确认执行", "om_live_4", "oc_live")]),
      registry,
      recorder,
    });

    assert.equal(result.processedMessages, 0);
    assert.equal(result.ignoredEvents, 1);
    assert.equal(recorder.ofType("run.completed").length, 0);
    assert.equal(recorder.ofType("gateway.text_confirmation_missing_pending_run").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function createGatewayRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const name of ["doc.create", "base.write", "task.create", "card.send", "entry.send", "entry.pin", "im.send"]) {
    registry.register(fakeTool(name, async (_input, ctx) => ({
      success: true,
      artifact: {
        type: artifactType(name),
        external_id: `${name}-${ctx.runId}`,
        title: name,
        metadata: { status: ctx.dryRun ? "planned" : "created" },
      },
    })));
  }
  return registry;
}

function fakeTool(name: string, handler: ToolDefinition["handler"]): ToolDefinition {
  return {
    name,
    description: name,
    confirmationRequired: true,
    requiresTargets: name === "base.write" ? ["baseToken", "baseTableId"] : name === "doc.create" ? [] : ["chatId"],
    schema: {
      type: "function",
      function: {
        name: name.replaceAll(".", "_"),
        description: name,
        parameters: { type: "object", properties: {} },
      },
    },
    handler,
  };
}

function artifactType(name: string) {
  if (name === "doc.create") return "doc";
  if (name === "base.write") return "base_record";
  if (name === "task.create") return "task";
  if (name === "entry.send") return "entry_message";
  if (name === "entry.pin") return "pinned_message";
  if (name === "card.send") return "card";
  return "im_message";
}

function messageEvent(text: string, id: string, chatId: string): FeishuGatewayEvent {
  return {
    kind: "message",
    id,
    chatId,
    chatType: "group",
    text,
    mentions: [{ id: { open_id: "ou_pilotflow_bot" } }],
    senderOpenId: "ou_user",
    raw: {},
  };
}

function plainMessageEvent(text: string, id: string, chatId: string): FeishuGatewayEvent {
  return {
    kind: "message",
    id,
    chatId,
    chatType: "group",
    text,
    mentions: [],
    senderOpenId: "ou_user",
    raw: {},
  };
}

function cardEvent(runId: string): FeishuGatewayEvent {
  return {
    kind: "card",
    id: "evt_card_1",
    raw: {
      event: {
        action: {
          value: {
            pilotflow_card: "execution_plan",
            pilotflow_action: "confirm_execute",
            pilotflow_run_id: runId,
          },
        },
        operator: { open_id: "ou_user" },
        context: { open_chat_id: "oc_live" },
      },
    },
  };
}

function eventSource(events: readonly FeishuGatewayEvent[]) {
  return {
    async *events() {
      for (const event of events) yield event;
    },
    async close() {},
  };
}
