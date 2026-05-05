## 2026-05-05 重启后状态卡片完成/重开闭环

| 项目 | 证据 |
| --- | --- |
| 功能验证 | 项目卡片的“标记完成”和“重新打开”动作现在由安装态 verifier 同时覆盖 registry 项目和 restart-safe state-only 项目 |
| 适用边界 | state-only 项目模拟 Hermes gateway 重启后 registry 丢失，只依赖脱敏 state 摘要和 opaque action ref；不会恢复成员名单，也不会写真实 Base 元数据 |
| 状态延续 | state-only 项目先从卡片标记为 `已完成`，再从卡片重新打开为 `进行中`；两次动作都会写公开最近进展并更新项目文档 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `301 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `267 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-card-status-cycle` 返回 `card_status_state_done_applied=true`、`card_status_state_reopen_applied=true`、`card_status_state_doc_recorded=true`、`card_status_state_feedback_sent=true` |
| 基线保留 | registry 项目的 `card_status_done_applied`、`card_status_reopen_applied`、`card_status_bitable_synced`、`card_status_doc_recorded`、`card_status_state_recorded`、`card_status_feedback_sent` 和 opaque action 基线保持不变 |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户仍可直接从旧项目卡片完成或重开项目，不需要重新创建项目或依赖内存中的 registry |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 重启后归档看板筛选

| 项目 | 证据 |
| --- | --- |
| 功能验证 | restart-safe state-only 项目处于 `已归档` 状态时，默认项目看板会隐藏该项目；显式 `filter=archived` 时可以重新显示 |
| 适用边界 | 看板筛选只读取脱敏 state 摘要；不会恢复成员名单，也不会暴露真实文档/Base/任务 URL |
| 状态延续 | 用户确认归档并重启 Hermes gateway 后，项目不会继续污染默认进行中看板，但仍能通过归档筛选追溯 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `301 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `267 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-dashboard-navigation` 返回 `dashboard_state_archived_hidden=true`、`dashboard_state_archived_filter_shown=true`，同时看板风险筛选、分页、opaque action 和 state-only 分工详情基线仍为 true |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 归档闭环不只停在状态写入：重启后团队默认看板保持干净，历史项目仍可按归档入口查回 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 重启后归档确认门控

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `pilotflow_update_project` 在 restart-safe state-only 项目上执行 `update_status=已归档` 时，仍必须先获得明确确认；未确认不会写 state、文档或群消息 |
| 适用边界 | 归档属于高风险状态变更，重启后仍沿用确认门控；state-only 项目不恢复成员名单，不写真实 Base 元数据 |
| 状态延续 | 用户确认后，归档会写公开最近进展 `状态 -> 已归档`、更新 restart-safe state、追加项目文档；默认看板随后会隐藏该归档项目 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `300 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `266 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-archive-gate` 返回 `archive_state_gate_required=true`、`archive_state_gate_no_write=true`、`archive_state_confirmed=true`、`archive_state_feedback_sent=true`，同时 registry 归档门控基线仍为 true |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户仍可安全归档旧项目；归档不会因内存丢失绕过确认，也不会误写未确认的状态变更 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 重启后截止时间联动

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `pilotflow_update_project` 在 restart-safe state-only 项目上执行 `update_deadline` 时，会更新公开状态中的截止时间并记录结构化进展 |
| 适用边界 | state-only 项目不恢复成员名单，不写真实 Base 元数据；截止时间来自 Agent 传入的结构化 `value`，工具只做执行层日期联动 |
| 状态延续 | 截止时间更新后会写公开最近进展 `截止时间 -> ...`、更新 restart-safe state、追加项目文档，并继续触发日历事件和 Hermes 截止提醒调度 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `299 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `265 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-deadline-update` 返回 `deadline_state_updated=true`、`deadline_state_hooks_ran=true`、`deadline_state_feedback_sent=true`，同时 registry 项目的日历、参与人和提醒基线仍为 true |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户在群里继续说“把截止时间改到某天”不会只改本地摘要；PilotFlow 仍能保持截止时间、日历和提醒调度的一致闭环 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、calendar event ID、token 或 app secret |

## 2026-05-05 重启后风险上报闭环

| 项目 | 证据 |
| --- | --- |
| 功能验证 | `pilotflow_update_project` 在 restart-safe state-only 项目上执行 `add_risk` 时，可把项目状态切换为 `有风险`，并记录结构化风险进展 |
| 适用边界 | state-only 项目不恢复成员名单，不写真实 Base 元数据；风险文本来自 Agent 传入的结构化 `value`，工具不从自然语言重新做意图推断 |
| 状态延续 | 风险上报后会写公开最近进展 `风险 -> ...`、更新 restart-safe state、追加项目文档；没有 app/table 元数据时不会写多维表格流水 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `298 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `264 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-risk-cycle` 返回 `risk_state_reported=true`、`risk_state_recorded=true`、`risk_state_feedback_sent=true`，同时 registry 风险上报/解除、state-only 卡片解除风险和详情卡 opaque action 基线仍为 true |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户在群里继续说项目阻塞/有风险时，PilotFlow 仍能把项目重新纳入风险看板；随后可从卡片继续解除风险，形成可恢复的风险来回闭环 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 重启后风险卡片解除闭环

| 项目 | 证据 |
| --- | --- |
| 功能修复 | 项目详情卡/看板卡的“解除风险”动作现在对 restart-safe state-only 项目有明确落盘返回；Hermes gateway 重启后，风险项目仍可从卡片按钮恢复为进行中 |
| 适用边界 | state-only 项目不恢复成员名单，也不写真实 Base 元数据；卡片动作只基于 opaque action ref 和脱敏项目状态执行，不从自然语言重新推断 |
| 状态延续 | 解除风险后会写公开最近进展 `风险解除 -> 风险已解除`、更新 restart-safe state、追加项目文档；没有 app/table 元数据时不会写多维表格流水 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `297 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `263 passed` |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-risk-cycle` 返回 `risk_state_card_resolved=true`、`risk_state_card_recorded=true`、`risk_state_card_feedback_sent=true`，同时风险上报/解除、详情卡 opaque action 和状态表同步基线仍为 true |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户在群里从风险项目卡片继续推进时，不会因为 Hermes 重启丢失可操作性；创建、上报风险、查看详情、解除风险、状态持久化构成更完整的办公闭环 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 重启后按保存负责人批量创建跟进待办

| 项目 | 证据 |
| --- | --- |
| 功能修复 | 简报卡“批量创建跟进待办”的负责人筛选现在会在 registry 无匹配时回退到 restart-safe state，并使用已保存的 `deliverable_assignees` 匹配负责人 |
| 适用边界 | state-only 项目仍不恢复成员名单；筛选和待办负责人只来自已脱敏保存的交付物负责人显示名，不从自然语言重新推断 |
| 状态延续 | 命中的 state-only 项目会创建跟进待办、写公开最近进展、追加项目文档；真实任务 URL 只进入私有 refs，不写入公开 state |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `296 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `262 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-batch-followup-task` 返回 `batch_followup_state_assignee_filtered=true`，同时 `batch_followup_state_assignee_used=true`、`batch_followup_task_created=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户从简报卡按负责人批量创建跟进待办不会因为成员名单脱敏丢失而失效；批量催办和批量待办的筛选行为保持一致 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 重启后按保存负责人批量催办

| 项目 | 证据 |
| --- | --- |
| 功能修复 | 批量催办的负责人筛选现在会把 state-only 项目中已保存的 `deliverable_assignees` 纳入候选负责人；重启后用户仍可按“李四负责的逾期项目”筛出并催办匹配项目 |
| 适用边界 | 不恢复或持久化成员名单；筛选只使用已脱敏保存的交付物负责人显示名。registry 项目仍按成员和分工负责人筛选，state fallback 只在 registry 无匹配时启用 |
| 状态延续 | 命中的 state-only 项目继续发送群聊催办、写公开最近进展、追加项目文档；没有 app/table 元数据时不会写多维表格流水 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `295 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `261 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-project-reminder` 返回 `reminder_batch_state_assignee_filtered=true`，同时 `reminder_batch_sent=true`、`reminder_state_only_assignees_included=true`、`reminder_feedback_sanitized=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，按负责人查找和批量催办不会因为成员名单脱敏丢失而失效；群聊中的后续追踪更接近真实项目监督用法 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 重启后普通进展更新保留分工

| 项目 | 证据 |
| --- | --- |
| 功能修复 | `_handle_update_project` 从 restart-safe state 恢复项目时 now includes saved `deliverable_assignees`; 重启后执行普通进展、风险、状态等项目更新，不再把已有交付物分工覆盖成空映射 |
| 适用边界 | state-only 项目仍不恢复成员名单，不允许重启后直接加减成员；只恢复已经脱敏保存的 `交付物 → 可见负责人显示名` |
| 状态延续 | 更新后继续通过 `_record_action_outcome` 写公开最近进展、私有资源 refs、项目文档和多维表格流水；公开 state 仍不保存真实 Feishu URL |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `294 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `260 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-progress-update` 返回 `progress_state_assignees_preserved=true`，同时 `progress_state_initiator_preserved=true`、`progress_state_recorded=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户继续补充进展不会把此前保存的负责人分工冲掉；后续详情卡、催办和跟进待办仍能基于同一份分工状态工作 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 重启后批量跟进待办负责人恢复

| 项目 | 证据 |
| --- | --- |
| 功能修复 | 简报卡“批量创建跟进待办”现在复用统一跟进负责人选择逻辑；state-only 项目没有成员名单时，会从已保存的 `deliverable_assignees` 中选择可见负责人显示名作为待办负责人 |
| 适用边界 | 内存 registry 项目仍优先使用项目成员列表；重启后从 state 恢复的项目只使用已脱敏、已结构化保存的交付物负责人，不从自然语言重新推断 |
| 状态延续 | 批量待办创建后继续通过 `_record_action_outcome` 写公开最近进展、私有任务资源 refs、项目文档和多维表格流水；state-only 路径不把真实任务 URL 写入公开 state |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `293 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `259 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-batch-followup-task` 返回 `batch_followup_state_assignee_used=true`，同时 `batch_followup_task_created=true`、`batch_followup_state_recorded=true`、`batch_followup_used_opaque_ref=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户从简报卡批量处理逾期项目时，不会退化成无负责人待办；批量跟进链路和详情卡单项目跟进链路保持一致 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 重启后跟进待办负责人恢复

| 项目 | 证据 |
| --- | --- |
| 功能修复 | 从项目详情卡或看板卡点击“创建待办”时，如果项目只从 restart-safe state 恢复且没有成员名单，PilotFlow 会从已保存的 `deliverable_assignees` 中选择一个可见负责人显示名作为跟进待办负责人 |
| 适用边界 | 有成员名单的内存项目仍使用项目成员列表第一个成员；无成员名单的 state-only 项目只使用已脱敏、已随交付物保存的负责人显示名，不从自然语言重新推断 |
| 状态延续 | 跟进待办创建后仍通过统一 `_record_action_outcome` 写公开最近进展、私有任务资源 refs、项目文档和多维表格流水 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `292 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `258 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-followup-task` 返回 `followup_task_state_assignee_used=true`，证明安装态 state-only 详情卡跟进待办会使用保存的交付物负责人 |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户不必重新声明成员；从详情卡或看板卡创建跟进待办仍能派给已有分工负责人，后续追踪链路更接近真实团队使用 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 重启后指定负责人追加交付物

| 项目 | 证据 |
| --- | --- |
| 功能修复 | restart-safe state fallback 项目现在允许用户继续追加“交付物 + 负责人显示名”；即使 state 不保存成员名单，也能把负责人传给飞书待办创建链路 |
| 安全边界 | 仅在重启后的 state-only 项目中放宽成员名单校验；内存项目仍要求负责人属于项目成员。state-only 路径继续拒绝 `ou_*` 等 Feishu 内部 ID 形态，避免把 open_id 当显示名落盘或派发 |
| 状态延续 | 新增交付物和负责人映射会写入 restart-safe state；真实任务 URL 只进入私有 resource refs，不进入公开项目摘要 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `290 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `256 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-update-task` 返回 `update_task_state_assignee_used=true`、`update_task_state_assignee_persisted=true`、`update_task_state_internal_id_rejected=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | Hermes gateway 重启后，用户在群里继续说“新增接口联调，张三负责”不会退化成无负责人任务或被错误拒绝，后续详情卡和催办仍能显示新分工 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 重启后分工展示恢复

| 项目 | 证据 |
| --- | --- |
| 功能修复 | restart-safe state fallback 现在会把已保存的 `deliverable_assignees` 传入项目详情卡；Hermes gateway 重启、内存 registry 清空后，按项目名查询详情仍显示 `交付物 → 负责人` 分工 |
| 催办修复 | 催办文本构建在没有成员名单的 state-only 项目中，也会保留已脱敏的交付物负责人分工，同时总负责人仍显示为“相关负责人” |
| 隐私边界 | 有成员名单时继续按项目成员强校验负责人；没有成员名单的重启状态只保留交付物键和可见显示名，并过滤 Feishu 内部 ID 形态 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `288 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `254 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `--verify-project-reminder` 返回 `reminder_state_only_assignees_included=true`；`--verify-dashboard-navigation` 返回 `dashboard_state_detail_assignees_shown=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | PilotFlow 重启后不会把刚持久化的新增交付物负责人“存了但看不到”；用户继续在群里查详情或催办时仍能看到可执行分工 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 新增交付物负责人持久化

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_update_project(action=add_deliverable)` 现在会把结构化 `assignee` 或兼容解析出的负责人同步写入项目 `deliverable_assignees`，不再只用于本次飞书任务创建和群反馈 |
| 状态延续 | restart-safe project state 现在保存清洗后的 `交付物 → 负责人显示名` 映射；重启后从 state fallback 打开项目详情时仍可展示新增交付物分工 |
| 隐私边界 | state 不保存成员列表、open_id、chat_id、message_id 或 Feishu URL；保存时按交付物和项目成员清洗，加载时只保留交付物键和脱敏后的显示名 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `286 passed`；`tests/test_tools.py tests/test_verify_wsl_feishu_runtime.py` 返回 `252 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-update-task` 在已安装的 WSL Hermes runtime 插件内返回 `update_task_assignee_persisted=true`、`update_task_detail_assignee_shown=true`、`update_task_reminder_assignee_shown=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户在项目创建后追加“交付物 + 负责人”时，后续详情卡和项目催办会继续显示该分工，不需要回翻群消息或依赖本次更新反馈 |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 交付物负责人幂等隔离

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `_plan_idempotency_key` 现在把 `deliverable_assignees` 纳入稳定业务计划摘要；同一项目、成员和交付物但负责人映射不同，会生成不同 `pik_*`，避免复用旧项目创建结果导致任务负责人错误 |
| 风险修复 | 上一轮新增结构化交付物负责人后，若幂等 key 忽略负责人映射，用户调整负责人再确认可能命中旧缓存；本轮已补齐该差异 |
| 本地回归 | 新增 assignment-sensitive idempotency 单测；`C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `277 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| 运行态验证 | `--verify-project-creation` 输出脱敏通过：`project_create_idempotency_includes_assignees=true`，并继续通过 `project_create_structured_assignees_used=true`、`project_create_schema_assignees_exposed=true`、`project_create_task_created=true`、`project_create_trace_redacted=true` |
| 基线验证 | 同轮继续通过 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，`--verify-health-check` 的 `health_check_ok=true`、`health_check_sanitized=true`、`health_card_bridge_registered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 创建项目交付物结构化负责人

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_generate_plan` / `pilotflow_create_project_space` 现在支持 `deliverable_assignees` 映射；Agent 可把“交付物标题 → 负责人显示名”作为结构化字段传入，创建飞书任务时按该映射派发，不再只能按成员列表轮询分配 |
| 确认卡可见性 | 计划确认卡新增 `**负责人：** 交付物 → 成员` 摘要，用户在点击确认前能看到每个交付物的负责人安排 |
| Agent 指引 | `skills/pilotflow/SKILL.md` 已明确：负责人映射 key 必须等于 `deliverables` 标题，value 必须是 `members` 中已有成员显示名或飞书 @ 提及；不要把负责人写进交付物标题，也不要传 open_id/chat_id/message_id |
| 安全边界 | `deliverable_assignees` 只保留同时匹配交付物和项目成员的条目；无效负责人不会进入 pending plan 或任务派发，未指定时仍保留原有轮询分配 |
| 本地回归 | 新增确认卡负责人展示和创建任务结构化负责人单测；`C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `276 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| 运行态验证 | `--verify-project-creation` 输出脱敏通过：`project_create_structured_assignees_used=true`、`project_create_schema_assignees_exposed=true`、`project_create_task_created=true`、`project_create_doc_created=true`、`project_create_bitable_created=true`、`project_create_entry_card_sent=true`、`project_create_trace_redacted=true` |
| 基线验证 | 同轮继续通过 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，`--verify-health-check` 的 `health_check_ok=true`、`health_check_sanitized=true`、`health_card_bridge_registered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 新增交付物结构化负责人

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_update_project` 的 `add_deliverable` 现在支持结构化 `assignee` 字段；Agent 可把交付物标题放在 `value`、负责人显示名放在 `assignee`，不再需要把“负责人：任务”硬塞进文本字段 |
| Agent 指引 | `skills/pilotflow/SKILL.md` 已明确：新增任务/交付物时 `value` 只填标题；用户明确指定负责人时传 `assignee`，且只传显示名或飞书 @ 提及，不传 open_id/chat_id/message_id |
| 兼容与安全 | 旧的 `负责人：交付物` value 解析仍保留；结构化负责人必须是项目已有成员，否则拒绝并不写 registry、状态表、流水或群消息 |
| 本地回归 | 新增结构化负责人单测；`C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `274 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 安装态 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home \\wsl.localhost\Ubuntu-24.04\home\ding\.hermes` 通过；插件和 skill 已同步到 WSL Hermes runtime profile |
| 运行态验证 | `--verify-update-task` 输出脱敏通过：`update_task_created=true`、`update_task_name_returned=true`、`update_task_structured_assignee_used=true`、`update_task_schema_assignee_exposed=true`、`update_task_feedback_includes_summary=true`、`update_task_artifact_recorded=true` |
| 基线验证 | 同轮继续通过 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，`--verify-health-check` 的 `health_check_ok=true`、`health_check_sanitized=true`、`health_card_bridge_registered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 隐私处理 | 验证只记录布尔结果和脱敏状态；不写入真实 chat_id、open_id、message_id、Feishu URL、任务 URL、token 或 app secret |

## 2026-05-05 会话发起人元数据贯穿

| 项目 | 证据 |
| --- | --- |
| 功能硬化 | `pilotflow_generate_plan` 现在把 Hermes session 的用户显示名作为独立 `initiator` 元数据写入 plan，不再只能通过 `members` 表达“谁发起”；保留原有无成员时把发起人补入成员的兼容行为 |
| Agent 可发现性 | `pilotflow_generate_plan` 和 `pilotflow_create_project_space` 的注册 schema 都显式暴露 `initiator` 字段，技能指引要求 Hermes Agent 只传显示名、不要传 open_id/chat_id/message_id |
| 状态贯穿 | `pilotflow_create_project_space` 会从 pending plan 或显式参数继承 `initiator`，写入 in-memory registry 和 restart-safe state；重启后继续记录进展不会清空发起人；项目详情卡展示 `**发起人：** ...` |
| 隐私边界 | 只保存显示名；伪 open_id / chat_id / message_id 形态的值会被丢弃，不把 Feishu 原始 ID 写入公开项目状态 |
| 自动化验证 | 新增回归覆盖 plan/pending plan 的 `initiator`、schema/skill 可发现性、成员显式传入时的 session 发起人来源标记、重启后 state 详情卡发起人展示，以及 installed-runtime verifier `--verify-session-initiator` 的 dry-run 断言 |
| WSL 验证项 | 新 verifier 仅输出脱敏布尔结论：`session_initiator_plan_recorded`、`session_initiator_project_created`、`session_initiator_registry_recorded`、`session_initiator_state_recorded`、`session_initiator_detail_card_shown`、`session_initiator_context_marked_with_explicit_members` |
| 注册验证项 | `--verify-plugin-registration` 新增脱敏布尔结论 `registration_initiator_schema_exposed=true`，证明安装后的 Hermes plugin registry 能发现该结构化字段 |
| 进展验证项 | `--verify-progress-update` 新增脱敏布尔结论 `progress_state_initiator_preserved=true`，证明安装后的 restart-safe 进展更新不会丢失发起人 |
| 确认卡验证项 | 计划确认卡现在在用户点击确认前展示 `**发起人：** ...`；`--send-card` 新增脱敏布尔结论 `card_has_initiator=true`，证明安装后的真实 Feishu interactive card 已包含发起人字段 |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `273 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| WSL 基线 | 同轮通过 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`、`pending_plan_recovered=true`、`card_action_recovered=true`、`redaction_enabled=true`；`--verify-health-check` 返回 `health_check_ok=true`、`health_check_sanitized=true`、`health_card_bridge_registered=true`；`--probe-llm` 返回 `llm_probe_ok=true`、`llm_probe_status=200` |
| 隐私处理 | 验证不打印真实 chat_id、open_id、message_id、Feishu URL、confirm token、idempotency key、token 或 app secret |

