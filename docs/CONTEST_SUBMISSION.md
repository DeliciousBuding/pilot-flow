# 复赛材料包

## 项目定位

PilotFlow 是飞书群里的 AI 项目运行官。它面向团队在群聊中发起项目、筹备答辩、推进活动和管理交付的场景，把自然语言需求转成可确认的计划，并在确认后编排飞书文档、多维表格、任务、日历、群卡片、权限和提醒。

## 一、个人信息

| 姓名 | 项目中负责的工作简述 | 个人基本信息介绍 | 实习信息 |
| --- | --- | --- | --- |
| 参赛人（已脱敏） | PilotFlow 产品设计、Hermes 插件实现、飞书 API 集成、测试体系、文档和演示材料 | 个人信息待最终提交时补充 | 个人信息待最终提交时补充 |

## 二、项目结果展示

## 评委视角三句话

1. 痛点：群聊讨论容易散，任务、负责人、截止时间和风险很难自动沉淀。
2. 方案：PilotFlow 用 Hermes 做 Agent 底座，用飞书 OpenAPI 创建真实协作产物，把群聊入口变成项目启动流程。
3. 可信：所有写入前先发计划卡片确认，确认后才执行，过程有状态、可追踪、可取消、可降级。

## Demo 展示

当前仓库已完成本地测试、演示脚本、真实飞书卡片发送、按钮确认续跑和原卡片状态更新验证；提交前把录屏和真实产物链接汇总进材料包即可。演示脚本入口：

- GitHub README: https://github.com/DeliciousBuding/PilotFlow
- Demo script: https://github.com/DeliciousBuding/PilotFlow/blob/main/docs/demo/README.md
- Architecture: https://github.com/DeliciousBuding/PilotFlow/blob/main/docs/ARCHITECTURE.md

## Hermes 与 PilotFlow 的边界

| 层级 | Hermes | PilotFlow |
| --- | --- | --- |
| Agent 底座 | LLM 调度、工具注册、飞书网关、消息、memory、cron | 项目运行语义、模板、风险检测、确认门控、pending plan、多轮状态 |
| 飞书连接 | 网关接收消息，发送消息，卡片 action 路由 | 创建文档/多维表格/任务/日历，设置权限，解析成员，生成项目入口卡 |
| 用户体验 | 通用 agent runtime | 群聊需求到项目产物的一体化工作流 |

## 演示路线

| 场景 | 输入 | 展示重点 |
| --- | --- | --- |
| 成功路径 | `@PilotFlow 帮我准备答辩项目空间，成员示例成员A，交付物是项目简报和任务清单，5月7日截止` | 计划卡片、确认门控、文档/表格/任务/日历/入口卡、运行摘要 |
| 卡片确认 | 点击确认卡片的确认按钮 | 原卡片变为处理中 → Hermes card action → 插件 `/card` 桥接 → 从计划快照续跑 → 原卡片变为已创建 |
| 取消路径 | 点击取消按钮 | 原卡片变为已取消，清理确认门控，不创建项目 |
| 状态看板 | `@PilotFlow 项目进展如何？` | 项目看板、截止倒计时 |
| 多轮更新 | `@PilotFlow 把答辩项目的截止时间改成5月10日` | 状态同步、群通知 |

## 当前证据

| 证据 | 状态 |
| --- | --- |
| 本地测试 | `uv run pytest -o addopts='' -q`，47 个测试通过 |
| 插件注册 | 测试覆盖 6 个 Hermes 工具注册 |
| 卡片 action | 测试覆盖确认/取消路径和插件 `/card` 桥接 |
| 安装脚本 | 测试覆盖复制插件、复制 skill、环境变量、config 校验和 Feishu 显示降噪 |
| 真实飞书卡片 | 已验证发送为 `interactive` 卡片，点击后原卡片状态可更新 |
| 真实状态看板 | 2026-05-03 通过 lark-cli 发送状态查询，Bot 返回中文文本反馈和 `interactive` 看板卡片；见 [LIVE_TEST_EVIDENCE.md](LIVE_TEST_EVIDENCE.md) |
| 真实文字确认创建 | 2026-05-03 通过 lark-cli 跑通创建需求 → 计划卡片 → 文字确认 → 已确认并创建卡片 → 项目入口卡片；见 [LIVE_TEST_EVIDENCE.md](LIVE_TEST_EVIDENCE.md) |
| 真实文字取消 | 2026-05-03 通过 lark-cli 跑通创建需求 → 计划卡片 → 取消执行 → 已取消反馈且未创建项目；见 [LIVE_TEST_EVIDENCE.md](LIVE_TEST_EVIDENCE.md) |
| 真实飞书产物 | 2026-05-03 在真实群点击确认后创建文档、状态表和项目入口卡片 |
| 录屏 | 提交前补齐 |

## 风险与应对

| 风险 | 应对 |
| --- | --- |
| 现场飞书权限不足 | 提前跑真实群端到端验证，保留录屏和真实产物链接 |
| 卡片按钮在真实网关不续跑 | 插件 `/card` 桥接优先；文本 `确认执行` 作为兜底确认路径 |
| 群聊暴露内部工具名 | 安装脚本配置 `display.platforms.feishu.tool_progress=off` |
| memory 持久化隐私 | 默认不保存成员姓名，需环境变量显式开启 |
| 新机器安装失败 | `setup.py` 校验 `.env`、`config.yaml`、插件和 skill 安装结果 |

## 提交前补齐材料

| 材料 | 状态 |
| --- | --- |
| 成功路径录屏 | 待提交前汇总 |
| 失败/取消路径录屏 | 待提交前汇总 |
| 真实飞书文档/多维表格/任务链接 | 待提交前汇总 |
| 答辩 Q&A | 待提交前汇总 |
