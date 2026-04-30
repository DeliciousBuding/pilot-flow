# 09 - LLM Integration

This file defines the first real LLM provider for the Hermes-style rebuild. The rebuild should include a minimal OpenAI-compatible chat-completions client, tool calling, retry, and error classification. It does not include provider pools, OAuth, model routing, or long-context compression in the first pass.

## 架构

```
src/llm/
├── client.ts           ← OpenAI 兼容 fetch 封装
├── error-classifier.ts ← HTTP 状态码 + 消息模式 → 恢复提示
└── retry.ts            ← 抖动指数退避
```

## llm/client.ts

```typescript
export interface LlmCallOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface LlmResponse {
  readonly content: string;
  readonly tool_calls?: readonly {
    readonly id: string;
    readonly type: "function";
    readonly function: { readonly name: string; readonly arguments: string };
  }[];
  readonly usage?: { readonly prompt_tokens: number; readonly completion_tokens: number };
  readonly finish_reason: "stop" | "tool_calls" | "length";
}

export interface LlmClient {
  call(
    messages: readonly { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }[],
    tools?: readonly unknown[],
  ): Promise<LlmResponse>;
}

export function createLlmClient(options: LlmCallOptions): LlmClient {
  return {
    async call(messages, tools) {
      const body: Record<string, unknown> = {
        model: options.model,
        messages,
        max_tokens: options.maxTokens ?? 4096,
      };

      if (options.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const response = await fetch(`${options.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ["Bearer", options.apiKey].join(" "),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const classified = classifyError(response.status, errorBody);

        if (classified.retryable) {
          throw new RetryableLlmError(classified, response.status);
        }
        throw new LlmError(classified.reason, response.status, errorBody);
      }

      const data = await response.json() as { choices: { message: LlmResponse; finish_reason: string }[] };
      const choice = data.choices[0];

      return {
        content: choice.message.content || "",
        tool_calls: choice.message.tool_calls,
        usage: (data as any).usage,
        finish_reason: choice.finish_reason as LlmResponse["finish_reason"],
      };
    },
  };
}
```

**设计要点**：
- **零依赖** — 只用 `fetch`（Node.js 20 内置）
- **超时** — `AbortSignal.timeout(60_000)` 60 秒
- **错误分类集成** — 响应非 200 时自动分类
- **retryable 错误** — 抛 `RetryableLlmError` 让调用方重试
- **工具调用** — response 必须保留 `tool_calls`，由 Agent loop 交给 registry 执行
- **安全边界** — LLM 只能提出 tool calls；所有 live side effects 仍由 confirmation gate 和 tool preflight 约束

## llm/error-classifier.ts

```typescript
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

export function classifyError(statusCode: number, body: string): ClassifiedError {
  const bodyLower = body.toLowerCase();

  // 1. HTTP 状态码分类
  switch (statusCode) {
    case 401:
      return { reason: "auth", retryable: false, shouldRotate: true, shouldFallback: true, shouldCompress: false };

    case 402:
      // 真假区分：瞬时限流 vs 配额耗尽
      if (bodyLower.includes("try again") || bodyLower.includes("resets at")) {
        return { reason: "rate_limit", retryable: true, shouldRotate: true, shouldFallback: false, shouldCompress: false };
      }
      return { reason: "billing", retryable: false, shouldRotate: true, shouldFallback: true, shouldCompress: false };

    case 403:
      return { reason: "auth", retryable: false, shouldRotate: true, shouldFallback: true, shouldCompress: false };

    case 404:
      if (bodyLower.includes("model")) {
        return { reason: "auth", retryable: false, shouldRotate: false, shouldFallback: true, shouldCompress: false };
      }
      return { reason: "unknown", retryable: false, shouldRotate: false, shouldFallback: false, shouldCompress: false };

    case 413:
      return { reason: "context_overflow", retryable: true, shouldRotate: false, shouldFallback: false, shouldCompress: true };

    case 429:
      return { reason: "rate_limit", retryable: true, shouldRotate: true, shouldFallback: true, shouldCompress: false };

    case 500:
    case 502:
      return { reason: "server_error", retryable: true, shouldRotate: false, shouldFallback: true, shouldCompress: false };

    case 503:
    case 529:
      return { reason: "server_error", retryable: true, shouldRotate: false, shouldFallback: true, shouldCompress: false };
  }

  // 2. 消息模式匹配
  if (bodyLower.includes("context_length_exceeded") || bodyLower.includes("maximum context length")) {
    return { reason: "context_overflow", retryable: true, shouldRotate: false, shouldFallback: false, shouldCompress: true };
  }

  if (bodyLower.includes("insufficient_quota") || bodyLower.includes("quota exceeded")) {
    return { reason: "billing", retryable: false, shouldRotate: true, shouldFallback: true, shouldCompress: false };
  }

  // 3. 默认
  return { reason: "unknown", retryable: statusCode >= 500, shouldRotate: false, shouldFallback: false, shouldCompress: false };
}
```

This is a deliberately smaller version of Hermes' classifier. It must still use the same shape: reason plus recovery hints, so later provider fallback and context compression can be added without rewriting callers.

## llm/retry.ts

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;
  const maxDelay = options?.maxDelayMs ?? 30_000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // 只重试 retryable 错误
      if (error instanceof RetryableLlmError) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = delay * 0.5 * Math.random();
        await new Promise((r) => setTimeout(r, delay + jitter));
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unreachable");
}
```

## 使用方式

```typescript
import { createLlmClient } from "../llm/client.js";
import { withRetry } from "../llm/retry.js";

const llm = createLlmClient({
  baseUrl: process.env.PILOTFLOW_LLM_BASE_URL || "https://api.openai.com",
  apiKey: process.env.PILOTFLOW_LLM_API_KEY || "",
  model: process.env.PILOTFLOW_LLM_MODEL || "gpt-4o",
});

const response = await withRetry(() => llm.call(messages, tools));
```

## .env 配置

```env
# LLM 配置
PILOTFLOW_LLM_BASE_URL=https://api.openai.com
PILOTFLOW_LLM_API_KEY=<local-only-api-key>
PILOTFLOW_LLM_MODEL=gpt-4o
PILOTFLOW_LLM_FALLBACK_MODELS=gpt-4o-mini
PILOTFLOW_LLM_MAX_TOKENS=4096
PILOTFLOW_LLM_TEMPERATURE=0.1
```
