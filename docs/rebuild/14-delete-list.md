# 14 - Old Code Removal Plan

> 重建完成后删除。删除前确保新代码测试全部通过。

## 整个删除的目录

| 旧路径 | 新替代 | 原因 |
|--------|--------|------|
| `src/core/` 整个目录 | `src/orchestrator/` + `src/domain/` | 拆分 God Object |
| `src/runtime/` 整个目录 | `src/tools/registry.ts` | 替换为工具注册表 |
| `src/adapters/` 整个目录 | `src/infrastructure/command-runner.ts` | 合并 |

Do not delete `src/interfaces/` as a directory. The new product gateway lives in `src/gateway/feishu/`, while human-operated CLI entrypoints continue to live in `src/interfaces/cli/`.

## 逐文件删除

| 旧文件 | 新替代 | 原因 |
|--------|--------|------|
| `src/core/orchestrator/run-orchestrator.js` | `src/orchestrator/orchestrator.ts` + 11 个子模块 | 拆分 God Object |
| `src/core/planner/project-init-planner.js` | `src/domain/plan.ts` | 合并 planner + validator |
| `src/core/planner/plan-validator.js` | `src/domain/plan.ts` | 合并 |
| `src/core/orchestrator/risk-detector.js` | `src/domain/risk.ts` | 提取业务逻辑 |
| `src/core/orchestrator/risk-decision-card.js` | `src/orchestrator/risk-decision-card.ts` | 迁移 |
| `src/core/orchestrator/flight-plan-card.js` | `src/orchestrator/flight-plan-card.ts` | 迁移 |
| `src/core/orchestrator/entry-message-builder.js` | `src/orchestrator/entry-message.ts` | 迁移 |
| `src/core/orchestrator/summary-builder.js` | `src/orchestrator/summary-builder.ts` | 迁移 |
| `src/core/orchestrator/project-state-builder.js` | `src/orchestrator/project-state.ts` | 迁移 |
| `src/core/orchestrator/contact-owner-resolver.js` | `src/orchestrator/contact-resolver.ts` | 迁移 |
| `src/core/orchestrator/task-assignee-resolver.js` | `src/orchestrator/assignee-resolver.ts` | 迁移 |
| `src/core/orchestrator/duplicate-run-guard.js` | `src/orchestrator/duplicate-guard.ts` | 修复竞态+TTL |
| `src/core/orchestrator/card-callback-handler.js` | `src/orchestrator/card-callback.ts` | 迁移 |
| `src/core/recorder/jsonl-recorder.js` | `src/infrastructure/jsonl-recorder.ts` | 迁移+加固 |
| `src/core/events/card-event-listener.js` | `src/gateway/feishu/card-handler.ts` + `src/interfaces/cli/card-listener.ts` | 产品处理进入 gateway，CLI 只保留监听 wrapper |
| `src/core/events/callback-run-trigger.js` | `src/gateway/feishu/card-handler.ts` | 回调触发逻辑进入 gateway |
| `src/runtime/tool-step-runner.js` | `src/tools/registry.ts`（execute 方法） | 替换 |
| `src/tools/feishu/feishu-tool-executor.js` | `src/tools/feishu/*.ts`（9 个独立文件） | 拆分 |
| `src/tools/feishu/artifact-normalizer.js` | 合并到 `tools/registry.ts` | 消除 |
| `src/adapters/lark-cli/command-runner.js` | `src/infrastructure/command-runner.ts` | 迁移+加超时 |
| `src/config/runtime-config.js` | `src/config/runtime-config.ts` | 重写+去依赖 |
| `src/interfaces/cli/manual-trigger.js` | `src/interfaces/cli/cli-trigger.ts` | 改名 |
| `src/interfaces/cli/pilot-cli.js` | `src/interfaces/cli/pilot-cli.ts` | 迁移 |
| `src/interfaces/cli/doctor.js` | `src/interfaces/cli/doctor.ts` | 迁移+加修复提示 |
| `src/interfaces/cli/card-listener.js` | `src/interfaces/cli/card-listener.ts` | 迁移 |
| `src/interfaces/cli/flight-recorder-view.js` | `src/interfaces/cli/flight-recorder-view.ts` | 迁移+加 try/catch |
| `src/interfaces/cli/setup-feishu-targets.js` | `src/interfaces/cli/setup-feishu-targets.ts` | 迁移 |

## Review Packs（批量迁移后删除旧 .js）

| 旧文件 | 新替代 |
|--------|--------|
| `src/review-packs/demo-evidence.js` | `src/review-packs/demo-evidence.ts` |
| `src/review-packs/demo-eval.js` | `src/review-packs/demo-eval.ts` |
| `src/review-packs/demo-capture-pack.js` | `src/review-packs/demo-capture-pack.ts` |
| `src/review-packs/demo-failure-pack.js` | `src/review-packs/demo-failure-pack.ts` |
| `src/review-packs/demo-readiness-pack.js` | `src/review-packs/demo-readiness-pack.ts` |
| `src/review-packs/demo-permission-pack.js` | `src/review-packs/demo-permission-pack.ts` |
| `src/review-packs/demo-judge-pack.js` | `src/review-packs/demo-judge-pack.ts` |
| `src/review-packs/demo-callback-verification-pack.js` | `src/review-packs/demo-callback-verification-pack.ts` |
| `src/review-packs/demo-submission-pack.js` | `src/review-packs/demo-submission-pack.ts` |
| `src/review-packs/demo-delivery-index-pack.js` | `src/review-packs/demo-delivery-index-pack.ts` |
| `src/review-packs/demo-safety-audit-pack.js` | `src/review-packs/demo-safety-audit-pack.ts` |

## 测试文件（全部删除，用 tests/ 目录替代）

删除 `src/` 下所有 `*.test.js` 和 `*.test.ts` 文件（33 个）。

## scripts/ 目录

| 旧文件 | 新替代 |
|--------|--------|
| `scripts/run-tests.js` | `scripts/run-tests.ts`（改用 node:test runner） |
| `scripts/check-js.js` | 删除（不再需要 JS 语法检查） |

## 删除顺序

1. 先删测试文件（`.test.js`）— 不影响运行
2. 再删 `src/core/` — 已被 `src/orchestrator/` + `src/domain/` 替代
3. 再删 `src/runtime/` + `src/adapters/` — 已被 tools/registry + infrastructure 替代
4. 再删 `src/tools/feishu/feishu-tool-executor.js` + `artifact-normalizer.js` — 已被 6 个独立文件替代
5. 新增 `src/gateway/feishu/` 并验证 IM/card/webhook 单测
6. 再删 `src/interfaces/cli/` 中的旧 `.js` — 已被同目录 `.ts` 替代
7. 最后删 `scripts/check-js.js`

**每步删除后运行 `npm test` 确认不破坏。**

## Public Surface Synchronization

Any deletion or rename that affects commands or public paths must update, in the same commit series:

- `package.json`
- `README.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/OPERATOR_RUNBOOK.md`
- workspace `D:\Code\LarkProject\AGENTS.md`
- workspace `D:\Code\LarkProject\PERSONAL_PROGRESS.md`
