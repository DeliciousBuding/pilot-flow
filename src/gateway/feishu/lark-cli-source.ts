import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolveExecutable } from "../../shared/path-utils.js";
import type { FeishuGatewayEvent } from "./event-source.js";

export interface SubscribeArgsOptions {
  readonly profile?: string;
  readonly eventTypes?: readonly string[];
  readonly as?: "bot" | "user";
}

export function buildSubscribeArgs(options: SubscribeArgsOptions = {}): readonly string[] {
  const args: string[] = [];
  if (options.profile) args.push("--profile", options.profile);
  args.push("event", "+subscribe", "--api-version", "v2");
  if (options.as) args.push("--as", options.as);
  if (options.eventTypes?.length) args.push("--event-types", options.eventTypes.join(","));
  return args;
}

export function parseLarkCliEventLine(line: string): FeishuGatewayEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const eventType = getString(raw, ["header", "event_type"]) || getString(raw, ["type"]);
  const eventId = getString(raw, ["header", "event_id"]) || getString(raw, ["event", "event_id"]) || getString(raw, ["event_id"]);
  if (eventType === "im.message.receive_v1") {
    const messageId = getString(raw, ["event", "message", "message_id"]) || eventId;
    const content = parseContent(getString(raw, ["event", "message", "content"]));
    return {
      kind: "message",
      id: messageId,
      chatId: getString(raw, ["event", "message", "chat_id"]),
      chatType: getString(raw, ["event", "message", "chat_type"]),
      text: content.text,
      mentions: getArray(raw, ["event", "message", "mentions"]),
      senderOpenId: getString(raw, ["event", "sender", "sender_id", "open_id"]),
      raw,
    };
  }
  if (eventType === "card.action.trigger") {
    return { kind: "card", id: eventId, raw };
  }
  return { kind: "unsupported", id: eventId, eventType, raw };
}

export class LarkCliEventSource {
  private child?: ChildProcessWithoutNullStreams;

  constructor(private readonly options: SubscribeArgsOptions = {}) {}

  async *events(): AsyncIterable<FeishuGatewayEvent> {
    const resolved = resolveExecutable("lark-cli");
    this.child = spawn(resolved.bin, [...resolved.argsPrefix, ...buildSubscribeArgs({ as: "bot", ...this.options })], {
      shell: false,
      windowsHide: true,
    });
    let buffer = "";
    for await (const chunk of this.child.stdout) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseLarkCliEventLine(line);
        if (event) yield event;
      }
    }
    if (buffer.trim()) {
      const event = parseLarkCliEventLine(buffer);
      if (event) yield event;
    }
  }

  close(): void {
    this.child?.kill();
  }
}

function parseContent(content: string): { text: string } {
  if (!content) return { text: "" };
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const text = (parsed as Record<string, unknown>).text;
      return { text: typeof text === "string" ? text : content };
    }
  } catch {
    return { text: content };
  }
  return { text: content };
}

function getString(value: Record<string, unknown>, path: readonly string[]): string {
  const found = path.reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, value);
  return typeof found === "string" ? found : "";
}

function getArray(value: Record<string, unknown>, path: readonly string[]): [] {
  const found = path.reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, value);
  return Array.isArray(found) ? found as [] : [];
}
