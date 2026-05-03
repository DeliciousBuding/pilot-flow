<div align="center">

# ✈️ PilotFlow

**飞书群里的 AI 项目运行官，基于 Hermes 运行时实现**

在飞书群里 @PilotFlow 说一句需求，自动生成可确认的项目计划，并编排飞书文档、多维表格、任务、日历、群卡片、权限和提醒。

[English Version](README_EN.md)

[![Feishu](https://img.shields.io/badge/飞书-原生-00A4FF)](https://open.feishu.cn/)
[![Hermes](https://img.shields.io/badge/Hermes-插件-6f42c1)](https://github.com/NousResearch/hermes-agent)

</div>

---

## 演示与证据

| 材料 | 状态 | 入口 |
| --- | --- | --- |
| 演示脚本 | 已整理 | [docs/demo/README.md](docs/demo/README.md) |
| 复赛材料 | 已整理 | [docs/CONTEST_SUBMISSION.md](docs/CONTEST_SUBMISSION.md) |
| 本地测试 | 47 个测试通过 | `uv run pytest -o addopts='' -q` |
| 真实飞书卡片 | 已验证发送、按钮确认、原卡片状态更新 | WSL Hermes + 飞书测试群 |
| 真实状态看板 | 已验证中文文本反馈 + interactive 看板卡片 | [docs/LIVE_TEST_EVIDENCE.md](docs/LIVE_TEST_EVIDENCE.md) |
| 真实文字确认创建 | 已验证计划卡片 → 文字确认 → 项目入口卡片 | [docs/LIVE_TEST_EVIDENCE.md](docs/LIVE_TEST_EVIDENCE.md) |
| 真实文字取消 | 已验证计划卡片 → 取消执行 → 不创建项目 | [docs/LIVE_TEST_EVIDENCE.md](docs/LIVE_TEST_EVIDENCE.md) |
| 真实录屏/产物样例 | 提交前补齐 | 成功/取消路径录屏与真实链接样例 |

---

## 一句话介绍

**PilotFlow 是飞书群里的 AI 项目运行官。**

在飞书群里 @PilotFlow 说一句需求，它自动提取目标、成员、交付物和截止时间，先发确认卡片，再由用户确认后创建真实飞书产物。它不是把飞书 API 暴露成工具清单，而是把“项目启动、确认、执行、追踪、提醒、复盘”包装成一个可审计的工作流。

## 为什么需要 PilotFlow

| 痛点 | PilotFlow 解决方式 |
| --- | --- |
| 群聊讨论散落，关键信息丢失 | AI 自动提取目标、成员、交付物、截止时间 |
| 手动建项目空间要 30 分钟 | 一句话触发，全套飞书产物自动创建 |
| AI 生成的文字要复制粘贴 | 直接调飞书 API 创建真实文档、任务 |
| 出了问题不知道哪一步 | 全程日志，可追溯 |

## 核心优势

| 优势 | 说明 |
| --- | --- |
| **入口最自然** | 飞书群里 @机器人直接开始，不用打开别的工具 |
| **AI 干真活** | lark_oapi SDK 直连飞书 API，创建真实文档、任务 |
| **成员 @提及** | 文档和消息中自动 @提及项目成员 |
| **文档自动开权限** | 创建的文档自动开放链接访问，无需手动设置 |
| **即插即用** | 基于 Hermes 运行时，`python setup.py --hermes-dir ...` 一键安装 |
| **可沉淀项目模式** | 创建项目时写入 Hermes memory，为后续历史模式读取和智能建议打基础 |

## 飞书生态深度融合

PilotFlow 不是"能创建文档的机器人"，而是一个深度融合飞书生态的项目运行官：

| 飞书能力 | 融合方式 |
| --- | --- |
| **飞书文档** | 自动创建项目 Brief，格式化 markdown，@提及成员 |
| **多维表格** | 自动创建项目状态台账，写入记录，实时追踪 |
| **飞书任务** | 自动创建任务，关联项目，支持负责人分配 |
| **群消息** | 项目入口消息（@成员 + 文档/表格/截止时间链接） |
| **互动卡片** | 计划确认、状态看板、按钮续跑、点击后原卡片状态反馈，Feishu 直发 |
| **@mention** | 解析群成员列表，文档和消息中自动 @提及 |
| **权限管理** | 创建后自动开放链接访问 + 给群成员加编辑权限 |

## PilotFlow 不是简单飞书插件

| 层级 | Hermes 提供 | PilotFlow 新增 |
| --- | --- | --- |
| 运行时 | LLM 调度、工具注册、飞书网关、消息发送、memory、cron | 项目语义、模板、确认门控、pending plan、风险检测、多轮状态管理 |
| 飞书能力 | 消息通道和卡片 action 事件路由 | 文档/多维表格/任务/日历创建，权限自动开放，群成员解析，@mention，项目入口卡 |
| 工作流 | 可调用工具的执行环境 | 群聊需求 → 计划卡片 → 人工确认 → 产物编排 → 状态看板 → 截止提醒 |
| 可信控制 | 工具调用基础设施 | chat_id 级确认门控、10 分钟 TTL、取消按钮、运行结果 display、错误降级 |

## 技术架构

```
Hermes Agent 运行时（LLM + 飞书网关 + 工具注册表）
  └── PilotFlow 插件（项目管理工作流 + lark_oapi 飞书工具）
```

- **底座**：Hermes 提供 Agent runtime、飞书 WebSocket 网关、LLM 调度
- **插件**：PilotFlow 提供项目管理工作流和飞书 API 工具（lark_oapi SDK 直连；互动卡片走 Feishu IM API 直发）
- **边界**：PilotFlow 是 Hermes 插件，不修改 Hermes 源码；按钮回调用插件级 `/card` 桥接命令处理
- **LLM**：OpenAI-compatible API，默认示例使用 `gpt-4.1`，可按 Hermes 配置替换模型
- **权限**：创建文档/表格后自动开放链接访问 + 给群成员加编辑权限
- **@mention**：调用 im.chat.members.get 解析群成员，文档内用 mention_user 元素

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

## 能力证据

| 能力 | 当前证据 | 说明 |
| --- | --- | --- |
| 飞书文档/多维表格/任务/入口消息 | 2026-05-03 真实群按钮确认后跑通 | 创建后发送项目入口互动卡片 |
| 确认门控 | 本地集成测试 + 代码级 chat_id TTL | 未确认不能创建项目 |
| 卡片确认/取消 | 本地集成测试覆盖 confirm/cancel；插件注册 `/card` 桥接 | 真实按钮确认已续跑；原卡片会更新为处理中/已完成/已取消 |
| Hermes memory 写入 | 本地测试覆盖成功/失败 dispatch | best-effort 写入，默认不持久化成员姓名 |
| Hermes cron 截止提醒 | 本地测试覆盖成功/失败 dispatch | 创建项目时尝试调度，失败不阻断核心流程 |
| 项目模板/风险检测/看板/多轮更新 | 单元测试 + 集成测试 | 覆盖答辩、sprint、活动、上线模板 |
| LLM 驱动 | Hermes 工具描述 + skill 指令 + 真实群 @机器人验证 | 输出降噪已配置，交付材料持续补齐 |

## 竞品定位

| 维度 | 飞书妙记/项目 | PilotFlow |
| --- | --- | --- |
| 定位 | 会议纪要/项目空间 | 群聊项目运行官 |
| 入口 | 会议/工作台 | 飞书群聊 @mention |
| 工作流 | 会议→待办/项目流程 | 一句话→文档+任务+消息 |
| AI 工作方式 | 偏会议/项目空间内能力 | 群聊一句话触发，LLM 选择工具并执行项目工作流 |
| 学习能力 | 依赖飞书产品内建能力 | Hermes memory 写入链路已实现，历史读取和自动建议在下一轮推进 |
| 可扩展性 | 主要在飞书产品体系内扩展 | Hermes 插件/skill/cron/memory 生态 + 飞书 OpenAPI 编排 |

## 文档

| 文档 | 说明 |
| --- | --- |
| [安装指南](INSTALL.md) | 安装步骤 |
| [产品规格](docs/PRODUCT_SPEC.md) | 用户承诺、功能分级 |
| [架构设计](docs/ARCHITECTURE.md) | 组件、状态模型、工具路由 |
| [复赛材料](docs/CONTEST_SUBMISSION.md) | 答辩定位、演示路线、证据矩阵 |
| [真实测试证据](docs/LIVE_TEST_EVIDENCE.md) | 脱敏记录真实 Feishu 测试结果 |
| [个人进度](PERSONAL_PROGRESS.md) | 开发进度和验证结果 |
| [贡献指南](CONTRIBUTING.md) | 开发环境、代码规范、提交 PR |

## 路线图

| 阶段 | 目标 | 状态 |
| --- | --- | --- |
| Phase 1 | 插件基础：飞书工具 + 项目管理工作流 | ✅ 已完成 |
| Phase 2 | LLM 驱动的意图理解和计划生成 | ✅ 已完成 |
| Phase 3 | lark_oapi SDK 直连 + @mention + 格式化文档 + 权限自动开放 | ✅ 已完成 |
| Phase 4 | 确认门控 + 风险检测 + 多轮管理 + 项目看板 | ✅ 已完成 |
| Phase 5 | Hermes memory 写入 + 智能模板 + 日历集成 | ✅ 已完成 |
| Phase 6 | Hermes memory 读取 + 真实卡片按钮录屏 + 输出降噪验证 | 进行中 |

## 致谢

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent 运行时底座
- 飞书 / Lark 开放平台
- 飞书 AI 校园挑战赛
