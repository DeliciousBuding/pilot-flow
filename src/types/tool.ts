import type { Artifact } from "./artifact.js";
import type { Recorder } from "./recorder.js";

export interface ToolContext {
  readonly runId: string;
  readonly sequence: number;
  readonly dryRun: boolean;
  readonly recorder: Recorder;
  readonly profile?: string;
  readonly targets?: Record<string, string | undefined>;
}

export interface ToolResult {
  readonly success: boolean;
  readonly artifact?: Artifact;
  readonly artifacts?: readonly Artifact[];
  readonly output?: string;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export type ToolHandler = (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

export interface ToolDefinition {
  readonly name: string;
  readonly llmName?: string;
  readonly description: string;
  readonly schema: ToolSchema;
  readonly handler: ToolHandler;
  readonly requiresLive?: boolean;
  readonly requiresTargets?: readonly string[];
  readonly confirmationRequired: boolean;
  readonly optional?: boolean;
  readonly safeWithoutConfirmation?: boolean;
}

export interface ToolSchema {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: {
      readonly type: "object";
      readonly properties: Record<string, JsonSchemaProperty>;
      readonly required?: readonly string[];
    };
  };
}

export interface JsonSchemaProperty {
  readonly type: "string" | "number" | "boolean" | "object" | "array";
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly items?: JsonSchemaProperty;
  readonly properties?: Record<string, JsonSchemaProperty>;
}
