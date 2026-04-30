import { pathToFileURL } from "node:url";
import { JsonlRecorder } from "../../infrastructure/jsonl-recorder.js";
import { runCommand, type CommandResult } from "../../infrastructure/command-runner.js";
import { SessionManager } from "../../agent/session-manager.js";
import { ChatQueue } from "../../gateway/feishu/chat-queue.js";
import { EventDedupe } from "../../gateway/feishu/dedupe.js";
import type { BotIdentity, FeishuCardEvent, FeishuGatewayEvent, FeishuMessageEvent } from "../../gateway/feishu/event-source.js";
import type { EventSource } from "../../gateway/feishu/event-source.js";
import { handleCardEvent } from "../../gateway/feishu/card-handler.js";
import { LarkCliEventSource, LarkCliSubscribeError } from "../../gateway/feishu/lark-cli-source.js";
import { handleMessageEvent } from "../../gateway/feishu/message-handler.js";
import { stripSelfMention } from "../../gateway/feishu/mention-gate.js";
import { PendingRunStore, toPendingRunOptions, type PendingRunRecord, type PendingRunOptions } from "../../gateway/feishu/pending-run-store.js";
import { createProjectInitPlannerProvider } from "../../domain/plan.js";
import { loadCliEnv } from "../../config/local-env.js";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { DuplicateGuard } from "../../orchestrator/duplicate-guard.js";
import { Orchestrator, type RunOptions, type RunResult } from "../../orchestrator/orchestrator.js";
import { PRIMARY_CONFIRMATION_TEXT, isAcceptedConfirmationText } from "../../orchestrator/confirmation-text.js";
import { TextConfirmationGate } from "../../orchestrator/confirmation-gate.js";
import { parseArgs } from "../../shared/parse-args.js";
import { registerFeishuTools } from "../../tools/feishu/index.js";
import { buildToolIdempotencyKey } from "../../tools/idempotency.js";
import { ToolRegistry } from "../../tools/registry.js";
import type { Recorder } from "../../types/recorder.js";
import type { Session } from "../../types/session.js";
import type { AgentLoopResult } from "../../agent/loop.js";

const DEFAULT_OUTPUT = "tmp/runs/agent-gateway.jsonl";
const DEFAULT_PENDING_STORE = "tmp/state/pending-gateway-runs.json";
const DEFAULT_EVENT_TYPES = ["im.message.receive_v1", "card.action.trigger"] as const;

export interface AgentGatewayOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly source?: EventSource<FeishuGatewayEvent>;
  readonly registry?: ToolRegistry;
  readonly recorder?: Recorder;
  readonly runCommand?: typeof runCommand;
  readonly now?: () => number;
}

export interface AgentGatewayProbeResult {
  readonly status: "not_sent" | "sent" | "dry_run" | "failed";
  readonly mentionMode?: "structured_mention" | "custom_text";
  readonly runId?: string;
  readonly messageId?: string;
  readonly error?: string;
  readonly warning?: string;
}

export interface AgentGatewayAction {
  readonly reason: string;
  readonly action: string;
}

export interface AgentGatewayResult {
  readonly status: "completed" | "timeout" | "subscribe_failed";
  readonly processedMessages: number;
  readonly processedCards: number;
  readonly ignoredEvents: number;
  readonly unsupportedEvents: number;
  readonly pendingRuns: number;
  readonly output?: string;
  readonly probe: AgentGatewayProbeResult;
  readonly failure?: {
    readonly message: string;
    readonly exitCode?: number | null;
    readonly stderr?: string;
  };
  readonly nextActions: readonly AgentGatewayAction[];
}

export async function runAgentGateway(options: AgentGatewayOptions = {}): Promise<AgentGatewayResult> {
  const argv = options.argv ?? [];
  const env = deterministicGatewayEnv(loadCliEnv(options.env ?? process.env, options.cwd));
  const parsed = parseArgs(argv, {
    boolean: [
      "json",
      "help",
      "h",
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
      "send-probe-message",
    ],
    string: [
      "output",
      "pending-store",
      "profile",
      "chat-id",
      "base-token",
      "base-table-id",
      "tasklist-id",
      "owner-open-id",
      "owner-open-id-map-json",
      "storage-path",
      "bot-open-id",
      "bot-user-id",
      "bot-name",
      "max-events",
      "timeout",
      "probe-text",
      "probe-run-id",
      "probe-chat-id",
      "mode",
    ],
  });
  const runtime = loadRuntimeConfig(argv, env);
  const output = stringFlag(parsed.flags.output) ?? DEFAULT_OUTPUT;
  const recorderOwned = !options.recorder;
  const recorder = options.recorder ?? new JsonlRecorder(output);
  const registry = options.registry ?? new ToolRegistry();
  if (!options.registry) registerFeishuTools(registry);

  const orchestrator = new Orchestrator({
    planner: createProjectInitPlannerProvider(),
    registry,
    recorder,
    confirmationGate: new TextConfirmationGate(),
    duplicateGuard: new DuplicateGuard(runtime.duplicateGuard),
    runtime,
  });
  const store = new PendingRunStore({
    storagePath: stringFlag(parsed.flags["pending-store"]) ?? DEFAULT_PENDING_STORE,
    now: options.now,
  });
  const sessions = new SessionManager({ ttlMs: 60 * 60 * 1000, maxTurns: 20, maxSessions: 32 });
  const queue = new ChatQueue();
  const dedupe = new EventDedupe({ ttlMs: 60 * 60 * 1000, maxEntries: 1024 }, options.now);
  const bot = resolveBotIdentity(parsed.flags, env);
  const source = options.source ?? new LarkCliEventSource({ profile: runtime.profile, as: "bot", eventTypes: DEFAULT_EVENT_TYPES });
  const maxEvents = numberFlag(parsed.flags["max-events"]) ?? 0;
  const timeoutMs = durationMs(stringFlag(parsed.flags.timeout));
  const command = options.runCommand ?? runCommand;

  const counters: GatewayCounters = {
    processedMessages: 0,
    processedCards: 0,
    ignoredEvents: 0,
    unsupportedEvents: 0,
    seenEvents: 0,
    timedOut: false,
  };
  let failure: AgentGatewayResult["failure"] | undefined;
  let probe: AgentGatewayProbeResult = { status: "not_sent" };

  try {
    if (parsed.flags["send-probe-message"] === true) {
      const probeRunId = stringFlag(parsed.flags["probe-run-id"]) ?? buildProbeRunId(options.now);
      const eventScope = runtime.mode === "live"
        ? await checkProbeEventReceiveScope({ profile: runtime.profile, command })
        : { status: "ok" as const };
      if (eventScope.status === "failed") {
        probe = {
          status: "failed",
          runId: probeRunId,
          error: eventScope.error,
        };
        await recorder.record({
          type: "gateway.probe_message_failed",
          runId: probeRunId,
          error: eventScope.error,
        } as never);
      } else {
        const probeMessage = buildProbeMessage({
          bot,
          runId: probeRunId,
          customText: stringFlag(parsed.flags["probe-text"]),
        });
        if (probeMessage.status === "failed") {
          probe = {
            status: "failed",
            runId: probeRunId,
            error: probeMessage.error,
          };
          await recorder.record({
            type: "gateway.probe_message_failed",
            runId: probeRunId,
            error: probeMessage.error,
          } as never);
        } else {
          const iterator = source.events()[Symbol.asyncIterator]();
          const nextEvent = nextWithTimeout(iterator, timeoutMs);
          probe = await sendProbeMessage({
            chatId: stringFlag(parsed.flags["probe-chat-id"]) ?? runtime.feishuTargets.chatId,
            profile: runtime.profile,
            dryRun: runtime.mode === "dry-run",
            text: probeMessage.text,
            mentionMode: probeMessage.mentionMode,
            runId: probeRunId,
            command,
            recorder,
          });
          await processGatewayEvents({
            iterator,
            firstNextEvent: nextEvent,
            timeoutMs,
            maxEvents,
            bot,
            sessions,
            dedupe,
            queue,
            recorder,
            store,
            orchestrator,
            parsedFlags: parsed.flags,
            runtimeMode: runtime.mode,
            counters,
          });
        }
      }
    } else {
      const iterator = source.events()[Symbol.asyncIterator]();
      const nextEvent = nextWithTimeout(iterator, timeoutMs);
      await processGatewayEvents({
        iterator,
        firstNextEvent: nextEvent,
        timeoutMs,
        maxEvents,
        bot,
        sessions,
        dedupe,
        queue,
        recorder,
        store,
        orchestrator,
        parsedFlags: parsed.flags,
        runtimeMode: runtime.mode,
        counters,
      });
    }
  } catch (error) {
    failure = subscribeFailure(error);
    await recorder.record({
      type: "gateway.subscribe_failed",
      runId: "gateway",
      message: failure.message,
      exitCode: failure.exitCode,
      stderr: failure.stderr,
    } as never);
  } finally {
    if (recorderOwned) await recorder.close();
    await source.close();
  }

  const status: AgentGatewayResult["status"] = failure ? "subscribe_failed" : counters.timedOut ? "timeout" : "completed";
  const result: AgentGatewayResult = {
    status,
    processedMessages: counters.processedMessages,
    processedCards: counters.processedCards,
    ignoredEvents: counters.ignoredEvents,
    unsupportedEvents: counters.unsupportedEvents,
    pendingRuns: await store.count(),
    output: options.recorder ? undefined : output,
    probe,
    failure,
    nextActions: [],
  };
  return { ...result, nextActions: buildNextActions(result, runtime.profile) };
}

interface GatewayCounters {
  processedMessages: number;
  processedCards: number;
  ignoredEvents: number;
  unsupportedEvents: number;
  seenEvents: number;
  timedOut: boolean;
}

async function processGatewayEvents(config: {
  readonly iterator: AsyncIterator<FeishuGatewayEvent>;
  readonly firstNextEvent: Promise<IteratorResult<FeishuGatewayEvent> | { readonly timeout: true }>;
  readonly timeoutMs: number;
  readonly maxEvents: number;
  readonly bot: BotIdentity;
  readonly sessions: SessionManager;
  readonly dedupe: EventDedupe;
  readonly queue: ChatQueue;
  readonly recorder: Recorder;
  readonly store: PendingRunStore;
  readonly orchestrator: Orchestrator;
  readonly parsedFlags: Record<string, string | boolean>;
  readonly runtimeMode: "dry-run" | "live";
  readonly counters: GatewayCounters;
}): Promise<void> {
  let nextEvent = config.firstNextEvent;
  while (true) {
    const next = await nextEvent;
    if (isTimeoutResult(next)) {
      config.counters.timedOut = true;
      await config.recorder.record({
        type: "gateway.timeout",
        runId: "gateway",
        timeoutMs: config.timeoutMs,
        processedMessages: config.counters.processedMessages,
        processedCards: config.counters.processedCards,
        ignoredEvents: config.counters.ignoredEvents,
        unsupportedEvents: config.counters.unsupportedEvents,
      } as never);
      break;
    }
    if (next.done) break;
    const event = next.value;
    nextEvent = nextWithTimeout(config.iterator, config.timeoutMs);
    config.counters.seenEvents += 1;
    await config.recorder.record({
      type: "gateway.event_received",
      gateway_kind: event.kind,
      gateway_event_id: event.id,
    } as never);

    if (event.kind === "message") {
      const resumed = await resumePendingRunFromTextConfirmation(event, {
        bot: config.bot,
        dedupe: config.dedupe,
        queue: config.queue,
        recorder: config.recorder,
        store: config.store,
        run: async (pending) => config.orchestrator.run(pending.inputText, buildApprovedRunOptions(pending.options)),
      });
      if (resumed.status === "processed") {
        config.counters.processedMessages += 1;
      } else if (resumed.status === "ignored_confirmation") {
        config.counters.ignoredEvents += 1;
      } else {
        const result = await handleMessageEvent(event, {
          bot: config.bot,
          sessions: config.sessions,
          dedupe: config.dedupe,
          queue: config.queue,
          runAgent: async (text: string, session: Session): Promise<AgentLoopResult> => {
            const runResult = await config.orchestrator.run(text, buildMessageRunOptions(config.parsedFlags, config.runtimeMode, text));
            if (runResult.status === "waiting_confirmation" && runResult.plan) {
              await config.store.save({
                runId: runResult.runId,
                chatId: event.chatId,
                inputText: text,
                options: toPendingRunOptions(buildContinuationOptions(config.parsedFlags, text)),
                createdAt: new Date().toISOString(),
              });
            }
            return toGatewayResponse(runResult, session.chatId);
          },
        });
        if (result.status === "processed") config.counters.processedMessages += 1;
        else config.counters.ignoredEvents += 1;
      }
    } else if (event.kind === "card") {
      const continuation = await handleCardEvent(event, {
        dedupe: config.dedupe,
        queue: config.queue,
        onAction: async (action) => {
          const pending = await config.store.get(action.runId);
          if (!pending) {
            await config.recorder.record({
              type: "gateway.card_missing_pending_run",
              runId: action.runId,
              card: action.card,
              action: action.action,
            } as never);
            return;
          }
          const result = await config.orchestrator.run(pending.inputText, buildApprovedRunOptions(pending.options));
          await config.store.delete(action.runId);
          await config.recorder.record({
            type: "gateway.card_continuation_completed",
            originalRunId: action.runId,
            continuedRunId: result.runId,
            status: result.status,
          } as never);
        },
      });
      if (continuation.status === "processed") config.counters.processedCards += 1;
      else config.counters.ignoredEvents += 1;
    } else {
      config.counters.unsupportedEvents += 1;
    }

    if (config.maxEvents > 0 && config.counters.seenEvents >= config.maxEvents) break;
  }
}

interface TextConfirmationConfig {
  readonly bot: BotIdentity;
  readonly dedupe: EventDedupe;
  readonly queue: ChatQueue;
  readonly recorder: Recorder;
  readonly store: PendingRunStore;
  readonly run: (pending: PendingRunRecord) => Promise<RunResult>;
}

type TextConfirmationResult =
  | { readonly status: "processed" }
  | { readonly status: "ignored_confirmation"; readonly reason: string }
  | { readonly status: "not_confirmation" };

async function resumePendingRunFromTextConfirmation(
  event: FeishuMessageEvent,
  config: TextConfirmationConfig,
): Promise<TextConfirmationResult> {
  const text = stripSelfMention(event.text, config.bot.name);
  if (!isAcceptedConfirmationText(text)) return { status: "not_confirmation" };
  if (config.dedupe.seen(event.id)) return { status: "ignored_confirmation", reason: "duplicate_event" };

  return config.queue.enqueue(event.chatId, async () => {
    const pending = await config.store.findLatestByChatId(event.chatId);
    if (!pending) {
      await config.recorder.record({
        type: "gateway.text_confirmation_missing_pending_run",
        runId: "pending-run-missing",
        chatId: event.chatId,
        gateway_event_id: event.id,
        confirmation_text: text,
      });
      return { status: "ignored_confirmation", reason: "missing_pending_run" } as const;
    }

    const result = await config.run(pending);
    await config.store.delete(pending.runId);
    await config.recorder.record({
      type: "gateway.text_continuation_completed",
      runId: result.runId,
      originalRunId: pending.runId,
      continuedRunId: result.runId,
      chatId: event.chatId,
      confirmation_text: text,
      status: result.status,
    });
    return { status: "processed" } as const;
  });
}

export function renderAgentGateway(result: AgentGatewayResult): string {
  return [
    "PilotFlow TS Gateway",
    "",
    `status: ${result.status}`,
    `processed_messages: ${result.processedMessages}`,
    `processed_cards: ${result.processedCards}`,
    `ignored_events: ${result.ignoredEvents}`,
    `unsupported_events: ${result.unsupportedEvents}`,
    `pending_runs: ${result.pendingRuns}`,
    `probe_status: ${result.probe.status}`,
    result.probe.mentionMode ? `probe_mention_mode: ${result.probe.mentionMode}` : undefined,
    result.probe.runId ? `probe_run_id: ${result.probe.runId}` : undefined,
    result.probe.messageId ? `probe_message_id: ${result.probe.messageId}` : undefined,
    result.probe.error ? `probe_error: ${result.probe.error}` : undefined,
    result.failure ? `failure: ${result.failure.message}` : undefined,
    ...renderNextActions(result.nextActions),
    result.output ? `output: ${result.output}` : undefined,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function buildAgentGatewayUsage(): string {
  return `Usage:
  npm run pilot:gateway
  npm run pilot:gateway -- --dry-run --max-events 1
  npm run pilot:gateway -- --live --chat-id <chat> --base-token <base> --base-table-id <table>

Options:
  --dry-run                         Process events without live Feishu writes.
  --live                            Enable live Feishu mode.
  --max-events <n>                  Stop after handling n gateway events.
  --timeout <duration>              Stop after duration, for example 60s or 2m.
  --output <path>                   JSONL gateway run log path.
  --pending-store <path>            Local store for waiting confirmation runs.
  --send-probe-message              Send a real IM probe message after the listener starts; default text requires a real bot user_id.
  --probe-text <text>               Probe message body; defaults to a safe smoke request.
  --probe-run-id <id>               Stable id used in the probe message and idempotency key.
  --probe-chat-id <chat>            Probe chat; defaults to --chat-id or PILOTFLOW_TEST_CHAT_ID.
  --send-plan-card                  Send or dry-run an execution-plan card.
  --send-entry-message              Send or dry-run the project entry message after approval.
  --pin-entry-message               Pin or dry-run the project entry message after approval.
  --update-announcement             Try native announcement update after approval.
  --send-risk-card                  Send or dry-run the risk decision card after approval.
  --auto-lookup-owner-contact       Search Feishu Contacts for owner labels.
  --owner-open-id-map-json <json>   Map owner labels to Feishu open_id values.
  --bot-open-id <id>                Override bot open_id for mention filtering.
  --bot-user-id <id>                Override bot user_id for mention filtering.
  --bot-name <name>                 Override bot display name for mention filtering.
  --json                            Print JSON result.
  --help                            Show this help.
`;
}

async function checkProbeEventReceiveScope(options: {
  readonly profile?: string;
  readonly command: typeof runCommand;
}): Promise<{ readonly status: "ok" } | { readonly status: "failed"; readonly error: string }> {
  try {
    await options.command("lark-cli", ["auth", "check", "--scope", "im:message.p2p_msg:readonly"], {
      profile: options.profile,
      timeoutMs: 15_000,
    });
    return { status: "ok" };
  } catch {
    return {
      status: "failed",
      error: "Missing im:message.p2p_msg:readonly; refusing to send gateway IM probe because im.message.receive_v1 cannot be delivered until the app scope and user authorization are updated.",
    };
  }
}

async function sendProbeMessage(options: {
  readonly chatId?: string;
  readonly profile?: string;
  readonly dryRun: boolean;
  readonly text: string;
  readonly mentionMode: "structured_mention" | "custom_text";
  readonly runId: string;
  readonly command: typeof runCommand;
  readonly recorder: Recorder;
}): Promise<AgentGatewayProbeResult> {
  if (!options.chatId) {
    const error = "--send-probe-message requires --probe-chat-id, --chat-id, or PILOTFLOW_TEST_CHAT_ID";
    await options.recorder.record({ type: "gateway.probe_message_failed", runId: options.runId, error } as never);
    return { status: "failed", runId: options.runId, error };
  }

  try {
    const result = await options.command("lark-cli", [
      "im", "+messages-send",
      "--as", "user",
      "--chat-id", options.chatId,
      "--msg-type", "text",
      "--content", JSON.stringify({ text: options.text }),
      "--idempotency-key", buildToolIdempotencyKey({ runId: options.runId, tool: "gateway.probe", sequence: 1 }),
    ], { dryRun: options.dryRun, profile: options.profile, timeoutMs: 30_000 });
    const messageId = extractMessageId(result);
    await options.recorder.record({
      type: "gateway.probe_message_sent",
      runId: options.runId,
      dry_run: options.dryRun,
      mention_mode: options.mentionMode,
      message_id: messageId,
    } as never);
    return {
      status: options.dryRun ? "dry_run" : "sent",
      mentionMode: options.mentionMode,
      runId: options.runId,
      messageId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await options.recorder.record({ type: "gateway.probe_message_failed", runId: options.runId, error: message } as never);
    return { status: "failed", runId: options.runId, error: message };
  }
}

function buildProbeMessage(options: {
  readonly bot: BotIdentity;
  readonly runId: string;
  readonly customText?: string;
}): { readonly status: "ok"; readonly text: string; readonly mentionMode: "structured_mention" | "custom_text" } | { readonly status: "failed"; readonly error: string } {
  if (options.customText) {
    return { status: "ok", text: options.customText, mentionMode: "custom_text" };
  }
  if (isPlaceholderBotUserId(options.bot.userId)) {
    return {
      status: "failed",
      error: "Default gateway probe requires --bot-user-id or PILOTFLOW_BOT_USER_ID so Feishu receives a structured bot mention; pass --probe-text to override.",
    };
  }
  const mention = `<at user_id="${options.bot.userId}">${options.bot.name}</at>`;
  return {
    status: "ok",
    text: `${mention} 目标: PilotFlow gateway IM probe ${options.runId} 成员: 产品, 技术 交付物: 网关探针 截止时间: 2026-05-01 风险: 仅验证事件触发`,
    mentionMode: "structured_mention",
  };
}

function buildProbeRunId(now?: () => number): string {
  return `gateway-probe-${new Date(now ? now() : Date.now()).toISOString().replace(/[^0-9A-Za-z]/g, "").slice(0, 20)}`;
}

function isPlaceholderBotUserId(userId: string): boolean {
  return userId === "u_pilotflow_bot" || userId.length === 0;
}

function extractMessageId(result: CommandResult): string | undefined {
  return getString(result.json ?? {}, ["data", "message", "message_id"]) ||
    getString(result.json ?? {}, ["data", "message_id"]) ||
    getString(result.json ?? {}, ["message_id"]) ||
    undefined;
}

function getString(value: Record<string, unknown>, path: readonly string[]): string {
  const found = path.reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, value);
  return typeof found === "string" ? found : "";
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv, { boolean: ["json", "help", "h"] });
  if (parsed.flags.help === true || parsed.flags.h === true) {
    console.log(buildAgentGatewayUsage());
    return;
  }

  const result = await runAgentGateway({ argv, cwd: process.cwd() });
  if (parsed.flags.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderAgentGateway(result));
  }
  process.exitCode = result.status === "subscribe_failed" ? 2 : 0;
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

function isTimeoutResult<T>(value: IteratorResult<T> | { readonly timeout: true }): value is { readonly timeout: true } {
  return "timeout" in value;
}

function subscribeFailure(error: unknown): NonNullable<AgentGatewayResult["failure"]> {
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

function buildNextActions(result: AgentGatewayResult, profile: string): readonly AgentGatewayAction[] {
  if (result.status === "subscribe_failed") {
    return [
      {
        reason: "The gateway event subscription did not stay up.",
        action: "Run lark-cli event +subscribe --as bot --event-types im.message.receive_v1,card.action.trigger --dry-run, then fix the CLI profile, event permissions, or Open Platform subscription error shown in the gateway log.",
      },
    ];
  }

  if (result.probe.status === "failed") {
    const error = result.probe.error ?? "";
    if (/im:message\.p2p_msg:readonly/u.test(error)) {
      return [
        {
          reason: "IM event delivery is blocked before the gateway can receive probe messages.",
          action: `Enable im:message.p2p_msg:readonly in Feishu Open Platform, publish or make it effective, then run lark-cli auth login --profile ${profile} --scope "im:message.p2p_msg:readonly" and rerun pilot:live-check.`,
        },
      ];
    }
    if (/PILOTFLOW_BOT_USER_ID|bot-user-id/u.test(error)) {
      return [
        {
          reason: "The default gateway probe needs a structured bot mention.",
          action: "Set PILOTFLOW_BOT_USER_ID locally or pass --bot-user-id before running pilot:gateway -- --live --send-probe-message.",
        },
      ];
    }
    if (/probe-chat-id|chat-id|PILOTFLOW_TEST_CHAT_ID/u.test(error)) {
      return [
        {
          reason: "The gateway probe has no target chat.",
          action: "Set PILOTFLOW_TEST_CHAT_ID or pass --probe-chat-id before sending a gateway probe.",
        },
      ];
    }
    return [
      {
        reason: "The gateway probe message could not be sent.",
        action: "Check the target chat id, profile, message permission, bot installation state, and lark-cli im +messages-send error before retrying.",
      },
    ];
  }

  if (result.status === "timeout" && result.probe.status === "sent") {
    return [
      {
        reason: "A probe message was sent, but no im.message.receive_v1 event reached PilotFlow during the timeout window.",
        action: "Inspect Open Platform event subscription, long-connection mode, bot availability in the chat, app publication state, and rerun pilot:live-check before retrying pilot:gateway.",
      },
    ];
  }

  if (result.status === "timeout" && result.probe.status === "dry_run") {
    return [
      {
        reason: "The probe was dry-run, so no real Feishu event can arrive.",
        action: "Rerun with --live after pilot:live-check passes when collecting real gateway evidence.",
      },
    ];
  }

  if (result.status === "timeout" && result.probe.status === "not_sent") {
    return [
      {
        reason: "No probe message was sent, so timeout only proves that no existing gateway event arrived.",
        action: "Rerun with --send-probe-message --timeout 60s --max-events 1 after pilot:live-check passes.",
      },
    ];
  }

  return [];
}

function renderNextActions(actions: readonly AgentGatewayAction[]): readonly string[] {
  if (actions.length === 0) return [];
  return [
    "next_actions:",
    ...actions.map((item, index) => `${index + 1}. ${item.action} (${item.reason})`),
  ];
}

function buildMessageRunOptions(flags: Record<string, string | boolean>, mode: "dry-run" | "live", text: string): RunOptions {
  if (mode === "live") {
    return {
      ...buildContinuationOptions(flags, text),
      autoConfirm: false,
      confirmationText: "",
      sendPlanCard: boolWithDefault(flags["send-plan-card"], true),
      sourceMessage: text,
    };
  }
  return {
    ...buildContinuationOptions(flags, text),
    autoConfirm: true,
    confirmationText: PRIMARY_CONFIRMATION_TEXT,
    sendPlanCard: boolWithDefault(flags["send-plan-card"], true),
    sourceMessage: text,
  };
}

function buildContinuationOptions(flags: Record<string, string | boolean>, text: string): RunOptions {
  return {
    sendEntryMessage: boolWithDefault(flags["send-entry-message"], true),
    pinEntryMessage: boolWithDefault(flags["pin-entry-message"], true),
    updateAnnouncement: boolWithDefault(flags["update-announcement"], false),
    sendRiskCard: boolWithDefault(flags["send-risk-card"], true),
    autoLookupOwnerContact: flags["auto-lookup-owner-contact"] === true,
    ownerOpenIdMap: ownerMap(flags["owner-open-id-map-json"]),
    taskAssigneeOpenId: stringFlag(flags["owner-open-id"]),
    sourceMessage: text,
  };
}

function buildApprovedRunOptions(options: PendingRunOptions): RunOptions {
  return {
    autoConfirm: true,
    confirmationText: PRIMARY_CONFIRMATION_TEXT,
    sendPlanCard: false,
    sendEntryMessage: options.sendEntryMessage,
    pinEntryMessage: options.pinEntryMessage,
    updateAnnouncement: options.updateAnnouncement,
    sendRiskCard: options.sendRiskCard,
    autoLookupOwnerContact: options.autoLookupOwnerContact,
    ownerOpenIdMap: options.ownerOpenIdMap,
    taskAssigneeOpenId: options.taskAssigneeOpenId,
    sourceMessage: options.sourceMessage,
  };
}

function toGatewayResponse(result: RunResult, chatId: string): AgentLoopResult {
  const summary = [
    `PilotFlow handled chat ${chatId}.`,
    `run=${result.runId}`,
    `status=${result.status}`,
    `artifacts=${result.artifacts.length}`,
  ].join(" ");
  return {
    finalResponse: summary,
    messages: [],
    iterations: 1,
    toolCallsMade: 0,
  };
}

function resolveBotIdentity(flags: Record<string, string | boolean>, env: NodeJS.ProcessEnv): BotIdentity {
  return {
    openId: stringFlag(flags["bot-open-id"]) ?? env.PILOTFLOW_BOT_OPEN_ID ?? "ou_pilotflow_bot",
    userId: stringFlag(flags["bot-user-id"]) ?? env.PILOTFLOW_BOT_USER_ID ?? "u_pilotflow_bot",
    name: stringFlag(flags["bot-name"]) ?? env.PILOTFLOW_BOT_NAME ?? "PilotFlow",
  };
}

function stringFlag(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberFlag(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function boolWithDefault(value: unknown, fallback: boolean): boolean {
  return value === true ? true : fallback;
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

function deterministicGatewayEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
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
