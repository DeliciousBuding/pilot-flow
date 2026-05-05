# ✈️ PilotFlow

**飞书群里的 AI 项目运行官**

群聊一句需求 → 确认卡片 → 一键创建飞书文档、多维表格、任务、日历、群卡片、权限和提醒。Hermes Agent 负责理解意图和选择下一步，PilotFlow 负责确认门控和飞书执行。

[English Version](README_EN.md)
[![Hermes](https://img.shields.io/badge/Hermes-插件-6f42c1)](https://github.com/NousResearch/hermes-agent)

---

## 解决什么问题

飞书群里讨论项目，目标、成员、交付物、截止时间、风险散落在聊天里，不会自动变成协作产物。**PilotFlow 在群聊里识别这些信号，先发卡片确认，用户确认后一键创建真实飞书资源，并持续追踪状态。**

| 飞书项目 | PilotFlow |
| --- | --- |
| 项目创建后的管理与执行 | 项目还没形成时：群聊里识别意图、建议项目化、确认后写入飞书 |
| 工作台 / 项目空间入口 | 群聊对话入口，自然语言驱动 |
| 手动创建项目空间 | Agent 从上下文主动发现，Hermes 理解语义，PilotFlow 执行 |

PilotFlow 和飞书项目互补。飞书项目 OpenAPI 可用后优先对接作为权威项目后端。

## 已验证的真实能力

| 能力 | 证据 |
| --- | --- |
| @bot 一句话创建项目空间 | 真实 Feishu 群 @mention → Agent 推理 → 计划卡 → 确认 → 文档/Base/任务/日历/入口卡 |
| 确认门控 + 取消路径 | chat_id 级 TTL（10min），文字确认/卡片确认/取消三条路径全部验证 |
| 危险动作二次确认 | 移除成员/归档项目强制要求确认文本，不可静默执行 |
| Agent 主驾驶（工具不拍板） | view_mode / template / risk_level / page / filters 5 处必须 Agent 显式传字段；`allow_inferred_*=true` 仅回归用 |
| 互动卡片 + 按钮回调 | `/card` 桥接，确认/取消/标记完成/重开/解除风险/催办/待办/看板分页全部跑通 |
| 状态看板 + 催办看板 | 项目进展/逾期/近期截止/风险筛选，倒计时色标 |
| 站会简报 | 风险优先排序 + 指标汇总 + 一键催办/创建待办按钮 |
| 飞书文档留痕 | 状态变更/催办/新增交付物写回项目文档 |
| 多维表格流水 | 每次更新追加变更记录，可追溯 |
| 卡片失败可重试 | 按钮操作失败后保留 action ref，网络恢复可点同一按钮继续 |
| 重启后恢复 | 脱敏状态文件（公共）+ 私有资源 refs 全套恢复链，含文件锁（msvcrt/fcntl） |
| 隐私脱敏 | 公共 state 不含 URL/token/open_id/chat_id/message_id；资源链接进私有 refs |
| 群聊非 @ 订阅 | `pilotflow_subscribe_chat` 生成 per-group `require_mention: false` 配置片段 |
| Hermes 深度集成 | memory 写入、cron 截止提醒、插件级 `/card` 桥接、`registry.dispatch` 消息发送，不修改 Hermes 源码 |
| 自动化测试 | 328 个单元/集成/配置校验/多进程并发测试 |
| WSL 安装可复现 | `python setup.py --hermes-dir <path> --hermes-home ~/.hermes`，配置校验 + display 降噪 + 6 文件复制 + 运行态 verifier |

完整测试证据见 [LIVE_TEST_EVIDENCE.md](docs/LIVE_TEST_EVIDENCE.md)。

## 技术边界

```
Hermes Agent 运行时（LLM + 飞书 WebSocket 网关 + 工具注册 + memory + cron）
  └── PilotFlow 插件（9 个工具，lark_oapi SDK 直连 + /card 桥接命令）
```

- **不改 Hermes 源码**：PilotFlow 是纯插件，通过 `ctx.register_tool()` 和 `/card` 命令桥接运行
- **Agent 主驾驶**：5 类语义参数（view_mode / template / risk_level / page / filters）必须 Agent 显式传入，工具默认不自行推断
- **飞书直连**：文档/Base/任务/日历走 lark_oapi SDK；卡片走 Feishu IM API 直发；文本消息复用 `registry.dispatch("send_message")`
- **LLM 可替换**：OpenAI-compatible API，按 Hermes 配置；已验证 `mimo-v2.5-pro`
- **工程债识**：`tools.py` 已超 5000 行，复赛后拆分 `actions.py` / `state.py` / `feishu_client.py`

## 快速开始

```bash
git clone https://github.com/NousResearch/hermes-agent.git && cd hermes-agent && uv sync --extra feishu
git clone https://github.com/DeliciousBuding/PilotFlow.git && cd PilotFlow
python setup.py --hermes-dir <hermes-agent-path>
# 编辑 ~/.hermes/.env 填入 FEISHU_APP_ID / FEISHU_APP_SECRET 和 LLM API key
uv run hermes gateway
```

详细安装 + 群聊订阅模式配置见 [INSTALL.md](INSTALL.md)，上手指令见 [USER_GUIDE.md](docs/USER_GUIDE.md)。

## 文档

| 面向评委 | 面向用户 |
| --- | --- |
| [复赛材料](docs/CONTEST_SUBMISSION.md) — 定位、演示路线、证据矩阵 | [用户指南](docs/USER_GUIDE.md) — 我能问什么、常见问题 |
| [产品规格](docs/PRODUCT_SPEC.md) — 用户承诺、功能分级 | [安装指南](INSTALL.md) — 安装 + 群聊订阅配置 |
| [架构设计](docs/ARCHITECTURE.md) — 组件、状态模型、工具路由 | [答辩 Q&A](docs/Q_AND_A.md) — 10 条高频追问准备稿 |
| [真实测试证据](docs/LIVE_TEST_EVIDENCE.md) — 脱敏验证记录 | |
| [交付审计](docs/DELIVERY_AUDIT.md) — 需求/证据/缺口审计 | |

## 致谢

[Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent 运行时底座 · 飞书开放平台 · 飞书 AI 校园挑战赛
