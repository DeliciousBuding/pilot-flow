import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { artifactFromCommand, assertLiveArgLength, getPath, optionalStringInput, requireStringInput, singleLineArg } from "./common.js";
import { buildToolIdempotencyKey } from "../idempotency.js";

export const taskCreateTool: ToolDefinition = {
  name: "task.create",
  llmName: "task_create",
  description: "Create a Feishu task with owner and deadline fallback context.",
  confirmationRequired: true,
  schema: {
    type: "function",
    function: {
      name: "task_create",
      description: "Create a Feishu task.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Task summary." },
          description: { type: "string", description: "Task description." },
          due: { type: "string", description: "Due date." },
          assignee: { type: "string", description: "Optional Feishu open_id." },
        },
        required: ["summary", "description"],
      },
    },
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    const summary = singleLineArg(requireStringInput(input, "summary"));
    const description = singleLineArg(requireStringInput(input, "description"));
    assertLiveArgLength("--summary", summary, ctx, 200);
    assertLiveArgLength("--description", description, ctx, 2_000);
    const args = [
      "task", "+create",
      "--as", "user",
      "--summary", summary,
      "--description", description,
      "--idempotency-key", buildToolIdempotencyKey({ runId: ctx.runId, tool: "task.create", sequence: ctx.sequence }),
    ];
    const due = optionalStringInput(input, "due");
    const assignee = optionalStringInput(input, "assignee");
    const tasklistId = optionalStringInput(input, "tasklistId") ?? ctx.targets?.tasklistId;
    if (due) args.push("--due", due);
    if (assignee) args.push("--assignee", assignee);
    if (tasklistId) args.push("--tasklist-id", tasklistId);
    const result = await runCommand("lark-cli", args, { dryRun: ctx.dryRun, profile: ctx.profile, timeoutMs: 30_000 });
    const artifact = artifactFromCommand("task", { title: summary }, result, `dry-${ctx.runId}-task`, [
      getPath(result.json, ["data", "task", "guid"]),
      getPath(result.json, ["data", "task", "task_guid"]),
      getPath(result.json, ["data", "task", "task_id"]),
      getPath(result.json, ["data", "task", "id"]),
      getPath(result.json, ["data", "guid"]),
    ], {
      owner: optionalStringInput(input, "owner"),
      assignee,
      assignee_source: optionalStringInput(input, "assignee_source"),
    });
    return { success: true, artifact, output: `Created task: ${summary}` };
  },
};
