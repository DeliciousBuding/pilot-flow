import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { artifactFromCommand, assertLiveArgLength, getPath, objectInput, optionalStringInput, targetOrInput } from "./common.js";
import { buildToolIdempotencyKey } from "../idempotency.js";

export const cardSendTool: ToolDefinition = {
  name: "card.send",
  llmName: "card_send",
  description: "Send a Feishu interactive card.",
  confirmationRequired: true,
  requiresTargets: ["chatId"],
  schema: {
    type: "function",
    function: {
      name: "card_send",
      description: "Send a Feishu interactive card.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Card title." },
          card: { type: "object", description: "Feishu card payload." },
        },
        required: ["card"],
      },
    },
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    const card = objectInput(input, "card");
    const title = optionalStringInput(input, "title") ?? String(getPath(card, ["header", "title", "content"]) ?? "PilotFlow card");
    const cardJson = JSON.stringify(card);
    assertLiveArgLength("--content", cardJson, ctx, 8_000);
    const result = await runCommand("lark-cli", [
      "im", "+messages-send",
      "--as", "user",
      "--chat-id", targetOrInput(ctx, input, "chatId"),
      "--msg-type", "interactive",
      "--content", cardJson,
      "--idempotency-key", buildToolIdempotencyKey({ runId: ctx.runId, tool: "card.send", sequence: ctx.sequence }),
    ], { dryRun: ctx.dryRun, profile: ctx.profile, timeoutMs: 30_000 });
    return {
      success: true,
      artifact: artifactFromCommand("card", { title }, result, `dry-${ctx.runId}-card`, [
        getPath(result.json, ["data", "message", "message_id"]),
        getPath(result.json, ["data", "message_id"]),
      ]),
      output: `Sent card: ${title}`,
    };
  },
};
