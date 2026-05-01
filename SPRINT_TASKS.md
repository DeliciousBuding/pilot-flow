# PilotFlow Sprint 自驱任务

> 本文件是 loop 自驱系统的任务源。每 30 分钟由自动 agent 读取并执行。
> 执行后更新本文件的状态。

## 工作目录

- Worktree：`D:\Code\LarkProject\pilot-flow\.worktrees\sprint-main`
- 参考材料：`D:\Code\LarkProject\docs\research\`、`D:\Code\LarkProject\materials\`
- 竞品策略：`D:\Code\LarkProject\materials\05_competitors_agent_harness\18_competitive_strategy_report.md`

## 优先级规则

1. 有 blocker 的任务优先（如测试失败、构建报错）
2. 评分标准缺口优先（Demo > AI深度 > 差异化）
3. 代码和文档并行推进
4. 每轮至少完成一个可验证的产出

## 任务队列

### P0：Demo 可演示（评分维度1，50%）

- [x] **T01** 录屏脚本：更新演示脚本，控制在 6-8 分钟
  - 路径：`pilot-flow/docs/demo/DEMO_PLAYBOOK.md`
  - 产出：更新后的演示脚本，含失败路径、时间标注、最新命令

- [x] **T02** dry-run 完整验证：确保 `npm run pilot:run -- --dry-run` 全流程通过
  - 产出：status completed, 16 artifacts, run-63881b28

- [x] **T03** Flight Recorder 截图：生成 HTML 视图并截图
  - 命令：`npm run pilot:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html`
  - 产出：HTML 文件已生成，55 events, 16 artifacts

### P1：AI 技术深度（评分维度3，25%）

- [x] **T04** 架构文档增强：在 `docs/ARCHITECTURE.md` 中补充结构化提取引擎、工具编排、幂等保护、错误处理
  - 产出：ARCHITECTURE.md 从 220 行扩展到 368 行，含 4 个新章节

- [x] **T05** 测试覆盖率：确保核心模块测试通过
  - 命令：`npm test`，`npm run test:ts`
  - 产出：154 tests pass, 0 fail; pilot:check clean

### P2：差异化与可复用（评分维度2，25%）

- [x] **T06** 可复用性文档：在 docs/DEVELOPMENT.md 中补充扩展指南
  - 产出：新增 "Extending PilotFlow" 章节，含工具接入步骤、自定义规划器、团队复用指南

- [x] **T07** 竞品策略融入：在 PRODUCT_SPEC.md 和 PROJECT_BRIEF.md 中补充竞品定位
  - 产出：PRODUCT_SPEC.md 新增 "Competitive Positioning" 章节，PROJECT_BRIEF.md 新增 "Why Not OpenClaw" 对比表

### P3：工程质量

- [x] **T08** 代码清洁：扫描并清理 TODO、console.log、临时注释
  - 产出：0 TODO/FIXME，console.log 仅在 CLI 入口（正常）

- [x] **T09** TypeScript 编译检查：`npx tsc --noEmit` 无报错
  - 产出：编译通过（pilot:check 包含 tsc --noEmit）

## 执行日志

### 轮次 1（2026-05-02 00:35）
- 完成：T02（dry-run 通过，16 产物）、T03（Flight Recorder HTML 生成）、T05（154 测试全通过）、T09（TS 编译通过）

### 轮次 2（2026-05-02 00:45）
- 完成：T01（演示脚本更新，含失败路径和时间标注）、T04（架构文档 220→368 行，新增提取引擎/编排/幂等/错误处理）、T06（可复用性文档）、T07（竞品策略融入 PRODUCT_SPEC 和 PROJECT_BRIEF）、T08（代码清洁验证）
- 全部 9 个任务已完成

### P4：新一轮（2026-05-02 00:55）

- [ ] **T10** LLM Planner 集成：将 TS Agent loop 接入真实 LLM 规划
  - 当前：deterministic prototype planner，用正则提取字段
  - 目标：Agent loop 能通过 LLM 理解意图并生成计划
  - 路径：`src/llm/`（已有 OpenAI-compatible client）、`src/agent/`（已有 Agent loop）
  - 产出：LLM planner 可通过 `npm run pilot:agent-smoke` 验证

- [ ] **T11** 答辩 Q&A 文档：编写评委可能问的问题和标准回答
  - 路径：`docs/demo/QA_GUIDE.md`
  - 覆盖：OpenClaw 对比、AI 技术深度、可复用性、Demo 稳定性
  - 产出：Q&A 文档

- [ ] **T12** 测试增强：为 TS 核心模块补充测试
  - 覆盖：gateway event handling、session persistence、card callback parsing
  - 产出：新增测试用例

- [ ] **T13** Demo 截图清单：列出需要截图的 5 个关键画面
  - 路径：`docs/demo/SCREENSHOT_CHECKLIST.md`
  - 产出：截图清单文档
