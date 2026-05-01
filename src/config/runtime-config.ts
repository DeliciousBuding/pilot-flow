import { resolve } from "node:path";
import { parseArgs } from "../shared/parse-args.js";
import { ConfigurationError } from "../shared/errors.js";
import type { RuntimeConfig, RunMode } from "../types/config.js";

const DEFAULT_PROFILE = "pilotflow-contest";
const DEFAULT_STORAGE_PATH = "tmp/run-guard/project-init-runs";

export function loadRuntimeConfig(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const parsed = parseArgs(argv, {
    boolean: ["live", "dry-run"],
    string: [
      "mode",
      "profile",
      "base-token",
      "base-table-id",
      "chat-id",
      "tasklist-id",
      "owner-open-id",
      "storage-path",
    ],
  });
  const flags = parsed.flags;
  const mode = resolveMode(flags, env);

  return {
    mode,
    profile: stringValue(flags.profile) ?? env.PILOTFLOW_LARK_PROFILE ?? DEFAULT_PROFILE,
    feishuTargets: {
      baseToken: stringValue(flags["base-token"]) ?? env.PILOTFLOW_BASE_TOKEN,
      baseTableId: stringValue(flags["base-table-id"]) ?? env.PILOTFLOW_BASE_TABLE_ID,
      chatId: stringValue(flags["chat-id"]) ?? env.PILOTFLOW_TEST_CHAT_ID,
      tasklistId: stringValue(flags["tasklist-id"]) ?? env.PILOTFLOW_TASKLIST_ID,
      ownerOpenId: stringValue(flags["owner-open-id"]) ?? env.PILOTFLOW_OWNER_OPEN_ID ?? env.PILOTFLOW_TASK_ASSIGNEE_OPEN_ID,
    },
    duplicateGuard: {
      enabled: mode === "live" && !booleanFlag(flags["disable-duplicate-guard"], env.PILOTFLOW_DISABLE_DUPLICATE_GUARD),
      storagePath: resolve(stringValue(flags["storage-path"]) ?? env.PILOTFLOW_STORAGE_PATH ?? DEFAULT_STORAGE_PATH),
      ttlMs: numberValue(env.PILOTFLOW_DUPLICATE_GUARD_TTL_MS) ?? 24 * 60 * 60 * 1000,
      allowDuplicateRun: booleanFlag(flags["allow-duplicate-run"], env.PILOTFLOW_ALLOW_DUPLICATE_RUN),
    },
    llm: loadLlmConfig(env),
    autoConfirm: booleanFlag(flags["auto-confirm"], env.PILOTFLOW_AUTO_CONFIRM),
    verbose: booleanFlag(flags.verbose, env.PILOTFLOW_VERBOSE),
  };
}

function resolveMode(flags: Record<string, string | boolean>, env: NodeJS.ProcessEnv): RunMode {
  if (flags.live === true) return "live";
  if (flags["dry-run"] === true) return "dry-run";
  const mode = stringValue(flags.mode) ?? env.PILOTFLOW_FEISHU_MODE ?? "dry-run";
  if (mode !== "dry-run" && mode !== "live") {
    throw new ConfigurationError(`Unsupported PILOTFLOW_FEISHU_MODE: ${mode}`, { mode });
  }
  return mode;
}

function loadLlmConfig(env: NodeJS.ProcessEnv): RuntimeConfig["llm"] {
  const baseUrl = env.PILOTFLOW_LLM_BASE_URL;
  const apiKey = env.PILOTFLOW_LLM_API_KEY;
  const model = env.PILOTFLOW_LLM_MODEL;
  if (!baseUrl && !apiKey && !model) return undefined;
  if (!baseUrl || !apiKey || !model) {
    throw new ConfigurationError("Incomplete LLM config; set PILOTFLOW_LLM_BASE_URL, PILOTFLOW_LLM_API_KEY, and PILOTFLOW_LLM_MODEL");
  }
  return {
    baseUrl,
    apiKey,
    model,
    fallbackModels: env.PILOTFLOW_LLM_FALLBACK_MODELS?.split(",").map((item) => item.trim()).filter(Boolean),
    maxTokens: numberValue(env.PILOTFLOW_LLM_MAX_TOKENS),
    temperature: numberValue(env.PILOTFLOW_LLM_TEMPERATURE),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ConfigurationError(`Invalid numeric config value: ${value}`);
  }
  return parsed;
}

function booleanFlag(value: unknown, envValue?: string): boolean {
  return value === true || value === "true" || value === "1" || envValue === "true" || envValue === "1";
}
