import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
import test from "node:test";
import { MemoryRecorder } from "../helpers/memory-recorder.js";
import { feishuTools, registerFeishuTools } from "../../src/tools/feishu/index.js";
import { registry as globalRegistry, ToolPreflightError, ToolRegistry } from "../../src/tools/registry.js";
import { singleLineArg, writeTempBody } from "../../src/tools/feishu/common.js";
import { textMessageArgs } from "../../src/tools/feishu/im-send.js";
import type { ToolContext } from "../../src/types/tool.js";

test("registerFeishuTools registers all Day 2 Feishu tool definitions", () => {
  const registry = new ToolRegistry();
  registerFeishuTools(registry);

  assert.deepEqual(registry.names(), [
    "doc.create",
    "base.write",
    "task.create",
    "im.send",
    "entry.send",
    "entry.pin",
    "card.send",
    "announcement.update",
    "contact.search",
  ]);
  assert.equal(registry.has("doc_create"), true);
  assert.equal(registry.has("announcement_update"), true);
  assert.equal(globalRegistry.has("doc.create"), true);
  assert.equal(feishuTools.length, 9);
});

test("Feishu tools return dry-run artifacts through registry", async () => {
  const registry = new ToolRegistry();
  registerFeishuTools(registry);
  const recorder = new MemoryRecorder();
  const ctx = toolCtx(recorder);

  const doc = await registry.execute("doc.create", { title: "Brief", markdown: "# Brief" }, ctx);
  assert.equal(doc.artifact?.type, "doc");
  assert.match(doc.artifact?.external_id ?? "", /^dry-run-1-doc$/);

  const base = await registry.execute("base.write", {
    body: {
      fields: ["type", "title"],
      rows: [["task", "Project brief"]],
    },
  }, ctx);
  assert.equal(base.artifacts?.[0]?.type, "base_record");

  const task = await registry.execute("task.create", { summary: "Project brief", description: "Do it" }, ctx);
  assert.equal(task.artifact?.type, "task");

  const entry = await registry.execute("entry.send", { text: "Project entry" }, ctx);
  assert.equal(entry.artifact?.type, "entry_message");

  const card = await registry.execute("card.send", { title: "Plan", card: { header: { title: { content: "Plan" } } } }, ctx);
  assert.equal(card.artifact?.type, "card");

  const search = await registry.execute("contact.search", { query: "Alice", pageSize: 99 }, ctx);
  assert.equal(search.artifact, undefined);
  assert.equal(search.metadata?.pageSize, 30);

  assert.equal(recorder.ofType("tool.called").length, 6);
  const cardCall = recorder.ofType("tool.called").find((event) => event.tool === "card.send") as unknown as { input: Record<string, unknown> };
  assert.equal(JSON.stringify(cardCall.input).includes("oc_secret"), false);
});

test("Optional Feishu tools expose optional semantics", () => {
  const optionalNames = feishuTools.filter((tool) => tool.optional).map((tool) => tool.name);
  assert.deepEqual(optionalNames, ["entry.pin", "announcement.update", "contact.search"]);
  assert.deepEqual(feishuTools.find((tool) => tool.name === "entry.pin")?.requiresTargets, ["chatId"]);
});

test("dry-run Feishu message tools do not require live targets inside handlers", async () => {
  const registry = new ToolRegistry();
  registerFeishuTools(registry);
  const result = await registry.execute("im.send", { text: "No target dry-run" }, {
    runId: "run-no-target",
    sequence: 0,
    dryRun: true,
    recorder: new MemoryRecorder(),
    targets: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.artifact?.type, "message");
});

test("entry.pin live preflight requires chatId even though it is optional", async () => {
  const registry = new ToolRegistry();
  registerFeishuTools(registry);

  await assert.rejects(
    () => registry.execute("entry.pin", { messageId: "om_1" }, {
      runId: "run-pin",
      sequence: 0,
      dryRun: false,
      confirmed: true,
      recorder: new MemoryRecorder(),
      targets: {},
    }),
    ToolPreflightError,
  );
});

test("writeTempBody creates lark-cli compatible relative files under ignored tmp", async () => {
  const file = await writeTempBody("doc-create", "# Brief", "md");
  try {
    assert.equal(file.startsWith("tmp/"), true);
    assert.equal(file.includes(".."), false);
    assert.equal(await stat(file).then((item) => item.isFile()), true);
  } finally {
    await rm(file, { force: true });
  }
});

test("text message live args use JSON content so multiline text is argv-safe", () => {
  const args = textMessageArgs("im.send", {}, { runId: "run-1", sequence: 1, dryRun: false, targets: { chatId: "oc_1" } }, "line 1\nline 2");

  assert.equal(args.includes("--content"), true);
  assert.equal(args.includes("--text"), false);
  assert.equal(args.some((arg) => /\r|\n/.test(arg)), false);
  assert.equal(args.includes('{"text":"line 1\\nline 2"}'), true);
});

test("singleLineArg collapses multiline values for argv-only lark-cli fields", () => {
  assert.equal(singleLineArg("Task\n\nOwner: 产品"), "Task Owner: 产品");
});

function toolCtx(recorder: MemoryRecorder): ToolContext {
  return {
    runId: "run-1",
    sequence: 0,
    dryRun: true,
    profile: "pilotflow-contest",
    recorder,
    targets: {
      chatId: "oc_secret",
      baseToken: "base_secret",
      baseTableId: "tbl_secret",
    },
  };
}
