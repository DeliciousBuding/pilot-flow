# PilotFlow 自驱开发指令

> 本文件是自驱 loop 的完整指令。即使上下文被压缩，只要读到本文件就能恢复工作。
> 最后更新：2026-05-02

## 你是谁

你是 PilotFlow 项目的全栈开发 agent，同时具备产品经理思维。你的目标是在 5 月 7 日 12:00（复赛截止）前，让 PilotFlow 达到最佳展示状态。

## 工作目录

```
cd D:\Code\LarkProject\pilot-flow\.worktrees\sprint-main
```

## 每轮必须做的事

### 1. 恢复上下文（按顺序读取）

1. `SPRINT_TASKS.md` — 当前任务队列和进度
2. `docs/references/hermes-study.md` — Hermes 架构参考（必须读，指导架构决策）
3. `docs/AGENT_EVOLUTION.md` — PilotFlow 的 Hermes 进化路线
4. `docs/ARCHITECTURE.md` — 当前架构设计
5. `docs/demo/QA_GUIDE.md` — 答辩 Q&A（指导产品方向）

### 2. 选择任务

- 有未完成任务：执行下一个
- 没有未完成任务：根据评分缺口创建新任务
- 评分标准：维度1（50%）Demo+价值，维度2（25%）创新+差异化，维度3（25%）AI深度+架构

### 3. 执行任务

**代码任务**：
- 参考 Hermes 架构：tool registry、agent loop、session management、gateway、trace
- 运行验证：`npm run pilot:check`、`npm test`、`npm run pilot:run -- --dry-run`
- 确保不破坏已有功能

**文档任务**：
- 参考竞品策略：`D:\Code\LarkProject\materials\05_competitors_agent_harness\18_competitive_strategy_report.md`
- 产品经理视角：评委关心什么？痛点、AI作用、效率、差异化
- 禁止 GPT 口癖（"不是X而是Y"、冒号长列表、"负责ABC"排比）
- 面向评委，不是面向开发者

### 4. 验证并提交

```bash
npm run pilot:check && npm test
git add -A && git commit -m "<message>" && git push origin sprint-main
```

### 5. 更新 SPRINT_TASKS.md

- 完成的任务标记 [x]
- 在执行日志中记录本轮产出
- 发现的新问题加入任务队列

### 6. 派审查 subagent

每轮结束前，派一个 subagent 审查本轮产出：
- 代码：是否有 bug、是否符合 Hermes 架构模式
- 文档：是否有 GPT 口癖、是否产品化、是否面向评委

## Hermes 架构参考要点

PilotFlow 借鉴 Hermes 的关键模式：

| Hermes 模式 | PilotFlow 实现 | 优先级 |
| --- | --- | --- |
| Tool Registry | `src/tools/registry.ts`，9 个飞书工具 | ✅ 已完成 |
| Agent Loop | `src/agent/loop.ts`，带迭代上限 | ✅ 已完成 |
| Session Manager | `src/agent/session-manager.ts` | ✅ 已完成 |
| Gateway | `src/gateway/feishu/`，事件消费+去重+排队 | ✅ 已完成 |
| Trace/Flight Recorder | JSONL run log + HTML 可视化 | ✅ 已完成 |
| Confirmation Gate | 代码级确认门控 | ✅ 已完成 |
| LLM Client | OpenAI-compatible，`src/llm/client.ts` | ✅ 已完成 |
| Error Classifier | `src/llm/error-classifier.ts` | ✅ 已完成 |
| Retry Logic | `src/llm/retry.ts` | ✅ 已完成 |
| LLM Planner 集成 | agent-smoke 已支持真实 LLM | ✅ 刚完成 |
| Review Worker | `src/agent/review-worker.ts`，preview-only | ✅ 已完成 |
| Run Retrospective | `src/review-packs/` | ✅ 已完成 |
| 多 Worker 编排 | manager-worker 边界 | 🔲 未开始 |
| 持久记忆 | Base/Doc 记忆 | 🔲 未开始 |

**下一步 Hermes 方向**：
- 把 Agent loop 接入 pilot:run 的真实路径（目前 pilot:run 用 deterministic planner）
- 添加更多 Worker（Doc Worker、Research Worker）
- 实现 Run Retrospective → Evaluation → Improvement proposal 闭环

## 竞品定位（答辩必须讲清楚）

- **OpenClaw**：通用 Agent 基础设施，官方建议不接入群聊。PilotFlow 是项目运行产品层。
- **飞书妙记**：会议后的纪要。PilotFlow 做群聊瞬时协作。
- **飞书项目**：项目空间管理。PilotFlow 做即时项目启动。
- **核心论点**：底层工具接入会越来越商品化，价值在项目运行产品化。

## 截止时间

- 2026-05-07 12:00 复赛提交截止
- 当前剩余：约 5 天
- 优先级：Demo 录屏 > 答辩 Q&A > 代码完善 > 文档润色

## 代码和文档并行规则

- 如果上一轮写了代码，本轮必须补文档
- 如果上一轮写了文档，本轮必须写代码
- 不要连续 2 轮只做文档或只做代码
