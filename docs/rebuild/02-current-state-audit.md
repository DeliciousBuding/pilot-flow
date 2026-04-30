# 02 — 当前状态审查汇总

> 来源：2 轮 12 个并行 subagent 审查，每个 agent 独立读源码验证

## 第一轮：代码质量审查（7 个 agent）

### 架构问题

| 严重度 | 问题 | 文件:行号 | 验证状态 |
|--------|------|----------|---------|
| 🔴 高 | God Object — `startProjectInit` 252 行 | `run-orchestrator.js:37-288` | ✅ 精确验证：252 行 |
| 🔴 高 | events→orchestrator 单向依赖（报告曾称"双向"，交叉验证修正为单向） | `card-event-listener.js:5`, `callback-run-trigger.js:4` | ⚠️ 修正 |
| 🟡 中 | runtime→tools 倒置依赖 | `tool-step-runner.js:1` | ✅ |
| 🟡 中 | config→core 向上依赖 | `runtime-config.js:2` | ✅ |
| 🟡 中 | Domain 模型过薄（16-24 行纯模板） | `project-brief.js`, `task-description.js` | ✅ |

### 核心逻辑问题

| 严重度 | 问题 | 文件:行号 | 验证状态 |
|--------|------|----------|---------|
| 🔴 高 | DuplicateRunGuard 竞态条件（read-modify-write 无锁） | `duplicate-run-guard.js:23-47` | ✅ |
| 🔴 高 | 硬编码 `demo-user`（实际在行 156，非 158） | `run-orchestrator.js:156` | ⚠️ 行号修正 |
| 🔴 高 | 硬编码 `revision: "0"` | `run-orchestrator.js:234` | ✅ |
| 🟡 中 | 20+ 处函数重复（parseArgs×11, getPath×3, escapeCell×9） | 跨 5+ 文件 | ✅ |
| 🟡 中 | `parseDemoInput` 正则只匹配 ASCII | `project-init-planner.js:77` | ✅ |
| 🟢 低 | `normalizeDueDate` 对 "TBD" 返回 undefined | `project-state-builder.js:76` | ✅ |

### 测试问题

| 严重度 | 问题 | 验证状态 |
|--------|------|---------|
| 🔴 高 | `jsonl-recorder.js` 零测试 | ✅ 仓库内无对应文件 |
| 🔴 高 | `command-runner.js` 零测试 | ✅ 仓库内无对应文件 |
| 🔴 高 | `run-orchestrator.test.js` 仅 1 个测试用例 | ✅ 43 行 |
| 🟡 中 | `feishu-tool-executor.test.js` 只测 idempotency key | ✅ |
| 🟡 中 | 无测试框架（裸 assert，无 per-case reporting） | ✅ |

### 安全问题

| 严重度 | 问题 | 文件:行号 | 验证状态 |
|--------|------|----------|---------|
| 🟡 中 | `.env.example` 缺 LLM 配置 | `.env.example` | ✅ |
| 🟡 中 | JSONL 日志含未脱敏文档内容 | `command-runner.js:121-136` | ✅ |
| 🟢 低 | `plan-validator.js` 无字符串长度限制 | `plan-validator.js` | ✅ |

### 飞书集成问题

| 严重度 | 问题 | 文件:行号 | 验证状态 |
|--------|------|----------|---------|
| 🔴 高 | `runProcess()` 无超时 | `command-runner.js` | ✅ |
| 🟡 中 | Windows `cmd.exe` fallback 注入风险（实际风险较低，shell:false） | `command-runner.js:101` | ⚠️ 降级 |
| 🟡 中 | 卡片 `lark_md` 用户内容未转义 | `flight-plan-card.js:16` | ✅ |
| 🟡 中 | 无限流/重试 | `command-runner.js` | ✅ |

### 文档问题

| 严重度 | 问题 | 验证状态 |
|--------|------|---------|
| 🟡 中 | 仓库缺 `pilot-flow/AGENTS.md` | ✅ |
| 🟡 中 | README 过于冗长（342 行） | ✅ |
| 🟡 中 | `DEVELOPMENT.md` 硬编码 Windows 路径 | ✅ |
| 🟡 中 | `OPERATOR_RUNBOOK.md` 泄露 profile ID | ✅ |

## 第二轮：深度漏洞 + PM 视角 + 数据流（5 个 agent）

### 漏洞深挖 — 确认安全的项

- ✅ 原型污染 — 无 Object.assign/merge 于不可信输入
- ✅ ReDoS — 所有正则已锚定，无嵌套量词
- ✅ JSONL 注入 — `JSON.stringify` 转义 `\n`
- ✅ 环境变量注入 — `shell:false` + 数组参数
- ✅ 符号链接攻击 — 路径由开发者控制

### 漏洞深挖 — 新发现

| 严重度 | 问题 | 验证状态 |
|--------|------|---------|
| 🟡 中 | 无输入大小验证 — 50K risks 可致 OOM | ✅ |
| 🟡 中 | `error.result` 含原始 token 写入 JSONL | ✅ |
| 🟢 低 | `plan.goal` 未转义注入 `lark_md` | ✅ |

### 数据流与状态一致性 — 第一轮完全遗漏的严重问题

| 严重度 | 问题 | 根因 |
|--------|------|------|
| 🔴 高 | 崩溃 = 永久锁死（guard 卡 "started"，无 TTL/恢复） | SIGKILL 后 catch 不执行 |
| 🔴 高 | 无运行恢复（artifacts 纯内存，崩溃丢失） | 无 JSONL replay |
| 🔴 高 | 回调并发 = 重复飞书写入（guard 显式禁用 + 无互斥锁） | `callback-run-trigger.js:58` |
| 🟡 中 | 飞书资源孤儿化 | 进程崩溃后引用丢失 |
| 🟡 中 | 回调使用错误配置（硬编码默认值） | `callback-run-trigger.js:52-59` |

### UX 问题

| 严重度 | 问题 |
|--------|------|
| 🟡 中 | 新开发者冷启动无引导 |
| 🟡 中 | 飞书卡片 4 按钮挤一行，移动端难点击 |
| 🟡 中 | 中英文硬编码混杂 |
| 🟢 低 | 卡片出现 "当前原型" 开发态语言 |

### 产品经理视角 — 核心诊断

| 维度 | 评估 |
|------|------|
| 价值主张 | 无 10x 改进，planner 是正则解析器不是 AI |
| 入口 | CLI 而非 @PilotFlow，90%+ 用户流失 |
| 竞争护城河 | 零 — 一个周末可重建 |
| 功能膨胀 | 11 个 review-pack 是参赛脚手架非产品 |
| 评委评分潜力 | 5/10 — 工程基础扎实但产品未兑现承诺 |
| 杀手级缺失 | LLM 集成、@PilotFlow 触发、多轮对话 |

## 综合 Top 10 修复建议

| 优先级 | 修复项 | 状态 |
|--------|--------|------|
| P0 | 超时机制 | 重建时修复 |
| P0 | 竞态 + 崩溃锁死 | 重建时修复 |
| P0 | 移除硬编码 | 重建时修复 |
| P0 | 回调并发 + 错误配置 | 重建时修复 |
| P1 | 消除 20+ 处重复 | 重建时修复 |
| P1 | 补测试 | 重建时修复 |
| P1 | readJsonl 容错 | 重建时修复 |
| P2 | redactArgs 覆盖 | 重建时修复 |
| P2 | .env.example 补全 | 重建时修复 |
| P2 | 卡片按钮移动端适配 | 后续优化 |
