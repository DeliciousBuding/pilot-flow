import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { artifactFromCommand, getPath, requireStringInput } from "./common.js";
import { textMessageArgs, textMessageSchema } from "./im-send.js";

export const entrySendTool: ToolDefinition = {
  name: "entry.send",
  llmName: "entry_send",
  description: "Send a PilotFlow project entry message.",
  confirmationRequired: true,
  requiresTargets: ["chatId"],
  schema: textMessageSchema("entry_send", "Send a PilotFlow project entry message."),
  handler: async (input, ctx): Promise<ToolResult> => {
    const text = requireStringInput(input, "text");
    const result = await runCommand("lark-cli", textMessageArgs("entry.send", input, ctx, text), {
      dryRun: ctx.dryRun,
      profile: ctx.profile,
      timeoutMs: 30_000,
    });
    return {
      success: true,
      artifact: artifactFromCommand("entry_message", { title: text.slice(0, 80) }, result, `dry-${ctx.runId}-entry`, [
        getPath(result.json, ["data", "message", "message_id"]),
        getPath(result.json, ["data", "message_id"]),
      ]),
      output: "Sent project entry message",
    };
  },
};
