import type { Artifact } from "./artifact.js";
import type { ProjectInitPlan } from "./plan.js";

export interface Session {
  sessionId: string;
  chatId: string;
  createdAt: string;
  lastActiveAt: string;
  messages: SessionMessage[];
  plans: ProjectInitPlan[];
  artifacts: Artifact[];
  turnCount: number;
}

export interface SessionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCallMessage[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCallMessage {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface SessionConfig {
  readonly ttlMs: number;
  readonly maxTurns: number;
  readonly maxSessions: number;
}
