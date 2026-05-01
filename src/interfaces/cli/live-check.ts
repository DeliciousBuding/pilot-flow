import { pathToFileURL } from "node:url";
import { runCommand, type CommandResult, type RunOptions } from "../../infrastructure/command-runner.js";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { loadCliEnv } from "../../config/local-env.js";
import { parseArgs } from "../../shared/parse-args.js";
import { buildToolIdempotencyKey } from "../../tools/idempotency.js";

export interface LiveCheckOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly runCommand?: CommandRunner;
}

export type CommandRunner = (bin: string, args: readonly string[], options: RunOptions) => Promise<CommandResult>;

export interface LiveCheckItem {
  readonly name: string;
  readonly status: "pass" | "warn" | "fail";
  readonly detail: string;
}

export interface LiveCheckAction {
  readonly severity: "warn" | "fail";
  readonly owner: "local_operator" | "open_platform_admin";
  readonly reason: string;
  readonly action: string;
}

export interface LiveCheckReport {
  readonly generatedAt: string;
  readonly profile: string;
  readonly ready: boolean;
  readonly checks: readonly LiveCheckItem[];
  readonly nextActions: readonly LiveCheckAction[];
  readonly summary: {
    readonly passed: number;
    readonly warned: number;
    readonly failed: number;
    readonly actionable: number;
  };
}

export async function buildLiveCheckReport(options: LiveCheckOptions = {}): Promise<LiveCheckReport> {
  const argv = options.argv ?? [];
  const env = feishuOnlyEnv(loadCliEnv(options.env, options.cwd));
  const command = options.runCommand ?? runCommand;
  const runtime = loadRuntimeConfig(["--live", ...argv], env);
  const targets = runtime.feishuTargets;
  const commandOptions: RunOptions = { profile: runtime.profile, timeoutMs: 15_000, maxOutputBytes: 64_000 };

  const checks: LiveCheckItem[] = [];
  checks.push(await commandCheck("lark-cli", "lark-cli version", ["--version"], command, { timeoutMs: 10_000 }));
  checks.push(await commandCheck("lark-cli", "lark auth", ["auth", "status", "--verify"], command, commandOptions));
  checks.push(await eventScopeCheck("im:message.p2p_msg:readonly", command, commandOptions));
  checks.push(await eventSubscribeDryRunCheck("IM event subscribe dry-run", "im.message.receive_v1", command, commandOptions));
  checks.push(await eventSubscribeDryRunCheck("card callback subscribe dry-run", "card.action.trigger", command, commandOptions));
  checks.push(await eventBusStatusCheck(command, commandOptions));

  if (targets.chatId) {
    checks.push(await commandCheck("lark-cli", "chat readable", ["api", "GET", `/open-apis/im/v1/chats/${targets.chatId}`, "--as", "bot"], command, commandOptions));
    checks.push(await callbackProbeCardDryRunCheck(targets.chatId, command, commandOptions));
  } else {
    checks.push({ name: "chat readable", status: "warn", detail: "missing PILOTFLOW_TEST_CHAT_ID" });
    checks.push({ name: "callback probe card dry-run", status: "warn", detail: "missing PILOTFLOW_TEST_CHAT_ID" });
  }

  if (targets.baseToken && targets.baseTableId) {
    checks.push(await commandCheck("lark-cli", "base table readable", ["base", "+table-get", "--base-token", targets.baseToken, "--table-id", targets.baseTableId, "--as", "user"], command, commandOptions));
  } else {
    checks.push({ name: "base table readable", status: "warn", detail: "missing PILOTFLOW_BASE_TOKEN or PILOTFLOW_BASE_TABLE_ID" });
  }

  checks.push({
    name: "tasklist configured",
    status: targets.tasklistId ? "pass" : "warn",
    detail: targets.tasklistId ? `configured ${maskValue(targets.tasklistId)}` : "optional PILOTFLOW_TASKLIST_ID not set",
  });

  checks.push({
    name: "bot mention identity",
    status: env.PILOTFLOW_BOT_USER_ID ? "pass" : "warn",
    detail: env.PILOTFLOW_BOT_USER_ID
      ? "PILOTFLOW_BOT_USER_ID is set for structured gateway probes"
      : "missing PILOTFLOW_BOT_USER_ID; gateway IM probe will fail before sending unless --bot-user-id or --probe-text is passed",
  });

  const nextActions = buildNextActions(checks, runtime.profile);
  return {
    generatedAt: new Date().toISOString(),
    profile: runtime.profile,
    ready: checks.every((item) => item.status !== "fail") && nextActions.length === 0,
    checks,
    nextActions,
    summary: {
      passed: checks.filter((item) => item.status === "pass").length,
      warned: checks.filter((item) => item.status === "warn").length,
      failed: checks.filter((item) => item.status === "fail").length,
      actionable: nextActions.length,
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
    ...renderNextActions(report.nextActions),
    `Ready: ${report.ready ? "yes" : "no"}`,
    `Summary: ${report.summary.passed} passed, ${report.summary.warned} warned, ${report.summary.failed} failed, ${report.summary.actionable} actionable.`,
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
  --strict                  Exit non-zero when known next actions remain.
  --help                    Show this help.
`;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv, { boolean: ["json", "strict", "help", "h"] });
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
  if (report.summary.failed > 0 || (parsed.flags.strict === true && !report.ready)) process.exitCode = 1;
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

async function eventScopeCheck(scope: string, command: CommandRunner, options: RunOptions): Promise<LiveCheckItem> {
  try {
    await command("lark-cli", ["auth", "check", "--scope", scope], options);
    return { name: "IM event receive scope", status: "pass", detail: `${scope} granted` };
  } catch (error) {
    return {
      name: "IM event receive scope",
      status: "warn",
      detail: `missing ${scope}; im.message.receive_v1 may not be delivered until the app scope and user authorization are updated`,
    };
  }
}

async function eventSubscribeDryRunCheck(name: string, eventType: string, command: CommandRunner, options: RunOptions): Promise<LiveCheckItem> {
  try {
    await command("lark-cli", ["event", "+subscribe", "--as", "bot", "--event-types", eventType, "--dry-run"], options);
    return { name, status: "pass", detail: `${eventType} subscribe command can be constructed` };
  } catch (error) {
    return {
      name,
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function eventBusStatusCheck(command: CommandRunner, options: RunOptions): Promise<LiveCheckItem> {
  try {
    const result = await command("lark-cli", ["event", "status"], options);
    const detail = summarizeEventBusStatus(result.stdout);
    return { name: "event bus status", status: detail.startsWith("running;") ? "warn" : "pass", detail };
  } catch (error) {
    return {
      name: "event bus status",
      status: "warn",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function callbackProbeCardDryRunCheck(chatId: string, command: CommandRunner, options: RunOptions): Promise<LiveCheckItem> {
  const runId = "live-check-callback-probe";
  const content = JSON.stringify({
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: "PilotFlow callback probe dry-run" } },
    elements: [
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "确认执行" },
            type: "primary",
            value: {
              pilotflow_card: "execution_plan",
              pilotflow_action: "confirm_execute",
              pilotflow_run_id: runId,
            },
          },
        ],
      },
    ],
  });
  try {
    await command("lark-cli", [
      "im", "+messages-send",
      "--as", "user",
      "--chat-id", chatId,
      "--msg-type", "interactive",
      "--content", content,
      "--idempotency-key", buildToolIdempotencyKey({ runId, tool: "callback.probe.live-check", sequence: 1 }),
    ], { ...options, dryRun: true });
    return { name: "callback probe card dry-run", status: "pass", detail: "interactive callback probe card send command can be constructed" };
  } catch (error) {
    return { name: "callback probe card dry-run", status: "fail", detail: error instanceof Error ? error.message : String(error) };
  }
}

function summarizeEventBusStatus(stdout = ""): string {
  const text = stdout.trim();
  if (!text) return "event bus status unavailable";
  if (/not running/i.test(text)) return "not running";
  if (/\brunning\b/i.test(text)) return "running; avoid multiple event subscribers unless intentionally using --force";
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2).join(" ");
}

function buildNextActions(checks: readonly LiveCheckItem[], profile: string): readonly LiveCheckAction[] {
  const actions: LiveCheckAction[] = [];
  const byName = new Map(checks.map((item) => [item.name, item]));
  const imScope = byName.get("IM event receive scope");
  const subscribe = byName.get("IM event subscribe dry-run");
  const cardSubscribe = byName.get("card callback subscribe dry-run");
  const probeCard = byName.get("callback probe card dry-run");
  const bus = byName.get("event bus status");
  const bot = byName.get("bot mention identity");

  if (subscribe?.status === "fail") {
    actions.push({
      severity: "fail",
      owner: "local_operator",
      reason: "The local event subscription command cannot be constructed.",
      action: "Run lark-cli event +subscribe --as bot --event-types im.message.receive_v1 --dry-run and fix the CLI/profile error before sending probes.",
    });
  }

  if (cardSubscribe?.status === "fail") {
    actions.push({
      severity: "fail",
      owner: "local_operator",
      reason: "The local card callback subscription command cannot be constructed.",
      action: "Run lark-cli event +subscribe --as bot --event-types card.action.trigger --dry-run and fix the CLI/profile or Open Platform event subscription error before running pilot:callback-proof.",
    });
  }

  if (probeCard?.status === "fail") {
    actions.push({
      severity: "fail",
      owner: "local_operator",
      reason: "The callback probe card command cannot be constructed.",
      action: "Run npm run pilot:callback-proof -- --send-probe-card --dry-run --json and fix the profile, chat id, message permission, or lark-cli interactive card send error before a real callback probe.",
    });
  }

  if (bus?.status === "warn") {
    actions.push({
      severity: "warn",
      owner: "local_operator",
      reason: "Another event subscriber may consume or compete with gateway probes.",
      action: "Stop the existing event bus or intentionally run a single subscriber before testing pilot:gateway.",
    });
  }

  if (bot?.status === "warn") {
    actions.push({
      severity: "warn",
      owner: "local_operator",
      reason: "Default gateway probes need a structured bot mention.",
      action: "Set PILOTFLOW_BOT_USER_ID locally or pass --bot-user-id before running pilot:gateway -- --live --send-probe-message.",
    });
  }

  return actions;
}

function renderNextActions(actions: readonly LiveCheckAction[]): readonly string[] {
  if (actions.length === 0) return [];
  const groups: Array<[LiveCheckAction["owner"], string]> = [
    ["open_platform_admin", "Open Platform admin"],
    ["local_operator", "Local operator"],
  ];
  const lines = ["Next actions:"];
  for (const [owner, label] of groups) {
    const owned = actions.filter((item) => item.owner === owner);
    if (owned.length === 0) continue;
    lines.push(`${label}:`);
    lines.push(...owned.map((item, index) => `${index + 1}. [${item.severity}] ${redactDetail(item.action)} (${item.reason})`));
  }
  lines.push("");
  return lines;
}

function redactReport(report: LiveCheckReport): LiveCheckReport {
  return {
    ...report,
    checks: report.checks.map((item) => ({ ...item, detail: redactDetail(item.detail) })),
    nextActions: report.nextActions.map((item) => ({
      severity: item.severity,
      owner: item.owner,
      reason: redactDetail(item.reason),
      action: redactDetail(item.action),
    })),
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
