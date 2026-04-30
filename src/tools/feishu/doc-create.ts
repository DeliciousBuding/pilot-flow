import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { artifactFromCommand, getPath, optionalStringInput, requireStringInput, writeTempBody } from "./common.js";

export const docCreateTool: ToolDefinition = {
  name: "doc.create",
  llmName: "doc_create",
  description: "Create a Feishu document from markdown content.",
  confirmationRequired: true,
  schema: {
    type: "function",
    function: {
      name: "doc_create",
      description: "Create a Feishu document from markdown content.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title." },
          markdown: { type: "string", description: "Markdown body." },
        },
        required: ["title", "markdown"],
      },
    },
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    const title = requireStringInput(input, "title");
    const markdown = requireStringInput(input, "markdown");
    const contentFile = ctx.dryRun ? undefined : await writeTempBody("doc-create", `# ${title}\n\n${markdown}`, "md");
    const result = await runCommand("lark-cli", [
      "docs", "+create",
      "--api-version", "v2",
      "--as", "user",
      "--doc-format", "markdown",
      "--content", contentFile ? `@${contentFile}` : markdown,
    ], { dryRun: ctx.dryRun, profile: ctx.profile, timeoutMs: 30_000 });
    const artifact = artifactFromCommand("doc", { title }, result, `dry-${ctx.runId}-doc`, [
      getPath(result.json, ["data", "document", "document_id"]),
      getPath(result.json, ["data", "document", "documentId"]),
      getPath(result.json, ["data", "document", "token"]),
      getPath(result.json, ["document", "document_id"]),
    ]);
    return { success: true, artifact, output: optionalStringInput(input, "title") ?? "Created Feishu doc" };
  },
};
