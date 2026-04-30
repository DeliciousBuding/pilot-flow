export interface FeishuTargets {
  readonly baseToken?: string;
  readonly baseTableId?: string;
  readonly chatId?: string;
  readonly tasklistId?: string;
  readonly ownerOpenId?: string;
}

export interface CardAction {
  readonly action: {
    readonly value: Record<string, unknown>;
    readonly tag: string;
  };
  readonly operator: {
    readonly open_id: string;
    readonly user_id?: string;
  };
  readonly context: {
    readonly open_chat_id?: string;
    readonly open_message_id?: string;
  };
}

export interface MessagePayload {
  readonly msg_type: "text" | "post" | "interactive";
  readonly content: string;
  readonly receive_id?: string;
  readonly uuid?: string;
}

export interface LarkCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly json?: Record<string, unknown>;
  readonly timedOut?: boolean;
  readonly truncated?: boolean;
}
