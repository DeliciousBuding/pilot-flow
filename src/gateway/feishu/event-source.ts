export type FeishuGatewayEvent = FeishuMessageEvent | FeishuCardEvent | FeishuUnsupportedEvent;

export interface FeishuMessageEvent {
  readonly kind: "message";
  readonly id: string;
  readonly chatId: string;
  readonly chatType?: string;
  readonly text: string;
  readonly mentions?: readonly FeishuMention[];
  readonly senderOpenId?: string;
  readonly raw: Record<string, unknown>;
}

export interface FeishuCardEvent {
  readonly kind: "card";
  readonly id: string;
  readonly raw: Record<string, unknown>;
}

export interface FeishuUnsupportedEvent {
  readonly kind: "unsupported";
  readonly id: string;
  readonly eventType?: string;
  readonly raw: Record<string, unknown>;
}

export interface FeishuMention {
  readonly id?: {
    readonly open_id?: string;
    readonly user_id?: string;
  };
  readonly name?: string;
  readonly key?: string;
}

export interface BotIdentity {
  readonly openId: string;
  readonly userId: string;
  readonly name: string;
}

export interface EventSource<TEvent> {
  events(): AsyncIterable<TEvent>;
  close(): Promise<void> | void;
}
