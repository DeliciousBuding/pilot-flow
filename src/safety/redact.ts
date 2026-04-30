const SENSITIVE_KEYS = new Set([
  "--base-token",
  "--chat-id",
  "--user-id",
  "--content",
  "--text",
  "--json",
  "--data",
  "--summary",
  "--description",
  "--api-key",
  "--token",
  "--secret",
  "--password",
]);

const SENSITIVE_BARE_KEYS = new Set([
  "content",
  "markdown",
  "json",
  "data",
  "summary",
  "text",
  "description",
  "baseToken",
  "chatId",
  "userId",
  "apiKey",
  "token",
  "secret",
  "password",
]);

export function redactArgs(args: readonly string[]): readonly string[] {
  const redacted: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const eqIndex = arg.indexOf("=");

    if (eqIndex > 0) {
      const key = arg.slice(0, eqIndex);
      redacted.push(isSensitiveKey(key) ? `${key}=[REDACTED]` : arg);
      continue;
    }

    redacted.push(arg);
    if (isSensitiveKey(arg) && index + 1 < args.length) {
      redacted.push("[REDACTED]");
      index += 1;
    }
  }

  return redacted;
}

export function redactValue(key: string, value: string): string {
  return isSensitiveKey(key)
    ? `[REDACTED ${value.length} chars]`
    : value;
}

export function redactObject<T>(value: T): T {
  return redactUnknown(value) as T;
}

function redactUnknown(value: unknown, key = ""): unknown {
  if (typeof value === "string") return isSensitiveKey(key) ? redactValue(key, value) : value;
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, key));
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = redactUnknown(childValue, childKey);
  }
  return result;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/^--/, "").replace(/[-_]/g, "").toLowerCase();
  if (SENSITIVE_KEYS.has(key)) return true;
  return [...SENSITIVE_BARE_KEYS].some((item) => item.replace(/[-_]/g, "").toLowerCase() === normalized) ||
    /apikey|secret|token|password/.test(normalized);
}
