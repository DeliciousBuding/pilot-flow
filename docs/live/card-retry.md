## 2026-05-05 卡片动作失败后可重试

| 项目 | 证据 |
| --- | --- |
| 功能验证 | Hermes `/card button` 桥接既覆盖执行 action 失败后恢复 opaque action ref，也覆盖确认建项按钮从真实桥接入口进入项目空间创建闭环 |
| 适用边界 | 覆盖 `create_followup_task` 待办创建失败后重试，以及 `confirm_project` 经 `/card button {"pilotflow_action_id":...}` 创建文档、Base、任务、memory、state 和入口卡片；成功路径仍会消费 action ref，保持按钮单次成功执行 |
| 状态安全 | 第一次失败会把原卡片标记为操作失败但不让 action id 永久失效；确认建项成功后原确认卡会更新为已创建，项目入口卡片发送到群聊 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_verify_wsl_feishu_runtime.py::test_verify_runtime_card_command_bridge_is_sanitized tests\test_verify_wsl_feishu_runtime.py::test_verifier_card_command_bridge_mode_outputs_sanitized_runtime_result -q` 返回 `2 passed`；`tests\test_verify_wsl_feishu_runtime.py tests\test_tools.py::test_card_command_confirm_returns_none_after_direct_card_send -q` 返回 `46 passed`；`C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `316 passed` |
| Verifier 新字段 | `--verify-card-command-bridge` 返回 `card_command_confirm_project_created=true`、`card_command_confirm_origin_marked=true`、`card_command_bridge_retryable_failure=true`，并保留桥接执行、原卡片更新、文档/Base 留痕、state 记录和脱敏反馈基线 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；同轮 `--verify-card-command-bridge`、`--send-card`、`--probe-llm` 均通过 |
| 用户价值 | 用户真实点击飞书卡片确认项目时，PilotFlow 不依赖直调测试路径，而是经 Hermes `/card` 桥接完成项目创建；临时故障后同一按钮也可恢复重试继续推进办公动作 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 历史建议应用后确认卡发送失败可重试

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `apply_history_suggestions` 通过 opaque action ref 触发后，如果历史建议已写入 pending plan 但重建确认卡发送失败，会恢复 action ref；Feishu 发卡恢复后同一按钮可再次发送更新后的确认卡 |
| 适用边界 | 只对“历史建议已应用，但确认卡片发送失败”执行层错误恢复；成功发送确认卡后仍保持 action id 单次消费，裸历史建议 action 仍被拒绝 |
| 状态安全 | 第一次失败会保留已应用的成员/交付物建议和 action ref；第二次成功后发送确认卡并消费 action ref，避免用户卡在没有确认卡的中间态 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py::test_direct_card_action_retryable_failure_keeps_action_ref_for_history_suggestions -q` 返回 `1 passed`；`C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `316 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 结果 | `--verify-projectization-suggestion` 返回 `projectization_history_apply_retryable_failure=true`、`projectization_plan_card_sent=true`、`projectization_raw_history_rejected=true`、`projectization_pending_recovered=true`、`projectization_cards_sent=true`；同轮 `--send-card` 返回 `card_sent=true`，`--probe-llm` 返回 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户采用历史建议后如果 Feishu 临时发卡失败，不需要重新生成项目计划；同一按钮可恢复确认卡，让后续确认建项闭环继续推进 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 确认建项资源失败后可重试

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `confirm_project` 通过 opaque action ref 触发后，如果项目资源创建阶段整体失败，会恢复确认 action ref 和计划 gate；资源服务恢复后同一确认按钮可再次创建项目 |
| 适用边界 | 只对 `_handle_create_project_space` 返回的“创建失败，请检查飞书应用凭证配置。”执行层错误恢复；确认成功后仍保持 action id 单次消费，重复点击仍被视为已处理/过期 |
| 状态安全 | 第一次失败不写入项目 registry/state、不保存 Hermes memory、不清除按钮引用；第二次成功后创建项目空间、写入状态并消费 action ref |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_verify_wsl_feishu_runtime.py::test_verify_runtime_projectization_suggestion_is_sanitized tests\test_verify_wsl_feishu_runtime.py::test_verifier_projectization_suggestion_mode_outputs_sanitized_runtime_result -q` 返回 `2 passed`；`tests\test_verify_wsl_feishu_runtime.py tests\test_tools.py::test_direct_card_confirm_retryable_failure_keeps_action_ref_for_project_creation -q` 返回 `46 passed`；`C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `316 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 结果 | `--verify-projectization-suggestion` 返回 `projectization_confirm_retryable_failure=true`、`projectization_clarification_confirm_created=true`、`projectization_clarification_confirm_resources=true`、`projectization_clarification_confirm_state=true`、`projectization_clarification_confirm_one_shot=true`；同轮 `--send-card` 返回 `card_sent=true`，`--probe-llm` 返回 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户点击确认创建项目时，如果飞书文档/Base/待办/入口卡等资源服务临时不可用，不需要重新生成确认卡；故障恢复后可继续同一个建项闭环 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 看板分页/筛选发卡失败后可重试

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `dashboard_page` 和 `dashboard_filter` 通过 opaque action ref 触发时，如果看板内容已生成但 Feishu interactive card 发送失败，不会永久消费按钮引用；Feishu 发卡恢复后同一 action id 可再次发送分页/筛选看板 |
| 适用边界 | 只对 `_handle_query_status` 返回的“项目看板已生成，但发送到群聊失败”执行层错误恢复 action ref；成功发卡仍保持单次消费，普通参数/未知动作错误不改为可重试 |
| 状态安全 | 第一次失败不标记原卡片为成功、不清除 action ref；第二次成功后发送新看板卡并消费 action ref，保持防重复边界 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py::test_direct_card_action_retryable_failure_keeps_action_ref_for_dashboard_page tests\test_tools.py::test_direct_card_action_retryable_failure_keeps_action_ref_for_dashboard_filter -q` 返回 `2 passed`；`C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `314 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 结果 | `--verify-dashboard-navigation` 返回 `dashboard_page_sent=true`、`dashboard_filter_sent=true`、`dashboard_used_opaque_refs=true`、`dashboard_cards_sent=true`；同轮 `--send-card` 返回 `card_sent=true`，`--probe-llm` 返回 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户在项目看板里翻页或切换筛选时，如果 Feishu 临时发卡失败，不需要重新发起查询或重新生成看板；同一按钮可在故障恢复后继续导航 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 批量催办发送失败后可重试

| 项目 | 证据 |
| --- | --- |
| 功能验证 | 站会简报/项目看板里的 `briefing_batch_reminder` 通过 opaque action ref 触发时，如果存在匹配项目但群聊催办发送全部失败，不会永久消费按钮引用；Feishu 发送恢复后同一 action id 可再次执行 |
| 适用边界 | `_handle_update_project` 批量催办结果现在带 `candidate_count`，卡片层只在 `candidate_count>0` 且 `reminder_count=0` 时判断为执行层发送失败并恢复 action ref；真正没有匹配项目仍保持“无需催办”的成功语义 |
| 状态安全 | 第一次失败不发送成功反馈、不写入文档/Base/state 催办留痕、不清除 action ref；第二次成功后才发送群消息、记录催办留痕并消费 action ref |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py::test_direct_card_action_retryable_failure_keeps_action_ref_for_briefing_batch_reminder -q` 返回 `1 passed`；`C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `312 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 结果 | `--verify-briefing-batch-reminder` 返回 `briefing_batch_reminder_sent=true`、`briefing_batch_reminder_used_opaque_ref=true`、`briefing_batch_reminder_doc_recorded=true`、`briefing_batch_reminder_history_recorded=true`、`briefing_batch_reminder_state_recorded=true`；同轮 `--send-card` 返回 `card_sent=true`，`--probe-llm` 返回 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 站会简报一键催办遇到临时 Feishu 发送故障时，用户不用重新生成简报卡；同一按钮可在故障恢复后继续完成批量通知分发 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 批量跟进待办失败后可重试

| 项目 | 证据 |
| --- | --- |
| 功能验证 | 站会简报/项目看板里的 `briefing_batch_followup_task` 通过 opaque action ref 触发时，如果批量待办创建阶段临时失败，不会永久消费按钮引用；服务恢复后同一 action id 可再次执行并创建跟进待办 |
| 适用边界 | 只把“匹配项目存在但实际待办创建失败导致没有创建结果”的执行层失败视为可重试；非法筛选条件仍保持普通错误，避免把用户输入错误伪装成可重试故障 |
| 状态安全 | 第一次失败不发送批量成功反馈、不写入文档/Base/state 留痕、不清除 action ref；第二次成功后才发送群消息、记录待办留痕并消费 action ref |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py::test_direct_card_action_retryable_failure_keeps_action_ref_for_briefing_batch_followup -q` 返回 `1 passed`；`C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `311 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 结果 | `--verify-batch-followup-task` 返回 `batch_followup_created=true`、`batch_followup_task_created=true`、`batch_followup_used_opaque_ref=true`、`batch_followup_doc_recorded=true`、`batch_followup_history_recorded=true`、`batch_followup_state_recorded=true`；同轮 `--send-card` 返回 `card_sent=true`，`--probe-llm` 返回 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 站会简报一键批量派发待办遇到临时任务服务/飞书 API 故障时，用户不用重新生成简报卡；同一按钮可在故障恢复后继续完成真实办公动作 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 直调卡片动作失败后可重试

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `pilotflow_handle_card_action` 直接收到 `pilotflow_action_id` 时，若真实办公动作失败，也会恢复刚消费的 opaque action ref；同一 action id 可在故障恢复后再次执行 |
| 适用边界 | 覆盖 `send_project_reminder` 群聊催办发送失败后重试、`create_followup_task` 详情卡跟进待办创建失败后重试，以及 `project_followup_task` 看板跟进待办创建失败后重试；确认/取消和成功路径仍保持单次消费，不改变已建立的防重复边界 |
| 状态安全 | 第一次失败不写入催办留痕、不清除 action ref；第二次成功后发送群消息、记录文档/Base/state 更新并消费 action ref |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py::test_direct_card_action_retryable_failure_keeps_action_ref_for_dashboard_followup_task -q` 返回 `1 passed`；`C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `310 passed` |
| Verifier 新字段 | `--verify-card-status-cycle` 返回 `card_status_retryable_failure=true`，并保留完成/重开、状态表同步、文档/Base 留痕、state 记录和脱敏反馈基线 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；`--verify-card-status-cycle`、`--verify-card-command-bridge`、`--send-card`、`--probe-llm` 均通过 |
| 用户价值 | Hermes 直接调用卡片处理工具或测试/兼容入口遇到临时 Feishu 发送、任务创建失败时，不需要重新生成状态卡或看板卡；同一按钮引用可继续完成真实办公动作 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 确认/取消卡片裸 action 拒绝

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `confirm_project` 和 `cancel_project` 也必须通过短期 opaque action id 触发；裸 `pilotflow_action` payload 会被视为过期/已处理并拒绝 |
| 适用边界 | 文字确认路径仍通过 `pilotflow_create_project_space.confirmation_text` 执行；本次只收紧卡片按钮工具，避免伪造 `/card button {"pilotflow_action":"confirm_project"}` 直接创建项目或取消 pending plan |
| 状态安全 | 裸确认不会调用文档/Base/待办创建；裸取消不会发送取消消息，也不会清除已有 pending plan |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py::test_raw_confirm_project_without_action_id_is_rejected tests\test_tools.py::test_raw_cancel_project_without_action_id_is_rejected -q` 返回 `2 passed`；合法 opaque 确认/取消桥接和文字 `confirmation_text` 路径保持通过 |
| Verifier 新字段 | `--verify-projectization-suggestion` 返回 `projectization_raw_confirm_rejected=true`、`projectization_raw_cancel_rejected=true`，并保留项目化建议、裸项目化拒绝、澄清补齐、确认创建和一次性确认基线 |
| 用户价值 | 项目创建/取消这两个最高影响按钮只能由真实飞书卡片引用推进，降低群聊里误触、重放或伪造命令导致项目被错误创建/取消的风险 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 项目化卡片裸 action 拒绝

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `suggest_project_from_signals` 和 `apply_history_suggestions` 必须通过短期 opaque action id 触发；裸 `pilotflow_action` payload 会被视为过期/已处理并拒绝 |
| 适用边界 | 覆盖“整理成项目计划”和“采用历史建议”两类会推进计划状态的卡片动作，避免旧卡片、伪造命令或非飞书按钮 payload 绕过 action ref |
| 状态安全 | 裸项目化 action 不生成 pending plan；裸历史建议 action 不改写已有 pending plan 的成员和交付物 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py::test_raw_projectization_suggestion_without_action_id_is_rejected tests\test_tools.py::test_raw_history_suggestions_without_action_id_is_rejected -q` 返回 `2 passed`；相关卡片/历史建议/verifier 单测均通过 |
| Verifier 新字段 | `--verify-projectization-suggestion` 返回 `projectization_raw_action_rejected=true`、`projectization_raw_history_rejected=true`，并保留项目化建议、澄清补齐、确认创建和一次性确认基线 |
| 用户价值 | 群聊里的项目启动链路只能由真实飞书卡片按钮推进，降低误触、重放和伪造 `/card button` 参数导致错误建项或污染计划的风险 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 澄清后确认按钮一次性防重复

| 项目 | 证据 |
| --- | --- |
| 功能验证 | 澄清后补齐字段并点击确认卡完成项目创建后，同一个确认 action ref 再次提交不会重复创建文档/Base/待办 |
| 适用边界 | 二次提交被视为已处理/过期卡片动作；Verifier 断言资源 stub 调用次数不增加，避免重复执行真实办公资源创建 |
| 状态安全 | 该路径覆盖澄清、补齐、确认、创建后的重复点击防护，降低真实群聊中用户重复点击确认按钮导致重复项目的风险 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `303 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `269 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-projectization-suggestion` 返回 `projectization_clarification_confirm_one_shot=true`，并保留 `projectization_clarification_confirm_created/resources/state=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户或飞书回调重复提交确认卡时，PilotFlow 不会重复生成项目资源，项目创建链路更适合真实群聊使用 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 澄清后确认创建闭环

| 项目 | 证据 |
| --- | --- |
| 功能验证 | 群聊信息不足请求先触发澄清；用户补齐结构化字段后生成确认卡；点击确认卡后进入项目空间创建路径 |
| 适用边界 | Verifier 使用安装态插件和真实卡片发送路径验证确认卡，但资源创建阶段使用脱敏 stub，避免在公共 evidence 中写入真实文档/Base/待办 URL |
| 状态延续 | 同一 chat_id 下从澄清、补齐、确认到创建会保留正确 pending plan，并在确认后写入项目 state 和 registry |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `303 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `269 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-projectization-suggestion` 返回 `projectization_clarification_confirm_created=true`、`projectization_clarification_confirm_resources=true`、`projectization_clarification_confirm_state=true`，并保留澄清/补齐/确认卡基线 |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户先模糊提出办公任务，再补齐字段并点击确认后，PilotFlow 能走到实际项目资源创建入口，不只是停在澄清或确认卡 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 澄清后补齐字段进入确认卡

| 项目 | 证据 |
| --- | --- |
| 功能验证 | 群聊里信息不足请求触发中文澄清后，用户补齐结构化项目字段时，`pilotflow_generate_plan` 会回到正常计划确认流程并发送交互卡 |
| 适用边界 | 补齐后的字段仍由 Hermes Agent 以结构化参数传入；工具不从自然语言硬解析语义，只负责确认门控、pending plan 和卡片发送 |
| 状态延续 | 同一真实群聊 chat_id 下，澄清路径不会留下 pending/gate；补齐字段后会写新的 pending plan、开启确认 gate，并发送确认卡 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `302 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `268 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-projectization-suggestion` 返回 `projectization_clarification_followup_plan_sent=true`、`projectization_clarification_followup_pending=true`、`projectization_clarification_followup_gate=true`，并保留澄清 no-card/no-pending/no-gate 基线 |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户先说“帮我推进客户上线”、再补充项目名称/目标/交付物/截止时间时，PilotFlow 不会停在追问，也不会误用旧 gate，而是继续生成可确认的项目计划 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 信息不足时群聊澄清闭环

| 项目 | 证据 |
| --- | --- |
| 功能修复 | `pilotflow_generate_plan` 在群聊中收到缺少结构化项目字段的 @ 请求时，会直接向群里发送中文澄清消息，而不是只返回内部 instructions |
| 适用边界 | 默认不从原文硬解析标题/目标/交付物/截止时间；只有 Agent 明确传入结构化字段或开启受控推断时才进入计划确认流程 |
| 状态安全 | 缺字段路径不会发送确认卡、不会写 pending plan，也不会设置确认 gate，避免用户后续一句“确认”误触发旧计划执行 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `301 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `267 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-projectization-suggestion` 返回 `projectization_clarification_sent=true`、`projectization_clarification_no_card=true`、`projectization_clarification_no_pending=true`、`projectization_clarification_no_gate=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 真实群聊里用户只说“帮我推进客户上线”这类信息不足请求时，PilotFlow 会主动追问缺失字段，避免生成伪项目或卡住在工具返回结果里 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

