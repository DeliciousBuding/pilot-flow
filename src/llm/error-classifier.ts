export type FailoverReason =
  | "auth"
  | "billing"
  | "rate_limit"
  | "context_overflow"
  | "server_error"
  | "timeout"
  | "format_error"
  | "unknown";

export interface ClassifiedError {
  readonly reason: FailoverReason;
  readonly retryable: boolean;
  readonly shouldRotate: boolean;
  readonly shouldFallback: boolean;
  readonly shouldCompress: boolean;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: string,
    public readonly classified: ClassifiedError = classifyError(statusCode ?? 0, body ?? message),
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export class RetryableLlmError extends LlmError {
  constructor(classified: ClassifiedError, statusCode?: number, body?: string) {
    super(classified.reason, statusCode, body, classified);
    this.name = "RetryableLlmError";
  }
}

export function classifyError(statusCode: number, body: string): ClassifiedError {
  const bodyLower = body.toLowerCase();

  switch (statusCode) {
    case 401:
    case 403:
      return result("auth", false, true, true, false);
    case 402:
      if (bodyLower.includes("try again") || bodyLower.includes("resets at") || bodyLower.includes("rate limit")) {
        return result("rate_limit", true, true, false, false);
      }
      return result("billing", false, true, true, false);
    case 404:
      if (bodyLower.includes("model")) return result("auth", false, false, true, false);
      return result("unknown", false, false, false, false);
    case 413:
      return result("context_overflow", true, false, false, true);
    case 429:
      return result("rate_limit", true, true, true, false);
    case 500:
    case 502:
    case 503:
    case 529:
      return result("server_error", true, false, true, false);
  }

  if (bodyLower.includes("context_length_exceeded") || bodyLower.includes("maximum context length")) {
    return result("context_overflow", true, false, false, true);
  }
  if (bodyLower.includes("insufficient_quota") || bodyLower.includes("quota exceeded")) {
    return result("billing", false, true, true, false);
  }
  if (bodyLower.includes("timeout") || bodyLower.includes("timed out") || bodyLower.includes("aborted")) {
    return result("timeout", true, false, true, false);
  }
  if (bodyLower.includes("invalid json") || bodyLower.includes("malformed")) {
    return result("format_error", false, false, false, false);
  }

  return result("unknown", statusCode >= 500, false, statusCode >= 500, false);
}

export function classifyThrowable(error: unknown): ClassifiedError {
  if (error instanceof LlmError) return error.classified;
  if (error instanceof Error && (error.name === "AbortError" || /aborted|timeout|timed out/i.test(error.message))) {
    return result("timeout", true, false, true, false);
  }
  return result("unknown", false, false, false, false);
}

function result(
  reason: FailoverReason,
  retryable: boolean,
  shouldRotate: boolean,
  shouldFallback: boolean,
  shouldCompress: boolean,
): ClassifiedError {
  return { reason, retryable, shouldRotate, shouldFallback, shouldCompress };
}
