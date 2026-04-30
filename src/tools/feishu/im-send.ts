import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { artifactFromCommand, getPath, requireStringInput, targetOrInput } from "./common.js";
import { assertLiveArgLength } from "./common.js";
import { buildToolIdempotencyKey } from "../idempotency.js";

export const imSendTool: ToolDefinition = {
  name: "im.send",
  llmName: "im_send",
  description: "Send a Feishu IM text message.",
  confirmationRequired: true,
  requiresTargets: ["chatId"],
  schema: textMessageSchema("im_send", "Send a Feishu IM text message."),
  handler: async (input, ctx): Promise<ToolResult> => {
    const text = requireStringInput(input, "text");
    const result = await runCommand("lark-cli", textMessageArgs("im.send", input, ctx, text), {
      dryRun: ctx.dryRun,
      profile: ctx.profile,
      timeoutMs: 30_000,
    });
    return {
      success: true,
      artifact: artifactFromCommand("message", { title: text.slice(0, 80) }, result, `dry-${ctx.runId}-message`, [
        getPath(result.json, ["data", "message", "message_id"]),
        getPath(result.json, ["data", "message_id"]),
        getPath(result.json, ["message", "message_id"]),
      ]),
      output: "Sent Feishu message",
    };
  },
};

export function textMessageSchema(name: string, description: string): ToolDefinition["schema"] {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Message text." },
          chatId: { type: "string", description: "Optional chat id override." },
        },
        required: ["text"],
      },
    },
  };
}

export function textMessageArgs(tool: string, input: Record<string, unknown>, ctx: { readonly runId: string; readonly sequence: number; readonly dryRun: boolean; readonly targets?: Record<string, string | undefined> }, text: string): string[] {
  assertLiveArgLength("--text", text, ctx, 2_000);
  return [
    "im", "+messages-send",
    "--as", "user",
    "--chat-id", targetOrInput(ctx as Parameters<typeof targetOrInput>[0], input, "chatId"),
    "--text", text,
    "--idempotency-key", buildToolIdempotencyKey({ runId: ctx.runId, tool, sequence: ctx.sequence }),
  ];
}
