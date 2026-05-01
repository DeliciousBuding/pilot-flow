import { pathToFileURL } from "node:url";
import { runAgentLoop, type AgentLoopResult } from "../../agent/loop.js";
import { SessionManager } from "../../agent/session-manager.js";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { ChatQueue } from "../../gateway/feishu/chat-queue.js";
import { EventDedupe } from "../../gateway/feishu/dedupe.js";
import type { BotIdentity, FeishuMessageEvent } from "../../gateway/feishu/event-source.js";
import { parseLarkCliEventLine } from "../../gateway/feishu/lark-cli-source.js";
import { handleMessageEvent } from "../../gateway/feishu/message-handler.js";
import { createLlmClient, type LlmClient, type LlmResponse } from "../../llm/client.js";
import { parseArgs } from "../../shared/parse-args.js";
import type { ConfirmationGate } from "../../orchestrator/confirmation-gate.js";
import { registerFeishuTools } from "../../tools/feishu/index.js";
import { ToolRegistry } from "../../tools/registry.js";
import type { Recorder, RecorderEvent } from "../../types/recorder.js";
import type { Session } from "../../types/session.js";

const DEFAULT_INPUT = "@PilotFlow 帮我为校园 AI 产品答辩建立项目空间，产出项目简报并在群里同步。";

export interface AgentSmokeOptions {
  readonly input?: string;
  readonly eventLine?: string;
  readonly json?: boolean;
  readonly maxTurns?: number;
}

export interface AgentSmokeResult {
  readonly status: "processed" | "ignored";
  readonly reason?: string;
  readonly finalResponse?: string;
  readonly session: {
    readonly chatId: string;
    readonly messageCount: number;
    readonly turnCount: number;
  };
  readonly toolCalls: number;
  readonly artifacts: readonly unknown[];
  readonly recorderEvents: readonly RecorderEvent[];
}

export async function runAgentSmoke(options: AgentSmokeOptions = {}): Promise<AgentSmokeResult> {
  const runtime = loadRuntimeConfig(["--dry-run"], smokeRuntimeEnv(process.env));
  const recorder = new MemoryRecorder();
  const tools = new ToolRegistry();
  registerFeishuTools(tools);

  const sessions = new SessionManager({ ttlMs: 60 * 60 * 1000, maxTurns: options.maxTurns ?? 20, maxSessions: 8 });
  const event = messageEventFromLine(options.eventLine ?? buildMockMessageEventLine(options.input ?? DEFAULT_INPUT));
  const bot: BotIdentity = { openId: "ou_pilotflow_bot", userId: "u_pilotflow_bot", name: "PilotFlow" };

  const llm = resolveSmokeLlm(options.input ?? DEFAULT_INPUT, process.env);
  const handled = await handleMessageEvent(event, {
    bot,
    sessions,
    dedupe: new EventDedupe({ ttlMs: 60 * 60 * 1000, maxEntries: 128 }),
    queue: new ChatQueue(),
    runAgent: async (text: string, session: Session): Promise<AgentLoopResult> => runAgentLoop(text, session.messages.slice(0, -1), {
      llm,
      tools,
      recorder,
      runtime,
      confirmationGate: autoApprovalGate(),
      maxIterations: 4,
    }),
  });

  const session = sessions.get(event.chatId);
  const artifacts = recorder.events.flatMap((item) => Array.isArray(item.artifacts) ? item.artifacts : []);
  return {
    status: handled.status,
    reason: handled.status === "ignored" ? handled.reason : undefined,
    finalResponse: handled.status === "processed" ? handled.response : undefined,
    session: {
      chatId: event.chatId,
      messageCount: session?.messages.length ?? 0,
      turnCount: session?.turnCount ?? 0,
    },
    toolCalls: recorder.events.filter((item) => item.type === "tool.called").length,
    artifacts,
    recorderEvents: recorder.events,
  };
}

export function renderAgentSmoke(result: AgentSmokeResult): string {
  const lines = [
    "PilotFlow TS Agent Smoke",
    "",
    `status: ${result.status}`,
    result.reason ? `reason: ${result.reason}` : undefined,
    result.finalResponse ? `final: ${result.finalResponse}` : undefined,
    `chat: ${result.session.chatId}`,
    `session_messages: ${result.session.messageCount}`,
    `turns: ${result.session.turnCount}`,
    `tool_calls: ${result.toolCalls}`,
    `artifacts: ${result.artifacts.length}`,
  ].filter((line): line is string => typeof line === "string");
  return lines.join("\n");
}

export function buildMockMessageEventLine(text: string): string {
  return JSON.stringify({
    header: { event_id: "evt_agent_smoke", event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_smoke_user" } },
      message: {
        message_id: "om_agent_smoke",
        chat_id: "oc_agent_smoke",
        chat_type: "group",
        content: JSON.stringify({ text }),
        mentions: [{ id: { open_id: "ou_pilotflow_bot" }, name: "PilotFlow" }],
      },
    },
  });
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv, {
    boolean: ["json"],
    string: ["input", "event-line", "max-turns"],
  });
  const result = await runAgentSmoke({
    input: stringFlag(parsed.flags.input),
    eventLine: stringFlag(parsed.flags["event-line"]),
    json: parsed.flags.json === true,
    maxTurns: numberFlag(parsed.flags["max-turns"]),
  });

  if (parsed.flags.json === true) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(renderAgentSmoke(result));
}

function createSmokeLlm(text: string): LlmClient {
  let calls = 0;
  return {
    async call(): Promise<LlmResponse> {
      calls += 1;
      if (calls === 1) {
        const title = text.slice(0, 42) || "PilotFlow smoke project";
        return {
          content: "I will create dry-run Feishu artifacts.",
          finish_reason: "tool_calls",
          tool_calls: [
            {
              id: "call_smoke_doc",
              type: "function",
              function: {
                name: "doc_create",
                arguments: JSON.stringify({
                  title: `Smoke: ${title}`,
                  markdown: `# Smoke Run\n\nSource message:\n\n${text}`,
                }),
              },
            },
            {
              id: "call_smoke_im",
              type: "function",
              function: {
                name: "im_send",
                arguments: JSON.stringify({
                  text: `PilotFlow dry-run smoke completed: ${title}`,
                }),
              },
            },
          ],
        };
      }
      return {
        content: "TS gateway -> session -> Agent loop -> ToolRegistry dry-run completed.",
        finish_reason: "stop",
      };
    },
  };
}

function resolveSmokeLlm(text: string, env: NodeJS.ProcessEnv): LlmClient {
  const baseUrl = env.PILOTFLOW_LLM_BASE_URL;
  const apiKey = env.PILOTFLOW_LLM_API_KEY;
  const model = env.PILOTFLOW_LLM_MODEL;
  if (baseUrl && apiKey && model) {
    return createLlmClient({
      baseUrl,
      apiKey,
      model,
      maxTokens: env.PILOTFLOW_LLM_MAX_TOKENS ? Number(env.PILOTFLOW_LLM_MAX_TOKENS) : 4096,
      temperature: env.PILOTFLOW_LLM_TEMPERATURE ? Number(env.PILOTFLOW_LLM_TEMPERATURE) : undefined,
    });
  }
  return createSmokeLlm(text);
}

function messageEventFromLine(line: string): FeishuMessageEvent {
  const event = parseLarkCliEventLine(line);
  if (!event || event.kind !== "message") {
    throw new Error("agent smoke requires an im.message.receive_v1 event line");
  }
  return event;
}

function autoApprovalGate(): ConfirmationGate {
  return {
    async request() {
      return { approved: true, status: "approved", confirmationText: "dry-run" };
    },
  };
}

function stringFlag(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberFlag(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function smokeRuntimeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env, PILOTFLOW_FEISHU_MODE: "dry-run" };
  // Keep LLM config only when all three are present; delete partial config to avoid ConfigurationError
  const hasAll = env.PILOTFLOW_LLM_BASE_URL && env.PILOTFLOW_LLM_API_KEY && env.PILOTFLOW_LLM_MODEL;
  if (!hasAll) {
    for (const key of Object.keys(next)) {
      if (key.startsWith("PILOTFLOW_LLM_")) delete next[key];
    }
  }
  return next;
}

class MemoryRecorder implements Recorder {
  readonly events: RecorderEvent[] = [];

  async record(event: RecorderEvent): Promise<void> {
    this.events.push({ timestamp: event.timestamp ?? new Date().toISOString(), ...event });
  }

  close(): void {
    this.events.length = 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
