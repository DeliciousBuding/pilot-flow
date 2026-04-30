import type { AgentLoopResult } from "../../agent/loop.js";
import type { SessionManager } from "../../agent/session-manager.js";
import type { Session } from "../../types/session.js";
import type { BotIdentity, FeishuMessageEvent } from "./event-source.js";
import type { ChatQueue } from "./chat-queue.js";
import type { EventDedupe } from "./dedupe.js";
import { shouldAcceptMessage, stripSelfMention } from "./mention-gate.js";

export interface MessageHandlerConfig {
  readonly bot: BotIdentity;
  readonly sessions: SessionManager;
  readonly dedupe: EventDedupe;
  readonly queue: ChatQueue;
  readonly runAgent: (text: string, session: Session, event: FeishuMessageEvent) => Promise<AgentLoopResult>;
}

export type HandlerResult =
  | { readonly status: "processed"; readonly response?: string }
  | { readonly status: "ignored"; readonly reason: string };

export async function handleMessageEvent(event: FeishuMessageEvent, config: MessageHandlerConfig): Promise<HandlerResult> {
  if (config.dedupe.seen(event.id)) return { status: "ignored", reason: "duplicate_event" };
  if (!shouldAcceptMessage(event, config.bot)) return { status: "ignored", reason: "not_mentioned" };

  return config.queue.enqueue(event.chatId, async () => {
    const text = stripSelfMention(event.text, config.bot.name);
    const session = config.sessions.addMessage(event.chatId, { role: "user", content: text });
    const result = await config.runAgent(text, session, event);
    config.sessions.addMessage(event.chatId, { role: "assistant", content: result.finalResponse });
    return { status: "processed", response: result.finalResponse };
  });
}
