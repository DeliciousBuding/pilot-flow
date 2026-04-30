import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { artifactFromCommand, getPath, optionalStringInput, requireStringInput, targetOrInput, writeTempBody } from "./common.js";

export const announcementUpdateTool: ToolDefinition = {
  name: "announcement.update",
  llmName: "announcement_update",
  description: "Try to update the group announcement with the project entry.",
  confirmationRequired: true,
  optional: true,
  requiresTargets: ["chatId"],
  schema: {
    type: "function",
    function: {
      name: "announcement_update",
      description: "Update a Feishu group announcement.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Announcement title." },
          html: { type: "string", description: "Announcement HTML body." },
          revision: { type: "string", description: "Announcement revision." },
        },
        required: ["html"],
      },
    },
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    const html = requireStringInput(input, "html");
    const title = optionalStringInput(input, "title") ?? "PilotFlow group announcement";
    const body = JSON.stringify({ revision: optionalStringInput(input, "revision") ?? "0", requests: [html] });
    const bodyFile = ctx.dryRun ? undefined : await writeTempBody("announcement", body, "json");
    const result = await runCommand("lark-cli", [
      "api", "PATCH",
      `/open-apis/im/v1/chats/${targetOrInput(ctx, input, "chatId")}/announcement`,
      "--as", "bot",
      "--data", bodyFile ? `@${bodyFile}` : body,
    ], { dryRun: ctx.dryRun, profile: ctx.profile, timeoutMs: 30_000 });
    return {
      success: true,
      artifact: artifactFromCommand("announcement", { title }, result, `dry-${ctx.runId}-announcement`, [
        getPath(result.json, ["data", "revision"]),
        getPath(result.json, ["revision"]),
        optionalStringInput(input, "revision"),
      ]),
      output: `Updated announcement: ${title}`,
    };
  },
};
