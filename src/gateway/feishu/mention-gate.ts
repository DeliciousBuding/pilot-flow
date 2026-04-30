import type { BotIdentity, FeishuMention } from "./event-source.js";

export interface MentionGateMessage {
  readonly chatType?: string;
  readonly mentions?: readonly FeishuMention[];
  readonly text?: string;
}

export function shouldAcceptMessage(message: MentionGateMessage, bot: BotIdentity): boolean {
  if (message.chatType === "p2p") return true;
  return (message.mentions ?? []).some((mention) =>
    mention.id?.open_id === bot.openId ||
    mention.id?.user_id === bot.userId ||
    mention.name === bot.name ||
    mention.key === "@_all"
  );
}

export function stripSelfMention(text: string, botName: string): string {
  const escaped = escapeRegExp(botName);
  return text
    .replace(new RegExp(`^@${escaped}\\s*`), "")
    .replace(new RegExp(`\\s*@${escaped}$`), "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
