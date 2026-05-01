import { pathToFileURL } from "node:url";
import { JsonlRecorder } from "../../infrastructure/jsonl-recorder.js";
import { handleCardEvent } from "../../gateway/feishu/card-handler.js";
import { EventDedupe } from "../../gateway/feishu/dedupe.js";
import { LarkCliEventSource, LarkCliSubscribeError } from "../../gateway/feishu/lark-cli-source.js";
import type { EventSource, FeishuGatewayEvent } from "../../gateway/feishu/event-source.js";
import { runCommand, type CommandResult } from "../../infrastructure/command-runner.js";
import { loadCliEnv } from "../../config/local-env.js";
import { parseArgs } from "../../shared/parse-args.js";
import { buildToolIdempotencyKey } from "../../tools/idempotency.js";

const DEFAULT_OUTPUT = "tmp/proof/callback-proof.jsonl";
const LISTENER_STARTUP_GRACE_MS = 100;

export interface CallbackProofOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly source?: EventSource<FeishuGatewayEvent>;
  readonly runCommand?: typeof runCommand;
  readonly now?: () => string;
}

export interface CallbackProofProbeResult {
  readonly status: "not_sent" | "sent" | "dry_run" | "failed";
  readonly runId?: string;
  readonly messageId?: string;
  readonly error?: string;
}

export interface CallbackProofAction {
  readonly reason: string;
  readonly action: string;
}

export interface CallbackProofResult {
  readonly status: "observed" | "timeout_no_callback" | "subscribe_failed" | "probe_failed";
  readonly observedCallbacks: number;
  readonly ignoredEvents: number;
  readonly unsupportedEvents: number;
  readonly output: string;
  readonly probe: CallbackProofProbeResult;
  readonly nextActions: readonly CallbackProofAction[];
  readonly failure?: {
    readonly message: string;
    readonly exitCode?: number | null;
    readonly stderr?: string;
  };
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
  let failure: CallbackProofResult["failure"] | undefined;
  let probe: CallbackProofProbeResult = { status: "not_sent" };
  let expectedProbeRunId: string | undefined;
  let stopAfterObservedCallback = false;

  await recorder.record({ type: "callback_proof.started", runId: "callback-proof", output, strict, includeRaw, timestamp: now() });

  try {
    const iterator = source.events()[Symbol.asyncIterator]();
    let nextEvent = nextWithTimeout(iterator, timeoutMs);
    if (parsed.flags["send-probe-card"] === true) {
      const probeRunId = stringFlag(parsed.flags["probe-run-id"]) ?? buildProbeRunId(now);
      expectedProbeRunId = probeRunId;
      const startup = await observeListenerStartup(nextEvent, LISTENER_STARTUP_GRACE_MS);
      if (startup.status === "rejected") throw startup.error;
      if (startup.status === "settled") nextEvent = settledNext(startup.value);
      try {
        probe = await sendProbeCard({
          chatId: stringFlag(parsed.flags["chat-id"]) ?? env.PILOTFLOW_TEST_CHAT_ID,
          profile,
          dryRun: parsed.flags["dry-run"] === true,
          title: stringFlag(parsed.flags["probe-title"]) ?? "PilotFlow callback proof",
          runId: probeRunId,
          command,
          recorder,
          timestamp: now,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        probe = { status: "failed", runId: probeRunId, error: message };
        await recorder.record({
          type: "callback_proof.probe_card_failed",
          runId: probeRunId,
          message,
          timestamp: now(),
        });
      }
    }

    if (probe.status === "failed") {
      nextEvent.cancel();
      timedOut = false;
    } else {
      while (true) {
        const next = await nextEvent.promise;
        if (isTimeoutResult(next)) {
          timedOut = true;
          break;
        }
        if (next.done) break;
        const event = next.value;
        nextEvent = nextWithTimeout(iterator, timeoutMs);
        seenEvents += 1;
        if (event.kind !== "card") {
          unsupportedEvents += 1;
          await recorder.record({ type: "callback_proof.unsupported_event", runId: "callback-proof", gatewayEventId: event.id, gatewayKind: event.kind, timestamp: now() });
        } else {
          const result = await handleCardEvent(event, {
            dedupe,
            onAction: async (action) => {
              if (expectedProbeRunId && action.runId !== expectedProbeRunId) {
                ignoredEvents += 1;
                await recorder.record({
                  type: "callback_proof.callback_ignored",
                  runId: "callback-proof",
                  gatewayEventId: event.id,
                  reason: "probe_run_id_mismatch",
                  observedRunId: action.runId || "unknown-run",
                  expectedRunId: expectedProbeRunId,
                  timestamp: now(),
                });
                return;
              }
              observedCallbacks += 1;
              stopAfterObservedCallback = true;
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
        if (stopAfterObservedCallback || (maxEvents > 0 && seenEvents >= maxEvents)) {
          nextEvent.cancel();
          break;
        }
      }
    }
  } catch (error) {
    const currentFailure = subscribeFailure(error);
    failure = currentFailure;
    await recorder.record({
      type: "callback_proof.subscribe_failed",
      runId: "callback-proof",
      message: currentFailure.message,
      exitCode: currentFailure.exitCode,
      stderr: currentFailure.stderr,
      timestamp: now(),
    });
  } finally {
    await source.close();
    await recorder.close();
  }

  const status = failure ? "subscribe_failed" : probe.status === "failed" ? "probe_failed" : observedCallbacks > 0 ? "observed" : "timeout_no_callback";
  if (timedOut || status === "timeout_no_callback") {
    await recorder.record({ type: "callback_proof.timeout_no_callback", runId: "callback-proof", observedCallbacks, ignoredEvents, unsupportedEvents, timestamp: now() });
  }
  const nextActions = buildNextActions({ status, probe, failure, strict });

  return {
    status,
    observedCallbacks,
    ignoredEvents,
    unsupportedEvents,
    output,
    probe,
    nextActions,
    failure,
    exitCode: status === "subscribe_failed" || status === "probe_failed" ? 2 : status === "timeout_no_callback" && strict ? 1 : 0,
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
    result.probe.error ? `probe_error: ${result.probe.error}` : undefined,
    result.failure ? `failure: ${result.failure.message}` : undefined,
    ...renderNextActions(result.nextActions),
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
  --send-probe-card     Start listening, then send a callback probe card.
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

interface PendingNext<T> {
  readonly promise: Promise<IteratorResult<T> | { readonly timeout: true }>;
  readonly cancel: () => void;
}

type StartupObservation<T> =
  | { readonly status: "pending" }
  | { readonly status: "settled"; readonly value: IteratorResult<T> | { readonly timeout: true } }
  | { readonly status: "rejected"; readonly error: unknown };

async function observeListenerStartup<T>(
  pending: PendingNext<T>,
  graceMs: number,
): Promise<StartupObservation<T>> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      pending.promise.then<StartupObservation<T>, StartupObservation<T>>(
        (value) => ({ status: "settled", value }),
        (error: unknown) => ({ status: "rejected", error }),
      ),
      new Promise<StartupObservation<T>>((resolve) => {
        timer = setTimeout(() => resolve({ status: "pending" }), graceMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function settledNext<T>(value: IteratorResult<T> | { readonly timeout: true }): PendingNext<T> {
  return {
    promise: Promise.resolve(value),
    cancel: () => {},
  };
}

function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
): PendingNext<T> {
  let timer: NodeJS.Timeout | undefined;
  let settled = false;
  const promise = (async () => {
    if (timeoutMs <= 0) return iterator.next();
    try {
      return await Promise.race([
        iterator.next(),
        new Promise<{ readonly timeout: true }>((resolve) => {
          timer = setTimeout(() => resolve({ timeout: true }), timeoutMs);
        }),
      ]);
    } finally {
      settled = true;
      if (timer) clearTimeout(timer);
    }
  })();

  return {
    promise,
    cancel: () => {
      if (!settled && timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
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

function subscribeFailure(error: unknown): NonNullable<CallbackProofResult["failure"]> {
  if (error instanceof LarkCliSubscribeError) {
    return {
      message: error.message,
      exitCode: error.details.exitCode,
      stderr: error.details.stderr,
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
  };
}

function buildNextActions(input: {
  readonly status: CallbackProofResult["status"];
  readonly probe: CallbackProofProbeResult;
  readonly failure?: CallbackProofResult["failure"];
  readonly strict: boolean;
}): readonly CallbackProofAction[] {
  if (input.status === "observed") return [];
  if (input.status === "subscribe_failed") {
    return [
      {
        reason: "The callback listener did not stay up.",
        action: "Run lark-cli event +subscribe --as bot --event-types card.action.trigger --dry-run, then fix the CLI profile, event permission, or Open Platform event subscription error shown in the proof log.",
      },
    ];
  }
  if (input.status === "probe_failed") {
    return [
      {
        reason: "The probe card could not be sent to Feishu.",
        action: "Check the target chat id, profile, message permission, bot installation state, and lark-cli im +messages-send error before retrying callback proof.",
      },
    ];
  }
  if (input.probe.status === "sent") {
    return [
      {
        reason: "A probe card was sent, but no card.action.trigger event reached PilotFlow during the timeout window.",
        action: "Click the probe card button from Feishu, then inspect Open Platform event subscription, callback/long-connection mode, bot installation state, and app publication state before rerunning with --strict.",
      },
    ];
  }
  if (input.probe.status === "dry_run") {
    return [
      {
        reason: "The probe card was only dry-run, so no real callback can arrive.",
        action: "Rerun without --dry-run when you want a real card.action.trigger proof.",
      },
    ];
  }
  return [
    {
      reason: "No probe card was sent, so timeout only proves that no existing card callback arrived.",
      action: "Rerun with --send-probe-card --timeout 60s, click the button in Feishu, and use --strict when collecting pass/fail evidence.",
    },
  ];
}

function renderNextActions(actions: readonly CallbackProofAction[]): readonly string[] {
  if (actions.length === 0) return [];
  return [
    "next_actions:",
    ...actions.map((item, index) => `${index + 1}. ${item.action} (${item.reason})`),
  ];
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
