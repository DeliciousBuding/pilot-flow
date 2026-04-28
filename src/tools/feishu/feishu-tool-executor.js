import { LarkCliCommandRunner } from "../../adapters/lark-cli/command-runner.js";

export class FeishuToolExecutor {
  constructor({ dryRun = true } = {}) {
    this.runner = new LarkCliCommandRunner({ dryRun });
  }

  async execute(tool, input, context) {
    const idempotencyKey = `${context.runId}:${tool}:${context.sequence}`;
    const args = toLarkCliArgs(tool, input, idempotencyKey);
    return this.runner.run(args, { idempotencyKey });
  }
}

function toLarkCliArgs(tool, input, idempotencyKey) {
  if (tool === "doc.create") {
    return [
      "docs",
      "+create",
      "--as",
      "user",
      "--title",
      input.title,
      "--markdown",
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
      input.baseToken || "<base-token>",
      "--table-id",
      input.tableId || "<table-id>",
      "--json",
      JSON.stringify(input.body)
    ];
  }

  if (tool === "im.send") {
    return [
      "im",
      "+messages-send",
      "--as",
      "user",
      "--chat-id",
      input.chatId || "<chat-id>",
      "--text",
      input.text,
      "--idempotency-key",
      idempotencyKey
    ];
  }

  throw new Error(`Unsupported Feishu tool: ${tool}`);
}
