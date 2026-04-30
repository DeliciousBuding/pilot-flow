import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact, ArtifactType } from "../../types/artifact.js";
import type { ToolContext, ToolResult } from "../../types/tool.js";
import type { CommandResult } from "../../infrastructure/command-runner.js";

export function requireStringInput(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required tool input: ${key}`);
  }
  return value;
}

export function optionalStringInput(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function objectInput(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Missing required object tool input: ${key}`);
  }
  return value as Record<string, unknown>;
}

export function targetOrInput(ctx: ToolContext, input: Record<string, unknown>, key: string): string {
  const value = optionalStringInput(input, key) ?? ctx.targets?.[key];
  if (value) return value;
  if (ctx.dryRun) return `<${key}>`;
  return missingTarget(key);
}

export function assertLiveArgLength(label: string, value: string, ctx: Pick<ToolContext, "dryRun">, maxLength: number): void {
  if (ctx.dryRun || value.length <= maxLength) return;
  throw new Error(`${label} is too long for argv-based live execution (${value.length} > ${maxLength}); use file/stdin transport first`);
}

export function singleLineArg(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, " ").trim();
}

export function dryRunArtifact(type: ArtifactType, title: string, ctx: ToolContext, suffix: string): ToolResult {
  return {
    success: true,
    artifact: {
      type,
      external_id: `dry-${ctx.runId}-${suffix}`,
      title,
      metadata: { status: "planned" },
    },
    output: `[dry-run] ${title}`,
  };
}

export function dryRunArtifacts(artifacts: readonly Artifact[], output: string): ToolResult {
  return {
    success: true,
    artifacts: artifacts.map((artifact) => ({ ...artifact, metadata: { ...artifact.metadata, status: "planned" } })),
    output,
  };
}

export async function writeTempBody(prefix: string, body: string, extension: string): Promise<string> {
  const dir = join("tmp", "tool-bodies", `pilotflow-${sanitizePathSegment(prefix)}-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `body.${extension}`);
  await writeFile(file, body, "utf8");
  return file.replaceAll("\\", "/");
}

export function artifactFromCommand(
  type: ArtifactType,
  input: { readonly title?: string },
  result: CommandResult,
  fallbackId: string,
  idCandidates: readonly unknown[],
  extraMetadata: Record<string, unknown> = {},
): Artifact {
  const externalId = firstString(idCandidates) ?? fallbackId;
  return {
    type,
    external_id: externalId,
    title: input.title,
    url: firstString([getPath(result.json, ["data", "document", "url"]), getPath(result.json, ["data", "task", "url"])]),
    metadata: { status: result.dry_run ? "planned" : "created", ...extraMetadata },
  };
}

export function getPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function firstString(values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function missingTarget(key: string): never {
  throw new Error(`Missing required live target: ${key}`);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40) || "body";
}
