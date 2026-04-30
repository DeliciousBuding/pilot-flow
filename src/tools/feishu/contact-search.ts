import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { requireStringInput } from "./common.js";

export const contactSearchTool: ToolDefinition = {
  name: "contact.search",
  llmName: "contact_search",
  description: "Search Feishu contacts for owner resolution.",
  confirmationRequired: false,
  optional: true,
  safeWithoutConfirmation: true,
  schema: {
    type: "function",
    function: {
      name: "contact_search",
      description: "Search Feishu contacts.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name or keyword to search." },
          pageSize: { type: "number", description: "Page size, 1-30." },
        },
        required: ["query"],
      },
    },
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    const query = requireStringInput(input, "query");
    const pageSize = clampPageSize(input.pageSize);
    const result = await runCommand("lark-cli", [
      "contact", "+search-user",
      "--as", "user",
      "--query", query,
      "--page-size", String(pageSize),
      "--format", "json",
    ], { dryRun: ctx.dryRun, profile: ctx.profile, timeoutMs: 30_000 });
    return {
      success: true,
      output: `Searched contacts: ${query}`,
      metadata: { result: result.json, pageSize },
    };
  },
};

function clampPageSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(30, Math.trunc(value)));
}
