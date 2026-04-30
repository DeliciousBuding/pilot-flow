import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRecorder } from "../helpers/memory-recorder.js";
import {
  ToolAlreadyRegisteredError,
  ToolConfirmationRequiredError,
  ToolInputError,
  ToolNotFoundError,
  ToolPreflightError,
  ToolRegistry,
  toLlmToolName,
} from "../../src/tools/registry.js";
import type { ToolContext, ToolDefinition, ToolResult } from "../../src/types/tool.js";

test("ToolRegistry registers tools and maps LLM-safe names", () => {
  const registry = new ToolRegistry();
  const def = toolDef("doc.create");

  registry.register(def);

  assert.equal(registry.has("doc.create"), true);
  assert.equal(registry.has("doc_create"), true);
  assert.equal(registry.get("doc_create")?.name, "doc.create");
  assert.deepEqual(registry.names(), ["doc.create"]);
  assert.equal(registry.getSchemas()[0]?.function.name, "doc_create");
  assert.equal(toLlmToolName("entry.pin"), "entry_pin");
});

test("ToolRegistry rejects duplicate internal names and duplicate llmName mappings", () => {
  const registry = new ToolRegistry();
  registry.register(toolDef("doc.create"));

  assert.throws(() => registry.register(toolDef("doc.create")), ToolAlreadyRegisteredError);
  assert.throws(() => registry.register(toolDef("doc_create_shadow", { llmName: "doc_create" })), ToolAlreadyRegisteredError);
});

test("ToolRegistry executes object and JSON-string inputs with recorder events", async () => {
  const registry = new ToolRegistry();
  registry.register(toolDef("doc.create", {
    handler: async (input): Promise<ToolResult> => ({
      success: true,
      artifact: { type: "doc", external_id: "doc-1", title: String(input.title), url: "https://example.test/doc" },
      output: "created",
    }),
  }));
  const recorder = new MemoryRecorder();

  const result = await registry.execute("doc_create", JSON.stringify({
    title: "Brief",
    markdown: "# Secret content",
    chatId: "oc_secret",
  }), ctx({ recorder }));

  assert.equal(result.success, true);
  assert.equal(recorder.ofType("tool.called").length, 1);
  assert.equal(recorder.ofType("tool.succeeded").length, 1);
  assert.deepEqual(recorder.ofType("tool.succeeded")[0]?.artifacts, [
    { type: "doc", external_id: "doc-1", url: "https://example.test/doc", title: "Brief" },
  ]);
  const called = recorder.ofType("tool.called")[0] as unknown as { input: Record<string, unknown> };
  assert.equal(called.input.markdown, "[REDACTED 16 chars]");
  assert.equal(called.input.chatId, "[REDACTED 9 chars]");
});

test("ToolRegistry rejects unknown tools and invalid LLM argument shapes", async () => {
  const registry = new ToolRegistry();
  const recorder = new MemoryRecorder();

  await assert.rejects(() => registry.execute("missing.tool", {}, ctx({ recorder })), ToolNotFoundError);
  registry.register(toolDef("doc.create"));
  await assert.rejects(() => registry.execute("doc.create", "{", ctx({ recorder })), ToolInputError);
  await assert.rejects(() => registry.execute("doc.create", [], ctx({ recorder })), ToolInputError);
  await assert.rejects(() => registry.execute("doc.create", null, ctx({ recorder })), ToolInputError);
});

test("ToolRegistry enforces live preflight and skips it in dry-run", async () => {
  const registry = new ToolRegistry();
  registry.register(toolDef("base.write", { requiresTargets: ["baseToken", "baseTableId"] }));

  await assert.rejects(
    () => registry.execute("base.write", {}, ctx({ recorder: new MemoryRecorder(), dryRun: false, confirmed: true, targets: { baseToken: "base" } })),
    ToolPreflightError,
  );

  await assert.doesNotReject(
    () => registry.execute("base.write", {}, ctx({ recorder: new MemoryRecorder(), dryRun: true })),
  );
});

test("ToolRegistry blocks unconfirmed live side-effect tools", async () => {
  const registry = new ToolRegistry();
  registry.register(toolDef("doc.create", { requiresTargets: ["chatId"] }));

  await assert.rejects(
    () => registry.execute("doc.create", {}, ctx({ recorder: new MemoryRecorder(), dryRun: false, targets: { chatId: "oc_demo" } })),
    ToolConfirmationRequiredError,
  );
  await assert.doesNotReject(
    () => registry.execute("doc.create", {}, ctx({ recorder: new MemoryRecorder(), dryRun: false, confirmed: true, targets: { chatId: "oc_demo" } })),
  );
});

test("ToolRegistry allows safe live tools without confirmation", async () => {
  const registry = new ToolRegistry();
  registry.register(toolDef("contact.search", { confirmationRequired: false, safeWithoutConfirmation: true }));

  await assert.doesNotReject(
    () => registry.execute("contact.search", {}, ctx({ recorder: new MemoryRecorder(), dryRun: false })),
  );
});

test("ToolRegistry records failed tool calls without dumping raw input", async () => {
  const registry = new ToolRegistry();
  registry.register(toolDef("im.send", {
    handler: async () => {
      throw new Error("send failed");
    },
  }));
  const recorder = new MemoryRecorder();

  await assert.rejects(() => registry.execute("im.send", { text: "hello secret", baseToken: "base_secret" }, ctx({ recorder })), /send failed/);

  assert.equal(recorder.ofType("tool.called").length, 1);
  assert.equal(recorder.ofType("tool.failed").length, 1);
  const called = recorder.ofType("tool.called")[0] as unknown as { input: Record<string, unknown> };
  assert.equal(called.input.text, "[REDACTED 12 chars]");
  assert.equal(called.input.baseToken, "[REDACTED 11 chars]");
});

function toolDef(name: string, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name,
    description: `${name} test tool`,
    confirmationRequired: true,
    schema: {
      type: "function",
      function: {
        name: toLlmToolName(name),
        description: `${name} schema`,
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
    handler: async (input): Promise<ToolResult> => ({
      success: true,
      artifacts: [
        { type: "doc", external_id: String(input.external_id ?? "doc-1"), title: "Doc" },
        { type: "message", external_id: "om_1", title: "Message" },
      ],
      output: { content: "secret body", ok: true },
    }),
    ...overrides,
  };
}

function ctx({
  recorder,
  dryRun = true,
  confirmed,
  targets,
}: {
  readonly recorder: MemoryRecorder;
  readonly dryRun?: boolean;
  readonly confirmed?: boolean;
  readonly targets?: Record<string, string | undefined>;
}): ToolContext {
  return {
    runId: "run-1",
    sequence: 0,
    dryRun,
    confirmed,
    recorder,
    targets,
  };
}
