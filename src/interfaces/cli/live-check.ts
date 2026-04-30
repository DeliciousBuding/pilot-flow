import { pathToFileURL } from "node:url";
import { runCommand, type CommandResult, type RunOptions } from "../../infrastructure/command-runner.js";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { parseArgs } from "../../shared/parse-args.js";

export interface LiveCheckOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly runCommand?: CommandRunner;
}

export type CommandRunner = (bin: string, args: readonly string[], options: RunOptions) => Promise<CommandResult>;

export interface LiveCheckItem {
  readonly name: string;
  readonly status: "pass" | "warn" | "fail";
  readonly detail: string;
}

export interface LiveCheckReport {
  readonly generatedAt: string;
  readonly profile: string;
  readonly checks: readonly LiveCheckItem[];
  readonly summary: {
    readonly passed: number;
    readonly warned: number;
    readonly failed: number;
  };
}

export async function buildLiveCheckReport(options: LiveCheckOptions = {}): Promise<LiveCheckReport> {
  const argv = options.argv ?? [];
  const env = feishuOnlyEnv(options.env ?? process.env);
  const command = options.runCommand ?? runCommand;
  const runtime = loadRuntimeConfig(["--live", ...argv], env);
  const targets = runtime.feishuTargets;
  const commandOptions: RunOptions = { profile: runtime.profile, timeoutMs: 15_000, maxOutputBytes: 64_000 };

  const checks: LiveCheckItem[] = [];
  checks.push(await commandCheck("lark-cli", "lark-cli version", ["--version"], command, { timeoutMs: 10_000 }));
  checks.push(await commandCheck("lark-cli", "lark auth", ["auth", "status", "--verify", "--format", "json"], command, commandOptions));

  if (targets.chatId) {
    checks.push(await commandCheck("lark-cli", "chat readable", ["api", "GET", `/open-apis/im/v1/chats/${targets.chatId}`, "--as", "bot"], command, commandOptions));
  } else {
    checks.push({ name: "chat readable", status: "warn", detail: "missing PILOTFLOW_TEST_CHAT_ID" });
  }

  if (targets.baseToken && targets.baseTableId) {
    checks.push(await commandCheck("lark-cli", "base table readable", ["api", "GET", `/open-apis/bitable/v1/apps/${targets.baseToken}/tables/${targets.baseTableId}`, "--as", "user"], command, commandOptions));
  } else {
    checks.push({ name: "base table readable", status: "warn", detail: "missing PILOTFLOW_BASE_TOKEN or PILOTFLOW_BASE_TABLE_ID" });
  }

  checks.push({
    name: "tasklist configured",
    status: targets.tasklistId ? "pass" : "warn",
    detail: targets.tasklistId ? `configured ${maskValue(targets.tasklistId)}` : "optional PILOTFLOW_TASKLIST_ID not set",
  });

  return {
    generatedAt: new Date().toISOString(),
    profile: runtime.profile,
    checks,
    summary: {
      passed: checks.filter((item) => item.status === "pass").length,
      warned: checks.filter((item) => item.status === "warn").length,
      failed: checks.filter((item) => item.status === "fail").length,
    },
  };
}

function feishuOnlyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(next)) {
    if (key.startsWith("PILOTFLOW_LLM_")) delete next[key];
  }
  return next;
}

export function renderLiveCheckReport(report: LiveCheckReport): string {
  return [
    "PilotFlow Live Check",
    `Generated: ${report.generatedAt}`,
    `Profile: ${report.profile}`,
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...report.checks.map((item) => `| ${item.name} | ${item.status} | ${escapeCell(redactDetail(item.detail))} |`),
    "",
    `Summary: ${report.summary.passed} passed, ${report.summary.warned} warned, ${report.summary.failed} failed.`,
  ].join("\n");
}

export function buildLiveCheckUsage(): string {
  return `Usage:
  npm run pilot:live-check
  npm run pilot:live-check -- --json
  npm run pilot:live-check -- --profile <profile> --chat-id <chat> --base-token <base> --base-table-id <table>

Options:
  --profile <profile>       lark-cli profile.
  --chat-id <chat>          Feishu chat id for read check.
  --base-token <base>       Feishu Base token for read check.
  --base-table-id <table>   Feishu Base table id for read check.
  --json                    Print JSON report.
  --help                    Show this help.
`;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv, { boolean: ["json", "help", "h"] });
  if (parsed.flags.help === true || parsed.flags.h === true) {
    console.log(buildLiveCheckUsage());
    return;
  }

  const report = await buildLiveCheckReport({ argv });
  if (parsed.flags.json === true) {
    console.log(JSON.stringify(redactReport(report), null, 2));
  } else {
    console.log(renderLiveCheckReport(report));
  }
  if (report.summary.failed > 0) process.exitCode = 1;
}

async function commandCheck(
  bin: string,
  name: string,
  args: readonly string[],
  command: CommandRunner,
  options: RunOptions,
): Promise<LiveCheckItem> {
  try {
    await command(bin, args, options);
    return { name, status: "pass", detail: "ok" };
  } catch (error) {
    return { name, status: "fail", detail: error instanceof Error ? error.message : String(error) };
  }
}

function redactReport(report: LiveCheckReport): LiveCheckReport {
  return {
    ...report,
    checks: report.checks.map((item) => ({ ...item, detail: redactDetail(item.detail) })),
  };
}

function redactDetail(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[REDACTED]")
    .replace(/\b(?:oc|ou|om|bascn|tbl)[A-Za-z0-9_-]{8,}\b/g, (match) => maskValue(match))
    .replace(/(token|secret|api[_-]?key)["'=:\s]+[A-Za-z0-9._~+/=-]{8,}/gi, "$1=[REDACTED]");
}

function maskValue(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function escapeCell(value = ""): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
