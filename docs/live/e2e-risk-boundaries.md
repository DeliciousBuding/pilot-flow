## 2026-05-04 完整 @Bot 自动调用端到端场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | 受控 WSL foreground gateway，会话明确连接 Feishu WebSocket；Hermes runtime 使用 `/home/ding/.hermes` profile |
| 模型配置 | `hermes status` 显示 `Model: mimo-v2.5-pro`、`Provider: vectorcontrol`；WSL runtime 中 OpenAI-compatible 直接探针返回 HTTP 200 |
| 配置修复 | 旧 caveat 的 14:22 `HTTP 401 auth_unavailable` 发生在 WSL profile 仍使用旧 `gpt-5.5` 配置时；本次将 WSL profile 切到已验证可用的 `mimo-v2.5-pro` 后复测通过 |
| 用户入口 | 通过 `lark-cli im +messages-send --as user` 在真实 Feishu 测试群发送 `@PilotFlow 创建真实端到端验证项目 ...` |
| Agent 处理 | gateway 日志确认收到同一 @ 消息，随后 Hermes 用 `mimo-v2.5-pro` 进入 Agent 推理，无 401 认证错误 |
| 计划卡片 | Bot 在群内发送 `执行计划` 互动卡，卡片包含成员、交付物、截止时间和确认/取消按钮，并回复 `已生成计划，请在卡片上确认。` |
| 卡片内容验证 | 后续 WSL verifier 同步覆盖 `card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，证明真实发送的计划确认卡不仅发出，而且标题、目标和风险字段完整 |
| 确认执行 | 用户在同一群发送 `确认执行` 后，gateway 日志确认再次进入 `mimo-v2.5-pro` Agent 回合并执行 PilotFlow 创建链路 |
| 飞书产物 | 日志确认真实创建项目文档、状态 Base、两条飞书任务、日历事件，并调度 Hermes 截止提醒 |
| 群内结果 | Bot 返回项目创建摘要和项目入口互动卡，入口卡包含文档、状态表、成员、截止时间、查看状态和标记完成动作 |
| 已知非阻塞告警 | 文档评论 SDK builder 字段告警、任务关注者“已是协作者”告警均不阻断文档/Base/任务/日历/提醒创建；执行后模型补充响应阶段出现一次 SSL ReadError 并自动重试成功 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档 URL、Base URL、任务 ID、calendar event ID、token 和 app secret 不写入公开仓库 |

## 2026-05-04 群聊信号项目化风险贯通

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_scan_chat_signals` 的项目化建议按钮现在会把 Hermes Agent 已提取的 `signals.risks` 或 `suggested_project.risks` 写入短期 opaque action ref；用户点击“整理成项目计划”后，`pilotflow_generate_plan` 会保留这些结构化风险，不再在计划确认链路丢失群聊里的阻塞信息 |
| 端到端回归 | 新增回归覆盖：群聊信号建议 → 点击项目化按钮 → 生成待确认计划 → 点击确认创建；断言风险进入待确认 plan、项目文档 `## 风险` 段和多维表格创建参数 |
| Agent 边界 | `pilotflow_generate_plan` 新增结构化 `risks` 参数；工具只接收 Agent 已提取风险，不从 `input_text` 做关键词或正则推断 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `206 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、message_id、Feishu URL、任务 ID、confirm token、idempotency key、token 或 app secret |

## 2026-05-04 群聊风险卡片可见性

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_generate_plan` 的计划确认卡现在展示 Agent 已提取的结构化风险；`pilotflow_create_project_space` 创建后的项目入口卡也展示同一风险摘要，避免用户确认前后看不到将写入文档/Base 的阻塞项 |
| 回归验证 | 新增确认卡风险展示和入口卡风险展示单测；断言 `**风险：** ...` 出现在真实 Feishu interactive card markdown 中 |
| Agent 边界 | 风险展示只读取 `plan.risks` / `params.risks`，不从 `input_text` 推断；最多展示 3 条，避免群卡片过长 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `208 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、message_id、Feishu URL、任务 ID、confirm token、idempotency key、token 或 app secret |

## 2026-05-04 计划确认卡标题目标可见性

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_generate_plan` 的计划确认卡现在在成员、交付物、截止时间和风险之前展示结构化 `title` 与 `goal`，避免用户确认前看不到将创建的项目名称和目标 |
| 回归验证 | 新增确认卡标题/目标展示单测，断言 Feishu interactive card markdown 包含 `**项目：** ...` 和 `**目标：** ...` |
| Agent 边界 | 标题和目标只来自 Agent 传入或会话上下文补全后的 plan 字段；卡片展示层不做新的自然语言解析 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `209 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、message_id、Feishu URL、confirm token、idempotency key、token 或 app secret |

## 2026-05-04 WSL 卡片内容门禁

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `verify_wsl_feishu_runtime.py --send-card` 不再只验证“卡片已发送”，还会捕获本次真实发送的计划确认卡并输出脱敏布尔断言：`card_has_title`、`card_has_goal`、`card_has_risk` |
| 真实链路覆盖 | verifier 的测试计划卡显式包含标题、目标和风险；真实 WSL 发送后输出 `card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，证明前几轮确认卡可见性改动进入安装后的 Hermes runtime |
| 隐私处理 | 新增输出仍只有布尔结果，不打印卡片正文、chat_id、message_id、confirm token、idempotency key、Feishu URL、token 或 app secret |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `210 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |

## 2026-05-04 初始风险项目状态一致性

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_create_project_space` 创建带 `risks` 的项目时，registry 和 restart-safe state 现在初始写入 `status=有风险`，而不是固定 `进行中` |
| 后续追踪 | 新增回归验证：带初始风险创建项目后，风险看板 `filter=risk` 能立即筛出该项目，避免文档/Base/卡片都显示风险但看板和简报漏报 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `211 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、message_id、Feishu URL、任务 ID、confirm token、idempotency key、token 或 app secret |

## 2026-05-04 初始风险最近进展追踪

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_create_project_space` 创建带 `risks` 的项目时，会把最多 3 条初始风险写入 registry 和 restart-safe state 的 `updates`，作为 `action=风险` 的最近进展 |
| 后续追踪 | 新增回归验证：带初始风险创建项目后，项目详情卡 `project_status` 会展示 `**最近进展：** API 审批可能卡住`，重启后 state 也保留该脱敏风险进展 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `212 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、message_id、Feishu URL、任务 ID、confirm token、idempotency key、token 或 app secret |

## 2026-05-04 初始风险入口卡动作一致性

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_create_project_space` 创建带初始 `risks` 的项目时，项目入口卡第二按钮现在显示“解除风险”，并绑定 `resolve_risk` action ref；无风险项目仍保持“标记完成” |
| 后续追踪 | 新增回归验证：带初始风险的入口卡按钮不会误导用户直接标记完成，而是提供与 `status=有风险` 一致的下一步处理动作 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `213 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、message_id、Feishu URL、任务 ID、confirm token、idempotency key、token 或 app secret |

## 2026-05-04 创建结果风险摘要

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_create_project_space` 创建带初始 `risks` 的项目时，返回给 Agent 的 `display` 摘要现在包含最多 3 条 `⚠️ 风险: ...`，让群聊文字回复与确认卡、入口卡、state 状态保持一致 |
| 后续追踪 | 新增回归验证：带初始风险创建后，`display` 包含风险摘要，避免 Agent 只回复文档/任务/截止时间而漏掉项目阻塞 |
| 自动化验证 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `214 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、message_id、Feishu URL、任务 ID、confirm token、idempotency key、token 或 app secret |

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
| 私有引用硬化 | `pilotflow_project_refs.json` 与公共状态共用同一个 lock，并在 `_save_project_state` 同一锁窗口内更新，避免重启后公共项目存在但文档/Base/任务链接引用丢失 |
| 恢复状态硬化 | `card_actions`、`pending_plans` 和 `idempotency` 持久化改为同一 lock 内 read-modify-write，避免并发卡片创建、多群同时生成计划或重复确认缓存写入时丢失重启恢复入口 |
| 自动化验证 | 新增旧格式升级、20 线程公共状态保存、20 线程私有 refs 保存、20 线程卡片 action refs、20 线程 pending plans、20 线程 idempotency、12 进程公共状态 + 私有 refs 保存回归测试；`C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `202 passed` |
| WSL 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件文件已同步到 WSL Hermes runtime |
| WSL runtime dry-run | `verify_wsl_feishu_runtime.py --env-file /home/ding/.hermes/.env --config-file /home/ding/.hermes/config.yaml` 输出脱敏通过：`config_model=mimo-v2.5-pro`、`config_provider=vectorcontrol`、`config_has_feishu_gateway=true` |
| 真实 Feishu 卡片验证 | WSL `verify_wsl_feishu_runtime.py --send-card` 成功：`card_sent=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true` |

## 2026-05-04 WSL 模型探针与 401 预检

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `verify_wsl_feishu_runtime.py` 新增 `--probe-llm`，会读取 Hermes runtime `config.yaml` 中当前 provider 的 `base_url/key_env` 并探测 OpenAI-compatible `/models` |
| 隐私处理 | 探针输出只保留 `llm_probe_ok`、`llm_probe_status`、`llm_probe_error`、`llm_probe_provider`，不打印 API key、base_url 或响应正文 |
| 自动化验证 | 新增成功探针和 HTTP 401 探针脱敏回归测试；`C:\Users\Ding\miniforge3\python.exe -m pytest` 通过，结果 `204 passed` |
| WSL 模型预检 | WSL `verify_wsl_feishu_runtime.py --probe-llm` 输出脱敏通过：`llm_probe_ok=true`、`llm_probe_provider=vectorcontrol`、`llm_probe_status=200` |

