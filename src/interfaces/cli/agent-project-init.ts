import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { JsonlRecorder } from "../../infrastructure/jsonl-recorder.js";
import { createProjectInitPlannerProvider } from "../../domain/plan.js";
import { DuplicateGuard } from "../../orchestrator/duplicate-guard.js";
import { Orchestrator, type RunOptions, type RunResult } from "../../orchestrator/orchestrator.js";
import { TextConfirmationGate } from "../../orchestrator/confirmation-gate.js";
import { parseArgs } from "../../shared/parse-args.js";
import { registerFeishuTools } from "../../tools/feishu/index.js";
import { ToolRegistry } from "../../tools/registry.js";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { loadCliEnv } from "../../config/local-env.js";
import type { Artifact } from "../../types/artifact.js";
import type { RuntimeConfig } from "../../types/config.js";
import { isAcceptedConfirmationText } from "../../orchestrator/confirmation-text.js";

const DEFAULT_INPUT = [
  "目标: 为校园 AI 产品答辩建立项目空间",
  "成员: 产品负责人, 技术负责人, 演示负责人",
  "交付物: 项目简报, 任务清单, 风险台账, 群内总结",
  "截止时间: 2026-05-03",
  "风险: 卡片回调平台配置未验证, 群公告 API 可能降级",
].join("\n");

export interface AgentProjectInitOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
}

export interface AgentProjectInitResult {
  readonly status: RunResult["status"];
  readonly runId: string;
  readonly mode: RuntimeConfig["mode"];
  readonly output: string;
  readonly artifactCount: number;
  readonly artifacts: readonly Artifact[];
  readonly duplicateGuard?: Record<string, unknown>;
}

export async function runAgentProjectInit(options: AgentProjectInitOptions = {}): Promise<AgentProjectInitResult> {
  const argv = options.argv ?? [];
  const parsed = parseArgs(argv, {
    boolean: [
      "json",
      "live",
      "dry-run",
      "send-plan-card",
      "send-entry-message",
      "pin-entry-message",
      "update-announcement",
      "send-risk-card",
      "auto-lookup-owner-contact",
      "auto-confirm",
      "no-auto-confirm",
      "allow-duplicate-run",
      "disable-duplicate-guard",
    ],
    string: [
      "input",
      "input-file",
      "output",
      "confirm",
      "profile",
      "base-token",
      "base-table-id",
      "chat-id",
      "tasklist-id",
      "owner-open-id",
      "owner-open-id-map-json",
      "dedupe-key",
      "storage-path",
      "mode",
    ],
  });
  const runtime = loadRuntimeConfig(argv, deterministicRuntimeEnv(loadCliEnv(options.env, options.cwd)));
  const input = await resolveInput(parsed.flags);
  const output = stringFlag(parsed.flags.output) ?? defaultOutputPath();
  const registry = new ToolRegistry();
  registerFeishuTools(registry);
  const recorder = new JsonlRecorder(output);
  const orchestrator = new Orchestrator({
    planner: createProjectInitPlannerProvider(),
    registry,
    recorder,
    confirmationGate: new TextConfirmationGate(),
    duplicateGuard: new DuplicateGuard(runtime.duplicateGuard),
    runtime,
  });

  const result = await orchestrator.run(input, runOptions(parsed.flags, runtime));
  await recorder.close();
  return {
    status: result.status,
    runId: result.runId,
    mode: runtime.mode,
    output,
    artifactCount: result.artifacts.length,
    artifacts: result.artifacts,
    duplicateGuard: result.duplicateGuard,
  };
}

export function renderAgentProjectInit(result: AgentProjectInitResult): string {
  return [
    "PilotFlow TS Project Init",
    "",
    `status: ${result.status}`,
    `run: ${result.runId}`,
    `mode: ${result.mode}`,
    `artifacts: ${result.artifactCount}`,
    `output: ${result.output}`,
    result.duplicateGuard ? `duplicate_guard: ${String(result.duplicateGuard.status ?? "unknown")}` : undefined,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv, { boolean: ["json", "help", "h"] });
  if (parsed.flags.help === true || parsed.flags.h === true) {
    console.log(buildAgentProjectInitUsage());
    return;
  }

  const result = await runAgentProjectInit({ argv });
  if (parsed.flags.json === true) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(renderAgentProjectInit(result));
}

export function buildAgentProjectInitUsage(): string {
  return `Usage:
  npm run pilot:project-init-ts
  npm run pilot:project-init-ts -- --dry-run --send-entry-message --send-risk-card
  npm run pilot:project-init-ts -- --live --confirm "确认执行" --send-entry-message --send-risk-card

Options:
  --dry-run                         Run without Feishu writes.
  --live                            Enable live Feishu mode.
  --confirm <text>                  Required confirmation text for live side effects.
  --input <text>                    Inline project intent.
  --input-file <path>               Read project intent from a file.
  --output <path>                   JSONL run log path.
  --send-plan-card                  Send or dry-run an execution-plan card.
  --send-entry-message              Send or dry-run the project entry message.
  --pin-entry-message               Pin or dry-run the project entry message.
  --update-announcement             Try native announcement update and fallback on failure.
  --send-risk-card                  Send or dry-run a risk decision card.
  --auto-lookup-owner-contact       Search Feishu Contacts for owner labels.
  --owner-open-id-map-json <json>   Map owner labels to Feishu open_id values.
  --allow-duplicate-run             Bypass duplicate-run protection intentionally.
  --json                            Print JSON result.
  --help                            Show this help.
`;
}

async function resolveInput(flags: Record<string, string | boolean>): Promise<string> {
  const inputFile = stringFlag(flags["input-file"]);
  if (inputFile) return readFile(inputFile, "utf8");
  return stringFlag(flags.input) ?? DEFAULT_INPUT;
}

function runOptions(flags: Record<string, string | boolean>, runtime: RuntimeConfig): RunOptions {
  return {
    autoConfirm: autoConfirm(flags, runtime),
    confirmationText: stringFlag(flags.confirm),
    sendPlanCard: flags["send-plan-card"] === true,
    sendEntryMessage: flags["send-entry-message"] === true,
    pinEntryMessage: flags["pin-entry-message"] === true,
    updateAnnouncement: flags["update-announcement"] === true,
    sendRiskCard: flags["send-risk-card"] === true,
    autoLookupOwnerContact: flags["auto-lookup-owner-contact"] === true,
    ownerOpenIdMap: ownerMap(flags["owner-open-id-map-json"]),
    taskAssigneeOpenId: stringFlag(flags["owner-open-id"]) ?? runtime.feishuTargets.ownerOpenId,
    dedupeKey: stringFlag(flags["dedupe-key"]),
    sourceMessage: stringFlag(flags.input),
  };
}

function autoConfirm(flags: Record<string, string | boolean>, runtime: RuntimeConfig): boolean {
  if (flags["no-auto-confirm"] === true) return false;
  if (flags["auto-confirm"] === true) return true;
  if (runtime.mode !== "live") return true;
  return isAcceptedConfirmationText(stringFlag(flags.confirm) ?? "");
}

function ownerMap(value: unknown): Record<string, string> | undefined {
  const text = stringFlag(value);
  if (!text) return undefined;
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--owner-open-id-map-json must be a JSON object");
  }
  return parsed as Record<string, string>;
}

function defaultOutputPath(): string {
  return `tmp/runs/ts-project-init-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
}

function stringFlag(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function deterministicRuntimeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(next)) {
    if (key.startsWith("PILOTFLOW_LLM_")) delete next[key];
  }
  return next;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
