import { extractCardAction, type ExtractedCardAction } from "../../orchestrator/card-callback.js";
import type { FeishuCardEvent } from "./event-source.js";
import type { EventDedupe } from "./dedupe.js";
import type { ChatQueue } from "./chat-queue.js";

export interface CardHandlerConfig {
  readonly dedupe: EventDedupe;
  readonly queue?: ChatQueue;
  readonly onAction?: (action: ExtractedCardAction, event: FeishuCardEvent) => Promise<void>;
}

export type CardHandlerResult =
  | { readonly status: "processed"; readonly action: ExtractedCardAction }
  | { readonly status: "ignored"; readonly reason: string };

export async function handleCardEvent(event: FeishuCardEvent, config: CardHandlerConfig): Promise<CardHandlerResult> {
  const action = extractCardAction(event.raw);
  const dedupeKey = action ? `card:${action.card}:${action.runId}:${action.action}` : `card:${event.id}:unsupported`;
  if (config.dedupe.seen(dedupeKey)) return { status: "ignored", reason: "duplicate_event" };
  if (!action) return { status: "ignored", reason: "unsupported_action" };
  const process = async (): Promise<CardHandlerResult> => {
    await config.onAction?.(action, event);
    return { status: "processed", action };
  };
  return config.queue ? config.queue.enqueue(cardQueueKey(event, action), process) : process();
}

function cardQueueKey(event: FeishuCardEvent, action: ExtractedCardAction): string {
  return getString(event.raw, ["event", "context", "open_chat_id"]) ||
    getString(event.raw, ["event", "context", "chat_id"]) ||
    getString(event.raw, ["event", "context", "open_message_id"]) ||
    action.runId ||
    event.id;
}

function getString(value: Record<string, unknown>, path: readonly string[]): string {
  const found = path.reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, value);
  return typeof found === "string" ? found : "";
}
