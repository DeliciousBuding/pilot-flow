import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { artifactFromCommand, getPath, optionalStringInput, requireStringInput } from "./common.js";

export const entryPinTool: ToolDefinition = {
  name: "entry.pin",
  llmName: "entry_pin",
  description: "Pin a project entry message in Feishu IM.",
  confirmationRequired: true,
  optional: true,
  requiresTargets: ["chatId"],
  schema: {
    type: "function",
    function: {
      name: "entry_pin",
      description: "Pin a project entry message.",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "Message id to pin." },
          title: { type: "string", description: "Artifact title." },
        },
        required: ["messageId"],
      },
    },
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    const messageId = requireStringInput(input, "messageId");
    const title = optionalStringInput(input, "title") ?? "Pinned project entry message";
    const result = await runCommand("lark-cli", [
      "im", "pins", "create",
      "--as", "user",
      "--data", JSON.stringify({ message_id: messageId }),
    ], { dryRun: ctx.dryRun, profile: ctx.profile, timeoutMs: 30_000 });
    return {
      success: true,
      artifact: artifactFromCommand("pinned_message", { title }, result, messageId, [
        getPath(result.json, ["data", "pin", "message_id"]),
        messageId,
      ], {
        chat_id: getPath(result.json, ["data", "pin", "chat_id"]),
        created_at: getPath(result.json, ["data", "pin", "create_time"]),
      }),
      output: `Pinned message: ${messageId}`,
    };
  },
};
