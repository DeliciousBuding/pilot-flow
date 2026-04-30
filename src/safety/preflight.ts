import type { RuntimeConfig } from "../types/config.js";

export interface PreflightResult {
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly warnings: readonly string[];
}

const TARGET_REQUIREMENTS: Record<string, readonly string[]> = {
  "base.write": ["baseToken", "baseTableId"],
  "im.send": ["chatId"],
  "card.send": ["chatId"],
  "entry.send": ["chatId"],
  "entry.pin": ["chatId"],
  "announcement.update": ["chatId"],
};

const PROJECT_INIT_TARGETS = ["baseToken", "baseTableId", "chatId"] as const;

export function preflight(
  config: RuntimeConfig,
  toolName: string,
  requiredTargets: readonly string[] = TARGET_REQUIREMENTS[toolName] ?? [],
): PreflightResult {
  if (config.mode === "dry-run") {
    return { ok: true, missing: [], warnings: [] };
  }

  const missing: string[] = [];
  const warnings: string[] = [];

  if (!config.profile.trim()) {
    missing.push("PILOTFLOW_LARK_PROFILE");
  }

  for (const target of requiredTargets) {
    if (!config.feishuTargets[target as keyof RuntimeConfig["feishuTargets"]]) {
      missing.push(envNameForTarget(target));
    }
  }

  if (toolName === "task.create" && !config.feishuTargets.tasklistId) {
    warnings.push("PILOTFLOW_TASKLIST_ID not set; task.create will use the default Feishu task destination");
  }

  return { ok: missing.length === 0, missing, warnings };
}

export function preflightProjectInit(config: RuntimeConfig): PreflightResult {
  return preflight(config, "project_init", PROJECT_INIT_TARGETS);
}

function envNameForTarget(target: string): string {
  switch (target) {
    case "baseToken":
      return "PILOTFLOW_BASE_TOKEN";
    case "baseTableId":
      return "PILOTFLOW_BASE_TABLE_ID";
    case "chatId":
      return "PILOTFLOW_TEST_CHAT_ID";
    case "tasklistId":
      return "PILOTFLOW_TASKLIST_ID";
    default:
      return target;
  }
}
