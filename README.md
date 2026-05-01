<div align="center">

# ✈️ PilotFlow

**飞书项目协作的 AI 运行层**

从群聊讨论开始，把目标、负责人、风险和材料推进成确认过的计划、可执行任务、可追踪状态和交付总结。

[English Version](README_EN.md)

[![Feishu](https://img.shields.io/badge/飞书-原生-00A4FF)](#-飞书原生能力)
[![Agent](https://img.shields.io/badge/Agent-主驾驶-6f42c1)](#-产品体验)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](docs/OPERATOR_RUNBOOK.md)
[![GitHub stars](https://img.shields.io/github/stars/DeliciousBuding/PilotFlow?style=social)](https://github.com/DeliciousBuding/PilotFlow/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/DeliciousBuding/PilotFlow)](https://github.com/DeliciousBuding/PilotFlow/commits/main)

[产品规格](docs/PRODUCT_SPEC.md) · [架构设计](docs/ARCHITECTURE.md) · [路线图](docs/ROADMAP.md) · [操作手册](docs/OPERATOR_RUNBOOK.md) · [文档索引](docs/README.md)

</div>

---

> **截图占位**：飞书群聊中 PilotFlow 发送执行计划卡片的效果截图。

---

## 产品定位

PilotFlow 是面向飞书协作场景的 **AI 项目运行官**。

> **像一个项目经理一样，在飞书群里推动团队从讨论走向交付。**

项目讨论散落在群聊中，关键信息容易丢失。PilotFlow 让 Agent 理解讨论、生成计划、请求确认、调用飞书工具，把结果沉淀到文档、多维表格和任务中。

产品体验在飞书群聊、卡片、文档和任务系统中发生。

> **Agent 主驾驶，GUI 做仪表盘，人类始终掌舵。**

## 核心能力

PilotFlow 从群聊中的一句话需求出发，走完这条闭环：

1. 提取目标、负责人、截止时间、交付物和风险
2. 生成结构化项目执行计划，以飞书卡片形式发送到群中
3. 等待人工确认——可以批准、编辑、限制为仅文档或取消
4. 确认后自动创建飞书文档、多维表格状态记录、飞书任务
5. 发送风险裁决卡、部署项目入口消息并固定到群顶部
6. 汇总所有产物链接，发送交付总结到群聊

每一步都记录在 JSONL 运行日志中，支持 Flight Recorder 可视化回放。

## 适用团队

| 团队类型 | 典型场景 | 为什么适合 |
| --- | --- | --- |
| 学生团队 | 把头脑风暴转化为可交付计划 | 轻量高效，适合快速项目周期 |
| 产品与运营 | 将群聊决策沉淀为文档、任务和状态 | 在决策发生的飞书环境中直接工作 |
| 黑客松团队 | 对齐范围、负责人和演示素材 | 一条可见的项目主线，无需重型项目管理 |
| AI 原生团队 | 让 Agent 在护栏内执行真实协作工作 | 确认机制和运行记录让自动化可解释、可审计 |

## 产品体验

```mermaid
flowchart LR
    A["群聊意图"] --> B["生成计划"]
    B --> C["人工确认"]
    C --> D["执行飞书工具"]
    D --> E["文档 + 多维表格\n任务 + 卡片 + 入口"]
    E --> F["交付总结"]
```

## 运行模型

| 步骤 | 产品行为 | 控制点 |
| --- | --- | --- |
| 观察 | 读取群聊，提取目标、成员、交付物、截止时间和风险 | 无写入副作用 |
| 计划 | 生成结构化项目执行计划 | Schema 格式校验 |
| 确认 | 请求人工批准、编辑或取消 | 不确认不执行 |
| 执行 | 通过飞书工具路由器创建产物 | 写入前预检，防重复创建 |
| 记录 | 记录每一步的工具调用、产物、降级和异常 | JSONL 运行日志 + Flight Recorder |
| 汇报 | 汇总产物链接，发送交付总结到群聊 | 带产物感知的总结消息 |

---

## 架构设计

```mermaid
flowchart LR
    subgraph 输入
        IM["群聊"]
    end

    subgraph PilotFlow
        Planner["规划器"] --> Confirm["确认机制"]
        Confirm --> Router["工具路由器"]
    end

    subgraph 飞书产物
        Doc["文档"]
        Base["多维表格"]
        Task["任务"]
        Card["卡片"]
        Entry["固定入口"]
    end

    IM --> Planner
    Router --> Doc
    Router --> Base
    Router --> Task
    Router --> Card
    Router --> Entry
    Doc --> Summary["交付总结"]
    Base --> Summary
    Task --> Summary
    Summary --> IM
```

详细架构：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 飞书原生能力

全部使用真实飞书 API，经过实际环境验证：

| 能力 | 产品角色 |
| --- | --- |
| 群聊消息 | 项目发起和交付总结回传通道 |
| 互动卡片 | 执行计划展示、确认交互和风险裁决 |
| 飞书文档 | 自动生成项目 Brief 和交付文档 |
| 多维表格 | 结构化项目状态：负责人、截止时间、风险等级、状态、链接 |
| 飞书任务 | 行动项，支持负责人分配 |
| 固定入口消息 | 群内稳定的项目导航入口 |

> **截图占位**：飞书互动卡片确认截图和 Flight Recorder HTML 视图截图。

## 路线图

| 阶段 | 目标 | 状态 |
| --- | --- | --- |
| Phase 0 | CLI、飞书 API 验证、本地骨架 | 已完成 |
| Phase 1 | 文档、多维表格、任务、消息、运行日志完整闭环 | 已完成 |
| Phase 2 | 计划卡、风险卡、入口消息、负责人映射、重复运行保护 | 基本完成 |
| Phase 3 | 演示加固、录屏、提交材料 | 进行中 |
| Phase 4 | 移动端确认、项目记忆、Worker 预览 | 计划中 |
| Phase 5 | 事件订阅、多项目空间、自我进化闭环 | 计划中 |

完整路线图：[docs/ROADMAP.md](docs/ROADMAP.md)。

## 文档

| 文档 | 说明 |
| --- | --- |
| [文档索引](docs/README.md) | 完整文档地图 |
| [项目简报](docs/PROJECT_BRIEF.md) | 产品与赛事简报 |
| [产品规格](docs/PRODUCT_SPEC.md) | 用户承诺、功能分级、非目标 |
| [架构设计](docs/ARCHITECTURE.md) | 组件、状态模型、工具路由 |
| [Agent 进化](docs/AGENT_EVOLUTION.md) | 自我进化、评估闭环与 Worker 编排 |
| [项目结构](docs/PROJECT_STRUCTURE.md) | 运行层、命令入口、目录边界 |
| [操作手册](docs/OPERATOR_RUNBOOK.md) | 本地操作、live run、证据生成 |
| [开发指南](docs/DEVELOPMENT.md) | 贡献流程、模块边界、验证矩阵 |
| [视觉设计](docs/VISUAL_DESIGN.md) | 飞书原生卡片、驾驶舱、UX 规则 |
| [路线图](docs/ROADMAP.md) | 长期规划和近期行动 |
| [演示材料](docs/demo/README.md) | 演示脚本、录屏指南、失败路径 |
| [真实状态](docs/PRODUCT_REALITY_CHECK.md) | 能力评估与声明边界 |

## 快速开始

```bash
# 安装依赖并验证环境
npm install
npm run pilot:check

# 运行产品闭环（dry-run 模式）
npm run pilot:run -- --dry-run

# 自定义输入运行
npm run pilot:run -- --dry-run --input "目标: 建立答辩项目空间 成员: 产品, 技术 交付物: Brief, Task 截止时间: 2026-05-03"
```

<details>
<summary>完整命令参考</summary>

```bash
# 环境验证
npm run pilot:check
npm run pilot:doctor
npm test

# 产品闭环
npm run pilot:run -- --dry-run
npm run pilot:gateway -- --dry-run --timeout 30s --max-events 1
npm run pilot:agent-smoke

# 演示与证据
npm run pilot:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html
npm run pilot:package
npm run pilot:status
npm run pilot:audit
```

操作手册：[docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md)。开发指南：[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

</details>

## 安全原则

- 发布项目产物前必须经过人工确认。
- 工具失败会被记录和展示，Agent 不会假装失败的写入成功了。
- 每条写入路径都设计了幂等或重复检测机制。
- 密钥不允许出现在仓库、公开文档、截图或聊天记录中。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DeliciousBuding/PilotFlow&type=Date)](https://star-history.com/#DeliciousBuding/PilotFlow&Date)

## 参与贡献

变更应保持主循环稳定：

```text
群聊 -> 执行计划 -> 确认 -> 飞书工具 -> 状态 -> 风险裁决 -> 交付总结
```

1. 运行相关验证。
2. 更新受影响的文档。
3. 不要将本地密钥提交到仓库。

## 致谢

- 飞书 / Lark 开放平台和 `lark-cli`。
- 飞书 AI 校园挑战赛赛事材料和赛题说明。
- 影响了 Worker 产物路线的 Agent 工程工具。
