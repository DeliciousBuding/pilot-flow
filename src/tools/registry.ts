import { redactObject } from "../safety/redact.js";
import { PilotFlowError } from "../shared/errors.js";
import type { Artifact } from "../types/artifact.js";
import type { ToolContext, ToolDefinition, ToolResult, ToolSchema } from "../types/tool.js";

export class ToolNotFoundError extends PilotFlowError {
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`, "TOOL_NOT_FOUND", { toolName });
    this.name = "ToolNotFoundError";
  }
}

export class ToolPreflightError extends PilotFlowError {
  constructor(
    public readonly toolName: string,
    public readonly missing: readonly string[],
  ) {
    super(`Tool ${toolName} missing required targets: ${missing.join(", ")}`, "TOOL_PREFLIGHT_FAILED", { toolName, missing });
    this.name = "ToolPreflightError";
  }
}

export class ToolAlreadyRegisteredError extends PilotFlowError {
  constructor(public readonly toolName: string, details?: Record<string, unknown>) {
    super(`Tool already registered: ${toolName}`, "TOOL_ALREADY_REGISTERED", details);
    this.name = "ToolAlreadyRegisteredError";
  }
}

export class ToolInputError extends PilotFlowError {
  constructor(public readonly toolName: string, message: string) {
    super(`Invalid input for ${toolName}: ${message}`, "TOOL_INPUT_INVALID", { toolName });
    this.name = "ToolInputError";
  }
}

export class ToolConfirmationRequiredError extends PilotFlowError {
  constructor(public readonly toolName: string) {
    super(`Tool ${toolName} requires confirmation before live execution`, "TOOL_CONFIRMATION_REQUIRED", { toolName });
    this.name = "ToolConfirmationRequiredError";
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly llmNameToName = new Map<string, string>();

  // 注册工具定义，同时维护内部名 -> LLM 名的双向映射，防止重名
  register(definition: ToolDefinition): void {
    if (this.tools.has(definition.name)) {
      throw new ToolAlreadyRegisteredError(definition.name);
    }

    const llmName = definition.llmName ?? toLlmToolName(definition.name);
    const existing = this.llmNameToName.get(llmName);
    if (existing) {
      throw new ToolAlreadyRegisteredError(definition.name, { llmName, existing });
    }

    this.tools.set(definition.name, definition);
    this.llmNameToName.set(llmName, definition.name);
  }

  // 执行工具：名称解析 -> 输入校验 -> 前置检查 -> 记录事件 -> 调用 handler
  async execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
    const internalName = this.resolveName(name);
    const tool = this.tools.get(internalName);
    if (!tool) throw new ToolNotFoundError(internalName);

    const input = parseToolInput(internalName, rawInput);
    if (!ctx.dryRun) {
      const missing = (tool.requiresTargets ?? []).filter((target) => !ctx.targets?.[target]);
      if (missing.length > 0) throw new ToolPreflightError(internalName, missing);
      if (tool.confirmationRequired && !tool.safeWithoutConfirmation && ctx.confirmed !== true) {
        throw new ToolConfirmationRequiredError(internalName);
      }
    }

    await ctx.recorder.record({
      type: "tool.called",
      runId: ctx.runId,
      sequence: ctx.sequence,
      tool: internalName,
      input: redactObject(input),
    });

    try {
      const result = await tool.handler(input, ctx);
      await ctx.recorder.record({
        type: "tool.succeeded",
        runId: ctx.runId,
        sequence: ctx.sequence,
        tool: internalName,
        output: summarizeOutput(result.output),
        artifacts: summarizeArtifacts(result),
      });
      return result;
    } catch (error) {
      await ctx.recorder.record({
        type: "tool.failed",
        runId: ctx.runId,
        sequence: ctx.sequence,
        tool: internalName,
        error: error instanceof PilotFlowError
          ? { code: error.code, message: error.message }
          : { message: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  getDefinitions(): readonly ToolDefinition[] {
    return [...this.tools.values()];
  }

  getSchemas(): readonly ToolSchema[] {
    return this.getDefinitions().map((tool) => ({
      ...tool.schema,
      function: {
        ...tool.schema.function,
        name: tool.llmName ?? toLlmToolName(tool.name),
      },
    }));
  }

  has(name: string): boolean {
    return this.tools.has(this.resolveName(name));
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(this.resolveName(name));
  }

  names(): readonly string[] {
    return [...this.tools.keys()];
  }

  reset(): void {
    this.tools.clear();
    this.llmNameToName.clear();
  }

  private resolveName(name: string): string {
    return this.llmNameToName.get(name) ?? name;
  }
}

export function toLlmToolName(name: string): string {
  return name.replaceAll(".", "_");
}

export const registry = new ToolRegistry();

function parseToolInput(toolName: string, rawInput: unknown): Record<string, unknown> {
  let parsed = rawInput;
  if (typeof rawInput === "string") {
    try {
      parsed = JSON.parse(rawInput) as unknown;
    } catch {
      throw new ToolInputError(toolName, "JSON string arguments could not be parsed");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ToolInputError(toolName, "arguments must be an object");
  }

  return parsed as Record<string, unknown>;
}

function summarizeOutput(output: ToolResult["output"]): unknown {
  if (typeof output === "string") return output.length > 500 ? `${output.slice(0, 500)}...` : output;
  return output === undefined ? undefined : redactObject(output);
}

function summarizeArtifacts(result: ToolResult): ReadonlyArray<Partial<Pick<Artifact, "type" | "external_id" | "url" | "title">>> {
  const artifacts = result.artifacts ?? (result.artifact ? [result.artifact] : []);
  return artifacts.map((artifact) => ({
    type: artifact.type,
    external_id: artifact.external_id,
    url: artifact.url,
    title: artifact.title,
  }));
}
