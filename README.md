<div align="center">

# ✈️ PilotFlow

**飞书群里的 AI 项目运行官**

在飞书群里 @PilotFlow 说一句需求，自动生成可确认的项目计划，编排飞书文档、多维表格、任务、日历、群卡片、权限和提醒。

[English Version](README_EN.md)

[![Feishu](https://img.shields.io/badge/飞书-原生-00A4FF)](https://open.feishu.cn/)
[![Hermes](https://img.shields.io/badge/Hermes-插件-6f42c1)](https://github.com/NousResearch/hermes-agent)

</div>

---

## 一句话介绍

**PilotFlow 是飞书群里的 AI 项目运行官。**

在飞书群里 @PilotFlow 说一句需求，它自动提取目标、成员、交付物和截止时间，先发确认卡片，用户确认后创建真实飞书产物。PilotFlow 读懂群聊上下文中的目标、承诺、风险和行动项，主动追问缺失信息，建议是否整理成项目，在用户确认后把"讨论"推进成"交付"——文档、表格、任务、日历提醒和互动卡片，一条链路打通。

## 差异化定位

飞书生态已有成熟的"飞书项目"，强项是项目创建后的结构化管理和执行空间。PilotFlow 解决的是更上游的问题：**项目还没形成时**，群聊里的意图、承诺和风险谁来识别？谁来主动追问、建议项目化，并在确认后把结果写入飞书？

| 维度 | 飞书项目 | PilotFlow |
| --- | --- | --- |
| 阶段 | 项目创建后的管理与执行 | 项目形成前的意图识别与启动 |
| 入口 | 工作台、项目空间 | 飞书群聊/私聊，自然对话 |
| 触发方式 | 手动创建项目空间 | Agent 从群聊上下文主动发现和规划 |
| 核心能力 | 项目台账、甘特图、流程管理 | 意图理解 → 计划确认 → 飞书产物编排 → 状态追踪 → 截止提醒 |
| AI 角色 | 产品内固定场景增强 | Hermes Agent 理解上下文并选择下一步，PilotFlow 负责确认门控和飞书执行 |

PilotFlow 与飞书项目互补：群聊里 PilotFlow 把散落信息整理成结构化计划并启动执行，飞书项目承载后续深度管理。飞书项目 OpenAPI 可用时，PilotFlow 优先对接飞书项目作为权威项目后端。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| **意图理解** | 从群聊文本中提取目标、成员、交付物、截止时间和风险 |
| **计划生成** | 结构化项目执行计划，以飞书互动卡片发送到群中 |
| **确认门控** | 人工点击确认或回复"确认执行"后才写入，支持取消，10 分钟 TTL |
| **产物编排** | 确认后自动创建飞书文档、多维表格、任务、日历事件 |
| **项目入口** | 汇总所有产物链接，以互动卡片发送到群中 |
| **状态看板** | 随时查询项目进展，截止倒计时，🟢🟡🔴 色标紧急程度 |
| **多轮管理** | 修改截止时间、重新分配成员等后续操作，自动同步多维表格 |
| **截止提醒** | 通过 Hermes cron 在截止前自动发送群提醒 |

全程记录在 JSONL 运行日志中，每一步可追溯。

## 飞书生态融入

PilotFlow 与以下飞书能力深度集成：

| 飞书能力 | 融合方式 |
| --- | --- |
| **飞书文档** | 自动创建项目 Brief，Markdown 格式化，@提及成员 |
| **多维表格** | 创建项目状态台账，写入记录，支持后续更新 |
| **飞书任务** | 自动创建任务、分配负责人、设置截止时间 |
| **群消息** | 项目入口消息汇总全部产物链接 |
| **互动卡片** | 计划确认、状态看板、按钮回调，点击后原卡片状态更新 |
| **@mention** | 解析群成员列表，文档和消息中自动 @提及 |
| **权限管理** | 创建后自动开放链接访问 + 给群成员加编辑权限 |

## 技术架构

```
Hermes Agent 运行时（LLM 调度 + 飞书网关 + 工具注册表）
  └── PilotFlow 插件（项目管理工作流 + lark_oapi SDK）
```

**底座与插件的分工：**

| 层级 | Hermes 提供 | PilotFlow 新增 |
| --- | --- | --- |
| 运行时 | LLM 调度、工具注册、飞书网关、消息发送、memory、cron | 项目语义、模板匹配、确认门控、pending plan、风险检测、多轮状态管理 |
| 飞书能力 | 消息通道和卡片 action 事件路由 | 文档/多维表格/任务/日历创建，权限自动开放，群成员解析，@mention，项目入口卡 |
| 工作流 | 可调用工具的执行环境 | 群聊意图 → 计划卡片 → 人工确认 → 产物编排 → 状态看板 → 截止提醒 |
| 可信控制 | 工具调用基础设施 | chat_id 级确认门控、10 分钟 TTL、取消按钮、运行结果 display、错误降级 |

- **底座**：Hermes 提供 Agent runtime、飞书 WebSocket 网关、LLM 调度、memory 和 cron
- **插件**：PilotFlow 提供 6 个飞书 API 工具（lark_oapi SDK 直连；互动卡片走 Feishu IM API 直发）
- **边界**：PilotFlow 不修改 Hermes 源码；按钮回调通过插件级 `/card` 桥接命令处理
- **LLM**：OpenAI-compatible API，默认 `gpt-4.1`，可按 Hermes 配置替换模型
- **权限**：创建文档/表格后自动开放链接访问 + 给群成员加编辑权限

## 竞品参照

| 维度 | OpenClaw（飞书官方 Agent 插件） | 飞书妙记 | PilotFlow |
| --- | --- | --- | --- |
| 定位 | 通用 Agent 基础设施 | 会议纪要 | 群聊里的 AI 项目运行官 |
| 入口 | 个人助手，建议不接入群聊 | 会议场景 | 飞书群聊/私聊，自然对话 |
| 工作流 | 通用 flow 编排，用户自行搭建 | 会议→待办 | 内置"讨论→计划→确认→执行→追溯"闭环 |
| 确认机制 | 底层 exec approvals | 无 | 项目语义级确认：先预览计划，再确认执行 |
| 运行追溯 | 工程级 trace，面向开发者 | 会议回放 | 业务级审计：谁发起、确认了什么、写入了哪些对象 |
| 群聊原生 | 否 | 否 | 是，入口即群聊上下文 |

## 能力证据

| 能力 | 证据 |
| --- | --- |
| 飞书文档/多维表格/任务/日历/入口消息 | 2026-05-03 真实群按钮确认后跑通，创建真实飞书产物 |
| 确认门控（含取消路径） | 本地集成测试 + 代码级 chat_id TTL + 真实群文字取消验证 |
| 互动卡片 + 按钮回调 | 真实群发送 interactive 卡片，按钮确认后原卡片状态更新为处理中/已完成/已取消 |
| 状态看板 | 真实群查询，Bot 返回中文文本 + interactive 看板卡片 |
| 多轮更新 | 修改截止时间后自动更新多维表格记录 + 群通知 |
| Hermes memory 写入 | 本地测试覆盖成功/失败 dispatch，项目模式写入 |
| Hermes cron 截止提醒 | 本地测试覆盖 6 种截止时间场景 |
| 自动化测试 | 47 个测试通过（单元测试 + 集成测试） |
| 真实录屏 / 产物链接 | 提交前汇总 |

## 快速开始

详见 [INSTALL.md](INSTALL.md)

```bash
# 1. 安装 Hermes
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent && uv sync --extra feishu

# 2. 安装 PilotFlow 插件
git clone https://github.com/DeliciousBuding/PilotFlow.git
cd PilotFlow
python setup.py --hermes-dir <hermes-agent-path>

# 3. 配置
cp .env.example ~/.hermes/.env
# 编辑 ~/.hermes/.env 填入飞书凭证和 LLM API key

# 4. 启动
uv run hermes gateway
```

## 路线图

| 阶段 | 目标 | 状态 |
| --- | --- | --- |
| Phase 1 | 插件基础：飞书工具 + 项目管理工作流 | ✅ 已完成 |
| Phase 2 | LLM 驱动的意图理解和计划生成 | ✅ 已完成 |
| Phase 3 | lark_oapi SDK 直连 + @mention + 格式化文档 + 权限自动开放 | ✅ 已完成 |
| Phase 4 | 确认门控 + 风险检测 + 多轮管理 + 项目看板 | ✅ 已完成 |
| Phase 5 | Hermes memory 写入 + 智能模板 + 日历集成 + cron 截止提醒 | ✅ 已完成 |
| Phase 6 | Hermes memory 读取 + 真实录屏 + 输出降噪验证 | 进行中 |

## 文档

| 文档 | 说明 |
| --- | --- |
| [安装指南](INSTALL.md) | 安装步骤 |
| [产品规格](docs/PRODUCT_SPEC.md) | 用户承诺、功能分级 |
| [架构设计](docs/ARCHITECTURE.md) | 组件、状态模型、工具路由 |
| [复赛材料](docs/CONTEST_SUBMISSION.md) | 答辩定位、演示路线、证据矩阵 |
| [真实测试证据](docs/LIVE_TEST_EVIDENCE.md) | 脱敏记录真实 Feishu 测试结果 |
| [交付审计](docs/DELIVERY_AUDIT.md) | 需求、证据、缺口的完整审计清单 |
| [个人进度](PERSONAL_PROGRESS.md) | 开发进度和验证结果 |
| [贡献指南](CONTRIBUTING.md) | 开发环境、代码规范、提交 PR |

## 致谢

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent 运行时底座
- 飞书 / Lark 开放平台
- 飞书 AI 校园挑战赛
