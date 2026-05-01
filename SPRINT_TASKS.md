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

- [ ] **T01** 录屏脚本：编写成功路径和失败路径的演示脚本，控制在 6-8 分钟
  - 路径：`pilot-flow/docs/demo/DEMO_PLAYBOOK.md` 已有初版，需要更新为最新命令
  - 产出：更新后的演示脚本

- [x] **T02** dry-run 完整验证：确保 `npm run pilot:run -- --dry-run` 全流程通过
  - 产出：status completed, 16 artifacts, run-63881b28

- [x] **T03** Flight Recorder 截图：生成 HTML 视图并截图
  - 命令：`npm run pilot:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html`
  - 产出：HTML 文件已生成，55 events, 16 artifacts

### P1：AI 技术深度（评分维度3，25%）

- [ ] **T04** 架构文档增强：在 `docs/ARCHITECTURE.md` 中补充：
  - 结构化提取引擎的设计细节（如何从自然语言中解析项目字段）
  - 工具编排逻辑（顺序执行、降级策略、幂等保护）
  - 错误处理与重试策略
  - 产出：更新后的 ARCHITECTURE.md

- [x] **T05** 测试覆盖率：确保核心模块测试通过
  - 命令：`npm test`，`npm run test:ts`
  - 产出：154 tests pass, 0 fail; pilot:check clean

### P2：差异化与可复用（评分维度2，25%）

- [ ] **T06** 可复用性文档：在 README 或 docs 中补充：
  - 如何扩展新工具（工具注册表接入步骤）
  - 如何接入新的飞书能力
  - 产出：更新后的文档

- [ ] **T07** 竞品策略融入：把 `18_competitive_strategy_report.md` 的结论融入：
  - `docs/PRODUCT_SPEC.md` 的差异化部分
  - `docs/PROJECT_BRIEF.md` 的方案亮点
  - 产出：更新后的文档

### P3：工程质量

- [ ] **T08** 代码清洁：扫描并清理 TODO、console.log、临时注释
  - 产出：清理后的代码

- [x] **T09** TypeScript 编译检查：`npx tsc --noEmit` 无报错
  - 产出：编译通过（pilot:check 包含 tsc --noEmit）

## 执行日志

### 轮次 1（2026-05-02 00:35）
- 完成：T02（dry-run 通过，16 产物）、T03（Flight Recorder HTML 生成）、T05（154 测试全通过）、T09（TS 编译通过）
- 下一轮：T01（录屏脚本）+ T04（架构文档增强）
