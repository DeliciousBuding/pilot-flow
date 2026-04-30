# 10 — 错误处理模式

> 来源：hermes-agent `error_classifier.py` + `retry_utils.py` 模式

## 原则

1. **分类一次，到处使用** — 错误在边界处分类，内部传递 `ClassifiedError`
2. **恢复提示驱动** — `retryable`, `shouldRotate`, `shouldFallback`, `shouldCompress` 指导调用方决策
3. **不吞错误** — 每个 catch 要么分类后重抛，要么记录后降级
4. **用户可理解** — 错误消息包含 what happened + what to do

## 错误层级

```
src/llm/error-classifier.ts    ← LLM API 错误分类（HTTP 状态码 + 消息模式）
src/shared/errors.ts                  ← PilotFlowError + shared typed subclasses
src/infrastructure/command-runner.ts  ← lark-cli 进程错误（exit code + stderr）
src/orchestrator/duplicate-guard.ts   ← 业务错误（GuardBlockedError）
src/tools/registry.ts                ← 工具错误（ToolNotFoundError, ToolPreflightError）
```

## 错误类型层次

```typescript
// 基础错误类（所有 PilotFlow 错误的根）
export class PilotFlowError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PilotFlowError";
  }
}

// LLM 错误
export class LlmError extends PilotFlowError {
  constructor(
    public readonly reason: FailoverReason,
    public readonly statusCode: number,
    responseBody: string,
  ) {
    super(`LLM error (${reason}): HTTP ${statusCode}`, "LLM_ERROR");
  }
}

export class RetryableLlmError extends LlmError {
  constructor(classified: ClassifiedError, statusCode: number) {
    super(classified.reason, statusCode, "");
    this.name = "RetryableLlmError";
  }
  // 标记为可重试 — withRetry() 识别这个类型
}

// 工具错误
export class ToolNotFoundError extends PilotFlowError {
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`, "TOOL_NOT_FOUND");
  }
}

export class ToolPreflightError extends PilotFlowError {
  constructor(toolName: string, public readonly missing: readonly string[]) {
    super(`Tool ${toolName} missing targets: ${missing.join(", ")}`, "TOOL_PREFLIGHT_FAILED");
  }
}

// 业务错误
export class GuardBlockedError extends PilotFlowError {
  constructor(public readonly guardKey: string) {
    super(`Duplicate run blocked. Key: ${guardKey}. Use --allow-duplicate-run to override.`, "GUARD_BLOCKED");
  }
}

export class PlanValidationError extends PilotFlowError {
  constructor(public readonly errors: readonly string[]) {
    super(`Plan validation failed: ${errors.join("; ")}`, "PLAN_VALIDATION_FAILED");
  }
}

// 进程错误
export class CommandTimeoutError extends PilotFlowError {
  constructor(command: string, timeoutMs: number) {
    super(`Command timed out after ${timeoutMs}ms: ${command}`, "COMMAND_TIMEOUT");
  }
}

export class CommandFailedError extends PilotFlowError {
  constructor(
    command: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(`Command failed (exit ${exitCode}): ${command}`, "COMMAND_FAILED");
  }
}
```

## 错误处理策略

| 错误类型 | 策略 | 用户消息 |
|---------|------|---------|
| `RetryableLlmError` | withRetry 重试 3 次 | "正在重试..." |
| `LlmError(auth)` | 停止，提示检查 API key | "API 认证失败，请检查 PILOTFLOW_LLM_API_KEY" |
| `LlmError(billing)` | 停止，提示检查配额 | "API 配额已用完，请检查账户" |
| `LlmError(context_overflow)` | 压缩上下文后重试 | "上下文过长，正在压缩..." |
| `ToolNotFoundError` | 停止运行 | "工具未注册: {name}" |
| `ToolPreflightError` | 停止运行 | "缺少配置: {missing}" |
| `GuardBlockedError` | 停止运行 | "重复运行已阻止。使用 --allow-duplicate-run 覆盖" |
| `CommandTimeoutError` | 记录 + 继续（可选工具） | "lark-cli 超时，跳过可选步骤" |
| `CommandFailedError` | 区分必需/可选工具 | 必需: 停止；可选: 降级 |
| `PlanValidationError` | 返回 fallback plan | "信息不足，已生成基础计划" |

## 每个模块的错误处理约定

### infrastructure/command-runner.ts
```typescript
// 超时 → CommandTimeoutError
// 非零退出 → CommandFailedError
// JSON 解析失败 → 返回 null（不崩溃）
// stdout/stderr 超限 → 截断
```

### tools/registry.ts
```typescript
// 工具不存在 → ToolNotFoundError
// preflight 失败 → ToolPreflightError
// handler 抛错 → 记录 tool.failed，重抛（不吞）
```

### orchestrator/orchestrator.ts
```typescript
// 规划失败 → 返回 { status: "needs_clarification" }
// guard 阻止 → 返回 { status: "blocked" }
// 工具失败（必需）→ 记录 run.failed，重抛
// 工具失败（可选）→ 记录 artifact.failed，继续
```

### agent/loop.ts
```typescript
// 工具执行失败 → 错误作为 tool result 返回给 LLM
// LLM 超时 → withRetry 重试
// 迭代耗尽 → 返回 "Maximum iterations reached"
```

## 错误消息模板

```typescript
export function formatUserError(error: PilotFlowError): string {
  switch (error.code) {
    case "LLM_ERROR":
      return `AI 服务出错 (${(error as LlmError).reason})。请稍后重试。`;
    case "TOOL_NOT_FOUND":
      return `内部错误：工具 ${(error as ToolNotFoundError).toolName} 未注册。`;
    case "TOOL_PREFLIGHT_FAILED":
      return `配置不完整，缺少 ${(error as ToolPreflightError).missing.join("、")}。请运行 pilot:setup。`;
    case "GUARD_BLOCKED":
      return `该项目已启动过。使用 --allow-duplicate-run 重新执行。`;
    case "PLAN_VALIDATION_FAILED":
      return `计划信息不足：${(error as PlanValidationError).errors.join("；")}。请补充后重试。`;
    case "COMMAND_TIMEOUT":
      return `飞书服务响应超时，请稍后重试。`;
    case "COMMAND_FAILED":
      return `飞书操作失败：${(error as CommandFailedError).stderr.slice(0, 200)}`;
    default:
      return `未知错误：${error.message}`;
  }
}
```
