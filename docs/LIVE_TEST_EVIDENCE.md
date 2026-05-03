# 真实测试证据（脱敏）

> 本文件只记录可复验结论和脱敏摘要，不提交真实群 ID、用户 open_id、应用 secret、message_id 或飞书文档链接。

## 2026-05-03 状态看板场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已运行，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| CLI 身份 | `lark-cli auth status` 显示 user token valid |
| 发送方式 | `lark-cli im +messages-send --as user` 向 Hermes 记录的 Feishu 测试群发送文本查询 |
| 用户输入 | `PilotFlow 真实测试：项目进展如何？` |
| Bot 文本反馈 | `项目看板已发送，共 1 个项目。` |
| Bot 卡片反馈 | 最近消息中出现 `msg_type=interactive` 的 `项目看板` 卡片 |
| 看板内容 | 卡片展示已创建项目、成员、截止时间、倒计时和状态 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接和状态表链接不写入公开仓库 |

## 2026-05-03 文字确认创建场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | 同一 WSL Hermes gateway 与同一 Feishu 测试群 |
| 发送方式 | `lark-cli im +messages-send --as user` 发送创建需求，再发送 `确认执行` |
| 用户创建输入 | `PilotFlow 真实测试：帮我创建迁移验证项目，成员示例成员A，交付物是迁移验证记录，5月10日截止` |
| 计划反馈 | Bot 返回中文文本 `已生成计划，请在卡片上确认。` |
| 计划卡片 | 最近消息中出现 `msg_type=interactive` 的 `执行计划` 卡片，包含成员、交付物、截止时间和确认/取消按钮 |
| 文字确认 | 用户发送 `确认执行` 后，Bot 返回 `已确认并创建` 互动卡片 |
| 项目入口 | Bot 发送 `迁移验证项目` 项目入口互动卡片 |
| 产物摘要 | 项目入口卡片包含飞书文档链接、状态表链接、成员和截止时间 |
| 隐私处理 | 真实文档 URL、状态表 URL、chat_id、open_id、message_id 不写入公开仓库 |

## 2026-05-03 文字取消场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | 同一 WSL Hermes gateway 与同一 Feishu 测试群 |
| 发送方式 | `lark-cli im +messages-send --as user` 发送创建需求，再发送 `取消执行` |
| 用户创建输入 | `PilotFlow 真实测试：帮我创建取消验证项目，成员示例成员A，交付物是取消验证记录，5月12日截止` |
| 计划反馈 | Bot 返回中文文本 `已生成计划，请在卡片上确认。` |
| 计划卡片 | 最近消息中出现 `msg_type=interactive` 的 `执行计划` 卡片，包含成员、交付物、截止时间和确认/取消按钮 |
| 取消反馈 | 用户发送 `取消执行` 后，Bot 返回 `已取消。` 和 `已取消本次项目创建。` |
| 未创建确认 | 最近消息中未出现 `取消验证项目` 的项目入口卡片 |
| 隐私处理 | 真实 chat_id、open_id、message_id 不写入公开仓库 |

## 2026-05-03 确认语义回归场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 发送方式 | `lark-cli im +messages-send --as user` 向 Hermes 记录的 Feishu 测试群发送文本 |
| 负路径输入 | `PilotFlow 真实回归：帮我准备一个迁移验收项目，先给我确认卡片，不要直接创建` |
| 负路径结果 | Bot 只返回 `已生成计划，请在卡片上确认。` 和 `执行计划` 互动卡片 |
| 未创建确认 | 负路径最近消息中未出现 `已确认并创建`、项目入口卡片、飞书文档链接或状态表链接 |
| 正路径输入 | 用户随后独立发送 `确认执行` |
| 正路径结果 | Bot 返回项目空间创建摘要，包含文档、状态表、任务和群通知 |
| 入口卡片 | Bot 发送 `迁移验收项目` 入口互动卡片，包含 `查看状态` / `标记完成` 按钮 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接和状态表链接不写入公开仓库 |

## 2026-05-03 入口卡片完成状态同步场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 内直接调用 PilotFlow 工具链，使用真实 Feishu SDK 创建项目空间，再调用 `mark_project_done` 卡片动作 |
| 创建结果 | 工具返回 `project_space_created`，并在 Feishu 群里出现项目入口互动卡片 |
| 状态表 metadata | 创建后项目 registry 中存在 `app_token`、`table_id`、`record_id`，证明可定位状态表记录 |
| 完成动作 | `mark_project_done` 返回 `project_marked_done` |
| 状态表同步 | 工具返回 `bitable_updated=True`，registry 状态变为 `已完成` |
| 群卡片确认 | 最近消息中出现 `按钮同步状态表验证` 项目入口卡片，包含文档、状态表、截止时间和 `查看状态` / `标记完成` 按钮 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但飞书文档、状态表、卡片和状态表更新均走真实 API |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接和 token 不写入公开仓库 |

## 本地回归

```bash
uv run pytest -o addopts='' -q
```

结果：

```text
58 passed
```

## 当前证据边界

- 已有真实证据：Feishu 网关可接收群消息，PilotFlow 可发中文文本反馈、互动看板卡片、执行计划卡片、确认完成卡片、项目入口卡片和取消反馈。
- 已有历史现场验证：确认按钮可触发项目创建，原确认卡片可更新为已创建状态；`确认卡片` 请求不会再被当作执行确认；入口卡片完成动作可同步状态表。
- 提交材料仍需补齐：成功创建路径录屏、取消路径录屏、真实文档/多维表格/任务/日历链接清单。该清单应进入私有提交材料或飞书在线文档，不建议直接提交到公开仓库。
