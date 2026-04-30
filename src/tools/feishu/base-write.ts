import { runCommand } from "../../infrastructure/command-runner.js";
import type { Artifact } from "../../types/artifact.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import { assertLiveArgLength, dryRunArtifacts, getPath, objectInput, targetOrInput } from "./common.js";

export const baseWriteTool: ToolDefinition = {
  name: "base.write",
  llmName: "base_write",
  description: "Write project state rows into a Feishu Base table.",
  confirmationRequired: true,
  requiresTargets: ["baseToken", "baseTableId"],
  schema: {
    type: "function",
    function: {
      name: "base_write",
      description: "Write rows into the project state Base.",
      parameters: {
        type: "object",
        properties: {
          body: { type: "object", description: "Batch create body with fields and rows." },
        },
        required: ["body"],
      },
    },
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    const body = objectInput(input, "body");
    const fields = Array.isArray(body.fields) ? body.fields.map(String) : [];
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (ctx.dryRun) {
      return dryRunArtifacts(baseArtifacts(fields, rows, [], ctx.runId, true), `[dry-run] Would write ${Math.max(rows.length, 1)} Base rows`);
    }
    const jsonBody = JSON.stringify(body);
    assertLiveArgLength("--json", jsonBody, ctx, 8_000);

    const result = await runCommand("lark-cli", [
      "base", "+record-batch-create",
      "--as", "user",
      "--base-token", targetOrInput(ctx, input, "baseToken"),
      "--table-id", targetOrInput(ctx, { ...input, baseTableId: input.tableId }, "baseTableId"),
      "--json", jsonBody,
    ], { dryRun: false, profile: ctx.profile, timeoutMs: 30_000 });
    const recordIds = readRecordIds(result.json);
    return { success: true, artifacts: baseArtifacts(fields, rows, recordIds, ctx.runId, false), output: `Wrote ${Math.max(rows.length, recordIds.length)} Base rows` };
  },
};

function readRecordIds(json: unknown): readonly string[] {
  const list = getPath(json, ["data", "record_id_list"]) ?? getPath(json, ["record_id_list"]);
  if (Array.isArray(list)) return list.filter((item): item is string => typeof item === "string");
  const records = getPath(json, ["data", "records"]);
  return Array.isArray(records)
    ? records.map((record) => getPath(record, ["record_id"]) ?? getPath(record, ["id"])).filter((item): item is string => typeof item === "string")
    : [];
}

function baseArtifacts(fields: readonly string[], rows: readonly unknown[], recordIds: readonly string[], runId: string, planned: boolean): readonly Artifact[] {
  const titleIndex = fields.indexOf("title");
  const typeIndex = fields.indexOf("type");
  const count = Math.max(rows.length, recordIds.length, 1);
  return Array.from({ length: count }, (_, index): Artifact => {
    const row = Array.isArray(rows[index]) ? rows[index] as readonly unknown[] : [];
    const externalId = recordIds[index] ?? `dry-${runId}-base-${index + 1}`;
    return {
      type: "base_record",
      external_id: externalId,
      title: typeof row[titleIndex] === "string" ? row[titleIndex] : `Base record ${index + 1}`,
      metadata: {
        status: planned ? "planned" : "created",
        record_type: typeof row[typeIndex] === "string" ? row[typeIndex] : undefined,
      },
    };
  });
}
