import { pathToFileURL } from "node:url";
import { JsonlRecorder } from "../../infrastructure/jsonl-recorder.js";
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
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { DuplicateGuard } from "../../orchestrator/duplicate-guard.js";
import { Orchestrator, type RunOptions, type RunResult } from "../../orchestrator/orchestrator.js";
import { PRIMARY_CONFIRMATION_TEXT, isAcceptedConfirmationText } from "../../orchestrator/confirmation-text.js";
import { TextConfirmationGate } from "../../orchestrator/confirmation-gate.js";
import { parseArgs } from "../../shared/parse-args.js";
import { registerFeishuTools } from "../../tools/feishu/index.js";
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
  readonly source?: EventSource<FeishuGatewayEvent>;
  readonly registry?: ToolRegistry;
  readonly recorder?: Recorder;
  readonly now?: () => number;
}

export interface AgentGatewayResult {
  readonly status: "completed" | "timeout" | "subscribe_failed";
  readonly processedMessages: number;
  readonly processedCards: number;
  readonly ignoredEvents: number;
  readonly unsupportedEvents: number;
  readonly pendingRuns: number;
  readonly output?: string;
  readonly failure?: {
    readonly message: string;
    readonly exitCode?: number | null;
    readonly stderr?: string;
  };
}

export async function runAgentGateway(options: AgentGatewayOptions = {}): Promise<AgentGatewayResult> {
  const argv = options.argv ?? [];
  const env = deterministicGatewayEnv(options.env ?? process.env);
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

  let processedMessages = 0;
  let processedCards = 0;
  let ignoredEvents = 0;
  let unsupportedEvents = 0;
  let seenEvents = 0;
  let timedOut = false;
  let failure: AgentGatewayResult["failure"] | undefined;

  try {
    const iterator = source.events()[Symbol.asyncIterator]();
    while (true) {
      const next = await nextWithTimeout(iterator, timeoutMs);
      if (isTimeoutResult(next)) {
        timedOut = true;
        await recorder.record({
          type: "gateway.timeout",
          runId: "gateway",
          timeoutMs,
          processedMessages,
          processedCards,
          ignoredEvents,
          unsupportedEvents,
        } as never);
        break;
      }
      if (next.done) break;
      const event = next.value;
      seenEvents += 1;
      await recorder.record({
        type: "gateway.event_received",
        gateway_kind: event.kind,
        gateway_event_id: event.id,
      } as never);

      if (event.kind === "message") {
        const resumed = await resumePendingRunFromTextConfirmation(event, {
          bot,
          dedupe,
          queue,
          recorder,
          store,
          run: async (pending) => orchestrator.run(pending.inputText, buildApprovedRunOptions(pending.options)),
        });
        if (resumed.status === "processed") {
          processedMessages += 1;
        } else if (resumed.status === "ignored_confirmation") {
          ignoredEvents += 1;
        } else {
        const result = await handleMessageEvent(event, {
          bot,
          sessions,
          dedupe,
          queue,
          runAgent: async (text: string, session: Session): Promise<AgentLoopResult> => {
            const runResult = await orchestrator.run(text, buildMessageRunOptions(parsed.flags, runtime.mode, text));
            if (runResult.status === "waiting_confirmation" && runResult.plan) {
              await store.save({
                runId: runResult.runId,
                chatId: event.chatId,
                inputText: text,
                options: toPendingRunOptions(buildContinuationOptions(parsed.flags, text)),
                createdAt: new Date().toISOString(),
              });
            }
            return toGatewayResponse(runResult, session.chatId);
          },
        });
        if (result.status === "processed") processedMessages += 1;
        else ignoredEvents += 1;
        }
      } else if (event.kind === "card") {
        const continuation = await handleCardEvent(event, {
          dedupe,
          queue,
          onAction: async (action) => {
            const pending = await store.get(action.runId);
            if (!pending) {
              await recorder.record({
                type: "gateway.card_missing_pending_run",
                runId: action.runId,
                card: action.card,
                action: action.action,
              } as never);
              return;
            }
            const result = await orchestrator.run(pending.inputText, buildApprovedRunOptions(pending.options));
            await store.delete(action.runId);
            await recorder.record({
              type: "gateway.card_continuation_completed",
              originalRunId: action.runId,
              continuedRunId: result.runId,
              status: result.status,
            } as never);
          },
        });
        if (continuation.status === "processed") processedCards += 1;
        else ignoredEvents += 1;
      } else {
        unsupportedEvents += 1;
      }

      if (maxEvents > 0 && seenEvents >= maxEvents) break;
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

  return {
    status: failure ? "subscribe_failed" : timedOut ? "timeout" : "completed",
    processedMessages,
    processedCards,
    ignoredEvents,
    unsupportedEvents,
    pendingRuns: await store.count(),
    output: options.recorder ? undefined : output,
    failure,
  };
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
    result.failure ? `failure: ${result.failure.message}` : undefined,
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

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv, { boolean: ["json", "help", "h"] });
  if (parsed.flags.help === true || parsed.flags.h === true) {
    console.log(buildAgentGatewayUsage());
    return;
  }

  const result = await runAgentGateway({ argv });
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
