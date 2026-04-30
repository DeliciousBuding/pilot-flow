# 07 - Tool Registry Design

> 来源：hermes-agent `tools/registry.py` 模式移植
>
> Feishu command examples must match the installed `lark-cli` v2 surface. For document creation, verified help says: `lark-cli docs +create --api-version v2 --content <xml-or-markdown> --doc-format markdown --as user`.

## 设计目标

1. **自注册** — 每个工具文件导入时自动注册到全局 registry
2. **OpenAI 兼容** — registry 输出 LLM-safe function-calling schema，同时保留内部点分命名
3. **类型安全** — TypeScript 泛型约束 input/output
4. **可测试** — handler 与 registry 解耦，可独立测试
5. **preflight 检查** — 工具声明自己需要的 targets，registry 在执行前检查

## 核心实现

```typescript
// src/tools/registry.ts

import type { ToolDefinition, ToolHandler, ToolSchema, ToolContext, ToolResult } from "../types/tool.js";
import type { RecorderEvent } from "../types/recorder.js";
import { PilotFlowError } from "../shared/errors.js";

export class ToolNotFoundError extends PilotFlowError {
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`, "TOOL_NOT_FOUND");
    this.name = "ToolNotFoundError";
  }
}

export class ToolPreflightError extends PilotFlowError {
  constructor(
    public readonly toolName: string,
    public readonly missing: readonly string[],
  ) {
    super(`Tool ${toolName} missing required targets: ${missing.join(", ")}`, "TOOL_PREFLIGHT_FAILED");
    this.name = "ToolPreflightError";
  }
}

export class ToolAlreadyRegisteredError extends PilotFlowError {
  constructor(public readonly toolName: string) {
    super(`Tool already registered: ${toolName}`, "TOOL_ALREADY_REGISTERED");
    this.name = "ToolAlreadyRegisteredError";
  }
}

export class ToolConfirmationRequiredError extends PilotFlowError {
  constructor(public readonly toolName: string) {
    super(`Tool ${toolName} requires confirmation before live execution`, "TOOL_CONFIRMATION_REQUIRED");
    this.name = "ToolConfirmationRequiredError";
  }
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private llmNameToName = new Map<string, string>();

  /** 注册工具（模块导入时调用） */
  register(def: ToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new ToolAlreadyRegisteredError(def.name);
    }
    const llmName = def.llmName ?? toLlmToolName(def.name);
    this.tools.set(def.name, def);
    this.llmNameToName.set(llmName, def.name);
  }

  /** 执行工具 */
  async execute(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const internalName = this.llmNameToName.get(name) ?? name;
    const tool = this.tools.get(internalName);
    if (!tool) throw new ToolNotFoundError(internalName);

    // preflight: 检查必需的 targets
    if (tool.requiresTargets && !ctx.dryRun) {
      const missing = tool.requiresTargets.filter((t) => !ctx.targets?.[t]);
      if (missing.length > 0) throw new ToolPreflightError(internalName, missing);
    }

    // confirmation: live side-effect tools cannot run through registry unless the caller
    // has passed an explicit confirmation result.
    if (!ctx.dryRun && tool.confirmationRequired && !tool.safeWithoutConfirmation && ctx.confirmed !== true) {
      throw new ToolConfirmationRequiredError(internalName);
    }

    // 记录 tool.called（脱敏输入，防止敏感内容泄露到 JSONL）
    ctx.recorder.record({
      type: "tool.called",
      runId: ctx.runId,
      sequence: ctx.sequence,
      tool: internalName,
      input: redactToolInput(internalName, input),
    });

    try {
      const result = await tool.handler(input, ctx);

      // 记录 tool.succeeded（输出摘要化，防止敏感内容泄露）
      ctx.recorder.record({
        type: "tool.succeeded",
        runId: ctx.runId,
        sequence: ctx.sequence,
        tool: internalName,
        output: typeof result.output === "string" ? result.output.slice(0, 500) : result.output,
        artifacts: summarizeArtifacts(result),
      });

      return result;
    } catch (error) {
      // 记录 tool.failed
      ctx.recorder.record({
        type: "tool.failed",
        runId: ctx.runId,
        sequence: ctx.sequence,
        tool: internalName,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /** 获取所有工具定义（用于 LLM function-calling） */
  getDefinitions(): readonly ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** 获取 OpenAI 格式的工具 schema 列表 */
  getSchemas(): readonly ToolSchema[] {
    return this.getDefinitions().map((t) => ({
      ...t.schema,
      function: {
        ...t.schema.function,
        name: t.llmName ?? toLlmToolName(t.name),
      },
    }));
  }

  /** 检查工具是否存在 */
  has(name: string): boolean {
    return this.tools.has(this.llmNameToName.get(name) ?? name);
  }

  /** 获取工具定义（只读） */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(this.llmNameToName.get(name) ?? name);
  }

  /** 获取已注册工具名称列表 */
  names(): readonly string[] {
    return [...this.tools.keys()];
  }

  /** 清空所有注册（测试用，防止跨测试污染） */
  reset(): void {
    this.tools.clear();
    this.llmNameToName.clear();
  }
}

/** 工具输入脱敏 — 防止文档内容、token 等写入 JSONL 日志 */
const SENSITIVE_INPUT_KEYS = new Set([
  "markdown", "content", "text", "description", "baseToken", "chatId", "apiKey",
]);

function redactToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_INPUT_KEYS.has(key) && typeof value === "string") {
      redacted[key] = `[REDACTED ${value.length} chars]`;
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function toLlmToolName(name: string): string {
  return name.replaceAll(".", "_");
}

function summarizeArtifacts(result: ToolResult): readonly Record<string, string | undefined>[] {
  const artifacts = result.artifacts ?? (result.artifact ? [result.artifact] : []);
  return artifacts.map((artifact) => ({ type: artifact.type, external_id: artifact.external_id }));
}

/** 全局单例 — 所有工具文件导入时使用 */
export const registry = new ToolRegistry();
```

## 工具定义示例

```typescript
// src/tools/feishu/doc-create.ts

import { registry } from "../registry.js";
import { runCommand } from "../../infrastructure/command-runner.js";
import type { ToolResult } from "../../types/tool.js";

registry.register({
  name: "doc.create",
  llmName: "doc_create",
  description: "Create a Feishu document from markdown content. Returns document ID and URL.",
  confirmationRequired: true,
  requiresTargets: [],  // lark-cli 通过 profile 处理认证，不需要 Base token
  schema: {
    type: "function",
    function: {
      name: "doc_create",
      description: "Create a Feishu document from markdown content",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Document title",
          },
          markdown: {
            type: "string",
            description: "Document content in markdown format",
          },
        },
        required: ["title", "markdown"],
      },
    },
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    const title = input.title as string;
    const markdown = input.markdown as string;

    if (ctx.dryRun) {
      return {
        success: true,
        artifact: { type: "doc", external_id: `dry-${Date.now()}`, title, url: "dry-run" },
        output: `[dry-run] Would create doc: ${title}`,
      };
    }

    const contentFile = await writeIgnoredTempFile("doc-create", `# ${title}\n\n${markdown}`);
    const result = await runCommand("lark-cli", [
      "docs", "+create",
      "--api-version", "v2",
      "--profile", ctx.profile || "pilotflow-contest",
      "--as", "user",
      "--doc-format", "markdown",
      "--content", `@${contentFile}`,
    ], { timeoutMs: 30000 });

    if (result.exitCode !== 0) {
      throw new Error(`doc.create failed: ${result.stderr}`);
    }

    const data = result.json?.data as { document?: { document_id?: string; title?: string } };
    const doc = data?.document;

    return {
      success: true,
      artifact: {
        type: "doc",
        external_id: doc?.document_id || "unknown",
        title: doc?.title || title,
        url: doc?.document_id ? `https://feishu.cn/docx/${doc.document_id}` : undefined,
      },
      output: `Created doc: ${doc?.title || title}`,
    };
  },
});
```

## 工具列表

| 工具名 | 文件 | 需要 targets | 可选 | 说明 |
|--------|------|-------------|------|------|
| `doc.create` | `tools/feishu/doc-create.ts` | — | 否 | 创建飞书文档（lark-cli profile 认证） |
| `base.write` | `tools/feishu/base-write.ts` | `baseToken`, `baseTableId` | 否 | 写入 Base 表行 |
| `task.create` | `tools/feishu/task-create.ts` | `tasklistId` optional | 否 | 创建飞书任务；缺省时使用飞书默认任务目标 |
| `im.send` | `tools/feishu/im-send.ts` | `chatId` | 否 | 发送 IM 消息 |
| `entry.send` | `tools/feishu/entry-send.ts` | `chatId` | 否 | 发送项目入口消息（语义独立于 im.send，artifact 类型为 `entry_message`） |
| `entry.pin` | `tools/feishu/entry-pin.ts` | `chatId` | 是 | 置顶消息（依赖 entry.send 返回的 message_id） |
| `card.send` | `tools/feishu/card-send.ts` | `chatId` | 否 | 发送交互式卡片 |
| `announcement.update` | `tools/feishu/announcement-update.ts` | `chatId` | 是 | 更新群公告（失败降级为 entry.pin） |
| `contact.search` | `tools/feishu/contact-search.ts` | — | 是 | 搜索飞书联系人（用于任务分配解析） |

Internal tool names use dot notation for readability and recorder grouping. LLM-facing names must use `llmName` with only letters, numbers, `_`, or `-` for provider compatibility. The registry maps `doc_create` back to `doc.create` before execution.

`writeIgnoredTempFile()` represents a small infrastructure helper that writes sensitive/long command bodies into `tmp/` or the OS temp directory and returns a path safe for `--content @file`. Do not pass full document bodies through argv in live mode.

### 工具输出归一化

每个工具的 handler 必须将 lark-cli 原始 JSON 输出归一化为 `Artifact` 对象。归一化逻辑内联在各工具 handler 中（不单独建模块），规则如下：

| 工具 | Artifact 类型 | external_id 取值 | 备注 |
|------|--------------|-----------------|------|
| `doc.create` | `doc` | `document_id` / `documentId` / `token` | 多路径回退 |
| `base.write` | `base_record` | 每行一个 artifact，`record_id_list` 与 `fields` 交叉 | 批量写入产生多个 artifact |
| `task.create` | `task` | `guid` / `task_guid` / `task_id` / `id` | 多路径回退 |
| `im.send` | `message` | `message_id` | — |
| `entry.send` | `entry_message` | `message_id` | 语义独立于 im.send |
| `entry.pin` | `pinned_message` | `message_id` + `chat_id` | — |
| `card.send` | `card` | `message_id` | — |
| `announcement.update` | `announcement` | `revision` | — |
| `contact.search` | — | — | 不产生 artifact，返回联系人列表 |

### 工具序列中的可选步骤行为

`tool-sequence.ts` 中标记为 `optional: true` 的工具（如 `announcement.update`、`entry.pin`）使用 `callOptionalTool` 模式执行：

```typescript
async function callOptionalTool(registry, toolName, input, ctx): Promise<ToolResult> {
  try {
    return await registry.execute(toolName, input, ctx);
  } catch (error) {
    // 不抛出，记录失败后继续
    ctx.recorder.record({ type: "artifact.failed", runId: ctx.runId, tool: toolName, error: error.message });
    ctx.recorder.record({ type: "optional_tool.fallback", runId: ctx.runId, tool: toolName, fallback: "continue" });
    return { success: false, error: error.message };
  }
}
```

条件不满足的步骤（`step.condition` 返回 false）记录 `step.status_changed: { status: "skipped" }` 后跳过。

## 注册入口

```typescript
// src/tools/feishu/index.ts — 导入所有工具触发自注册
import "./doc-create.js";
import "./base-write.js";
import "./task-create.js";
import "./im-send.js";
import "./entry-send.js";
import "./entry-pin.js";
import "./card-send.js";
import "./announcement-update.js";
import "./contact-search.js";
```

```typescript
// 应用启动时
import "./tools/feishu/index.js";  // 注册所有飞书工具
```

## Agent 循环集成

当使用 Agent 循环（LLM 驱动）时，registry 提供 schema 给 LLM：

```typescript
const schemas = registry.getSchemas();  // OpenAI function-calling 格式
const response = await llmClient.call(messages, schemas);

if (response.tool_calls) {
  for (const call of response.tool_calls) {
    const result = await registry.execute(
      call.function.name,
      JSON.parse(call.function.arguments),
      toolContext,
    );
    messages.push({ role: "tool", content: JSON.stringify(result), tool_call_id: call.id });
  }
}
```
