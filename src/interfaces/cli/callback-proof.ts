import { pathToFileURL } from "node:url";
import { JsonlRecorder } from "../../infrastructure/jsonl-recorder.js";
import { handleCardEvent } from "../../gateway/feishu/card-handler.js";
import { EventDedupe } from "../../gateway/feishu/dedupe.js";
import { LarkCliEventSource } from "../../gateway/feishu/lark-cli-source.js";
import type { EventSource, FeishuGatewayEvent } from "../../gateway/feishu/event-source.js";
import { parseArgs } from "../../shared/parse-args.js";

const DEFAULT_OUTPUT = "tmp/proof/callback-proof.jsonl";

export interface CallbackProofOptions {
  readonly argv?: readonly string[];
  readonly source?: EventSource<FeishuGatewayEvent>;
  readonly now?: () => string;
}

export interface CallbackProofResult {
  readonly status: "observed" | "timeout_no_callback";
  readonly observedCallbacks: number;
  readonly ignoredEvents: number;
  readonly unsupportedEvents: number;
  readonly output: string;
  readonly exitCode: number;
}

export async function runCallbackProof(options: CallbackProofOptions = {}): Promise<CallbackProofResult> {
  const argv = options.argv ?? [];
  const parsed = parseArgs(argv, {
    boolean: ["json", "help", "h", "strict", "include-raw"],
    string: ["output", "profile", "timeout", "max-events"],
  });
  const output = stringFlag(parsed.flags.output) ?? DEFAULT_OUTPUT;
  const strict = parsed.flags.strict === true;
  const includeRaw = parsed.flags["include-raw"] === true;
  if (includeRaw && !isTmpPath(output)) throw new Error("--include-raw is only allowed for ignored tmp/ outputs");

  const recorder = new JsonlRecorder(output);
  const source = options.source ?? new LarkCliEventSource({ profile: stringFlag(parsed.flags.profile), as: "bot", eventTypes: ["card.action.trigger"] });
  const dedupe = new EventDedupe({ ttlMs: 60 * 60 * 1000, maxEntries: 1024 });
  const timeoutMs = durationMs(stringFlag(parsed.flags.timeout));
  const maxEvents = numberFlag(parsed.flags["max-events"]) ?? 0;
  const now = options.now ?? (() => new Date().toISOString());

  let observedCallbacks = 0;
  let ignoredEvents = 0;
  let unsupportedEvents = 0;
  let seenEvents = 0;
  let timedOut = false;

  await recorder.record({ type: "callback_proof.started", runId: "callback-proof", output, strict, includeRaw, timestamp: now() });

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
    exitCode: status === "timeout_no_callback" && strict ? 1 : 0,
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
    `output: ${result.output}`,
  ].join("\n");
}

export function buildCallbackProofUsage(): string {
  return `Usage:
  npm run pilot:callback-proof -- --timeout 60s
  npm run pilot:callback-proof -- --timeout 60s --strict

Options:
  --profile <profile>   lark-cli profile.
  --timeout <duration>  Stop after duration, for example 60s or 2m.
  --max-events <n>      Stop after n events.
  --output <path>       JSONL proof output path.
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
