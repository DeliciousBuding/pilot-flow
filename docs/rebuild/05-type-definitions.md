# 05 — TypeScript 类型定义

> 以下所有接口可直接复制到 `src/types/` 目录使用

## plan.ts

```typescript
/** 计划意图类型 */
export type PlanIntent = "project_init";

/** 计划步骤状态 */
export type StepStatus = "pending" | "completed" | "failed" | "skipped";

/** 风险等级 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/** 风险状态 */
export type RiskStatus = "open" | "mitigated" | "accepted" | "closed";

/** 确认状态 */
export type ConfirmationStatus = "pending" | "approved" | "rejected" | "timeout";

/** 计划步骤 */
export interface PlanStep {
  readonly id: string;
  readonly title: string;
  readonly status: StepStatus;
  readonly tool?: string;
}

/** 计划风险 */
export interface PlanRisk {
  readonly id: string;
  readonly title: string;
  readonly level: RiskLevel;
  readonly status: RiskStatus;
  readonly owner?: string;
  readonly recommendation?: string;
}

/** 计划确认点 */
export interface PlanConfirmation {
  readonly id: string;
  readonly prompt: string;
  readonly status: ConfirmationStatus;
  readonly required_for: readonly string[];
}

/** 项目初始化计划 — 核心数据结构 */
export interface ProjectInitPlan {
  readonly intent: PlanIntent;
  readonly goal: string;
  readonly members: readonly string[];
  readonly deliverables: readonly string[];
  readonly deadline: string;
  readonly missing_info: readonly string[];
  readonly steps: readonly PlanStep[];
  readonly confirmations: readonly PlanConfirmation[];
  readonly risks: readonly PlanRisk[];
}

/** 计划验证结果 */
export type PlanValidationResult =
  | { readonly ok: true; readonly plan: ProjectInitPlan }
  | { readonly ok: false; readonly errors: readonly string[]; readonly partial?: Partial<ProjectInitPlan> };
```

## artifact.ts

```typescript
/** 工件类型（覆盖全部 9 个工具的输出） */
export type ArtifactType =
  | "doc"
  | "base"
  | "base_record"
  | "task"
  | "im_message"
  | "message"
  | "entry_message"
  | "pinned_message"
  | "card"
  | "announcement";

/** 运行产生的工件 */
export interface Artifact {
  readonly type: ArtifactType;
  readonly external_id: string;
  readonly url?: string;
  readonly title?: string;
  readonly metadata?: Record<string, unknown>;
}

/** 工件归一化输入（来自 lark-cli 输出） */
export interface RawArtifact {
  readonly type?: string;
  readonly document_id?: string;
  readonly base_id?: string;
  readonly task_id?: string;
  readonly message_id?: string;
  readonly url?: string;
  readonly title?: string;
  readonly [key: string]: unknown;
}
```

## recorder.ts

```typescript
/** 事件类型 */
export type EventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "plan.generated"
  | "plan.validated"
  | "confirmation.requested"
  | "confirmation.approved"
  | "confirmation.rejected"
  | "tool.called"
  | "tool.succeeded"
  | "tool.failed"
  | "artifact.created"
  | "artifact.failed"
  | "risk.detected"
  | "guard.started"
  | "guard.completed"
  | "guard.blocked";

/** 记录器事件 */
export interface RecorderEvent {
  readonly type: EventType | string;
  readonly runId: string;
  readonly sequence?: number;
  readonly timestamp?: string;
  readonly [key: string]: unknown;
}

/** 记录器接口 */
export interface Recorder {
  record(event: RecorderEvent): void;
  close(): void;
}

/** 运行状态 */
export type RunStatus =
  | "pending"
  | "running"
  | "waiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";
```

## tool.ts

```typescript
import type { Recorder } from "./recorder.js";

/** 工具执行上下文 */
export interface ToolContext {
  readonly runId: string;
  readonly sequence: number;
  readonly dryRun: boolean;
  readonly recorder: Recorder;
  readonly profile?: string;
  readonly targets?: Record<string, string>;
}

/** 工具执行结果 */
export interface ToolResult {
  readonly success: boolean;
  readonly artifact?: import("./artifact.js").Artifact;
  readonly output?: string;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

/** 工具处理函数 */
export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

/** 工具定义（注册到 registry 的完整描述） */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly schema: ToolSchema;
  readonly handler: ToolHandler;
  readonly requiresLive?: boolean;
  readonly requiresTargets?: readonly string[];
  readonly optional?: boolean;
  readonly safeWithoutConfirmation?: boolean;  // true = 只读工具，无需确认门控
}

/** OpenAI function-calling schema 格式 */
export interface ToolSchema {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: {
      readonly type: "object";
      readonly properties: Record<string, JsonSchemaProperty>;
      readonly required?: readonly string[];
    };
  };
}

/** JSON Schema 属性 */
export interface JsonSchemaProperty {
  readonly type: "string" | "number" | "boolean" | "object" | "array";
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly items?: JsonSchemaProperty;
  readonly properties?: Record<string, JsonSchemaProperty>;
}
```

## session.ts

```typescript
import type { ProjectInitPlan } from "./plan.js";
import type { Artifact } from "./artifact.js";

/** 会话状态（内存中的可变版本 — SessionManager 直接修改字段） */
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

/** 会话消息（OpenAI 兼容格式 — 内存中可变） */
export interface SessionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCallMessage[];
  tool_call_id?: string;
  name?: string;
}

/** 工具调用消息 */
export interface ToolCallMessage {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** 会话配置 */
export interface SessionConfig {
  readonly ttlMs: number;
  readonly maxTurns: number;
  readonly maxSessions: number;
}
```

## feishu.ts

```typescript
/** 飞书目标配置 */
export interface FeishuTargets {
  readonly baseToken?: string;
  readonly baseTableId?: string;
  readonly chatId?: string;
  readonly tasklistId?: string;
  readonly ownerOpenId?: string;
}

/** 卡片动作 */
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

/** 飞书消息载荷 */
export interface MessagePayload {
  readonly msg_type: "text" | "post" | "interactive";
  readonly content: string;
  readonly receive_id?: string;
  readonly uuid?: string;
}

/** lark-cli 执行结果 */
export interface LarkCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly json?: Record<string, unknown>;
}
```

## config.ts

```typescript
import type { FeishuTargets } from "./feishu.js";

/** 运行模式 */
export type RunMode = "dry-run" | "live";

/** LLM 配置 */
export interface LlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly fallbackModels?: readonly string[];
  readonly maxTokens?: number;
  readonly temperature?: number;
}

/** 运行时配置 */
export interface RuntimeConfig {
  readonly mode: RunMode;
  readonly profile: string;
  readonly feishuTargets: FeishuTargets;
  readonly duplicateGuard: DuplicateGuardConfig;
  readonly llm?: LlmConfig;
  readonly autoConfirm: boolean;
  readonly verbose: boolean;
}

/** 去重守卫配置 */
export interface DuplicateGuardConfig {
  readonly enabled: boolean;
  readonly storagePath: string;
  readonly ttlMs: number;
  readonly allowDuplicateRun: boolean;
}
```

## common.ts

```typescript
/** 通用 Result 类型 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** 时间戳字符串（ISO 8601） */
export type Timestamp = string;

/** 分页 */
export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
  readonly total?: number;
}
```

## env-utils.ts（环境变量工具 — 放在 config/ 而非 types/）

```typescript
// src/config/env-utils.ts — 运行时工具，不放 types/ 目录

export function env(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function envBool(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

export function envJson<T>(key: string, defaultValue: T): T {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}
```
