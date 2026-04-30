# 06 — 模块规格说明

> 每个模块的接口、职责、输入输出、错误处理

## shared/ — 纯函数工具

### shared/parse-args.ts

**职责**：统一命令行参数解析，替代 11 处重复实现。

```typescript
export interface ParsedArgs {
  readonly flags: Record<string, string | boolean>;
  readonly positional: readonly string[];
}

export function parseArgs(argv: string[], options?: ParseOptions): ParsedArgs;

export interface ParseOptions {
  readonly boolean?: readonly string[];      // --verbose, --dry-run
  readonly string?: readonly string[];       // --profile, --output
  readonly alias?: Record<string, string>;   // -p → --profile
}
```

**行为**：
- 支持 `--key=value` 和 `--key value` 两种格式
- 支持 `--` 分隔符（后续全部作为 positional）
- 支持 `-p` 短别名
- 不支持 `process.exit()` — 返回解析结果，让调用方决定

### shared/markdown.ts

**职责**：飞书 lark_md 模板构建。

```typescript
export function markdownBlock(text: string): { tag: "markdown"; content: string };
export function divider(): { tag: "hr" };
export function escapeHtml(text: string): string;
export function escapeMarkdown(text: string): string;
export function formatArtifactTarget(type: string, title: string, url?: string): string;
export function formatRecordIds(ids: readonly string[], max?: number): string;
```

### shared/path-utils.ts

**职责**：路径安全操作。

```typescript
export function getPath(obj: unknown, path: string): unknown;
export function resolveExecutable(name: string): string;
```

### shared/id.ts

**职责**：标识符生成。

```typescript
export function generateRunId(): string;                          // UUID v4
export function buildDedupeKey(plan: ProjectInitPlan): string;    // 内容哈希
export function buildIdempotencyKey(runId: string, tool: string, sequence: number): string;  // SHA-256 截断
```

### shared/array-utils.ts

**职责**：数组操作工具。

```typescript
export function unique<T>(items: readonly T[]): T[];                           // 去重
export function chunk<T>(items: readonly T[], size: number): T[][];            // 分块
export function firstBy<T>(items: readonly T[], predicate: (t: T) => boolean): T | undefined;  // 第一个匹配
```

## safety/ — 安全层

### safety/preflight.ts

**职责**：live 模式前的完整性检查。

```typescript
export interface PreflightResult {
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly warnings: readonly string[];
}

export function preflight(config: RuntimeConfig, toolName: string): PreflightResult;
```

**检查项**：
- `mode === "live"` 时必须有 `baseToken`, `baseTableId`, `chatId`
- `task.create` 支持无 `tasklistId` 时使用飞书默认任务入口；缺失时给 warning，不作为阻断项，除非运行参数显式要求写入指定 tasklist
- `profile` 不能是空字符串

### safety/write-guard.ts

**职责**：阻止写入敏感路径（hermes `file_safety` 模式）。

```typescript
export function isPathSafe(path: string): boolean;
export function assertPathSafe(path: string): void;  // throws if unsafe
```

**拒绝列表**：`.env`, `.ssh/`, `.aws/`, `.gnupg/`, `.kube/`, `/etc/`

### safety/redact.ts

**职责**：参数脱敏，防止敏感内容泄露到日志。

```typescript
export function redactArgs(args: readonly string[]): readonly string[];
export function redactValue(key: string, value: string): string;
```

**脱敏的 key**：`--base-token`, `--chat-id`, `--user-id`, `--content`, `--text`, `--api-key`

## infrastructure/ — 基础设施

### infrastructure/command-runner.ts

**职责**：安全执行 lark-cli 子进程。

```typescript
export interface RunOptions {
  readonly timeoutMs?: number;        // 默认 30000
  readonly maxOutputBytes?: number;   // 默认 1MB
  readonly dryRun?: boolean;
}

export async function runCommand(
  bin: string,
  args: readonly string[],
  options?: RunOptions,
): Promise<LarkCliResult>;
```

**关键改进**（vs 旧 command-runner.js）：
- **加超时**：`AbortSignal.timeout(timeoutMs)` + `child.kill()`
- **输出限制**：累积超过 maxOutputBytes 截断
- **错误分类**：调用 `classifyProcessError()` 返回结构化错误
- **Windows 安全**：`shell: false` + 数组参数，cmd.exe fallback 时验证参数

### infrastructure/jsonl-recorder.ts

**职责**：JSONL 事件记录。

```typescript
export class JsonlRecorder implements Recorder {
  constructor(filePath: string);
  record(event: RecorderEvent): void;  // JSON.stringify + appendFile
  close(): void;
}
```

**关键改进**：
- 事件自动加 `timestamp`（ISO 8601）
- `JSON.stringify` 保证 `\n` 安全
- 目录不存在时自动 `mkdir`
- write 失败静默降级到 stderr

### infrastructure/flight-recorder.ts

**职责**：从 JSONL 文件构建飞行记录器模型。

```typescript
export interface FlightRecorderModel {
  readonly runId: string;
  readonly status: RunStatus;
  readonly events: readonly RecorderEvent[];
  readonly artifacts: readonly Artifact[];
  readonly duration?: number;
}

export function buildFlightRecorderModel(jsonPath: string): FlightRecorderModel | null;
```

**关键改进**：`JSON.parse` 加 try/catch，坏行跳过不崩溃。

## config/ — 配置

### config/runtime-config.ts

**职责**：从环境变量加载运行时配置。

```typescript
export function loadRuntimeConfig(argv?: string[]): RuntimeConfig;
```

**关键改进**：
- 不再 import `duplicate-run-guard.js` 的常量 — `storagePath` 作为参数传入
- `mode` 验证允许值：`"dry-run"` | `"live"`
- LLM 配置从 env 加载：`PILOTFLOW_LLM_BASE_URL`, `PILOTFLOW_LLM_API_KEY`, `PILOTFLOW_LLM_MODEL`

## domain/ — 业务逻辑

### domain/plan.ts

**职责**：计划构建 + 验证 + fallback。合并旧 `project-init-planner.js` + `plan-validator.js`。

```typescript
export class DeterministicPlanner {
  plan(inputText: string): ProjectInitPlan;
}

export class LlmPlanner {
  plan(inputText: string): Promise<ProjectInitPlan>;
}

export function validatePlan(plan: unknown): PlanValidationResult;
export function buildFallbackPlan(errors: readonly string[]): ProjectInitPlan;
```

**关键改进**：
- `parseDemoInput` 正则支持中文/数字/下划线：`/^([\w一-鿿 ]+):\s*(.+)$/`
- 验证器加字符串长度限制（goal ≤ 500, title ≤ 200, 最大 50 步, 最大 50 风险）
- `LlmPlanner` 接口与 `DeterministicPlanner` 一致（duck typing）

### domain/risk.ts

**职责**：风险检测 + 决策卡片数据构建。

```typescript
export function detectRisks(plan: ProjectInitPlan): PlanRisk[];
export function summarizeRiskDecision(risks: readonly PlanRisk[]): string;
export function highestRiskLevel(risks: readonly PlanRisk[]): RiskLevel;
```

### domain/project-brief.ts

**职责**：项目简报 markdown 构建。

```typescript
export function buildBriefMarkdown(plan: ProjectInitPlan, artifacts: readonly Artifact[]): string;
```

### domain/task-description.ts

**职责**：任务描述文本构建。

```typescript
export function buildTaskDescription(plan: ProjectInitPlan, artifacts: readonly Artifact[]): string;
```

## orchestrator/ — 编排器

### orchestrator/orchestrator.ts（~80 行）

**职责**：主编排器 — 只做调度，不做实现。

```typescript
export interface OrchestratorConfig {
  readonly planner: { plan(input: string): ProjectInitPlan | Promise<ProjectInitPlan> };
  readonly tools: ToolRegistry;
  readonly recorder: Recorder;
  readonly confirmationGate: ConfirmationGate;
  readonly duplicateGuard: DuplicateGuard;
  readonly runtime: RuntimeConfig;
  readonly llm?: import("../llm/client.js").LlmClient;  // 可选：提供时启用 Agent 循环
}

export interface RunOptions {
  readonly autoConfirm?: boolean;
  readonly sendPlanCard?: boolean;
  readonly sendEntryMessage?: boolean;
  readonly pinEntryMessage?: boolean;
  readonly updateAnnouncement?: boolean;
  readonly sendRiskCard?: boolean;
  readonly ownerOpenIdMap?: Record<string, string>;
  readonly taskAssigneeOpenId?: string;
  readonly autoLookupOwnerContact?: boolean;
  readonly useAgentLoop?: boolean;  // true 时使用 LLM 驱动的 Agent 循环
}

export interface RunResult {
  readonly status: RunStatus;
  readonly plan?: ProjectInitPlan;
  readonly risks?: readonly PlanRisk[];
  readonly artifacts?: readonly Artifact[];
  readonly error?: string;
}

export class Orchestrator {
  constructor(config: OrchestratorConfig);
  run(inputText: string, options?: RunOptions): Promise<RunResult>;
}
```

**内部流程**（每个步骤委托给独立模块）：
1. `this.config.planner.plan(inputText)` → plan
2. `validatePlan(plan)` → validation
3. `detectRisks(plan)` → risks
4. `this.config.duplicateGuard.start(key)` → guard
5. `this.config.confirmationGate.request(plan, risks)` → confirmed?
6. `executeSequence(steps, ctx)` → artifacts（委托给 tool-sequence.ts）
7. `this.config.duplicateGuard.complete(key)`

### orchestrator/tool-sequence.ts

**职责**：定义确定性工具调用序列。

```typescript
export interface SequenceStep {
  readonly id: string;
  readonly tool: string;
  readonly input: (ctx: SequenceContext) => Record<string, unknown>;
  readonly condition?: (ctx: SequenceContext) => boolean;
}

export interface SequenceContext {
  readonly plan: ProjectInitPlan;
  readonly risks: readonly PlanRisk[];
  readonly artifacts: readonly Artifact[];
  readonly options: RunOptions;
}

export function buildToolSequence(ctx: SequenceContext): readonly SequenceStep[];
```

### orchestrator/duplicate-guard.ts

**职责**：防重复运行（修复竞态 + 崩溃锁死）。

```typescript
export class DuplicateGuard {
  constructor(config: DuplicateGuardConfig);
  start(key: string): Promise<void>;      // throws GuardBlockedError if duplicate
  complete(key: string): Promise<void>;
  fail(key: string): Promise<void>;
  cleanup(maxAgeMs?: number): Promise<number>;  // 清理过期条目，返回清理数量
}
```

**关键改进**：
- **竞态修复**：写入前检查文件 mtime，或用 `fs.open('wx')` 排他创建
- **崩溃锁死修复**：guard 条目带 `createdAt` 时间戳，超过 `ttlMs` 自动视为过期
- **cleanup()**：可定期调用清理过期条目

### orchestrator/confirmation-gate.ts

```typescript
export interface ConfirmationGate {
  request(plan: ProjectInitPlan, risks: readonly PlanRisk[], options: RunOptions): Promise<boolean>;
}
```

### orchestrator/card-callback.ts

**职责**：处理飞书卡片按钮回调。

```typescript
export function extractCardAction(body: Record<string, unknown>): CardAction | null;
export function handleCardCallback(action: CardAction, orchestrator: Orchestrator): Promise<RunResult>;
```

### 其余 orchestrator 子模块

| 模块 | 导出 | 行数 |
|------|------|------|
| `entry-message.ts` | `buildEntryMessageText()`, `buildEntryMessageHtml()` | ~60 |
| `flight-plan-card.ts` | `buildFlightPlanCard()` | ~40 |
| `risk-decision-card.ts` | `buildRiskDecisionCard()` | ~70 |
| `summary-builder.ts` | `buildSummaryText()` | ~50 |
| `project-state.ts` | `buildProjectStateRows()` | ~60 |
| `contact-resolver.ts` | `resolveContactAssignee()` | ~40 |
| `assignee-resolver.ts` | `resolveTaskAssignee()`, `applyDefaultAssignee()` | ~40 |

## tools/ — 工具注册表

（详见 [07-tool-registry.md](07-tool-registry.md)）

## agent/ — Agent 循环

（详见 [08-agent-loop.md](08-agent-loop.md)）

## llm/ — LLM 集成

（详见 [09-llm-integration.md](09-llm-integration.md)）

## interfaces/ — 入口点

| 模块 | 职责 | 输入 |
|------|------|------|
| `gateway/feishu/event-source.ts` | 统一事件来源接口 | AsyncIterable |
| `gateway/feishu/lark-cli-source.ts` | 第一阶段默认事件来源，封装 `lark-cli event +subscribe` NDJSON | stdout |
| `gateway/feishu/webhook-server.ts` | 第二阶段可选 transport，Node 内置 `http` 接收飞书 webhook 事件 | HTTP POST |
| `interfaces/cli/cli-trigger.ts` | CLI 手动触发运行 | `--input <file>` 或 stdin |
| `interfaces/cli/card-listener.ts` | 人类/开发调试 wrapper，读取 `lark-cli event +subscribe` NDJSON 并转交 `gateway/feishu/*` handler | stdin JSON lines |
| `interfaces/cli/pilot-cli.ts` | CLI 主入口（子命令路由） | argv |
| `interfaces/cli/doctor.ts` | 健康检查 | 无 |
| `interfaces/cli/flight-recorder-view.ts` | JSONL 飞行记录查看 | `--input <file>` |
| `interfaces/cli/setup-feishu-targets.ts` | 飞书目标配置向导 | 交互式 |
