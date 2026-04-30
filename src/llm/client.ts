import { classifyError, LlmError, RetryableLlmError } from "./error-classifier.js";
import type { SessionMessage, ToolCallMessage } from "../types/session.js";

export { LlmError, RetryableLlmError } from "./error-classifier.js";

export interface LlmCallOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export interface LlmUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens?: number;
}

export interface LlmResponse {
  readonly content: string;
  readonly tool_calls?: readonly ToolCallMessage[];
  readonly usage?: LlmUsage;
  readonly finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
}

export interface LlmClient {
  call(messages: readonly SessionMessage[], tools?: readonly unknown[]): Promise<LlmResponse>;
}

export function createLlmClient(options: LlmCallOptions): LlmClient {
  return {
    async call(messages, tools) {
      const body: Record<string, unknown> = {
        model: options.model,
        messages,
        max_tokens: options.maxTokens ?? 4096,
      };

      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const response = await (options.fetch ?? fetch)(joinUrl(options.baseUrl, "/v1/chat/completions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ["Bearer", options.apiKey].join(" "),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const classified = classifyError(response.status, errorBody);
        if (classified.retryable) throw new RetryableLlmError(classified, response.status, errorBody);
        throw new LlmError(classified.reason, response.status, errorBody, classified);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: { content?: string | null; tool_calls?: ToolCallMessage[] };
          finish_reason?: LlmResponse["finish_reason"];
        }>;
        usage?: LlmUsage;
      };
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content ?? "",
        tool_calls: choice?.message?.tool_calls,
        usage: data.usage,
        finish_reason: choice?.finish_reason ?? "stop",
      };
    },
  };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}
