# ✈️ PilotFlow

**Hermes/OpenClaw 飞书项目管理插件**

把飞书群聊中的项目讨论，自动转化为确认过的计划、文档、任务和状态跟踪。

[English Version](README_EN.md)

[![Feishu](https://img.shields.io/badge/飞书-原生-00A4FF)]()
[![Hermes](https://img.shields.io/badge/Hermes-插件-6f42c1)]()
[![GitHub stars](https://img.shields.io/github/stars/DeliciousBuding/PilotFlow?style=social)](https://github.com/DeliciousBuding/PilotFlow/stargazers)

---

## 一句话介绍

**PilotFlow 是飞书群里的 AI 项目运行官。**

在飞书群里 @PilotFlow 说一句需求，它自动提取目标、成员、交付物和截止时间，生成执行计划，确认后一键创建飞书文档、多维表格、任务和项目入口。

## 为什么需要 PilotFlow

| 痛点 | PilotFlow 解决方式 |
| --- | --- |
| 群聊讨论散落，关键信息丢失 | AI 自动提取目标、成员、交付物、截止时间 |
| 手动建项目空间要 30 分钟 | 一句话触发，全套飞书产物自动创建 |
| AI 生成的文字要复制粘贴 | 直接调飞书 API 创建真实文档、表格、任务 |
| AI 操作不可控 | 确认门控：不确认不执行 |
| 出了问题不知道哪一步 | 全程运行记录，可追溯 |

## 核心优势

| 优势 | 说明 |
| --- | --- |
| **入口最自然** | 飞书群里 @机器人直接开始，不用打开别的工具 |
| **AI 干真活** | 调飞书 API 创建真实文档、表格、任务，不是生成文字 |
| **人始终有控制权** | 每次写入前先展示计划，确认了才执行 |
| **每步有记录** | 出了问题能查到是哪一步、哪个工具、什么结果 |
| **即插即用** | 基于 Hermes/OpenClaw 运行时，不重复造轮子 |

## 技术架构

```
Hermes/OpenClaw 运行时（Agent + 飞书网关 + 工具注册表）
  └── PilotFlow 插件（项目管理工作流 + 飞书项目工具）
```

- **底座**：Hermes 提供 Agent runtime、飞书网关、会话管理、工具注册
- **插件**：PilotFlow 提供项目管理工作流和飞书项目操作工具
- **不重复造轮子**：飞书消息、文档、任务等基础能力由 Hermes 提供

## 安装

详见 [INSTALL.md](INSTALL.md)

```bash
# 1. 安装 Hermes
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent && uv sync

# 2. 安装 PilotFlow 插件
git clone https://github.com/DeliciousBuding/PilotFlow.git
cp -r PilotFlow/plugins/pilotflow hermes-agent/plugins/

# 3. 配置环境变量
cp PilotFlow/.env.example hermes-agent/.env
# 编辑 .env 填入飞书配置和 LLM API key

# 4. 启动
cd hermes-agent && uv run hermes
```

## 已验证的飞书能力

| 能力 | 产品价值 |
| --- | --- |
| 飞书 IM 消息 | 项目发起与结果回传 |
| 飞书互动卡片 | 计划展示与确认交互 |
| 飞书文档 | 自动生成项目 Brief |
| 飞书多维表格 | 项目状态台账 |
| 飞书任务 | 行动项，支持负责人分配 |
| 项目入口消息 | 群内固定项目导航 |
| 风险裁决卡 | 群内风险识别与裁决 |
| 运行记录 | 全流程日志与异常追踪 |

## 竞品定位

| 维度 | OpenClaw | 飞书妙记/项目 | PilotFlow |
| --- | --- | --- | --- |
| 定位 | 通用 Agent 基础设施 | 会议纪要/项目空间 | 群聊项目运行官 |
| 入口 | 个人助手 | 会议/工作台 | 飞书群聊 |
| 工作流 | 通用 flow，用户自己编排 | 会议→待办/项目流程 | 内置项目运行闭环 |
| 确认机制 | 底层命令审批 | 无 | 项目语义级审批 |
| 运行追溯 | 工程级 trace | 无 | 业务级审计 |

## 文档

| 文档 | 说明 |
| --- | --- |
| [安装指南](INSTALL.md) | Hermes/OpenClaw 安装步骤 |
| [产品规格](docs/PRODUCT_SPEC.md) | 用户承诺、功能分级 |
| [架构设计](docs/ARCHITECTURE.md) | 组件、状态模型、工具路由 |
| [演示材料](docs/demo/README.md) | 演示脚本、Q&A、截图清单 |

## 路线图

| 阶段 | 目标 | 状态 |
| --- | --- | --- |
| Phase 1 | 插件基础：飞书工具 + 项目管理工作流 | ✅ 已完成 |
| Phase 2 | LLM 驱动的意图理解和计划生成 | ✅ 已完成 |
| Phase 3 | lark_oapi SDK 直连 + @mention + 格式化文档 + 权限自动开放 | ✅ 已完成 |
| Phase 4 | 确认门控 + 风险检测 + 运行记录 | 进行中 |
| Phase 5 | 多项目空间、Worker 预览、自我进化 | 计划中 |

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DeliciousBuding/PilotFlow&type=Date)](https://star-history.com/#DeliciousBuding/PilotFlow&Date)

## 致谢

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent 运行时底座
- [OpenClaw](https://openclaw.ai) — 飞书 Agent 集成参考
- 飞书 / Lark 开放平台
- 飞书 AI 校园挑战赛
