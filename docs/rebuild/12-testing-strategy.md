# 12 - Testing Strategy

## 框架选型：node:test

**选择 Node.js 20 内置 `node:test`**，不引入 vitest/jest/mocha。

理由：
- 零依赖（符合项目哲学）
- 内置于 Node.js 20+，无安装成本
- 支持 `describe/it/test`、`beforeEach/afterEach`
- 支持 `--watch` 模式
- 支持 `--test-name-pattern` 过滤
- 输出格式清晰

## 测试目录结构

```
tests/
├── helpers/
│   ├── memory-recorder.ts    ← 内存版 Recorder（测试用）
│   ├── mock-registry.ts      ← 预注册工具的测试用 registry
│   ├── fixtures.ts            ← 测试数据 fixtures
│   └── hermetic.ts            ← hermes 模式：环境变量清理
│
├── shared/
│   ├── parse-args.test.ts
│   ├── markdown.test.ts
│   ├── path-utils.test.ts
│   └── id.test.ts
│
├── domain/
│   ├── plan.test.ts           ← 确定性 planner + 验证器 + LLM planner
│   ├── risk.test.ts           ← 风险检测
│   ├── project-brief.test.ts
│   └── task-description.test.ts
│
├── orchestrator/
│   ├── orchestrator.test.ts   ← 主编排器 happy-path + 错误路径
│   ├── duplicate-guard.test.ts ← 竞态测试 + TTL 过期
│   ├── confirmation-gate.test.ts
│   ├── tool-sequence.test.ts
│   ├── card-callback.test.ts
│   ├── flight-plan-card.test.ts
│   ├── risk-decision-card.test.ts
│   ├── entry-message.test.ts
│   ├── summary-builder.test.ts
│   ├── project-state.test.ts
│   ├── contact-resolver.test.ts
│   └── assignee-resolver.test.ts
│
├── tools/
│   ├── registry.test.ts       ← 注册/查找/执行/preflight
│   └── feishu/
│       ├── doc-create.test.ts
│       ├── base-write.test.ts
│       ├── task-create.test.ts
│       ├── im-send.test.ts
│       └── card-send.test.ts
│
├── infrastructure/
│   ├── command-runner.test.ts ← 超时、exit code、JSON 解析
│   ├── jsonl-recorder.test.ts ← 写入、目录创建、并发
│   └── flight-recorder.test.ts ← 坏行容错
│
├── llm/
│   ├── client.test.ts         ← fetch mock、超时、错误分类
│   ├── error-classifier.test.ts ← 状态码映射
│   └── retry.test.ts          ← 退避计算、最大重试
│
├── agent/
│   ├── loop.test.ts           ← one tool-call round-trip, max iteration guard
│   └── session-manager.test.ts
│
├── gateway/
│   └── feishu/
│       ├── mention-gate.test.ts
│       ├── dedupe.test.ts
│       ├── chat-queue.test.ts
│       └── webhook-server.test.ts
│
├── safety/
│   ├── preflight.test.ts
│   ├── write-guard.test.ts
│   └── redact.test.ts
│
└── config/
    └── runtime-config.test.ts
```

## helpers/memory-recorder.ts

```typescript
import type { Recorder, RecorderEvent } from "../../src/types/recorder.js";

export class MemoryRecorder implements Recorder {
  public events: RecorderEvent[] = [];

  record(event: RecorderEvent): void {
    this.events.push({ ...event, timestamp: event.timestamp || new Date().toISOString() });
  }

  close(): void {
    this.events = [];
  }

  // 测试辅助
  ofType(type: string): readonly RecorderEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  hasEvent(type: string): boolean {
    return this.events.some((e) => e.type === type);
  }

  last(): RecorderEvent | undefined {
    return this.events[this.events.length - 1];
  }
}
```

## helpers/hermetic.ts

**来源**：hermes `tests/conftest.py` 模式。

```typescript
// 测试前清理环境变量，防止开发者 key 泄漏
const CREDENTIAL_PATTERNS = [
  /API_KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i,
  /CREDENTIAL/i, /AUTH/i, /OPENAI/i, /ANTHROPIC/i,
];

const SAVED_ENV: Record<string, string | undefined> = {};

export function hermeticSetup(): void {
  for (const key of Object.keys(SAVED_ENV)) delete SAVED_ENV[key];

  for (const key of Object.keys(process.env)) {
    if (CREDENTIAL_PATTERNS.some((p) => p.test(key))) {
      SAVED_ENV[key] = process.env[key];
      delete process.env[key];
    }
  }

  // 固定确定性环境
  process.env.TZ = "UTC";
  process.env.LANG = "C";
}

export function hermeticTeardown(): void {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  for (const key of Object.keys(SAVED_ENV)) delete SAVED_ENV[key];
}
```

## package.json test scripts

```json
{
  "scripts": {
    "build": "tsc",
    "build:check": "tsc --noEmit",
    "test": "tsc && node --test dist/tests/",
    "test:core": "tsc && node --test dist/tests/shared/ dist/tests/domain/ dist/tests/orchestrator/",
    "test:tools": "tsc && node --test dist/tests/tools/",
    "test:llm": "tsc && node --test dist/tests/llm/",
    "test:one": "tsc && node --test",
    "test:watch": "node --watch --test dist/tests/"
  }
}
```

注意：
- `node --test dist/tests/` 让 Node.js 递归发现 `*.test.js`，跨平台兼容（不依赖 shell glob）
- `--watch` 是 Node 20 内置功能，单命令跨平台，不依赖 `&` 并行
- 编译后路径为 `dist/tests/`（因为 tsconfig 无 rootDir）

## 测试原则

1. **每个公共函数至少一个测试** — happy-path 必须覆盖
2. **每个错误类型至少一个测试** — 确认错误正确抛出
3. **边界条件** — 空数组、undefined、超长字符串
4. **不 mock 内部实现** — 只 mock 外部依赖（lark-cli、fetch）
5. **测试隔离** — 每个测试独立，不依赖执行顺序
6. **hermetic** — 无真实 API key、无文件系统副作用

## 关键测试场景

### orchestrator.test.ts — 必须覆盖的场景
1. Happy-path：完整 plan → 10 步执行 → 成功
2. 无效 plan → needs_clarification
3. Duplicate guard 阻止 → blocked
4. Guard TTL 过期 → 允许重新运行
5. 可选工具失败 → 降级继续
6. 必需工具失败 → 停止 + run.failed
7. autoConfirm=false → 等待确认

### duplicate-guard.test.ts — 竞态测试
1. 顺序调用 → 第二次被阻止
2. 并发调用（Promise.all）→ 只有一个成功
3. Guard TTL 过期 → 两个都成功
4. 进程崩溃模拟 → guard 条目有 TTL 可过期

### command-runner.test.ts — 必须覆盖的场景
1. 成功执行 → 返回 stdout + json
2. 非零退出 → CommandFailedError
3. 超时 → CommandTimeoutError
4. JSON 输出解析失败 → 返回 null（不崩溃）
5. stdout 超限 → 截断
