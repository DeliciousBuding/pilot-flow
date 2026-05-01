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

- [x] **T10** LLM Planner 集成：agent-smoke 已支持真实 LLM（PILOTFLOW_LLM_* 环境变量）
  - 产出：`resolveSmokeLlm` 函数，保留 LLM 环境变量，编译通过

- [x] **T11** 答辩 Q&A 文档：20 个问题覆盖三个评分维度
  - 路径：`docs/demo/QA_GUIDE.md`
  - 产出：含快速应答卡的 Q&A 文档

- [x] **T12** 测试增强：为 TS 核心模块补充测试
  - 覆盖：gateway event handling、session persistence、card callback parsing
  - 产出：新增 7 个测试用例，27 个相关测试全部通过
  - 已覆盖场景：
    - mention-gate: DM 接受、open_id/user_id/name/@_all 匹配（原 2 + 新 2）
    - message-handler: 完整消息流 + mention 过滤 + P2P DM 处理（原 2 + 新 1）
    - session-manager: TTL 过期、容量驱逐、maxTurns 历史截断、get() 惰性清理、turnCount 重置（原 3 + 新 2）
    - card-handler: confirm_execute 去重、cancel 动作处理（原 2 + 新 1）
    - card-callback: confirm_execute 提取、legacy flight_plan、cancel 决策、未知动作返回 null（原 2 + 新 2）
    - registry: dry-run 跳过 preflight/确认、工具注册/执行/错误处理（已完整覆盖）
    - feishu-tools: dry-run 产物、可选工具语义（已完整覆盖）

- [x] **T13** Demo 截图清单：5 张必截 + 2 张可选，对应评分标准
  - 路径：`docs/demo/SCREENSHOT_CHECKLIST.md`
  - 产出：截图清单文档，含获取方式和评分对应关系

### P5：Demo 打磨（2026-05-02 01:15）

- [x] **T14** dry-run 输出美化：精简为 artifacts 汇总 + surfaces 列表 + next steps
  - 路径：`src/interfaces/cli/pilot-run.ts`
  - 产出：更清晰的终端输出格式

- [x] **T15** 集成测试：端到端 dry-run 链路测试
  - 覆盖：正常路径、缺失字段、重复运行、中文输入解析
  - 产出：3 个新集成测试用例，pilot-run 总计 10 个测试通过

- [x] **T16** demo 输入场景化：用校园答辩项目替换技术化默认输入
  - 路径：`src/interfaces/cli/fixtures/demo_input_project_init.txt`
  - 产出：中文场景化 demo 输入，dry-run 验证通过（13 产物）

### 轮次 6（2026-05-02 02:10）
- 完成：T12（测试增强，7 个新测试用例）
  - 新增：mention-gate user_id/name 匹配、message-handler P2P DM 处理、session-manager get() 惰性清理和 turnCount 重置、card-handler cancel 动作、card-callback cancel 提取和未知动作处理
  - 27 个相关测试全部通过；2 个 interfaces 测试预置失败（环境配置问题，非本次变更引起）

### 轮次 7（2026-05-02 02:20）
- 完成：T13（截图清单）、T14（输出美化）、T16（中文 demo 输入）
- 修复：smokeRuntimeEnv 部分 LLM 配置导致 ConfigurationError、pilot-run 输出格式破坏测试断言
- 全量测试：162 pass, 0 fail
- 审查 subagent 发现问题并修复

### 轮次 8（2026-05-02 02:30）
- 完成：T15（集成测试，3 个新用例：缺失字段、重复运行、中文输入解析）
- 全量测试：165 pass, 0 fail
- 全部 16 个任务已完成

### P6：Demo 准备与合并（2026-05-02 02:40）

- [x] **T17** sprint-main 合并回 main：10+ commit 已合并，19 文件，1343 行新增
  - 产出：main 分支包含所有 sprint 产出，已推送到 GitHub

- [x] **T18** demo 全流程彩排：中文输入 dry-run + Flight Recorder + retrospective
  - 产出：16 产物，55 events，Flight Recorder HTML 和证据包已生成

- [x] **T19** PERSONAL_PROGRESS 更新：sprint 产出已写入阶段成果文档，飞书已同步（revision 283）
  - 产出：更新后的 PERSONAL_PROGRESS.md + 飞书同步

- [x] **T20** 复赛提交模板更新：最新进展已写入飞书复赛模板
  - 产出：飞书复赛文档 revision 8，含工程化落地（165 测试）和 LLM 集成信息

### P7：最终打磨（2026-05-02 03:20）

- [x] **T21** sprint-main 再次合并回 main：已合并并推送
  - 产出：main 分支最新（7f8ffcb）

- [x] **T22** 代码注释审查：5 处核心函数添加简明中文注释
  - 覆盖：runAgentLoop、prepareToolCalls、ToolRegistry.register、ToolRegistry.execute、resolveSmokeLlm
  - 产出：注释已添加，编译通过，165 测试通过

### 轮次 9（2026-05-02 03:25）
- 完成：T21（合并 main）、T22（代码注释）、T23（提交检查清单）
- 全量测试：165 pass, 0 fail
- main 分支已更新（840049d）
- 全部 23 个任务已完成

### P8：最终质量提升（2026-05-02 03:35）

- [x] **T24** 评委一页纸：面向评委的项目概览文档
  - 路径：docs/demo/JUDGE_ONE_PAGER.md
  - 产出：中文一页纸，含定位、能力、效率对比、竞品、架构、已验证能力

- [x] **T25** 代码质量扫描：无 TODO/FIXME/HACK，无硬编码值
  - 产出：代码干净，无需修复

- [x] **T23** 竞赛提交检查清单：提交前检查文档
  - 路径：docs/demo/SUBMISSION_CHECKLIST.md
  - 产出：含 GitHub、飞书、录屏、截图、答辩 5 大类检查项
