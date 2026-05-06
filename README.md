<div align="center">

# ✈️ PilotFlow
## 飞书群里的 AI 项目启动官

把群聊里散落的目标、承诺、截止时间，整理成确认过的飞书项目。

[English](README_EN.md) &nbsp;·&nbsp; [快速开始](#quick-start) &nbsp;·&nbsp; [使用指南](docs/USER_GUIDE.md)

<img src="https://img.shields.io/badge/version-1.12.0-blue?style=flat-square" alt="version">
<img src="https://img.shields.io/badge/python-3.12+-informational?style=flat-square&logo=python" alt="python">
<img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="license">

</div>


## 群聊里的项目启动官

群里讨论项目的时候，目标、成员、交付物、截止时间、风险常常散落在聊天里。PilotFlow 接住这些信号，先发计划卡片让用户确认，确认后再创建飞书文档、多维表格、任务、日历和群入口卡。

**和飞书项目（Meego）的差异**：飞书项目适合承载已经立项后的工作项管理；PilotFlow 处理上一步——项目还没形成时，群聊里的目标识别、信息追问、确认和创建。两者衔接顺序是 PilotFlow → 飞书项目，不是替代。

<br>

## 怎么工作

```
你：@PilotFlow 帮我准备产品发布，成员小王、小李，交付物是发布说明和检查清单，5 月 7 日截止

PilotFlow：
  ① 发确认卡片到群里，展示提取出的目标、成员、交付物、截止时间
  ② 你点击 ✅ 确认（或回复"确认执行"）
  ③ PilotFlow 同时创建：
     ├── 📄 飞书文档（格式化 + @成员 + 自动开权限）
     ├── 📊 多维表格（项目状态台账 + 自动写记录）
     ├── 📋 飞书任务（分配负责人 + 截止时间）
     ├── 📅 日历事件（截止提醒）
     ├── 🔔 Hermes cron 截止前自动催办
     └── 📌 项目入口卡片（群内一键跳转所有资源）

  之后：
  ④ 你说"进展如何？" → 看板卡片，倒计时色标
  ⑤ 你说"把截止改到 5 月 10 日" → 状态表自动同步 + 群通知
  ⑥ 你说"项目卡住了" → 标记风险 + 写飞书文档留痕
  ⑦ 你说"完成了" → 标记完成 + 归档看板
```

<br>

## 主要能力

| 你会做的事 | PilotFlow 做的 |
| :--- | :--- |
| 在打开订阅的群里出现目标、承诺、风险 | 🔍 主动识别后建议整理成项目（订阅模式可选） |
| 说一句要创建项目 | 📋 发确认卡片，你点一下就行 |
| 需要飞书文档、表格、任务 | 🚀 一键全建好，成员自动 @，权限自动开 |
| 想看进展 | 📊 看板卡片，逾期/风险/近期截止一目了然 |
| 要催办 | 📢 一键群内催办，自动写文档留痕 |
| 项目状态变了 | 🔄 文档、表格、看板全部同步，不用手动改 |
| 网络抖了，按钮点了没反应 | 🔁 自动保留，重试就好，不用重新发起 |
| 担心隐私 | 🛡 群 ID、成员 ID、文档链接不进公开仓库 |
| Hermes 重启了 | 💾 项目数据自动恢复，该看板看板，该催办催办 |

<br>

## 用 Hermes，但不改 Hermes

```
 Hermes Agent Runtime (LLM + 飞书网关 + 工具注册 + memory + cron)
                          │
                 Plugin Interface
                          │
  ┌───────────────────────▼─────────────────────────┐
  │              PilotFlow Plugin                    │
  │                                                  │
  │   9 tools  ·  /card bridge  ·  lark_oapi SDK     │
  │                                                  │
  │   generate_plan          create_project_space    │
  │   query_status           update_project          │
  │   scan_chat_signals      handle_card_action      │
  │   detect_risks           health_check            │
  │   subscribe_chat                                 │
  │                                                  │
  │   ── Agent 主驾驶：5 类决策字段必须 LLM 显式传    │
  │   ── 卡片失败重试：按钮操作网络恢复自动续跑      │
  │   ── 隐私脱敏：公共 state 不含 ID/URL/token      │
  └──────────────────┬──────────────────────────────┘
                     │ lark_oapi SDK
                     ▼
  ┌─────────────────────────────────────────────────┐
  │           Feishu Open API                        │
  │   文档 · Base · 任务 · 日历 · 权限 · IM · 卡片   │
  └─────────────────────────────────────────────────┘
```

纯插件运行，一行 Hermes 源码都不改。通过 `ctx.register_tool()` 和 `/card` 命令桥接接入。

<br>

## Quick Start

```bash
git clone https://github.com/NousResearch/hermes-agent.git && cd hermes-agent
uv sync --extra feishu

git clone https://github.com/DeliciousBuding/PilotFlow.git && cd PilotFlow
python setup.py --hermes-dir <hermes-agent-path>

# 编辑 ~/.hermes/.env → FEISHU_APP_ID / FEISHU_APP_SECRET / LLM API key
uv run hermes gateway
```

[安装详解](INSTALL.md) · [群聊订阅模式](INSTALL.md#群聊订阅模式可选) · [使用指南](docs/USER_GUIDE.md)

<br>

## Docs

|  |  |
| :--- | :--- |
| 📖 [用户指南](docs/USER_GUIDE.md) | 我能问什么？自然语言指令样例 + FAQ |
| 📦 [安装指南](INSTALL.md) | 安装 + 群聊订阅配置 |
| 🏗 [架构设计](docs/ARCHITECTURE.md) | 组件 · 状态模型 · 工具路由 |
| 📋 [产品规格](docs/PRODUCT_SPEC.md) | 功能分级 · 技术约束 |

<br>

## Credits

[Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent 运行时 · 飞书开放平台

<br>

<div align="center">

### ✈️ 让群聊里的项目讨论，落到飞书。

</div>
