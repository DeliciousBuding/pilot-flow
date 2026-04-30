import { pathToFileURL } from "node:url";
import { JsonlRecorder } from "../../infrastructure/jsonl-recorder.js";
import { handleCardEvent } from "../../gateway/feishu/card-handler.js";
import { EventDedupe } from "../../gateway/feishu/dedupe.js";
import { LarkCliEventSource } from "../../gateway/feishu/lark-cli-source.js";
import type { EventSource, FeishuGatewayEvent } from "../../gateway/feishu/event-source.js";
import { runCommand, type CommandResult } from "../../infrastructure/command-runner.js";
import { loadCliEnv } from "../../config/local-env.js";
import { parseArgs } from "../../shared/parse-args.js";
import { buildToolIdempotencyKey } from "../../tools/idempotency.js";

const DEFAULT_OUTPUT = "tmp/proof/callback-proof.jsonl";

export interface CallbackProofOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly source?: EventSource<FeishuGatewayEvent>;
  readonly runCommand?: typeof runCommand;
  readonly now?: () => string;
}

export interface CallbackProofProbeResult {
  readonly status: "not_sent" | "sent" | "dry_run";
  readonly runId?: string;
  readonly messageId?: string;
}

export interface CallbackProofResult {
  readonly status: "observed" | "timeout_no_callback";
  readonly observedCallbacks: number;
  readonly ignoredEvents: number;
  readonly unsupportedEvents: number;
  readonly output: string;
  readonly probe: CallbackProofProbeResult;
  readonly exitCode: number;
}

export async function runCallbackProof(options: CallbackProofOptions = {}): Promise<CallbackProofResult> {
  const argv = options.argv ?? [];
  const parsed = parseArgs(argv, {
    boolean: ["json", "help", "h", "strict", "include-raw", "send-probe-card", "dry-run"],
    string: ["output", "profile", "timeout", "max-events", "chat-id", "probe-title", "probe-run-id"],
  });
  const env = loadCliEnv(options.env, options.cwd);
  const output = stringFlag(parsed.flags.output) ?? DEFAULT_OUTPUT;
  const strict = parsed.flags.strict === true;
  const includeRaw = parsed.flags["include-raw"] === true;
  if (includeRaw && !isTmpPath(output)) throw new Error("--include-raw is only allowed for ignored tmp/ outputs");

  const recorder = new JsonlRecorder(output);
  const profile = stringFlag(parsed.flags.profile) ?? env.PILOTFLOW_LARK_PROFILE;
  const source = options.source ?? new LarkCliEventSource({ profile, as: "bot", eventTypes: ["card.action.trigger"] });
  const dedupe = new EventDedupe({ ttlMs: 60 * 60 * 1000, maxEntries: 1024 });
  const timeoutMs = durationMs(stringFlag(parsed.flags.timeout));
  const maxEvents = numberFlag(parsed.flags["max-events"]) ?? 0;
  const now = options.now ?? (() => new Date().toISOString());
  const command = options.runCommand ?? runCommand;

  let observedCallbacks = 0;
  let ignoredEvents = 0;
  let unsupportedEvents = 0;
  let seenEvents = 0;
  let timedOut = false;

  await recorder.record({ type: "callback_proof.started", runId: "callback-proof", output, strict, includeRaw, timestamp: now() });
  const probe = parsed.flags["send-probe-card"] === true
    ? await sendProbeCard({
      chatId: stringFlag(parsed.flags["chat-id"]) ?? env.PILOTFLOW_TEST_CHAT_ID,
      profile,
      dryRun: parsed.flags["dry-run"] === true,
      title: stringFlag(parsed.flags["probe-title"]) ?? "PilotFlow callback proof",
      runId: stringFlag(parsed.flags["probe-run-id"]) ?? buildProbeRunId(now),
      command,
      recorder,
      timestamp: now,
    })
    : { status: "not_sent" } as const;

  try {
    const iterator = source.events()[Symbol.asyncIterator]();
    while (true) {
      const next = await nextWithTimeout(iterator, timeoutMs);
      if (isTimeoutResult(next)) {
        timedOut = true;
        break;
      }
      if (next.done) break;
      const event = next.value;
      seenEvents += 1;
      if (event.kind !== "card") {
        unsupportedEvents += 1;
        await recorder.record({ type: "callback_proof.unsupported_event", runId: "callback-proof", gatewayEventId: event.id, gatewayKind: event.kind, timestamp: now() });
      } else {
        const result = await handleCardEvent(event, {
          dedupe,
          onAction: async (action) => {
            observedCallbacks += 1;
            await recorder.record({
              type: "callback_proof.callback_observed",
              runId: action.runId || "unknown-run",
              gatewayEventId: event.id,
              card: action.card,
              action: action.action,
              operatorPresent: action.userId.length > 0,
              chatContextPresent: hasChatContext(event.raw),
              timestamp: now(),
              raw: includeRaw ? event.raw : undefined,
            });
          },
        });
        if (result.status === "ignored") {
          ignoredEvents += 1;
          await recorder.record({ type: "callback_proof.callback_ignored", runId: "callback-proof", gatewayEventId: event.id, reason: result.reason, timestamp: now() });
        }
      }
      if (maxEvents > 0 && seenEvents >= maxEvents) break;
    }
  } finally {
    await source.close();
    await recorder.close();
  }

  const status = observedCallbacks > 0 ? "observed" : "timeout_no_callback";
  if (timedOut || status === "timeout_no_callback") {
    await recorder.record({ type: "callback_proof.timeout_no_callback", runId: "callback-proof", observedCallbacks, ignoredEvents, unsupportedEvents, timestamp: now() });
  }

  return {
    status,
    observedCallbacks,
    ignoredEvents,
    unsupportedEvents,
    output,
    probe,
    exitCode: status === "timeout_no_callback" && strict ? 1 : 0,
  };
}

async function sendProbeCard(options: {
  readonly chatId?: string;
  readonly profile?: string;
  readonly dryRun: boolean;
  readonly title: string;
  readonly runId: string;
  readonly command: typeof runCommand;
  readonly recorder: JsonlRecorder;
  readonly timestamp: () => string;
}): Promise<CallbackProofProbeResult> {
  if (!options.chatId) throw new Error("--send-probe-card requires --chat-id or PILOTFLOW_TEST_CHAT_ID");
  const content = JSON.stringify(buildProbeCard(options.title, options.runId));
  const result = await options.command("lark-cli", [
    "im", "+messages-send",
    "--as", "user",
    "--chat-id", options.chatId,
    "--msg-type", "interactive",
    "--content", content,
    "--idempotency-key", buildToolIdempotencyKey({ runId: options.runId, tool: "callback.proof", sequence: 1 }),
  ], { dryRun: options.dryRun, profile: options.profile, timeoutMs: 30_000 });
  const messageId = extractMessageId(result);
  await options.recorder.record({
    type: "callback_proof.probe_card_sent",
    runId: options.runId,
    dry_run: options.dryRun,
    message_id: messageId,
    timestamp: options.timestamp(),
  });
  return {
    status: options.dryRun ? "dry_run" : "sent",
    runId: options.runId,
    messageId,
  };
}

function buildProbeCard(title: string, runId: string): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: title } },
    elements: [
      { tag: "div", text: { tag: "lark_md", content: `Click **确认执行** to prove Feishu delivers \`card.action.trigger\` to PilotFlow.\n\nRun ID: ${runId}` } },
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
  };
}

function isTimeoutResult<T>(value: IteratorResult<T> | { readonly timeout: true }): value is { readonly timeout: true } {
  return "timeout" in value;
}

export function renderCallbackProof(result: CallbackProofResult): string {
  return [
    "PilotFlow Callback Proof",
    "",
    `status: ${result.status}`,
    `observed_callbacks: ${result.observedCallbacks}`,
    `ignored_events: ${result.ignoredEvents}`,
    `unsupported_events: ${result.unsupportedEvents}`,
    `probe_status: ${result.probe.status}`,
    result.probe.runId ? `probe_run_id: ${result.probe.runId}` : undefined,
    result.probe.messageId ? `probe_message_id: ${result.probe.messageId}` : undefined,
    `output: ${result.output}`,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function buildCallbackProofUsage(): string {
  return `Usage:
  npm run pilot:callback-proof -- --timeout 60s
  npm run pilot:callback-proof -- --timeout 60s --strict
  npm run pilot:callback-proof -- --send-probe-card --timeout 60s

Options:
  --profile <profile>   lark-cli profile.
  --chat-id <chat>      Chat to receive the optional probe card; defaults to PILOTFLOW_TEST_CHAT_ID.
  --timeout <duration>  Stop after duration, for example 60s or 2m.
  --max-events <n>      Stop after n events.
  --output <path>       JSONL proof output path.
  --send-probe-card     Send a callback probe card before listening.
  --probe-title <text>  Probe card title.
  --probe-run-id <id>   Probe callback run id.
  --dry-run             Dry-run the probe card send command.
  --include-raw         Include raw callback payload; only allowed under tmp/.
  --strict              Exit non-zero if no callback is observed.
  --json                Print JSON result.
  --help                Show this help.
`;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv, { boolean: ["json", "help", "h"] });
  if (parsed.flags.help === true || parsed.flags.h === true) {
    console.log(buildCallbackProofUsage());
    return;
  }
  const result = await runCallbackProof({ argv });
  if (parsed.flags.json === true) console.log(JSON.stringify(result, null, 2));
  else console.log(renderCallbackProof(result));
  process.exitCode = result.exitCode;
}

async function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
): Promise<IteratorResult<T> | { readonly timeout: true }> {
  if (timeoutMs <= 0) return iterator.next();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<{ readonly timeout: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timeout: true }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasChatContext(raw: Record<string, unknown>): boolean {
  return Boolean(getString(raw, ["event", "context", "open_chat_id"]) || getString(raw, ["event", "context", "chat_id"]));
}

function extractMessageId(result: CommandResult): string | undefined {
  return getString(result.json ?? {}, ["data", "message", "message_id"]) ||
    getString(result.json ?? {}, ["data", "message_id"]) ||
    getString(result.json ?? {}, ["message_id"]) ||
    undefined;
}

function buildProbeRunId(now: () => string): string {
  return `callback-proof-${now().replace(/[^0-9A-Za-z]/g, "").slice(0, 20)}`;
}

function getString(value: Record<string, unknown>, path: readonly string[]): string {
  const found = path.reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, value);
  return typeof found === "string" ? found : "";
}

function durationMs(value: string | undefined): number {
  if (!value) return 0;
  const match = /^(\d+)(ms|s|m)?$/u.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  if (unit === "m") return amount * 60_000;
  if (unit === "s") return amount * 1_000;
  return amount;
}

function numberFlag(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringFlag(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isTmpPath(value: string): boolean {
  return value === "tmp" || value.startsWith("tmp/") || value.startsWith("tmp\\");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
