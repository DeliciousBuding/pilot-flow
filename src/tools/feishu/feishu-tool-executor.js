import { createHash } from "node:crypto";
import { LarkCliCommandRunner } from "../../adapters/lark-cli/command-runner.js";

export class FeishuToolExecutor {
  constructor({ dryRun = true, profile, targets = {} } = {}) {
    this.dryRun = dryRun;
    this.targets = targets;
    this.runner = new LarkCliCommandRunner({ dryRun, profile });
  }

  preflight(tools) {
    if (this.dryRun) return;

    const missing = [];
    if (tools.includes("base.write") && !this.targets.baseToken) missing.push("PILOTFLOW_BASE_TOKEN");
    if (tools.includes("base.write") && !this.targets.baseTableId) missing.push("PILOTFLOW_BASE_TABLE_ID");
    if (tools.includes("im.send") && !this.targets.chatId) missing.push("PILOTFLOW_TEST_CHAT_ID");
    if (tools.includes("card.send") && !this.targets.chatId) missing.push("PILOTFLOW_TEST_CHAT_ID");
    if (tools.includes("entry.send") && !this.targets.chatId) missing.push("PILOTFLOW_TEST_CHAT_ID");
    if (tools.includes("announcement.update") && !this.targets.chatId) missing.push("PILOTFLOW_TEST_CHAT_ID");

    const uniqueMissing = [...new Set(missing)];
    if (uniqueMissing.length > 0) {
      throw new Error(`Live mode is missing required configuration: ${uniqueMissing.join(", ")}`);
    }
  }

  async execute(tool, input, context) {
    const idempotencyKey = buildToolIdempotencyKey({ runId: context.runId, tool, sequence: context.sequence });
    const args = toLarkCliArgs(tool, input, {
      idempotencyKey,
      dryRun: this.dryRun,
      targets: this.targets
    });
    return this.runner.run(args, { idempotencyKey });
  }
}

export function buildToolIdempotencyKey({ runId, tool, sequence }) {
  const toolSlug = String(tool).replaceAll(".", "-").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20) || "tool";
  const sequenceSlug = String(sequence).replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 6) || "0";
  const hash = createHash("sha256").update(`${runId}:${tool}:${sequence}`).digest("hex").slice(0, 16);
  return `pf-${toolSlug}-${sequenceSlug}-${hash}`;
}

function toLarkCliArgs(tool, input, options) {
  const { idempotencyKey, dryRun, targets } = options;

  if (tool === "doc.create") {
    return [
      "docs",
      "+create",
      "--api-version",
      "v2",
      "--as",
      "user",
      "--doc-format",
      "markdown",
      "--content",
      input.markdown
    ];
  }

  if (tool === "base.write") {
    return [
      "base",
      "+record-batch-create",
      "--as",
      "user",
      "--base-token",
      input.baseToken || targets.baseToken || dryRunPlaceholder(dryRun, "base-token"),
      "--table-id",
      input.tableId || targets.baseTableId || dryRunPlaceholder(dryRun, "table-id"),
      "--json",
      JSON.stringify(input.body)
    ];
  }

  if (tool === "task.create") {
    const args = [
      "task",
      "+create",
      "--as",
      "user",
      "--summary",
      input.summary,
      "--description",
      input.description,
      "--idempotency-key",
      idempotencyKey
    ];

    if (input.due) args.push("--due", input.due);
    if (input.assignee) args.push("--assignee", input.assignee);
    if (input.tasklistId || targets.tasklistId) args.push("--tasklist-id", input.tasklistId || targets.tasklistId);
    return args;
  }

  if (tool === "im.send") {
    return textMessageArgs(input, { idempotencyKey, dryRun, targets });
  }

  if (tool === "entry.send") {
    return textMessageArgs(input, { idempotencyKey, dryRun, targets });
  }

  if (tool === "entry.pin") {
    return [
      "im",
      "pins",
      "create",
      "--as",
      "user",
      "--data",
      JSON.stringify({
        message_id: input.messageId
      })
    ];
  }

  if (tool === "announcement.update") {
    const chatId = input.chatId || targets.chatId || dryRunPlaceholder(dryRun, "chat-id");
    return [
      "api",
      "PATCH",
      `/open-apis/im/v1/chats/${chatId}/announcement`,
      "--as",
      "bot",
      "--data",
      JSON.stringify({
        revision: input.revision || "0",
        requests: [input.html]
      })
    ];
  }

  if (tool === "card.send") {
    return [
      "im",
      "+messages-send",
      "--as",
      "user",
      "--chat-id",
      input.chatId || targets.chatId || dryRunPlaceholder(dryRun, "chat-id"),
      "--msg-type",
      "interactive",
      "--content",
      JSON.stringify(input.card),
      "--idempotency-key",
      idempotencyKey
    ];
  }

  if (tool === "contact.search") {
    return [
      "contact",
      "+search-user",
      "--as",
      "user",
      "--query",
      input.query,
      "--page-size",
      String(input.pageSize || 5),
      "--format",
      "json"
    ];
  }

  throw new Error(`Unsupported Feishu tool: ${tool}`);
}

function textMessageArgs(input, options) {
  const { idempotencyKey, dryRun, targets } = options;
  return [
    "im",
    "+messages-send",
    "--as",
    "user",
    "--chat-id",
    input.chatId || targets.chatId || dryRunPlaceholder(dryRun, "chat-id"),
    "--text",
    input.text,
    "--idempotency-key",
    idempotencyKey
  ];
}

function dryRunPlaceholder(dryRun, label) {
  if (dryRun) return `<${label}>`;
  throw new Error(`Missing required live target: ${label}`);
}
