# 11 — 安全层设计

## 三层防护

```
safety/
├── preflight.ts     ← live 前置检查（阻止不完整配置执行副作用）
├── write-guard.ts   ← 写入拒绝列表（防止 LLM/工具写入敏感路径）
└── redact.ts        ← 参数脱敏（防止敏感内容泄露到日志/进程列表）
```

## preflight.ts — Live 前置检查

**何时调用**：每个 side-effect 工具执行前。

```typescript
export interface PreflightCheck {
  readonly name: string;
  readonly check: (config: RuntimeConfig) => PreflightResult;
}

export interface PreflightResult {
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly warnings: readonly string[];
}

// 内置检查
const CHECKS: PreflightCheck[] = [
  {
    name: "base-token",
    check: (c) => ({
      ok: !!c.feishuTargets.baseToken,
      missing: c.feishuTargets.baseToken ? [] : ["PILOTFLOW_BASE_TOKEN"],
      warnings: [],
    }),
  },
  {
    name: "base-table",
    check: (c) => ({
      ok: !!c.feishuTargets.baseTableId,
      missing: c.feishuTargets.baseTableId ? [] : ["PILOTFLOW_BASE_TABLE_ID"],
      warnings: [],
    }),
  },
  {
    name: "chat-id",
    check: (c) => ({
      ok: !!c.feishuTargets.chatId,
      missing: c.feishuTargets.chatId ? [] : ["PILOTFLOW_TEST_CHAT_ID"],
      warnings: [],
    }),
  },
  {
    name: "tasklist-id",
    check: (c) => ({
      ok: !!c.feishuTargets.tasklistId,
      missing: c.feishuTargets.tasklistId ? [] : ["PILOTFLOW_TASKLIST_ID"],
      warnings: [],
    }),
  },
];

export function preflight(config: RuntimeConfig, toolName?: string): PreflightResult {
  if (config.mode === "dry-run") return { ok: true, missing: [], warnings: [] };

  // task.create 额外需要 tasklistId
  const checks = toolName === "task.create"
    ? CHECKS
    : CHECKS.filter((c) => c.name !== "tasklist-id");

  const allMissing: string[] = [];
  const allWarnings: string[] = [];

  for (const check of checks) {
    const result = check.check(config);
    allMissing.push(...result.missing);
    allWarnings.push(...result.warnings);
  }

  return { ok: allMissing.length === 0, missing: allMissing, warnings: allWarnings };
}
```

## write-guard.ts — 写入拒绝列表

**来源**：hermes `file_safety.py` 模式。

```typescript
import { resolve, normalize } from "node:path";

// 精确路径拒绝
const DENIED_PATHS = new Set([
  ".env", ".env.local", ".env.production",
  ".netrc", ".npmrc",
  "/etc/sudoers",
]);

// 前缀拒绝
const DENIED_PREFIXES = [
  ".ssh/", ".aws/", ".gnupg/", ".kube/", ".docker/",
  ".config/gh/", ".config/gcloud/",
  "/etc/", "/root/",
];

export function isPathSafe(inputPath: string): boolean {
  // 先 normalize + resolve 消除 .. 和 URL 编码绕过
  const resolved = resolve(normalize(inputPath)).replace(/\\/g, "/").toLowerCase();

  // 精确匹配
  const basename = resolved.split("/").pop() || "";
  if (DENIED_PATHS.has(basename)) return false;

  // 前缀匹配（在 resolved 路径上检查）
  for (const prefix of DENIED_PREFIXES) {
    if (resolved.includes(prefix)) return false;
  }

  return true;
}

export function assertPathSafe(path: string): void {
  if (!isPathSafe(path)) {
    throw new PilotFlowError(`Blocked write to sensitive path: ${path}`, "WRITE_GUARD_BLOCKED");
  }
}
```

## redact.ts — 参数脱敏

**问题**：旧 `redactArgs` 只脱敏 `--base-token`、`--chat-id`、`--user-id`，遗漏了 `--content` 和 `--text`。

```typescript
// 需要脱敏的参数 key
const SENSITIVE_KEYS = new Set([
  "--base-token",
  "--chat-id",
  "--user-id",
  "--content",
  "--text",
  "--api-key",
  "--token",
  "--secret",
  "--password",
]);

export function redactArgs(args: readonly string[]): readonly string[] {
  const result: string[] = [];
  let redactNext = false;

  for (const arg of args) {
    if (redactNext) {
      result.push("[REDACTED]");
      redactNext = false;
      continue;
    }

    // --key=value 格式
    const eqIndex = arg.indexOf("=");
    if (eqIndex > 0) {
      const key = arg.slice(0, eqIndex).toLowerCase();
      if (SENSITIVE_KEYS.has(key)) {
        result.push(`${key}=[REDACTED]`);
        continue;
      }
    }

    // --key value 格式
    if (SENSITIVE_KEYS.has(arg.toLowerCase())) {
      result.push(arg);
      redactNext = true;
      continue;
    }

    result.push(arg);
  }

  return result;
}

// 脱敏单个值（用于 JSONL 日志）
export function redactValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.has(`--${key}`) || SENSITIVE_KEYS.has(key)) {
    return "[REDACTED]";
  }
  return value;
}
```

## 集成点

| 模块 | 使用的安全层 |
|------|------------|
| `orchestrator.ts` | `preflight()` 在每个 side-effect 工具前检查 |
| `command-runner.ts` | `redactArgs()` 用于日志输出 |
| `jsonl-recorder.ts` | 事件中含 content 字段时自动 redact |
| `agent/loop.ts` | LLM 返回的 tool args 在记录前 redact |
| review-packs | `write-guard` 不直接使用，但 pack 输出路径检查 |
