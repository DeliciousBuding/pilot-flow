# 13 - Day-by-Day Execution Plan

> 每天结束时：`npx tsc --noEmit` 通过 + 所有测试绿色 + git commit
> 预计总工时：32-40 小时。Agent 编程可以提速，但 Feishu callback、安全边界和迁移验证不应压缩成口头完成。

## Execution Status

- [x] Day 0 complete: contract notes recorded in `CONTRACT_NOTES.md`.
- [x] Day 1 complete: strict TypeScript foundation, shared utilities, safety, infrastructure, runtime config, and TS test bridge are implemented.
- [x] Day 2 complete: domain modules, `ToolRegistry`, tool idempotency, and 9 Feishu tool definitions are implemented in commit `4353182`.
- [x] Day 3 complete: `src/orchestrator/` split is implemented with confirmation gate, deterministic sequence, duplicate guard, card/message/state helpers, callback bridge, and tests while keeping the JS prototype runnable.
- [x] Day 4 complete: Feishu gateway boundary, OpenAI-compatible LLM client, retry/error classifier, Agent loop, and session manager are implemented without deleting the JS public CLI path.
- [x] Day 5 complete: CLI migration bridge, public command hardening, and a dry-run Feishu gateway smoke path are implemented without replacing the JS live path.
- [ ] Day 6 next: live-guarded TS project-init bridge and old-runtime removal decision.

## Day 0：合同核验 + 迁移闸门（~2 小时）

先锁住外部合同，再开始重写。产物写入 `docs/rebuild/CONTRACT_NOTES.md` 或对应实现注释。

- `lark-cli docs +create --api-version v2 --help`：确认 `--content @file` / `--content -` / `--doc-format markdown`。
- `lark-cli event +subscribe --help`：确认 WebSocket NDJSON 事件接收作为第一事件来源。
- 飞书后台 callback 配置：确认 `card.action.trigger` 的实际投递形态、verification token、encrypt key、是否启用加密。
- OpenAI-compatible provider：只用 mock fetch 验证工具调用格式；不要求真实模型在线成功作为重构闸门。
- 迁移闸门：旧 JS prototype 在新 TS path 通过前保留，不删除可运行入口。

## Day 1：脚手架 + 类型 + 基础设施（~4 小时）

### 1.1 安装 TypeScript（15 分钟）

```bash
cd D:\Code\LarkProject\pilot-flow
npm install -D typescript
```

### 1.2 创建 tsconfig.json（15 分钟）

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

注意：不设 `rootDir`，让 tsc 自动推断为 `"."`。输出路径为 `dist/src/...` 和 `dist/tests/...`。严格模式从第一天开始；如需临时放宽，用 `// @ts-expect-error` 局部抑制，不全局关闭。

### 1.3 创建 src/types/ 全部类型文件（30 分钟）

按 [05-type-definitions.md](05-type-definitions.md) 创建 8 个文件：
- `src/types/plan.ts`
- `src/types/artifact.ts`
- `src/types/recorder.ts`
- `src/types/tool.ts`
- `src/types/session.ts`
- `src/types/feishu.ts`
- `src/types/config.ts`
- `src/types/common.ts`

验证：`npx tsc --noEmit` 通过。

### 1.4 创建 src/shared/（45 分钟）

按 [06-module-specs.md](06-module-specs.md) 创建：
- `src/shared/parse-args.ts` — 从旧代码中提取，统一行为
- `src/shared/markdown.ts` — `markdownBlock`, `divider`, `escapeHtml`, `formatArtifactTarget`
- `src/shared/path-utils.ts` — `getPath`, `resolveExecutable`
- `src/shared/array-utils.ts` — `unique`, `chunk`, `firstBy`
- `src/shared/id.ts` — `generateRunId`, `buildDedupeKey`, `buildIdempotencyKey`

### 1.5 创建 src/safety/（30 分钟）

- `src/safety/preflight.ts`
- `src/safety/write-guard.ts`
- `src/safety/redact.ts`

### 1.6 创建 src/infrastructure/（45 分钟）

- `src/infrastructure/command-runner.ts` — 从旧 `command-runner.js` 重写，加超时 + 错误分类
- `src/infrastructure/jsonl-recorder.ts` — 从旧 `jsonl-recorder.js` 重写，实现 `Recorder` 接口
- `src/infrastructure/flight-recorder.ts` — 从旧 `flight-recorder-view.js` 提取模型构建，加 try/catch

### 1.7 创建 src/config/runtime-config.ts（15 分钟）

从旧 `runtime-config.js` 重写，不再 import `duplicate-run-guard`。

### 1.8 创建 tests/helpers/（15 分钟）

- `tests/helpers/memory-recorder.ts`
- `tests/helpers/hermetic.ts`
- `tests/helpers/fixtures.ts`

### 1.9 更新 .gitignore（5 分钟）

追加：
```
dist/
*.tsbuildinfo
```

### 1.10 验证（15 分钟）

```bash
npx tsc --noEmit     # 类型检查通过
npx tsc              # 编译成功
```

**Day 1 完成标志**：types + shared + safety + infrastructure + config 全部编译通过。

---

## Day 2：Domain + Tools 注册表（~4 小时）

### 2.1 创建 src/domain/（1 小时）

- `src/domain/plan.ts` — 合并旧 `project-init-planner.js` + `plan-validator.js`
  - `DeterministicPlanner` 类
  - `validatePlan()` 函数
  - `buildFallbackPlan()` 函数
  - `parseDemoInput()` — 正则支持中文
- `src/domain/risk.ts` — 从旧 `risk-detector.js` + `risk-decision-card.js` 的数据逻辑提取
- `src/domain/project-brief.ts` — 从旧 `project-brief.js` 重写
- `src/domain/task-description.ts` — 从旧 `task-description.js` 重写

### 2.2 创建 src/tools/registry.ts（30 分钟）

按 [07-tool-registry.md](07-tool-registry.md) 实现 `ToolRegistry` 类。

### 2.3 创建 src/tools/feishu/（1.5 小时）

从旧 `feishu-tool-executor.js` 拆分为 9 个独立文件：
- `src/tools/feishu/doc-create.ts`
- `src/tools/feishu/base-write.ts`
- `src/tools/feishu/task-create.ts`
- `src/tools/feishu/im-send.ts`
- `src/tools/feishu/entry-send.ts`
- `src/tools/feishu/entry-pin.ts`
- `src/tools/feishu/card-send.ts`
- `src/tools/feishu/announcement-update.ts`
- `src/tools/feishu/contact-search.ts`
- `src/tools/feishu/index.ts` — 导入所有 9 个工具触发自注册

每个文件约 40-80 行，实现 `ToolDefinition` 接口。每个工具内联自己的 artifact 归一化逻辑（参见 `07-tool-registry.md` 归一化规则表）。

### 2.4 创建 src/tools/idempotency.ts（15 分钟）

从旧 `feishu-tool-executor.js` 提取幂等键逻辑。

### 2.5 编写 domain 和 tools 测试（45 分钟）

- `tests/domain/plan.test.ts` — 确定性 planner + 验证器
- `tests/domain/risk.test.ts`
- `tests/tools/registry.test.ts` — 注册/查找/执行/preflight

### 2.6 验证（15 分钟）

```bash
npx tsc --noEmit
npm test
```

**Day 2 完成标志**：domain + tools 全部编译通过，测试绿色。

---

## Day 3：Orchestrator 重构（~4 小时）

### 3.1 创建 orchestrator 子模块（2 小时）

从旧 `run-orchestrator.js`（252 行）拆分为：
- `src/orchestrator/orchestrator.ts` — 主编排器（~80 行）
- `src/orchestrator/confirmation-gate.ts` — 确认门控
- `src/orchestrator/tool-sequence.ts` — 确定性工具序列
- `src/orchestrator/duplicate-guard.ts` — 去重守卫（修复竞态 + TTL）
- `src/orchestrator/entry-message.ts`
- `src/orchestrator/flight-plan-card.ts`
- `src/orchestrator/risk-decision-card.ts`
- `src/orchestrator/summary-builder.ts`
- `src/orchestrator/project-state.ts`
- `src/orchestrator/contact-resolver.ts`
- `src/orchestrator/assignee-resolver.ts`
- `src/orchestrator/card-callback.ts`

### 3.2 编写 orchestrator 测试（1.5 小时）

重点：
- `orchestrator.test.ts` — happy-path + 错误路径（至少 5 个场景）
- `duplicate-guard.test.ts` — 竞态测试
- `tool-sequence.test.ts`

### 3.3 验证（30 分钟）

```bash
npx tsc --noEmit
npm test
# 手动 dry-run 测试
node dist/src/interfaces/cli/cli-trigger.js --input fixtures/sample-input.txt --dry-run
```

**Day 3 完成标志**：orchestrator 拆分完成，dry-run 测试通过。

---

## Day 4：Gateway + LLM + Agent 循环（~6 小时）

### 4.1 创建 src/llm/（1 小时）

按 [09-llm-integration.md](09-llm-integration.md) 创建：
- `src/llm/client.ts`
- `src/llm/error-classifier.ts`
- `src/llm/retry.ts`

### 4.2 创建 src/agent/（1 小时）

按 [08-agent-loop.md](08-agent-loop.md) 创建：
- `src/agent/loop.ts`
- `src/agent/session-manager.ts`

### 4.3 创建 src/gateway/feishu/（2 小时）

按 [15-feishu-integration.md](15-feishu-integration.md) 创建：
- `src/gateway/feishu/event-source.ts`
- `src/gateway/feishu/lark-cli-source.ts`
- `src/gateway/feishu/webhook-server.ts`（optional transport，先写 contract/test stub）
- `src/gateway/feishu/message-handler.ts`
- `src/gateway/feishu/card-handler.ts`
- `src/gateway/feishu/mention-gate.ts`
- `src/gateway/feishu/dedupe.ts`
- `src/gateway/feishu/chat-queue.ts`

### 4.4 迁移 src/interfaces/cli/（1 小时）

从旧 `src/interfaces/cli/` 重写：
- `src/interfaces/cli/cli-trigger.ts` — 改名自 `manual-trigger.ts`
- `src/interfaces/cli/pilot-cli.ts` — 子命令路由
- `src/interfaces/cli/doctor.ts` — 加修复提示
- `src/interfaces/cli/card-listener.ts` — 加超时
- `src/interfaces/cli/flight-recorder-view.ts` — 加 try/catch
- `src/interfaces/cli/setup-feishu-targets.ts`

### 4.5 创建 .env.example（15 分钟）

补全所有 LLM 配置项。

### 4.6 编写 gateway、agent 和 llm 测试（1 小时）

- `tests/llm/error-classifier.test.ts`
- `tests/llm/retry.test.ts`
- `tests/llm/client.test.ts`
- `tests/agent/loop.test.ts`
- `tests/gateway/feishu/mention-gate.test.ts`
- `tests/gateway/feishu/dedupe.test.ts`
- `tests/gateway/feishu/lark-cli-source.test.ts`
- `tests/gateway/feishu/webhook-server.test.ts`

### 4.7 验证（15 分钟）

```bash
npx tsc --noEmit
npm test
node dist/src/interfaces/cli/pilot-cli.js doctor
```

**Day 4 完成标志**：CLI 入口可运行，OpenAI-compatible LLM client 有 mock fetch 测试，Agent loop 可完成至少一次 tool call round-trip，gateway 的 mention/dedupe/webhook verification 单测绿色。

当前实现不要求真实模型在线成功，不要求公网 webhook 上线，也不替换现有 JS CLI 产品入口。已完成：

- `src/llm/client.ts`：OpenAI-compatible `/v1/chat/completions` client，支持 tools、tool calls、usage、finish reason、超时和错误分类。
- `src/llm/error-classifier.ts` / `src/llm/retry.ts`：Hermes-style 恢复提示形状，包括 retry、fallback、rotate、compress hints。
- `src/agent/loop.ts`：while-next Agent loop，使用 `ToolRegistry.getSchemas()` / `ToolRegistry.execute()`，工具输出加围栏，live side-effect 工具确认失败时 fail-closed。
- `src/agent/session-manager.ts`：Map + TTL + LRU 上限的轻量 session manager。
- `src/gateway/feishu/`：`lark-cli event +subscribe` NDJSON 解析、mention gate、event dedupe、per-chat queue、message/card handlers、webhook signature/token contract helpers。
- `tests/llm/`、`tests/agent/`、`tests/gateway/feishu/`：新增 29 项 TS 测试，覆盖 mock fetch、工具调用、畸形 JSON、确认拒绝、live batch preflight、retry、session 裁剪、事件解析、稳定业务去重、队列和 webhook contract。

---

## Day 5：Review Packs + 测试 + 清理 + 文档（~3 小时）

### 5.1 创建 src/review-packs/pack-utils.ts（30 分钟）

提取 11 个 pack 共享的函数：
- `parseArgs()` — 调用 `shared/parse-args`
- `escapeCell()`
- `readOptionalText()`
- `readJsonlOptional()` — 加 try/catch
- `isMainModule()`
- `summarizeError()`

### 5.2 迁移 review packs（45 分钟）

批量处理 — 11 个 pack 模式相同：
- 重命名 `.js` → `.ts`
- 导入 `pack-utils.ts` 替换本地重复函数
- 加类型标注

### 5.3 移动测试到 tests/ 目录（30 分钟）

- 旧 `.test.js` 文件 → `tests/` 对应目录
- 裸 `assert` → `node:test` 的 `describe/it/expect`
- 用 `MemoryRecorder` 替代真实 `JsonlRecorder`

### 5.4 删除旧文件（15 分钟）

按 [14-delete-list.md](14-delete-list.md) 清理。

### 5.5 更新 package.json scripts（15 分钟）

更新所有 `scripts` 指向 `dist/` 目录。

### 5.6 更新 README + docs（15 分钟）

- 更新 README 的运行命令
- 更新 `docs/ARCHITECTURE.md`
- 更新 `docs/PROJECT_STRUCTURE.md`

### 5.7 最终验证（15 分钟）

```bash
npx tsc --noEmit           # 类型检查
npm test                    # 全部测试
npm run pilot:doctor        # 健康检查
npm run pilot:demo          # dry-run demo
```

**Day 5 完成标志**：全量编译通过，所有测试绿色，旧文件清理完毕。

当前 Day 5 采用更保守的产品化迁移口径：不在 TS live path 完整验证前删除旧 JS runtime。已完成：

- `src/interfaces/cli/agent-smoke.ts`：TS gateway/Agent dry-run smoke CLI。
- `npm run pilot:agent-smoke`：可直接运行 mock Feishu event -> mention gate -> session -> Agent loop -> ToolRegistry -> dry-run Feishu tools。
- `tests/interfaces/agent-smoke.test.ts`：覆盖默认输入、显式 lark-cli NDJSON event line 和未 @bot 的群消息过滤。
- README、Operator Runbook、Architecture、Project Structure、Roadmap 和 rebuild docs 已同步新命令和 Day 5 状态。
