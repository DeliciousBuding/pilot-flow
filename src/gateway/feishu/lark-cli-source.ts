import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { resolveExecutable } from "../../shared/path-utils.js";
import type { FeishuGatewayEvent } from "./event-source.js";

export interface SubscribeArgsOptions {
  readonly profile?: string;
  readonly eventTypes?: readonly string[];
  readonly as?: "bot" | "user";
  readonly spawnProcess?: (bin: string, args: readonly string[]) => SubscribeProcess;
}

export interface SubscribeProcess {
  readonly stdout: Readable;
  readonly stderr: Readable;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  kill(): void;
}

export class LarkCliSubscribeError extends Error {
  constructor(
    message: string,
    readonly details: {
      readonly command: readonly string[];
      readonly exitCode?: number | null;
      readonly signal?: NodeJS.Signals | null;
      readonly stderr?: string;
    },
  ) {
    super(message);
    this.name = "LarkCliSubscribeError";
  }
}

export function buildSubscribeArgs(options: SubscribeArgsOptions = {}): readonly string[] {
  const args: string[] = [];
  if (options.profile) args.push("--profile", options.profile);
  args.push("event", "+subscribe");
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
  private child?: SubscribeProcess;
  private closing = false;

  constructor(private readonly options: SubscribeArgsOptions = {}) {}

  async *events(): AsyncIterable<FeishuGatewayEvent> {
    const resolved = resolveExecutable("lark-cli");
    const args = [...resolved.argsPrefix, ...buildSubscribeArgs({ as: "bot", ...this.options })];
    const command = [resolved.bin, ...args];
    this.closing = false;
    this.child = this.options.spawnProcess
      ? this.options.spawnProcess(resolved.bin, args)
      : spawn(resolved.bin, args, { shell: false, windowsHide: true });
    const closeResult = waitForClose(this.child);
    let stderr = "";
    this.child.stderr.on("data", (chunk: Buffer | string) => {
      stderr = appendLimited(stderr, Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk), 4_000);
    });
    let buffer = "";
    try {
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
      const result = await closeResult;
      if (!this.closing && result.code !== 0) {
        throw subscribeError("lark-cli event subscription failed", command, result.code, result.signal, stderr);
      }
    } catch (error) {
      if (this.closing) return;
      if (error instanceof LarkCliSubscribeError) throw error;
      throw subscribeError(error instanceof Error ? error.message : "lark-cli event subscription failed", command, undefined, undefined, stderr);
    }
  }

  close(): void {
    this.closing = true;
    this.child?.kill();
  }
}

function waitForClose(child: SubscribeProcess): Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

function subscribeError(message: string, command: readonly string[], exitCode: number | null | undefined, signal: NodeJS.Signals | null | undefined, stderr: string): LarkCliSubscribeError {
  const cleanStderr = redact(stderr.trim());
  const suffix = cleanStderr ? `: ${cleanStderr}` : "";
  return new LarkCliSubscribeError(`${message}${suffix}`, {
    command,
    exitCode,
    signal,
    stderr: cleanStderr || undefined,
  });
}

function appendLimited(current: string, next: string, max: number): string {
  const combined = current + next;
  return combined.length > max ? combined.slice(combined.length - max) : combined;
}

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]")
    .replace(/(app_secret|client_secret|secret|token|api_key)["'=:\s]+[A-Za-z0-9._~+/=-]{8,}/gi, "$1=[REDACTED]");
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
