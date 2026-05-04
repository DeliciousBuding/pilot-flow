# 真实测试证据（脱敏）

> 本文件只记录可复验结论和脱敏摘要，不提交真实群 ID、用户 open_id、应用 secret、message_id 或飞书文档链接。

## 2026-05-04 完整 @Bot 自动调用端到端场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | 受控 WSL foreground gateway，会话明确连接 Feishu WebSocket；Hermes runtime 使用 `/home/ding/.hermes` profile |
| 模型配置 | `hermes status` 显示 `Model: mimo-v2.5-pro`、`Provider: vectorcontrol`；WSL runtime 中 OpenAI-compatible 直接探针返回 HTTP 200 |
| 配置修复 | 旧 caveat 的 14:22 `HTTP 401 auth_unavailable` 发生在 WSL profile 仍使用旧 `gpt-5.5` 配置时；本次将 WSL profile 切到已验证可用的 `mimo-v2.5-pro` 后复测通过 |
| 用户入口 | 通过 `lark-cli im +messages-send --as user` 在真实 Feishu 测试群发送 `@PilotFlow 创建真实端到端验证项目 ...` |
| Agent 处理 | gateway 日志确认收到同一 @ 消息，随后 Hermes 用 `mimo-v2.5-pro` 进入 Agent 推理，无 401 认证错误 |
| 计划卡片 | Bot 在群内发送 `执行计划` 互动卡，卡片包含成员、交付物、截止时间和确认/取消按钮，并回复 `已生成计划，请在卡片上确认。` |
| 确认执行 | 用户在同一群发送 `确认执行` 后，gateway 日志确认再次进入 `mimo-v2.5-pro` Agent 回合并执行 PilotFlow 创建链路 |
| 飞书产物 | 日志确认真实创建项目文档、状态 Base、两条飞书任务、日历事件，并调度 Hermes 截止提醒 |
| 群内结果 | Bot 返回项目创建摘要和项目入口互动卡，入口卡包含文档、状态表、成员、截止时间、查看状态和标记完成动作 |
| 已知非阻塞告警 | 文档评论 SDK builder 字段告警、任务关注者“已是协作者”告警均不阻断文档/Base/任务/日历/提醒创建；执行后模型补充响应阶段出现一次 SSL ReadError 并自动重试成功 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档 URL、Base URL、任务 ID、calendar event ID、token 和 app secret 不写入公开仓库 |

## 2026-05-04 卡片输入安全与 WSL 安装复验

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | 新增回归验证：项目标题、成员名和最近进展中伪造的 `<at user_id="...">姓名</at>` 会在公开催办文本和脱敏状态进展里降级为普通 `@姓名`/姓名，不让用户输入或卡片 action 伪造 Feishu open_id mention |
| 测试隔离 | 集成测试新增临时 `PILOTFLOW_STATE_PATH` 和幂等/卡片/确认缓存清理，避免真实 runtime 或上次测试写入的 idempotency 状态让创建链路误判为 `project_space_replayed` |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `188 passed` |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；`.env`、`config.yaml`、Feishu display guard 和插件/skill 文件均指向 WSL runtime profile |
| WSL runtime dry-run | `verify_wsl_feishu_runtime.py --env-file /home/ding/.hermes/.env --config-file /home/ding/.hermes/config.yaml` 输出脱敏通过：`config_model=mimo-v2.5-pro`、`config_provider=vectorcontrol`、`config_has_feishu_gateway=true` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true`，输出不包含真实 chat_id、message_id、confirm token 或 idempotency key |

## 2026-05-04 卡片动作 opaque ref 强制校验

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | 新增回归验证：`mark_project_done`、`reopen_project`、`resolve_risk`、`send_project_reminder`、`create_followup_task`、`project_status`、看板翻页/筛选、批量催办/待办等项目变更或查询类卡片动作必须来自短期 `pilotflow_action_id`；裸 `{"pilotflow_action":"mark_project_done"}` 会返回“卡片操作已过期或已处理”且不改变项目状态 |
| 真实路径兼容 | `/card button {"pilotflow_action_id":"..."}` 桥接在解析并消费 action ref 后携带内部已验证标记转调 `_handle_card_action`，保持真实 Feishu 卡片按钮、重启恢复 action refs、单次消费和原卡片反馈逻辑可用 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `189 passed` |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件文件已同步到 WSL Hermes runtime |
| WSL runtime dry-run | `verify_wsl_feishu_runtime.py --env-file /home/ding/.hermes/.env --config-file /home/ding/.hermes/config.yaml` 输出脱敏通过：`config_model=mimo-v2.5-pro`、`config_provider=vectorcontrol`、`config_has_feishu_gateway=true` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true`，继续证明真实卡片只暴露 opaque action id 且可恢复 |

## 2026-05-04 Agent 主驾驶边界：计划生成结构化字段门控

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_generate_plan` 默认不再从 `input_text` 兜底解析标题、成员、交付物和截止时间；当 Agent 只传原文且没有任何结构化项目字段时，工具返回 `needs_clarification` 和缺失字段清单，不发送确认卡片 |
| 兼容路径 | 仅当 Agent 显式传 `allow_inferred_fields=true` 时，旧 `_extract_inline_project_fields` 文本解析才会启用；这让“工具做推断”成为显式行为，而不是默认偷偷修正 Agent 提取失败 |
| 真实路径兼容 | 集成测试已改为模拟 Agent 传入结构化 `title/goal/members/deliverables/deadline`；WSL `--send-card` verifier 继续通过，证明真实卡片计划生成路径不依赖 raw text fallback |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `191 passed` |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件文件已同步到 WSL Hermes runtime |
| WSL runtime dry-run | `verify_wsl_feishu_runtime.py --env-file /home/ding/.hermes/.env --config-file /home/ding/.hermes/config.yaml` 输出脱敏通过：`config_model=mimo-v2.5-pro`、`config_provider=vectorcontrol`、`config_has_feishu_gateway=true` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |

## 2026-05-04 Agent 主驾驶边界：文本确认显式字段门控

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_create_project_space` 不再把 `input_text="确认执行"` 当作执行确认；群聊文本确认路径必须由 Agent 显式传入 `confirmation_text`，否则返回错误并拒绝创建项目 |
| 真实能力保留 | `confirmation_text="确认执行"` 仍可从重启后的 pending plan 恢复项目字段、复用 idempotency key、执行创建链路，并保持重复确认幂等 |
| 卡片路径兼容 | 卡片确认按钮仍通过 `_pilotflow_gate_consumed` 跳过文本确认关键词判断；WSL `--send-card` verifier 继续通过 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `191 passed` |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件文件已同步到 WSL Hermes runtime |
| WSL runtime dry-run | `verify_wsl_feishu_runtime.py --env-file /home/ding/.hermes/.env --config-file /home/ding/.hermes/config.yaml` 输出脱敏通过：`config_model=mimo-v2.5-pro`、`config_provider=vectorcontrol`、`config_has_feishu_gateway=true` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |

## 2026-05-04 Agent 主驾驶边界：看板筛选显式字段门控

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_query_status` 默认不再从 `query` 推断 `risk/overdue/due_soon/active/completed` 或负责人筛选；Agent 必须显式传入 `filter` 和 `member_filters`，否则只按默认看板展示 |
| 批量催办硬化 | `pilotflow_update_project action=send_reminder` 默认不再从 `project_name="逾期项目"`、`"张三负责的逾期项目"` 推断批量催办范围；批量路径必须显式传入 `filter` 和 `member_filters` |
| 兼容路径 | 旧 `_status_filter_from_query` / `_member_filters_from_query` 仅在 `allow_inferred_filters=true` 时启用，作为显式兼容通道，不再是默认语义来源 |
| 卡片路径兼容 | 看板筛选、分页、简报批量催办、简报批量待办等卡片 action 继续通过 opaque `pilotflow_action_id` 携带结构化 `filter/member_filters`，不依赖 query 重新解析 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `193 passed` |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件文件已同步到 WSL Hermes runtime |
| WSL runtime dry-run | `verify_wsl_feishu_runtime.py --env-file /home/ding/.hermes/.env --config-file /home/ding/.hermes/config.yaml` 输出脱敏通过：`config_model=mimo-v2.5-pro`、`config_provider=vectorcontrol`、`config_has_feishu_gateway=true` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |

## 2026-05-04 Agent 主驾驶边界：项目模板显式字段门控

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_generate_plan` 默认不再从 `input_text` 中的“答辩/sprint/活动/上线”等关键词自动套模板；Agent 必须显式传入 `template` 才会补全模板交付物和建议截止时间 |
| 兼容路径 | 旧 `_detect_template` 仅在 `allow_inferred_template=true` 时启用，作为显式兼容通道，不再是默认语义来源 |
| 真实路径兼容 | 显式 `template="答辩"` 仍会补全答辩模板；未传 `template` 时即使原文含“答辩”也不会静默补 `PPT` 或模板截止时间 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `195 passed` |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件文件已同步到 WSL Hermes runtime |
| WSL runtime dry-run | `verify_wsl_feishu_runtime.py --env-file /home/ding/.hermes/.env --config-file /home/ding/.hermes/config.yaml` 输出脱敏通过：`config_model=mimo-v2.5-pro`、`config_provider=vectorcontrol`、`config_has_feishu_gateway=true` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |

## 2026-05-04 状态文件 schema 与并发写入硬化

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | 主状态文件 `pilotflow_projects.json` 写入时固定带 `schema_version=1`；旧版 list payload 会在下一次保存时兼容读取并升级为 dict payload |
| 并发硬化 | `_save_project_state` 改为进程内锁 + `.lock` 文件保护的 read-modify-write，避免多个卡片动作、多线程或多 worker 并发保存项目时互相覆盖公共状态列表 |
| 自动化验证 | 新增旧格式升级和 20 线程并发保存回归测试；`C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `197 passed` |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件文件已同步到 WSL Hermes runtime |
| WSL runtime dry-run | `verify_wsl_feishu_runtime.py --env-file /home/ding/.hermes/.env --config-file /home/ding/.hermes/config.yaml` 输出脱敏通过：`config_model=mimo-v2.5-pro`、`config_provider=vectorcontrol`、`config_has_feishu_gateway=true` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |

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

## 2026-05-04 项目风险上报写回场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env`，用真实 Feishu SDK 创建临时项目文档和多维表格，再调用 `pilotflow_update_project` 的 `add_risk` 动作 |
| 资源创建 | 工具输出确认 `doc_created=true` 和 `bitable_created=true` |
| 风险写回 | 工具输出确认 `status=project_updated`、`risk_level=高`、`registry_status=有风险`、`doc_updated=true`、`bitable_updated=true`、`bitable_history_created=true`、`state_updated=true` |
| 用户价值 | 群里一句“项目卡住了/有风险”可以把项目切到风险态，并同步文档、状态表风险等级和流水，便于后续跟踪 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但文档、多维表格和状态写回均已走真实链路 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接、doc token、app token、table ID 和 record ID 不写入公开仓库 |

## 2026-05-04 风险项目看板筛选场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中注册一个正常项目和一个 `有风险` 项目，查询 `看看风险项目` |
| 筛选结果 | 工具输出确认 `risk_filter=true`、`result_has_count=true`，说明只命中 1 个风险项目 |
| 卡片发送 | 工具输出确认 `sent=true`，风险项目看板通过真实 Feishu 卡片发送链路发出 |
| 用户价值 | 风险上报后可以直接在群里追问风险项目，不需要从日常看板里人工筛选 |
| 隐私处理 | 真实 chat_id、open_id、message_id、卡片 message_id 和本地绝对路径不写入公开仓库 |

## 2026-05-04 项目风险解除写回场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载 Hermes 用户 `.env`，用真实 Feishu SDK 创建临时项目文档和多维表格，再调用 `pilotflow_update_project` 的 `resolve_risk` 动作 |
| 资源创建 | 工具输出确认 `doc_created=true` 和 `bitable_created=true` |
| 风险解除 | 工具输出确认 `status=project_updated`、`risk_level=低`、`registry_status=进行中`、`doc_updated=true`、`bitable_updated=true`、`bitable_history_created=true`、`state_updated=true` |
| 用户价值 | 风险解决后可以把项目从风险态恢复为进行中，并同步文档、状态表风险等级和流水，形成完整风险闭环 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但文档、多维表格和状态写回均已走真实链路 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接、状态表链接、doc token、app token、table ID 和 record ID 不写入公开仓库 |

## 2026-05-04 风险卡片解除按钮场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中注册一个 `有风险` 项目，查询 `看看风险项目` 发送看板，再用卡片 action id 调用 `/card button` 桥接处理器 |
| 卡片发送 | 工具输出确认 `sent=true` |
| 按钮链路 | 工具输出确认 `resolve_action_found=true`、`command_none=true`、`registry_status=进行中` |
| 用户价值 | 风险项目卡片直接显示 `解除风险`，用户不需要再输入自然语言命令才能恢复项目状态 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但卡片发送、action id 恢复和状态变更均已复用真实插件链路 |
| 隐私处理 | 真实 chat_id、open_id、message_id、卡片 message_id 和本地绝对路径不写入公开仓库 |

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

## 2026-05-04 指定负责人交付物派发场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中注册临时项目，调用 `pilotflow_update_project` 的 `add_deliverable`，输入格式为 `成员：交付物` |
| 解析结果 | 工具输出确认 `parsed=true`、`assignee_detected=true`、`result_assignee_present=true` |
| 任务链路 | 工具输出确认 `task_created=true`、`registry_has_clean_deliverable=true`，说明任务正文已从成员前缀中拆出并进入项目交付物 |
| 群聊回执 | 工具输出确认 `reply_has_assignee=true`、`reply_has_clean_deliverable=true`，说明用户能看到任务负责人和干净任务正文 |
| 飞书提及 | 工具输出确认 `assignee=李四`、`value_clean=true`、`reply_has_raw_at=false`，说明 `<at ...>` 不会污染交付物或回执 |
| 用户价值 | 群里可以直接说“某人：做某任务”，PilotFlow 会按成员意图派发待办，而不是总是分给第一个项目成员 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但交付物解析、任务创建和项目状态写入均已走运行态插件链路 |
| 隐私处理 | 真实 chat_id、open_id、message_id、任务 ID、文档链接、状态表链接和 token 不写入公开仓库 |

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

## 2026-05-04 项目详情卡状态反馈场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载已安装插件，构造四类项目状态并生成项目详情互动卡 |
| 状态颜色 | 工具输出确认 `detail_card_status_colors_ok=true`，说明进行中、风险、完成、归档项目分别使用不同卡片头部颜色 |
| 操作按钮 | 运行态验证覆盖 `标记完成`、`解除风险`、`重新打开` 三类按钮，归档项目详情卡也会给出重新打开入口 |
| 用户价值 | 用户打开项目详情时能直接从卡片颜色判断项目状态，不必阅读正文才能发现风险或归档状态 |
| 隐私处理 | 验证只输出布尔结果和用例数量，不写入真实 chat_id、message_id、Feishu 资源 ID 或本地绝对路径 |

## 2026-05-04 截止日期催办看板场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 验证方式 | 在 WSL runtime 中加载已安装插件，构造逾期、近期截止和稍后截止项目，分别查询逾期看板和近期截止看板 |
| 逾期催办 | 工具输出确认 `overdue_dashboard_ok=true`、`overdue_result_sent=true`，说明逾期项目会进入红色催办看板且排除未逾期/已完成项目 |
| 近期截止 | 工具输出确认 `due_soon_dashboard_ok=true`、`due_soon_result_sent=true`，说明 7 天内截止项目会进入黄色看板且排除已逾期/稍后截止项目 |
| Agent 入口 | `pilotflow_query_status` 描述已包含“逾期项目”“快到期”“近期截止”“本周截止”，便于 Hermes Agent 基于用户自然语言选择该工具 |
| 用户价值 | 用户在群里问“看看逾期项目”或“看看近期截止”，即可得到需要催办的项目卡片，而不是翻完整项目列表 |
| 隐私处理 | 验证只输出布尔结果，不写入真实 chat_id、message_id、Feishu 资源 ID 或本地绝对路径 |

## 2026-05-04 卡片一键催办场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中生成逾期项目看板，检查催办按钮，再通过 `/card button` 桥接恢复 opaque action id 执行催办动作 |
| 按钮安全 | 工具输出确认 `reminder_button_present=true`、`action_ref_recovered=true`，说明看板有“发送提醒”按钮且按钮 payload 只依赖短期 action id |
| 动作结果 | 工具输出确认 `reminder_sent=true`、`reminder_message_chinese_ok=true`、`card_command_suppressed_extra_text=true`，说明点击后发送中文群催办并避免额外英文/JSON回复 |
| 卡片反馈 | 点击“发送提醒”时会把原卡片更新为“已发送催办提醒”，用户能看到按钮动作已生效 |
| 用户价值 | 用户从逾期/近期截止看板可以直接催办负责人，不需要手写群消息或复制项目信息 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID、成员 open_id 或本地绝对路径 |

## 2026-05-04 催办留痕场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中执行 `send_project_reminder` 卡片动作，拦截群消息发送、项目文档更新和多维表格流水写入 |
| 群催办 | 工具输出确认 `reminder_sent=true`、`result_status_ok=true`，说明卡片催办动作仍会发送群提醒 |
| 文档留痕 | 工具输出确认 `doc_updated=true`，说明催办动作会向项目文档追加“催办/已发送催办提醒”记录 |
| 表格流水 | 工具输出确认 `bitable_history_created=true`，说明可定位状态表时会追加一条多维表格更新流水 |
| 用户价值 | 催办不只是群里喊一声，还能沉淀到项目文档和状态表，后续复盘可追踪谁在何时催办过 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 文档链接、app token、table ID、record ID 或本地绝对路径 |

## 2026-05-04 负责人项目筛选场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中注册不同负责人的临时项目，分别查询“张三负责哪些项目”和飞书 @ 提及负责人查询 |
| 姓名筛选 | 工具输出确认 `plain_member_filter_ok=true`，说明自然语言负责人查询只展示该负责人相关项目 |
| 提及筛选 | 工具输出确认 `mention_member_filter_ok=true`，说明飞书 @ 提及也能作为负责人过滤条件 |
| 卡片清洁 | 工具输出确认 `raw_at_markup_hidden=true`，说明卡片 note 会显示 `@姓名`，不会展示原始 `<at user_id=...>` |
| 用户价值 | 群里直接问某个成员负责哪些项目即可得到专属看板，适合站会、催办和个人工作量追踪 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、成员 open_id 或本地绝对路径 |

## 2026-05-04 飞书提及加成员清理场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中对已有项目执行 `add_member`，成员值使用飞书 `<at user_id=...>` 提及格式 |
| 成员清理 | 工具输出确认 `value_clean=true`、`registry_clean=true`，说明新增成员会保存为纯姓名而不是原始提及 markup |
| 表格同步 | 工具输出确认 `bitable_owner_clean=true`、`history_value_clean=true`，说明状态表负责人字段和多维表格流水都使用纯姓名 |
| 权限刷新 | 工具输出确认 `permission_refreshed=true`，说明加成员后仍会刷新项目资源权限 |
| 群反馈 | 工具输出确认 `reply_has_no_raw_at=true`，说明群通知不展示原始 `<at user_id=...>` |
| 用户价值 | 用户用飞书 @ 给项目加人时，不会把 open_id markup 写进项目成员、文档、状态表或群反馈，后续看板和筛选更干净 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、成员 open_id、Feishu 资源 ID 或本地绝对路径 |

## 2026-05-04 项目移除成员同步场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中对已有项目执行 `remove_member`，成员值使用飞书 `<at user_id=...>` 提及格式 |
| 成员清理 | 工具输出确认 `value_clean=true`、`registry_removed=true`，说明被移除成员会先清理为纯姓名，再从项目成员列表移除 |
| 表格同步 | 工具输出确认 `bitable_owner_clean=true`、`history_value_clean=true`，说明状态表负责人字段和多维表格流水会同步移除后的成员列表 |
| 文档记录 | 工具输出确认 `doc_update_recorded=true`，说明成员移除动作会写入项目文档更新记录 |
| 群反馈 | 工具输出确认 `reply_has_no_raw_at=true`、`reply_has_chinese_feedback=true`，说明群通知不展示原始 `<at user_id=...>`，并给出中文反馈 |
| 负向保护 | 本地测试覆盖移除非项目成员时直接中文错误返回，不写状态表、文档或群消息 |
| 用户价值 | 项目负责人变更可以在群里闭环：加人、踢出、看板负责人字段、文档流水和状态表都保持一致 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、成员 open_id、Feishu 资源 ID 或本地绝对路径 |

## 2026-05-04 截止日历邀请项目成员场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中对已有项目执行 `update_deadline`，项目包含两个可解析成员和一个不可解析成员 |
| 日历事件 | 工具输出确认 `calendar_event_created=true`、`calendar_id_ok=true`、`summary_ok=true`，说明截止变更仍会创建项目截止日历事件 |
| 参与人邀请 | 工具输出确认 `calendar_attendees_added=true`、`attendee_request_made=true`、`attendee_count_ok=true`，说明可解析项目成员会加入日历事件参与人 |
| 飞书参数 | 工具输出确认 `user_id_type_ok=true`、`notification_enabled=true`，说明参与人使用 open_id 类型并启用飞书日历通知 |
| 群反馈 | 工具输出确认 `reply_has_chinese_feedback=true`，说明群通知会明确提示日历参与人已邀请 |
| 用户价值 | 截止日期不再只是状态字段，项目成员会收到日历邀请，更适合真实团队协作和 deadline 跟进 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、成员 open_id、日历事件 ID 或本地绝对路径 |

## 2026-05-04 飞书任务成员绑定场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中创建任务 payload，传入一个负责人、一个可解析项目成员和一个不可解析成员 |
| 任务创建 | 工具输出确认 `task_created=true`、`summary_ok=true`、`description_ok=true`，说明飞书任务主体仍按项目交付物创建 |
| 成员绑定 | 工具输出确认 `member_count_ok=true`、`assignee_bound=true`、`followers_bound=true`，说明负责人写入 assignee，其他可解析项目成员写入 follower |
| 解析保护 | 工具输出确认 `unresolved_skipped=true`，说明无法解析为飞书成员的人不会写入任务成员 payload |
| 用户价值 | 新增交付物不再只是单人待办，项目成员能在飞书任务里获得协作可见性，适合真实团队跟进 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、成员 open_id、任务 ID 或本地绝对路径 |

## 2026-05-04 飞书任务链接追踪场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中模拟 Feishu task 创建返回 URL，检查 `_create_task` 的返回摘要 |
| 摘要保留 | 工具输出确认 `task_summary_kept=true`，说明任务名仍保留在项目产物摘要中 |
| 链接追踪 | 工具输出确认 `task_url_included=true`，说明 Feishu 返回任务 URL 时会进入项目 artifacts，后续详情卡和项目记录可追踪 |
| 用户价值 | 项目里创建的飞书任务不再只是不可点击的文本名，后续查询项目详情时可以定位到任务入口 |
| 隐私处理 | 验证只使用 `example.invalid` 假链接并输出布尔结果；不写入真实任务 URL、任务 ID、chat_id、message_id 或本地绝对路径 |

## 2026-05-04 项目详情卡任务链接场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime，并加载 Hermes runtime 环境 |
| 验证方式 | 在 WSL runtime 中构造包含文档、状态表和任务 URL 的项目 artifacts，调用 `project_status` 详情卡动作 |
| 链接渲染 | 工具输出确认 `doc_link_rendered=true`、`bitable_link_rendered=true`、`task_link_rendered=true` |
| 用户价值 | 项目详情卡现在能同时展示文档、状态表和任务入口，群里查看项目即可跳转到下一步执行资源 |
| 隐私处理 | 验证只使用 `example.invalid` 假链接并输出布尔结果；不写入真实 Feishu 链接、任务 ID、chat_id、message_id 或本地绝对路径 |

## 2026-05-04 项目详情卡催办按钮场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件 |
| 验证方式 | 在 WSL runtime 中生成 7 天内截止项目的 `project_status` 详情卡 |
| 按钮展示 | 工具输出确认 `detail_reminder_button_present=true`、`completion_button_present=true` |
| 按钮安全 | 工具输出确认 `only_opaque_payload=true`、`reminder_action_registered=true`，说明详情卡按钮只携带短期 action id |
| 用户价值 | 用户点进快到期或逾期项目详情后可直接发送催办，不必退回看板或重新输入自然语言命令 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID 或本地绝对路径 |

## 2026-05-04 自然语言项目催办场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件 |
| 验证方式 | 通过 `pilotflow_update_project` 的 `send_reminder` 动作模拟用户说“催办项目/提醒负责人同步进展” |
| 群催办 | 工具输出确认 `send_reminder_status_ok=true`、`reminder_sent=true`、`message_chinese_ok=true` |
| 留痕闭环 | 工具输出确认 `doc_trace_recorded=true`、`bitable_trace_recorded=true`，说明自然语言催办复用项目文档和多维表格流水 |
| 用户价值 | 催办不再只能从卡片按钮触发；Hermes Agent 可在用户直接发起催办需求时选择同一真实执行链路 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID、文档链接或本地绝对路径 |

## 2026-05-04 批量逾期项目催办场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件 |
| 验证方式 | 通过 `pilotflow_update_project` 的 `send_reminder` 动作模拟用户说“催办逾期项目” |
| 筛选正确性 | 工具输出确认 `batch_status_ok=true`、`reminder_count_ok=true`、`only_overdue_reminded=true` |
| 留痕闭环 | 工具输出确认 `doc_trace_count_ok=true`、`bitable_trace_count_ok=true`，说明每个被催办项目都会写项目文档和多维表格流水 |
| 用户价值 | 用户可以一次性催办所有逾期项目，不需要逐个打开项目卡片或重复输入项目名 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID、文档链接或本地绝对路径 |

## 2026-05-04 按负责人批量催办场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件 |
| 验证方式 | 通过 `pilotflow_update_project` 的 `send_reminder` 动作模拟用户说“催办张三负责的逾期项目” |
| 筛选正确性 | 工具输出确认 `batch_status_ok=true`、`owner_filter_ok=true`、`reminder_count_ok=true` |
| 范围控制 | 工具输出确认 `only_owner_overdue_reminded=true`，说明只催办目标负责人负责且逾期的项目 |
| 用户价值 | 站会或主管视角可以直接催办某个负责人名下的逾期项目，避免群里误提醒无关成员 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、成员 open_id、Feishu 资源 ID、文档链接或本地绝对路径 |

## 2026-05-04 项目详情卡最近进展场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件 |
| 验证方式 | 通过 `pilotflow_update_project` 的 `add_progress` 动作记录项目进展，再生成项目详情卡 |
| 进展写入 | 工具输出确认 `progress_update_status_ok=true`，说明进展仍走项目更新链路 |
| 详情展示 | 工具输出确认 `recent_progress_rendered=true`，说明详情卡会展示最近进展 |
| 按钮安全 | 工具输出确认 `action_payload_opaque=true`，说明详情卡按钮仍只携带短期 action id |
| 用户价值 | 用户查看项目详情时能直接看到最新推进内容，不必跳转到文档或多维表格才能判断当前状态 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID、文档链接或本地绝对路径 |

## 2026-05-04 重启后看板最近进展场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件 |
| 验证方式 | 通过脱敏状态文件保存项目最近进展，清空内存 registry 后重新生成项目看板 |
| 状态恢复 | 工具输出确认 `state_updates_restored=true`，说明最近进展可从脱敏状态恢复 |
| 看板展示 | 工具输出确认 `dashboard_progress_rendered=true`，说明群里查询项目进展时看板直接展示最新推进 |
| 持续更新 | 工具输出确认 `state_progress_update_ok=true`，说明 Hermes 重启后继续记录进展也会累积保存 |
| 脱敏控制 | 工具输出确认 `unsafe_progress_filtered=true`，说明包含 URL、token 或本地路径的进展不会写入公开状态 |
| 用户价值 | Hermes 网关重启后，主管在群里问“项目进展如何”仍能直接看到每个项目最近推进，不需要重新创建项目或逐个点详情 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID、文档链接、token 或本地绝对路径 |

## 2026-05-04 站会项目简报场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件 |
| 验证方式 | 用户查询“站会简报/日报/项目汇总”时，PilotFlow 从项目 registry 生成管理简报卡 |
| 优先排序 | 工具输出确认 `briefing_priority_ok=true`，说明风险和逾期项目排在正常项目之前 |
| 指标汇总 | 工具输出确认 `briefing_counts_ok=true`，说明卡片展示总项目、风险、逾期、近期截止和已完成数量 |
| 进展可读 | 工具输出确认 `briefing_progress_ok=true`，说明简报直接带最近进展，减少逐个点详情 |
| 卡片动作 | 工具输出确认 `briefing_actions_ok=true`、`briefing_batch_reminder_ok=true`、`briefing_risk_followup_task_ok=true`、`briefing_filtered_button_label_ok=true`、`briefing_followup_card_feedback_ok=true`、`briefing_reminder_card_feedback_ok=true`、`filtered_briefing_reminder_ok=true`、`owner_filtered_briefing_followup_ok=true`、`owner_filtered_briefing_reminder_ok=true`、`owner_filtered_briefing_dashboard_ok=true`、`project_status_card_feedback_ok=true`、`dashboard_page_card_feedback_ok=true`、`dashboard_filter_card_feedback_ok=true`、`history_suggestion_card_feedback_ok=true`、`card_action_failure_feedback_ok=true`，说明简报可一键查看风险/逾期项目、批量催办逾期项目，并能按当前筛选和负责人范围批量创建跟进待办、发送催办、查看筛选看板；筛选简报的按钮会显示“催办风险/催办近期/催办逾期”和“创建风险待办/创建近期待办/创建逾期待办”，普通站会简报仍保持通用按钮；批量待办、批量催办、查看状态、看板翻页、看板筛选和采用历史建议点击成功后原卡片会显示明确反馈；项目或历史建议按钮执行失败时原卡片会更新为红色失败反馈，不会假显示成功 |
| 用户价值 | 站会或主管巡检时，一句“发一份站会简报”即可获得风险优先的项目总览，并能直接从卡片继续处理 |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID、文档链接、token 或本地绝对路径 |

## 2026-05-04 项目详情卡创建跟进待办双写场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件；直接工具验证使用临时 WSL venv 加载 `lark-oapi`，不修改 Hermes core |
| 验证方式 | 用真实 Feishu SDK 创建临时项目文档和多维表格，再调用同一个 `create_followup_task` 卡片动作处理器 |
| 资源创建 | 工具输出确认 `doc_created=true`、`bitable_created=true`、`task_created=true` |
| 留痕闭环 | 工具输出确认 `doc_updated=true`、`bitable_history_created=true`，说明从项目详情卡创建跟进待办会同步写项目文档和多维表格流水 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但文档、多维表格、待办创建和流水写回均走真实 Feishu API |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID、文档链接、状态表链接、任务链接、token 或本地绝对路径 |

## 2026-05-04 项目看板待办卡片双写场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes runtime 已安装最新 PilotFlow 插件；临时 WSL venv 加载 `lark-oapi` 后执行同一代码路径 |
| 验证方式 | 用真实 Feishu SDK 创建临时项目文档和多维表格，再从逾期看板卡片触发 `project_followup_task` 动作 |
| 资源创建 | 工具输出确认 `doc_created=true`、`bitable_created=true`、`task_created=true` |
| 留痕闭环 | 工具输出确认 `doc_updated=true`、`bitable_history_created=true`，说明看板上的“创建待办”也同步写项目文档和多维表格流水 |
| 边界说明 | 直接工具脚本脱离 gateway 时 `send_message` registry 不可用，但文档、多维表格、待办创建和流水写回均走真实 Feishu API |
| 隐私处理 | 验证只输出布尔结果；不写入真实 chat_id、message_id、Feishu 资源 ID、文档链接、状态表链接、任务链接、token 或本地绝对路径 |

## 2026-05-04 文档评论与任务关注者 live 验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | 使用活动租户 `pilotflow-contest` profile；`lark-cli auth status --verify` 返回 `verified=true`，scope 覆盖文档评论和任务写入 |
| 文档评论 | 用真实飞书文档创建临时验证文档后执行 `lark-cli drive +add-comment --full-comment`，返回 `ok=true`，随后 `drive file.comments list` 回读到 1 条全文评论 |
| 评论内容 | 评论回读的 `text_run.text` 为 `请补充内容`，说明新建文档后的引导评论链路可在真实飞书文档中落地 |
| 任务关注者 | 用真实飞书任务创建临时验证任务后执行 `lark-cli task +followers --add ...`，返回 `ok=true` 且 task guid 与创建结果一致 |
| 用户价值 | 项目文档创建后能主动引导成员补充内容；跟进待办不再只是单人任务，项目成员可作为关注者进入飞书任务协作链路 |
| 隐私处理 | 验证只记录布尔结果和脱敏结论；不写入真实文档链接、任务链接、comment_id、task guid、用户 open_id、token 或 app secret |

## 2026-05-04 群原话计划生成与确认创建场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 群聊触发 | 通过 `lark-cli im +messages-send --as user` 在真实 Feishu 测试群发送原始项目需求 `帮我创建答辩项目，成员张三、李四，交付物是项目简报和任务清单，5月10日截止` |
| 计划生成 | Bot 回发 `已生成计划，请在卡片上确认。`，并发送 `执行计划` 互动卡，卡片中已正确显示成员、交付物和截止时间 |
| 文本确认 | 用户回复 `确认执行` 后，Bot 返回 `项目空间已创建` 的中文摘要，并继续发送 `项目入口` 互动卡 |
| 产物摘要 | 项目入口卡片包含飞书文档链接、状态表链接、任务列表、截止时间和日历/提醒结果 |
| 用户价值 | 证明 PilotFlow 能直接从群里的自然语言项目描述生成计划、等待确认，再落到真实飞书文档/状态表/任务/日历链路 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档 URL、状态表 URL、任务 ID 和 token 不写入公开仓库 |

## 2026-05-04 确认文本兜底与误触保护场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已重启，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| 正向确认 | 新建计划后，用户回复 `确认执行`，Bot 继续返回 `项目空间已创建` 的中文摘要，并发送 `项目入口` 互动卡 |
| 误触保护 | 新建计划后，用户回复 `给我确认卡片`，Bot 只返回确认提示，不会误触发创建 |
| 反馈闭环 | 当用户再次回复 `确认执行` 时，Bot 正常创建项目空间；说明文本确认兜底和计划门控同时生效 |
| 用户价值 | 既保留卡片确认，也支持群里直接回复确认，减少对固定按钮路径的依赖 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档 URL、状态表 URL、任务 ID 和 token 不写入公开仓库 |

## 2026-05-04 聊天信号项目化建议卡场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已启动，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| Agent/工具边界 | Hermes 负责语义总结并传入结构化 `signals`、`suggested_project`、`should_suggest_project`；PilotFlow 工具不再从原始聊天用关键词或正则推断意图 |
| 验证方式 | 在 WSL Hermes runtime 中直接调用已安装的 `pilotflow_scan_chat_signals`，输入 Hermes 已总结的目标、承诺、风险、行动项和建议项目草案 |
| 工具输出 | 工具输出确认 `status=projectization_suggested`、`card_sent=true` |
| 群聊回读 | 通过 `lark-cli im +chat-messages-list --as user` 回读真实测试群，最新消息为 `interactive` 卡片，内容只展示结构化目标、承诺、风险和行动项，没有再把整句聊天重复归类 |
| 产品价值 | 证明 PilotFlow 可以作为飞书项目之前的群聊意图层：当聊天形成目标/承诺/风险/行动项时，先冒泡询问是否项目化，再进入现有计划确认链路 |
| 已知边界 | 14:22 的完整 @Bot 自动调用曾暴露 Hermes 模型侧 `HTTP 401 auth_unavailable` 错误；2026-05-04 20:54-20:58 已用受控 WSL gateway 和 `mimo-v2.5-pro` 复测完整 @Bot → Hermes LLM → PilotFlow → 飞书产物链路通过，旧 caveat 不再作为当前阻塞 |
| 隐私处理 | 真实 chat_id、open_id、message_id、Feishu URL、token 和 app secret 不写入公开仓库 |

## 2026-05-04 确认 token 与幂等 key 回归

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 WSL Hermes runtime；Hermes 测试模型已配置为 `mimo-v2.5-pro` |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py tests\test_setup.py tests\test_plugin_registration.py tests\test_trace.py tests\test_verify_wsl_feishu_runtime.py -q` 返回 `174 passed` |
| 安装验证 | `setup.py --hermes-dir <hermes-agent-path>` 返回 `OK: plugins/pilotflow/tools.py` 和 `OK: plugins/pilotflow/trace.py` |
| Runtime 直调 | 在 WSL Hermes runtime 中加载 `.hermes/.env` 后调用已安装的 `pilotflow_generate_plan`，输出确认 `status=plan_generated`、`has_confirm_token=true`、`has_idempotency_key=true`、`trace_has_key=true`、`redaction_enabled=true` |
| 真实链路修复 | WSL Hermes `.venv` 曾缺少 `lark_oapi`，且在 `/mnt/d` 仓库内执行 `uv sync --extra feishu` 会卡在跨文件系统 `.venv` 写入阶段；改用 `UV_PROJECT_ENVIRONMENT=/home/ding/.venvs/hermes-agent-feishu UV_LINK_MODE=copy uv sync --extra feishu` 后 3.26 秒完成安装，`lark-oapi==1.5.3` 可用 |
| 真实卡片发送 | 在同一 WSL ext4 venv 中调用已安装的 `pilotflow_generate_plan`，输出确认 `card_sent=true`、`has_confirm_token=true`、`has_idempotency_key=true`、`trace_has_key=true`、`action_ref_count=2`、`action_refs_have_token=true` |
| 可复现验证入口 | `scripts/verify_wsl_feishu_runtime.py` 默认 dry-run 输出 `lark_oapi_import_ok=true`、`pilotflow_import_ok=true` 且 `would_send_card=false`；显式加 `--send-card` 后输出 `card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true` |
| 执行级幂等 | 新增回归验证：同一 `idempotency_key` 第二次调用 `pilotflow_create_project_space` 返回 `project_space_replayed`，且 `_create_doc`、`_create_bitable`、`_create_task` 都只调用 1 次 |
| 重启后幂等回放 | 新增回归验证：首次创建成功后清空内存幂等缓存，再用同一 `idempotency_key` 调用创建工具，仍从状态文件返回 `project_space_replayed`，且不会重复创建文档、多维表格或待办 |
| 状态脱敏 | 幂等回放状态只持久化可展示回放字段；测试确认状态文件包含 `idempotency`，但不包含 Feishu `app_token` 或用户 `open_id` |
| 重启后卡片按钮 | 新增回归验证：卡片 action ref 写入状态文件，清空内存模拟 gateway 重启后，点击同一 `pilotflow_action_id` 仍能执行看板翻页并更新原卡片；消费后状态文件不再保留该 action id |
| 重启后文本确认 | 新增回归验证：生成计划后清空 `_pending_plans` 和 `_plan_generated` 模拟 gateway 重启，用户只回复 `确认执行` 仍能从状态文件恢复 pending plan，并创建文档、多维表格和待办 |
| 重启后资源留痕 | 新增回归验证：公开项目状态文件仍不保存成员、app token、table/record id 或资源 URL；非敏感资源 URL 进入私有 `pilotflow_project_refs.json` 后，重启状态 fallback 更新项目时可恢复文档链接并继续写项目文档留痕，群里直接查询项目详情或从看板按钮查看状态也会恢复项目文档、状态表和任务入口 |
| 统一动作流水管道 | 新增 `_record_action_outcome` 回归覆盖：催办、状态、待办、批量待办和自然语言更新统一通过同一通道写公开最近进展、私有资源 refs、项目文档留痕和多维表格流水，避免继续为每个重启动作写对称补丁 |
| WSL profile 显式验证 | 新增安装/验证回归：`setup.py --hermes-home <runtime-profile>` 会把 `.env`、`config.yaml` 和 Feishu display 检查指向同一个 Hermes runtime profile；已验证可在 WSL runtime config 存在 `display` 配置时保守合并 `display.platforms.feishu.tool_progress: off` 并保留备份；`verify_wsl_feishu_runtime.py --config-file <runtime-config>` 输出脱敏 `config_model`、`config_provider` 和 `config_has_feishu_gateway`，避免 Windows `~/.hermes` 与 WSL `/home/ding/.hermes` 漂移造成假阳性 |
| 重启后状态动作留痕 | 新增回归验证：Hermes gateway 重启后 registry 为空时，卡片 `mark_project_done` 从脱敏状态恢复项目并标记完成，公开状态写入 `已完成`，最近进展追加 `状态=已完成`，传给项目文档留痕的项目快照也同步为新状态，避免文档记录出现旧状态 |
| 重启后批量催办 | 新增回归验证：Hermes gateway 重启后 registry 为空时，简报卡片的 `briefing_batch_reminder` 可从脱敏项目状态恢复逾期/近期截止/风险候选项目，发送群催办并继续写项目文档留痕；成员缺失时使用“相关负责人”，不向公开状态补写成员；公开状态追加 `已发送催办提醒` 且不保存文档 URL |
| 重启后批量待办 | 新增回归验证：Hermes gateway 重启后 registry 为空时，简报卡片的 `briefing_batch_followup_task` 可从脱敏项目状态恢复逾期/近期截止/风险候选项目，创建跟进待办并把任务入口写入私有资源 refs；公开状态只保存任务摘要，不保存任务 URL |
| 重启后详情待办进展 | 新增回归验证：Hermes gateway 重启后 registry 为空时，项目详情卡 `create_followup_task` 创建跟进待办后，公开状态追加脱敏任务摘要作为最近进展，任务 URL 仍只进入私有资源 refs，后续看板可直接回读“刚创建了跟进待办” |
| 重启后详情催办进展 | 新增回归验证：Hermes gateway 重启后 registry 为空时，项目详情卡 `send_project_reminder` 可从脱敏状态和私有资源 refs 恢复项目，发送群催办，继续写项目文档留痕，并在公开状态追加 `已发送催办提醒`；公开状态不保存文档 URL |
| 重启后看板待办进展 | 新增回归验证：Hermes gateway 重启后 registry 为空时，项目看板 `project_followup_task` 可从脱敏状态和私有资源 refs 恢复项目，创建跟进待办，继续写项目文档留痕，并在公开状态追加脱敏任务摘要；任务 URL 仍只进入私有资源 refs |
| 重启后自然语言更新进展 | 新增回归验证：Hermes gateway 重启后 registry 为空时，自然语言 `update_deadline` 和 `update_status` 通过同一动作流水管道写入脱敏状态并追加 `截止时间=...` / `状态=...` 最近进展，后续看板可直接追踪字段变化 |
| 用户价值 | 计划生成和创建执行现在都有可追踪 `confirm_token` 与稳定 `idempotency_key`，并写入 Flight Recorder；重复确认和按钮单次消费可被审计 |
| 隐私处理 | 验证只记录布尔结果；不写入真实 chat_id、message_id、confirm token、idempotency key、Feishu URL、token 或 app secret |

## 本地回归

```bash
C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py tests\test_setup.py tests\test_plugin_registration.py tests\test_trace.py tests\test_verify_wsl_feishu_runtime.py -q
```

结果：

```text
167 passed
```

## 当前证据边界

- 已有真实证据：Feishu 网关可接收群消息，PilotFlow 可发中文文本反馈、互动看板卡片、执行计划卡片、确认完成卡片、项目入口卡片和取消反馈。
- 已有历史现场验证：确认按钮可触发项目创建，原确认卡片可更新为已创建状态；`确认卡片` 请求不会再被当作执行确认；入口卡片完成动作可同步状态表；重启后看板可从脱敏状态文件恢复项目摘要和最近进展；项目看板卡片可展示操作按钮并回读已完成状态；站会/日报/汇总查询可生成风险优先的项目简报卡，并可一键查看风险/逾期项目、批量催办逾期项目或按当前筛选批量创建跟进待办；重启后自然语言修改截止时间可更新脱敏状态并被看板回读；查看状态动作可发送项目详情互动卡；新增交付物可更新看板，并在内存项目模式下创建飞书任务；指定负责人新增交付物可按成员前缀或飞书 @ 提及派发任务；飞书任务会绑定负责人和可解析项目成员，且可记录任务链接；项目详情卡可展示文档、状态表、任务资源链接和最近进展，快到期/逾期项目可直接发送催办，创建跟进待办会同步写项目文档和多维表格流水，并按状态显示颜色反馈；看板上的创建待办动作会同步写项目文档和多维表格流水；看板支持未完成/已完成项目筛选；已完成项目可通过卡片动作重新打开；项目更新可写回飞书文档；项目进展可写回项目文档和多维表格流水；项目风险可切换风险态并写回项目文档、多维表格风险等级和流水；风险项目可通过看板单独筛选；项目风险解除可恢复进行中状态并写回文档、多维表格和流水；风险项目卡片可直接解除风险；新增交付物可同步写回多维表格交付物字段；按项目名直接查询可发送项目详情卡，且支持脱敏状态 fallback；卡片标记完成/重新打开可写回项目文档；新增成员可刷新项目文档/状态表权限并同步状态表负责人字段；新增成员支持飞书 @ 提及清理为纯姓名；项目成员可移除并同步负责人字段、项目文档和多维表格流水；运行健康检查可脱敏诊断当前 WSL/Hermes/Feishu 配置状态；项目更新会向多维表格追加可追溯流水记录；更新截止日期会刷新 Feishu 日历事件、邀请可解析项目成员并重设 Hermes 截止提醒；自然语言催办可发送群提醒并写回项目文档/多维表格流水，并支持按逾期/近期截止/风险和负责人筛选批量催办；生成计划会利用 Hermes 会话群名和发起人补全项目上下文；创建项目时会显式提示未能解析为飞书 @ 的成员；项目可归档并默认从日常看板隐藏；项目看板支持分页查看和卡片按钮翻页；项目看板支持逾期和近期截止催办筛选；逾期/近期截止看板支持卡片一键发送群催办，且催办会写回项目文档和多维表格流水；项目看板支持按负责人姓名或飞书 @ 提及筛选。
- 提交材料仍需补齐：成功创建路径录屏、取消路径录屏、真实文档/多维表格/任务/日历链接清单。该清单应进入私有提交材料或飞书在线文档，不建议直接提交到公开仓库。
