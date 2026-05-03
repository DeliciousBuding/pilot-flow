<div align="center">

# ✈️ PilotFlow

**Hermes 飞书项目管理插件**

在飞书群里 @PilotFlow 说一句需求，自动创建飞书文档、任务和项目入口消息。

[English Version](README_EN.md)

[![Feishu](https://img.shields.io/badge/飞书-原生-00A4FF)](https://open.feishu.cn/)
[![Hermes](https://img.shields.io/badge/Hermes-插件-6f42c1)](https://github.com/NousResearch/hermes-agent)

</div>

---

## 演示

详细演示脚本见 [docs/demo/README.md](docs/demo/README.md)，包含 5 个场景的完整流程。

---

## 一句话介绍

**PilotFlow 是飞书群里的 AI 项目运行官。**

在飞书群里 @PilotFlow 说一句需求，它自动提取目标、成员、交付物和截止时间，调用飞书 API 创建真实文档、任务和项目入口消息。全程 LLM 驱动，即插即用。

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
| **@mention** | 解析群成员列表，文档和消息中自动 @提及 |
| **权限管理** | 创建后自动开放链接访问 + 给群成员加编辑权限 |

## 技术架构

```
Hermes Agent 运行时（LLM + 飞书网关 + 工具注册表）
  └── PilotFlow 插件（项目管理工作流 + lark_oapi 飞书工具）
```

- **底座**：Hermes 提供 Agent runtime、飞书 WebSocket 网关、LLM 调度
- **插件**：PilotFlow 提供项目管理工作流和飞书 API 工具（lark_oapi SDK 直连）
- **LLM**：gpt-5.5，通过 OpenAI 兼容接口调用
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
python PilotFlow/setup.py --hermes-dir .

# 3. 配置
cp PilotFlow/.env.example ~/.hermes/.env
# 编辑 ~/.hermes/.env 填入飞书凭证和 LLM API key

# 4. 启动
uv run hermes gateway
```

## 已验证的能力

| 能力 | 说明 |
| --- | --- |
| 飞书文档创建 | 格式化 markdown，@提及成员，自动开放权限 + 给群成员加编辑权 |
| 多维表格 | 自动创建项目状态台账，写入记录，自动开放权限 + 编辑权 |
| 飞书任务创建 | 自动创建任务，分配负责人，设置截止时间 |
| @mention | 解析群成员列表，文档内 mention_user，消息内 `<at>` 标签 |
| 权限自管理 | 创建后自动：链接可查看 + 群成员可编辑 |
| 确认门控 | 代码级拦截 + 互动卡片按钮确认，必须先生成计划再执行 |
| 项目模板 | 答辩/sprint/活动/上线 模板自动识别和建议 |
| 多轮管理 | 改截止时间、加成员、改状态 |
| 项目看板 | 查询状态，发送飞书互动卡片到群 |
| 风险检测 | 自动识别缺失成员、模糊截止时间等风险 |
| 日历集成 | 自动创建截止时间日历事件（UTC+8） |
| 截止提醒 | 通过 Hermes cron 自动设置截止前 1 天提醒 |
| 卡片按钮 | 已实现确认/取消 action 工具；真实飞书按钮续跑需在 live parity 中复测 |
| LLM 驱动 | gpt-5.5 理解中文意图，自动选择工具 |
| 端到端验证 | 早期 live 路径已跑通；v1.12 需要复测真实 LLM + 卡片按钮续跑 |

## 竞品定位

| 维度 | 飞书妙记/项目 | PilotFlow |
| --- | --- | --- |
| 定位 | 会议纪要/项目空间 | 群聊项目运行官 |
| 入口 | 会议/工作台 | 飞书群聊 @mention |
| 工作流 | 会议→待办/项目流程 | 一句话→文档+任务+消息 |
| AI 能力 | 无 | LLM 理解意图，自动执行 |
| 学习能力 | 无 | Hermes memory 写入已实现，历史读取和自动建议在下一轮推进 |
| 可扩展性 | 固定功能 | Hermes 插件生态 |

## 文档

| 文档 | 说明 |
| --- | --- |
| [安装指南](INSTALL.md) | 安装步骤 |
| [产品规格](docs/PRODUCT_SPEC.md) | 用户承诺、功能分级 |
| [架构设计](docs/ARCHITECTURE.md) | 组件、状态模型、工具路由 |
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
| Phase 6 | Hermes memory 读取 + 真实卡片按钮 live parity + 录屏材料 | 进行中 |

## 致谢

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent 运行时底座
- 飞书 / Lark 开放平台
- 飞书 AI 校园挑战赛
