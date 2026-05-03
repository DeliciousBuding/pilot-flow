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

## 2026-05-03 重启后项目看板恢复场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 前置创建 | 使用真实 Feishu SDK 创建 `重启恢复看板验证` 项目空间，插件写入脱敏状态文件 |
| 状态文件位置 | 默认位于 Hermes 用户目录下，可通过 `PILOTFLOW_STATE_PATH` 覆盖 |
| 状态文件脱敏 | 检查结果：不包含 URL、`app_token`、`table_id`、`record_id`、`open_id`、`chat_id` |
| 重启验证 | 重启 gateway 后发送 `PilotFlow 真实回归：重启后项目进展如何？` |
| 看板结果 | Bot 返回 `项目看板已发送，共 1 个项目。` |
| 看板内容 | `项目看板` 卡片展示 `重启恢复看板验证`、交付物、截止时间、倒计时和 `来源: 本地状态` |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接和状态文件绝对路径不写入公开仓库 |

## 2026-05-03 项目看板互动按钮场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 群聊触发 | 通过 `lark-cli im +messages-send --as user` 在真实 Feishu 测试群发送 `@PilotFlow 项目进展如何？` |
| 看板卡片 | 最近消息中出现 `msg_type=interactive` 的 `项目看板` 卡片 |
| 操作按钮 | 看板卡片内容展示 `查看状态` / `标记完成` 按钮 |
| 重启后状态更新 | 在 WSL runtime 中调用同一卡片动作处理器，将脱敏状态文件中的项目状态从 `进行中` 更新为 `已完成` |
| gateway 回读 | 再次从 Feishu 群触发 `@PilotFlow 再看一下项目进展`，新看板卡片显示同一项目 `已完成` |
| 隐私处理 | 看板按钮只携带短期 opaque action id；真实 chat_id、open_id、message_id、文档链接、状态表链接和状态文件绝对路径不写入公开仓库 |

## 2026-05-03 重启后自然语言更新项目场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 前置状态 | gateway 重启后 registry 为空，但 Hermes 用户目录下存在 PilotFlow 脱敏项目状态 |
| 群聊触发 | 通过 `lark-cli im +messages-send --as user` 在真实 Feishu 测试群发送 `@PilotFlow 把重启恢复看板验证的截止时间改到2026-05-18` |
| 更新结果 | Bot 返回 `已更新项目「重启恢复看板验证」的截止时间为 2026-05-18。本地状态已更新。` |
| 群通知 | Bot 同步发送项目更新通知，包含新截止时间、倒计时和 `本地状态已更新` |
| 看板回读 | 再次从 Feishu 群触发 `@PilotFlow 看一下项目进展和截止时间`，新 `项目看板` 卡片显示截止时间 `2026-05-18`、剩余天数和操作按钮 |
| 隐私处理 | 重启 fallback 只更新脱敏字段；不写入成员、URL、`app_token`、`table_id`、`record_id`、`open_id`、`chat_id` 或真实 message_id |

## 2026-05-04 项目详情互动卡场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env`，直接调用同一个 `project_status` 卡片动作处理器 |
| 动作结果 | 工具返回 `project_status_sent`，并确认 `card_sent=true` |
| 飞书消息 | 最近消息中出现 `msg_type=interactive` 的 `项目详情` 卡片 |
| 卡片内容 | 详情卡展示项目名、目标、状态、交付物、截止时间，并包含 `标记完成` 按钮 |
| 隐私处理 | 详情卡按钮只携带短期 opaque action id；真实 chat_id、open_id、message_id、文档链接、状态表链接和 token 不写入公开仓库 |

## 2026-05-04 新增交付物与任务场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 群聊触发 | 通过 `lark-cli im +messages-send --as user` 在真实 Feishu 测试群发送 `@PilotFlow 给重启恢复看板验证新增交付物：用户访谈记录` |
| 更新结果 | Bot 返回已更新项目交付物，并提示 `本地状态已更新` |
| 看板回读 | 再次从 Feishu 群触发项目进展查询，`项目看板` 卡片展示交付物包含 `重启恢复记录、用户访谈记录` |
| 任务创建验证 | 在 WSL runtime 中加载 Hermes 用户 `.env`，注册临时内存项目后调用 `add_deliverable`，工具返回 `task_created=true`，确认新增交付物可创建真实飞书任务 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但飞书任务创建走真实 API |
| 隐私处理 | 真实 chat_id、open_id、message_id、任务 ID、文档链接、状态表链接和 token 不写入公开仓库 |

## 2026-05-04 项目看板状态筛选场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 未完成查询 | 通过 `lark-cli im +messages-send --as user` 在真实 Feishu 测试群发送 `@PilotFlow 看看未完成项目` |
| 未完成结果 | `项目看板` 互动卡只展示进行中的项目，未混入已完成项目 |
| 已完成查询 | 通过真实 Feishu 测试群发送 `@PilotFlow 看看已完成项目` |
| 已完成结果 | `项目看板` 互动卡只展示已完成项目，未混入进行中项目 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接和 token 不写入公开仓库 |

## 2026-05-04 已完成项目重新打开场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 已完成看板 | 通过真实 Feishu 测试群发送 `@PilotFlow 看看已完成项目`，`项目看板` 卡片展示已完成项目，并显示 `查看状态` / `重新打开` 按钮 |
| 重开动作 | 在 WSL runtime 中调用同一个 `reopen_project` 卡片动作处理器，工具返回 `project_reopened` |
| 状态回读 | 再次从 Feishu 群触发 `@PilotFlow 看看未完成项目`，看板展示该项目状态已回到 `进行中`，按钮恢复为 `标记完成` |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但状态更新和看板回读均使用同一插件状态文件 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接和 token 不写入公开仓库 |

## 2026-05-04 项目更新写回飞书文档场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env`，用真实 Feishu SDK 创建临时项目文档，再注册内存项目并调用 `pilotflow_update_project` |
| 文档创建 | 工具返回 `doc_created=true`，说明项目文档通过真实 Feishu docx API 创建成功 |
| 更新写回 | 调用 `update_status` 后工具返回 `project_updated` 且 `doc_updated=true`，说明项目更新记录已写回飞书文档 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但文档创建和文档更新均走真实 Feishu API |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接、doc token 和 app token 不写入公开仓库 |

## 2026-05-04 项目进展记录写回场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env`，用真实 Feishu SDK 创建临时项目文档和多维表格，再调用 `pilotflow_update_project` 的 `add_progress` 动作 |
| 资源创建 | 工具输出确认 `doc_created=true` 和 `bitable_created=true` |
| 进展写回 | 工具输出确认 `status=project_updated`、`doc_updated=true`、`bitable_history_created=true`、`state_updated=true` |
| 用户价值 | 群里一句“项目有新进展”可以沉淀到项目文档、状态表流水和脱敏状态，不再只是一次性聊天回复 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但文档、多维表格和状态写回均已走真实链路 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接、doc token、app token、table ID 和 record ID 不写入公开仓库 |

## 2026-05-04 项目详情卡资源链接场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env`，用真实 Feishu SDK 创建临时项目文档和多维表格，再注册内存项目并调用 `project_status` 卡片动作 |
| 资源创建 | 工具输出确认 `doc_created=true` 和 `bitable_created=true` |
| 详情卡 | 最近消息中出现 `msg_type=interactive` 的 `项目详情` 卡片 |
| 链接展示 | 详情卡资源区展示 `项目文档` 和 `状态表` 两个可点击链接 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接、doc token 和 app token 不写入公开仓库 |

## 2026-05-04 交付物同步多维表格场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env`，用真实 Feishu SDK 创建临时多维表格，再注册内存项目并调用 `add_deliverable` |
| 表格创建 | 工具输出确认 `created=true`，说明项目状态表通过真实 Feishu bitable API 创建成功 |
| 更新写回 | 调用 `add_deliverable` 后工具返回 `updated=true`，对应 `bitable_updated=true`，说明新增交付物已同步到状态表 |
| 状态持久化 | 工具输出确认 `state_updated=true`，说明脱敏本地状态同步更新 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但多维表格创建和记录更新均走真实 Feishu API |
| 隐私处理 | 真实 chat_id、open_id、message_id、状态表链接、app token、table ID 和 record ID 不写入公开仓库 |

## 2026-05-04 定向项目详情查询场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 内存项目查询 | 在 WSL runtime 中注册临时内存项目后查询 `项目名 + 进展如何`，工具输出确认 `detail_sent=true` 且 `dashboard_sent=false` |
| 卡片交互 | 工具输出确认 `has_next_action=true`，说明详情卡带有下一步操作按钮 |
| 重启状态查询 | 清空 registry 后只写入脱敏状态文件，再查询 `项目名 + 进展如何`，工具输出确认 `detail_sent=true`、`dashboard_sent=false`、`state_only=true` |
| 用户价值 | 用户在群里问具体项目进展时直接收到详情卡，不需要先看全局看板再点 `查看状态` |
| 隐私处理 | 真实 chat_id、open_id、message_id、状态文件绝对路径和任何飞书资源链接不写入公开仓库 |

## 2026-05-04 卡片状态动作写回项目文档场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 标记完成 | 在 WSL runtime 中用真实 Feishu SDK 创建临时项目文档，再触发 `mark_project_done` 卡片动作；工具输出确认 `doc_created=true`、`marked_done=true`、`doc_updated=true` |
| 重新打开 | 用真实 Feishu SDK 创建另一个临时项目文档，再触发 `reopen_project` 卡片动作；工具输出确认 `doc_created=true`、`reopened=true`、`doc_updated=true` |
| 用户价值 | 用户点击卡片改变项目状态后，项目文档同步留下状态变更记录，避免卡片状态和文档纪要脱节 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但项目文档创建和更新均走真实 Feishu docx API |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、doc token 和状态文件绝对路径不写入公开仓库 |

## 2026-05-04 新增成员刷新资源权限场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中用真实 Feishu SDK 创建临时项目文档和多维表格，再调用 `add_member` 更新项目成员 |
| 文档/表格创建 | 工具输出确认 `doc_created=true`、`bitable_created=true` |
| 成员更新 | 工具输出确认 `project_updated=true`、`registry_updated=true` |
| 权限刷新 | 工具输出确认 `permission_refreshed=true`，说明已对项目文档和状态表重新执行权限/编辑者补齐逻辑 |
| 状态表同步 | 工具输出确认 `bitable_updated=true`，说明新增成员同步到状态表负责人字段 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但文档、状态表和权限刷新均走真实 Feishu API |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接、doc token、app token、table ID 和 record ID 不写入公开仓库 |

## 2026-05-04 PilotFlow 运行健康检查场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env`，调用 `pilotflow_health_check` 对当前运行环境做脱敏诊断 |
| 检查结果 | 工具输出确认 `status=ok`、`credentials=已配置`、`client=可用`、`chat_context=已检测` |
| 状态项 | 工具输出确认 `memory_read=开启`、`memory_write=开启`，并返回脱敏 state path 状态 |
| 用户价值 | 安装或现场演示时可以直接诊断 Feishu SDK、凭据、chat 上下文、状态路径和 memory 开关，而不是靠猜日志 |
| 隐私处理 | 输出不包含真实 app id、secret、chat_id、open_id、message_id、token、URL 或本地绝对路径 |

## 2026-05-04 多维表格更新流水场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中用真实 Feishu SDK 创建临时多维表格，再调用 `update_status` 更新项目状态 |
| 表格创建 | 工具输出确认 `bitable_created=true` |
| 主记录更新 | 工具输出确认 `project_updated=true`、`bitable_updated=true`、`state_updated=true` |
| 流水记录 | 工具输出确认 `history_created=true`，说明状态表追加了 `update` 类型的更新记录 |
| 用户价值 | 状态表不再只保留当前值；每次更新会留下可追溯流水，方便复盘项目推进过程 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但多维表格创建、主记录更新和流水追加均走真实 Feishu Bitable API |
| 隐私处理 | 真实 chat_id、open_id、message_id、状态表链接、app token、table ID 和 record ID 不写入公开仓库 |

## 2026-05-04 更新截止日期联动日历和提醒场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env` 和真实 Feishu channel 上下文，注册临时内存项目后调用 `update_deadline` |
| 日历联动 | 工具输出确认 `calendar_event_created=true`，说明新截止日期已创建真实 Feishu 日历事件 |
| 提醒联动 | 工具输出确认 `reminder_scheduled=true`，说明已通过 Hermes `cronjob` 工具创建截止提醒；验证后临时提醒已清理 |
| 中文反馈 | 工具输出确认返回指令包含 `日历事件已更新` 和 `截止提醒已设置` |
| 用户价值 | 用户修改项目截止日期后，项目状态、飞书日历和 Hermes 提醒同步变化，不需要人工再补日程或提醒 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用；日历 API 和 cron 调度均已用 WSL runtime 真实验证 |
| 隐私处理 | 真实 chat_id、open_id、message_id、日历 ID、日历事件链接、cron job ID 和本地绝对路径不写入公开仓库 |

## 2026-05-04 Hermes 会话上下文补全计划场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中设置 Hermes Feishu session context，调用 `pilotflow_generate_plan` 并真实发送执行计划卡片 |
| 群名补全 | 工具输出确认 `title_has_context_prefix=true`，说明缺标题时使用 Hermes 会话群名作为标题前缀 |
| 发起人补全 | 工具输出确认 `initiator_in_members=true`、`pending_has_initiator=true`，说明缺成员时自动把会话发起人放入计划和待确认计划 |
| 卡片验证 | 工具输出确认 `card_sent=true`，说明补全后的计划卡片已通过真实 Feishu 卡片发送链路发出 |
| 用户价值 | 用户只说“帮我创建项目”时，PilotFlow 能利用当前群和发起人上下文生成更完整的计划，减少反复追问 |
| 隐私处理 | 真实 chat_id、open_id、message_id、群名、用户 ID 和用户真实姓名不写入公开仓库 |

## 2026-05-04 成员解析失败显式反馈场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载真实 Feishu channel 上下文，使用真实群成员查询识别不可解析成员，并发送项目入口卡片 |
| 成员解析 | 工具输出确认 `unresolved_members_detected=true`，说明不在群内或无法解析的成员不再静默降级 |
| 用户反馈 | 工具输出确认 `display_has_warning=true`、`instructions_has_warning=true`，说明最终回复会提示哪些成员未能 `@` |
| 卡片验证 | 工具输出确认 `card_sent=true`，说明入口卡片也走真实 Feishu 卡片发送链路 |
| 用户价值 | 用户创建项目时能立刻知道谁没有被真正提及或分配，避免任务看似派发、实际没人收到 |
| 隐私处理 | 真实 chat_id、open_id、message_id、群成员姓名和卡片 message_id 不写入公开仓库 |

## 2026-05-04 项目归档生命周期场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中注册进行中项目和已归档项目，分别查询默认看板、所有项目和归档项目 |
| 默认看板 | 工具输出确认 `default_sent=true` 且 `default_filter_hides_archived=true`，说明归档项目默认不再污染日常看板 |
| 显式查询 | 工具输出确认 `all_filter_shows_archived=true`、`archive_filter_shows_archived=true`，说明用户说“所有项目”或“归档项目”时仍可找回 |
| 卡片验证 | 工具输出确认 `default_sent=true`、`all_sent=true`、`archived_sent=true`，三次看板都走真实 Feishu 卡片发送链路 |
| 用户价值 | 项目结束后可用 `update_status=已归档` 收纳旧项目，日常看板只保留需要推进的项目 |
| 隐私处理 | 真实 chat_id、open_id、message_id、卡片 message_id 和本地绝对路径不写入公开仓库 |

## 2026-05-04 项目看板分页场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中注册 12 个临时内存项目，分别查询默认看板和 `第2页` 看板 |
| 分页结果 | 工具输出确认 `first_sent=true`、`second_sent=true`，两页看板均通过真实 Feishu 卡片发送链路发出 |
| 页码反馈 | 工具输出确认 `first_result_has_page=true`、`second_result_has_page=true`，返回文案包含 `第 1/2 页` 和 `第 2/2 页` |
| 卡片交互 | 看板超过一页时会生成 `上一页` / `下一页` 按钮；按钮 payload 只携带短期 action id，不携带群 ID |
| 配置性 | 工具输出确认 `page_size=10`；实际页大小可通过 `PILOTFLOW_DASHBOARD_PAGE_SIZE` 配置，非法配置会回退默认值而不是阻断插件导入 |
| 用户价值 | 项目数量增长后看板不会一次性塞满，用户可按页查看，保持群聊卡片可读 |
| 隐私处理 | 真实 chat_id、open_id、message_id、卡片 message_id 和本地绝对路径不写入公开仓库 |

## 本地回归

```bash
uv run pytest -o addopts='' -q
```

结果：

```text
93 passed
```

## 当前证据边界

- 已有真实证据：Feishu 网关可接收群消息，PilotFlow 可发中文文本反馈、互动看板卡片、执行计划卡片、确认完成卡片、项目入口卡片和取消反馈。
- 已有历史现场验证：确认按钮可触发项目创建，原确认卡片可更新为已创建状态；`确认卡片` 请求不会再被当作执行确认；入口卡片完成动作可同步状态表；重启后看板可从脱敏状态文件恢复项目摘要；项目看板卡片可展示操作按钮并回读已完成状态；重启后自然语言修改截止时间可更新脱敏状态并被看板回读；查看状态动作可发送项目详情互动卡；新增交付物可更新看板，并在内存项目模式下创建飞书任务；看板支持未完成/已完成项目筛选；已完成项目可通过卡片动作重新打开；项目更新可写回飞书文档；项目进展可写回项目文档和多维表格流水；项目详情卡可展示文档和状态表资源链接；新增交付物可同步写回多维表格交付物字段；按项目名直接查询可发送项目详情卡，且支持脱敏状态 fallback；卡片标记完成/重新打开可写回项目文档；新增成员可刷新项目文档/状态表权限并同步状态表负责人字段；运行健康检查可脱敏诊断当前 WSL/Hermes/Feishu 配置状态；项目更新会向多维表格追加可追溯流水记录；更新截止日期会刷新 Feishu 日历事件并重设 Hermes 截止提醒；生成计划会利用 Hermes 会话群名和发起人补全项目上下文；创建项目时会显式提示未能解析为飞书 @ 的成员；项目可归档并默认从日常看板隐藏；项目看板支持分页查看和卡片按钮翻页。
- 提交材料仍需补齐：成功创建路径录屏、取消路径录屏、真实文档/多维表格/任务/日历链接清单。该清单应进入私有提交材料或飞书在线文档，不建议直接提交到公开仓库。
