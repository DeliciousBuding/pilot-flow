## 2026-05-05 新增交付物待办摘要回传

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `221 passed`；新增交付物待办摘要和 verifier 新模式定向测试均返回通过 |
| 功能推进 | `pilotflow_update_project` 处理 `add_deliverable` 并成功创建飞书任务后，现在会在工具结果中返回 `task_name`，让 Hermes Agent 能基于真实执行结果继续回复或追踪 |
| 群反馈 | 回归验证确认群通知会追加 `飞书任务 → ...` 摘要，不再只显示“飞书任务已创建”，便于用户直接看到本次新增交付物对应的待办结果 |
| 资源追踪 | 新任务仍进入项目 `artifacts`，项目详情卡和资源列表可继续回读任务入口；交付物字段、多维表格同步、项目文档留痕保持原路径 |
| WSL 更新链路 | 新增 `verify_wsl_feishu_runtime.py --verify-update-task` dry-run 模式，在已安装的 WSL Hermes runtime 插件内验证 `update_task_created=true`、`update_task_name_returned=true`、`update_task_feedback_includes_summary=true`、`update_task_artifact_recorded=true` |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`pending_plan_recovered=true`，以及 `--verify-history` 的 `history_apply_card_sent=true`、`history_pending_recovered=true` |
| 用户价值 | 用户在群聊里补一个交付物后，PilotFlow 不只是内部建任务，而是把真实待办结果带回群反馈和 Agent 结构化结果，办公闭环更接近“可真实使用” |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 重启后新增交付物继续派发待办

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `221 passed`；`add_deliverable` / 跟进待办相关定向测试返回 `10 passed` |
| 功能修正 | `pilotflow_update_project` 在 registry 为空、只能从脱敏状态恢复项目时，处理 `add_deliverable` 也会创建飞书任务，不再只更新交付物列表 |
| 重启可用性 | 回归验证确认重启状态 fallback 会返回 `task_created=true` 和 `task_name`，群反馈包含待办摘要，私有资源 refs 记录任务入口，项目详情卡后续仍可回读 |
| 隐私边界 | 公开项目状态只追加 `交付物=...` 和交付物列表，不保存任务 URL；任务 URL 只进入私有资源 refs，符合重启后状态脱敏策略 |
| WSL 更新链路 | 同轮通过 `verify_wsl_feishu_runtime.py --verify-update-task`，输出 `update_task_created=true`、`update_task_name_returned=true`、`update_task_feedback_includes_summary=true`、`update_task_artifact_recorded=true` |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`pending_plan_recovered=true`，以及 `--verify-history` 的 `history_apply_card_sent=true`、`history_pending_recovered=true` |
| 用户价值 | Hermes gateway 重启后，用户在群里继续补任务/交付物仍会得到真实飞书待办和群反馈，项目不会因为内存 registry 丢失而降级成只改本地状态 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 测试模块状态隔离

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `223 passed`；新增 `tests/test_state_isolation.py` 先复现模块级 dict 泄漏，再由 `tests/conftest.py` autouse fixture 修复 |
| 测试稳定性 | 每个测试结束后清理 `_project_registry`、`_pending_plans`、`_card_action_refs`、`_recent_confirmed_projects` 和 `_idempotent_project_results`，降低测试顺序依赖和 cp936 环境下偶发污染风险 |
| 导入安全 | fixture 不主动导入 `tools`，只在测试模块完成自身 `tools.registry` mock 并导入 `tools` 后清理，避免破坏现有测试初始化顺序 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，以及 `--verify-update-task` 的 `update_task_created=true` |
| 用户价值 | 评审指出的 flaky 根因已变成可复现回归测试和固定清理机制，后续新增真实 Feishu 链路测试不会因为上一个测试遗留状态产生假阳性或假失败 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 legacy 推断字段 schema 标注

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `224 passed`；新增 schema 注册测试覆盖 4 个 `allow_inferred_*` 字段 |
| Agent 边界 | `pilotflow_generate_plan`、`pilotflow_query_status`、`pilotflow_update_project` 的 `allow_inferred_fields` / `allow_inferred_template` / `allow_inferred_filters` schema description 均明确标注“仅供回归测试 / 旧客户端回放使用” |
| 生产约束 | 同一测试确认 description 包含“生产 Agent 不应传 true”和“不再保留向前兼容承诺”，避免评委或 Agent 把 legacy fallback 当成正常生产路径 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，以及 `--verify-update-task` 的 `update_task_created=true` |
| 用户价值 | PilotFlow 的语义理解职责更明确地回到 Hermes Agent；工具层只保留可测试的 legacy escape hatch，不再鼓励生产链路依赖关键词兜底 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目归档确认门控

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `227 passed`；新增归档确认门控定向测试返回通过 |
| 功能修正 | `pilotflow_update_project` 处理 `update_status=已归档` 时会返回 `confirmation_required`，因为归档会从默认看板隐藏项目，属于撤销/隐藏已有协作内容 |
| 写入保护 | 回归验证确认未确认归档不会更新 registry、多维表格、项目文档、流水或群通知，项目状态保持 `进行中` |
| 兼容路径 | 显式传入 `confirmation_text=确认执行` 后，归档仍会更新状态、多维表格和动作流水，并向群里反馈状态表同步结果 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，以及 `--verify-update-task` 的 `update_task_created=true` |
| 用户价值 | 删除成员之外，另一个真实 destructive update 也进入统一确认门控；Agent 不能在未确认时把项目从日常看板隐藏 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 README 工程边界说明

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `227 passed`；`git diff --check` 通过 |
| 文档修正 | README 新增“工程边界与重构计划”，明确 `plugins/pilotflow/tools.py` 当前超过 5000 行，属于已识别工程债，不是目标架构 |
| 拆分计划 | README 列出复赛后第一个重构 issue：按 `state.py`、`feishu_client.py`、`actions.py` 拆分执行层，保留现有 `pilotflow_*` tool schema 与 Hermes 插件注册接口不变 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，以及 `--verify-update-task` 的 `update_task_created=true` |
| 用户价值 | 把评审一定会看到的代码体量问题转成明确工程自觉和可执行拆分边界，同时不牺牲当前已跑通的真实 Feishu 链路稳定性 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 归档确认门控运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `229 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `10 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-archive-gate` 在已安装的 WSL Hermes runtime 插件内返回 `archive_gate_required=true`、`archive_gate_no_write=true`、`archive_gate_confirmed=true`、`archive_gate_feedback_sent=true` |
| 写入保护 | 运行态 verifier 先发起未确认 `update_status=已归档`，确认返回 `confirmation_required`，项目仍保持 `进行中`，且未触发状态表、项目文档、流水或群通知写入 |
| 确认路径 | 同一 verifier 再传入 `confirmation_text=确认执行`，确认返回 `project_updated`，项目状态变为 `已归档`，并产生状态表同步反馈 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，以及 `--verify-update-task` 的 `update_task_created=true` |
| 用户价值 | 归档确认门控不再只有单元测试证据，已进入评委可复跑的 WSL runtime verifier，证明安装后的插件也会阻断未确认 destructive update |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 卡片跟进待办运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `231 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `12 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-followup-task` 在已安装的 WSL Hermes runtime 插件内返回 `followup_task_created=true`、`followup_task_feedback_sent=true`、`followup_task_artifact_recorded=true`、`followup_task_public_update_recorded=true` |
| 卡片动作链路 | verifier 使用生产 `_create_card_action_ref` 生成 opaque action，再通过 `_handle_card_action` 执行 `create_followup_task`，覆盖“项目详情卡按钮 → 创建飞书待办 → 群反馈”的真实插件路径 |
| 状态留痕 | 跟进待办进入项目 `artifacts`，公开项目状态只记录脱敏任务摘要，不把真实任务 URL 写入公开状态文件；这保证重启后看板能回读最近动作，同时不泄露资源链接 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，以及 `--verify-archive-gate` 的 `archive_gate_required=true` |
| 用户价值 | PilotFlow 的后续追踪能力从单元测试进入可复跑 runtime 证据：用户打开项目详情卡后，可以直接创建跟进待办，并在群里拿到明确反馈和后续看板状态 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 截止时间联动运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `233 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `14 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-deadline-update` 在已安装的 WSL Hermes runtime 插件内返回 `deadline_update_applied=true`、`deadline_calendar_created=true`、`deadline_attendees_added=true`、`deadline_reminder_scheduled=true`、`deadline_feedback_sent=true` |
| 飞书联动路径 | verifier 通过生产 `pilotflow_update_project` 的 `update_deadline` 分支执行，dry-run 替换日历和 Hermes cronjob 写入，证明安装态插件会调用日历事件、成员邀请和截止提醒路径 |
| 群反馈 | 运行态结果确认群反馈包含“日历事件已更新”“日历参与人已邀请”“截止提醒已设置”，让用户在群里能看到截止时间联动已经完成 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，以及 `--verify-followup-task` 的 `followup_task_created=true` |
| 用户价值 | 项目截止时间变更不只是改字段，而是同步到飞书日历、项目成员邀请、Hermes 截止提醒和群通知，补强“后续追踪”的真实办公闭环 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 新增成员权限联动运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `235 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `16 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-member-permissions` 在已安装的 WSL Hermes runtime 插件内返回 `member_added=true`、`member_mention_cleaned=true`、`member_permissions_refreshed=true`、`member_bitable_owner_synced=true`、`member_feedback_sent=true` |
| 飞书联动路径 | verifier 通过生产 `pilotflow_update_project` 的 `add_member` 分支执行，dry-run 替换权限刷新、Base 更新和群发送，证明安装态插件会刷新项目文档/状态表权限并同步负责人字段 |
| @ 提及清理 | 运行态输入使用 Feishu `<at user_id=...>王五</at>` 形式，输出确认工具结果和群反馈只保留纯姓名/可展示 @，不把原始 open_id markup 写入结果 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，以及 `--verify-deadline-update` 的 `deadline_update_applied=true` |
| 用户价值 | 群聊里新增协作者不只是改成员列表，而是同步资源权限、状态表负责人和群反馈，降低项目资源对新增成员不可见的真实办公风险 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 风险闭环运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `237 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `18 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-risk-cycle` 在已安装的 WSL Hermes runtime 插件内返回 `risk_reported=true`、`risk_level_high=true`、`risk_bitable_synced=true`、`risk_history_recorded=true`、`risk_feedback_sent=true`、`risk_resolved=true`、`risk_level_low=true`、`risk_resolve_feedback_sent=true` |
| 风险上报路径 | verifier 通过生产 `pilotflow_update_project` 的 `add_risk` 分支执行，dry-run 替换文档、Base 和群发送，确认项目状态切到 `有风险`、风险等级为 `高`，并同步状态表和流水 |
| 风险解除路径 | 同一 verifier 继续执行 `resolve_risk`，确认项目状态恢复 `进行中`、风险等级为 `低`，并产生风险解除群反馈，形成完整风险闭环 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，`--verify-deadline-update` 的 `deadline_update_applied=true`，以及 `--verify-member-permissions` 的 `member_added=true` |
| 用户价值 | 群里上报风险后，PilotFlow 能把项目切入风险态并维护风险等级；风险解除后能恢复项目推进状态，补齐“发现风险 → 跟踪 → 解除”的办公闭环 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目进展记录运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `239 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `20 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-progress-update` 在已安装的 WSL Hermes runtime 插件内返回 `progress_update_applied=true`、`progress_doc_updated=true`、`progress_history_recorded=true`、`progress_state_recorded=true`、`progress_feedback_sent=true` |
| 飞书联动路径 | verifier 通过生产 `pilotflow_update_project` 的 `add_progress` 分支执行，dry-run 替换项目文档、多维表格流水和群发送，证明安装态插件会把进展写入文档追踪、Base history、脱敏状态和群反馈 |
| 状态留痕 | 运行态结果确认公开状态文件只记录进展摘要，不写入真实文档链接或 Feishu 原始资源 ID；重启后看板仍可回读最近进展 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，`--verify-deadline-update` 的 `deadline_update_applied=true`，`--verify-member-permissions` 的 `member_added=true`，以及 `--verify-risk-cycle` 的 `risk_reported=true` |
| 用户价值 | 群里追加项目进展后，PilotFlow 不只是回复文本，而是把进展同步到项目文档、状态表流水、脱敏状态和群反馈，补齐日常推进记录的真实办公闭环 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目催办运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `241 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `22 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-project-reminder` 在已安装的 WSL Hermes runtime 插件内返回 `reminder_single_sent=true`、`reminder_single_doc_updated=true`、`reminder_single_history_recorded=true`、`reminder_single_state_recorded=true`、`reminder_batch_sent=true`、`reminder_batch_filtered=true`、`reminder_batch_history_recorded=true`、`reminder_feedback_sanitized=true` |
| 单项目催办路径 | verifier 通过生产 `pilotflow_update_project` 的 `send_reminder` 分支执行单项目催办，dry-run 替换 Hermes 群发送、项目文档和 Base 流水，证明安装态插件能把“请同步进展”类办公催办写入群反馈、项目文档、状态表流水和脱敏状态 |
| 批量催办路径 | 同一 verifier 再显式传入 `filter=overdue` 执行批量逾期催办，确认只命中逾期项目，不催办未到期项目，并为命中项目追加 Base 流水 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，`--verify-deadline-update` 的 `deadline_update_applied=true`，`--verify-member-permissions` 的 `member_added=true`，`--verify-risk-cycle` 的 `risk_reported=true`，以及 `--verify-progress-update` 的 `progress_update_applied=true` |
| 用户价值 | 用户在群里要求催办项目时，PilotFlow 能直接发送中文群提醒并保留可追踪流水；当 Agent 明确传入筛选条件时，也能批量催办逾期项目，补齐“发现逾期 → 催办 → 留痕”的办公闭环 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 卡片状态闭环运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `243 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `24 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-card-status-cycle` 在已安装的 WSL Hermes runtime 插件内返回 `card_status_done_applied=true`、`card_status_reopen_applied=true`、`card_status_bitable_synced=true`、`card_status_doc_recorded=true`、`card_status_state_recorded=true`、`card_status_feedback_sent=true`、`card_status_used_opaque_refs=true` |
| 卡片动作路径 | verifier 使用生产 `_create_card_action_ref` 生成 opaque action，再通过 `_handle_card_action` 执行 `mark_project_done` 和 `reopen_project`，覆盖“项目卡片按钮 → 状态变更 → 群反馈”的真实插件路径 |
| 状态同步 | 完成和重开都会同步状态表 `状态` 字段、追加项目文档与 Base 流水，并把最新状态写入脱敏状态文件，保证重启后看板仍能回读 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，`--verify-deadline-update` 的 `deadline_update_applied=true`，`--verify-member-permissions` 的 `member_added=true`，`--verify-risk-cycle` 的 `risk_reported=true`，`--verify-progress-update` 的 `progress_update_applied=true`，以及 `--verify-project-reminder` 的 `reminder_single_sent=true` |
| 用户价值 | 用户不需要重新描述项目，只要点击卡片即可完成或重新打开项目；PilotFlow 会同步群反馈、状态表、文档流水和重启状态，补齐项目生命周期的关键交互闭环 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 批量跟进待办运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `245 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `26 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-batch-followup-task` 在已安装的 WSL Hermes runtime 插件内返回 `batch_followup_created=true`、`batch_followup_filtered=true`、`batch_followup_task_created=true`、`batch_followup_doc_recorded=true`、`batch_followup_history_recorded=true`、`batch_followup_state_recorded=true`、`batch_followup_feedback_sent=true`、`batch_followup_used_opaque_ref=true` |
| 卡片动作路径 | verifier 使用生产 `_create_card_action_ref` 生成 opaque action，再通过 `_handle_card_action` 执行 `briefing_batch_followup_task`，覆盖“简报/看板卡片按钮 → 批量筛选项目 → 创建飞书跟进待办 → 群反馈”的真实插件路径 |
| 批量筛选 | 运行态场景同时注册逾期和未到期项目，显式 `filter=overdue` 后只为逾期项目创建跟进待办，不误触未到期项目 |
| 留痕闭环 | 命中项目会调用生产 `_create_task` 入口，追加项目文档、Base 流水和脱敏状态更新；任务 URL 不进入公开 evidence |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，`--verify-deadline-update` 的 `deadline_update_applied=true`，`--verify-member-permissions` 的 `member_added=true`，`--verify-risk-cycle` 的 `risk_reported=true`，`--verify-progress-update` 的 `progress_update_applied=true`，`--verify-project-reminder` 的 `reminder_single_sent=true`，以及 `--verify-card-status-cycle` 的 `card_status_done_applied=true` |
| 用户价值 | 站会/项目看板发现逾期或风险项目后，用户可以一键批量创建跟进待办，PilotFlow 自动分配负责人、同步文档/状态表/状态文件并在群里反馈，补齐团队级后续追踪闭环 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 看板导航运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `247 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `28 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-dashboard-navigation` 在已安装的 WSL Hermes runtime 插件内返回 `dashboard_filter_sent=true`、`dashboard_filter_scoped=true`、`dashboard_page_sent=true`、`dashboard_page_scoped=true`、`dashboard_cards_sent=true`、`dashboard_used_opaque_refs=true` |
| 卡片动作路径 | verifier 使用生产 `_create_card_action_ref` 生成 opaque action，再通过 `_handle_card_action` 执行 `dashboard_filter` 和 `dashboard_page`，覆盖“简报/看板卡片按钮 → 筛选项目看板/翻页项目看板 → 群内发送新卡片”的真实插件路径 |
| 筛选与分页 | 运行态场景同时注册普通项目和风险项目，风险筛选只展示风险项目；强制分页大小为 1 后，第 2 页只展示第二个项目，并保留页码信息 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，`--verify-deadline-update` 的 `deadline_update_applied=true`，`--verify-member-permissions` 的 `member_added=true`，`--verify-risk-cycle` 的 `risk_reported=true`，`--verify-progress-update` 的 `progress_update_applied=true`，`--verify-project-reminder` 的 `reminder_single_sent=true`，`--verify-card-status-cycle` 的 `card_status_done_applied=true`，以及 `--verify-batch-followup-task` 的 `batch_followup_created=true` |
| 用户价值 | 项目简报和看板上的查看风险、查看逾期、上一页/下一页按钮不只是单元测试行为，而是在安装态插件中可复跑验证，用户可以从群卡片继续浏览筛选后的项目状态 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 成员移除运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `249 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `30 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-member-removal` 在已安装的 WSL Hermes runtime 插件内返回 `member_remove_gate_required=true`、`member_remove_gate_no_write=true`、`member_removed=true`、`member_remove_bitable_synced=true`、`member_remove_doc_recorded=true`、`member_remove_history_recorded=true`、`member_remove_feedback_sent=true`、`member_remove_mention_cleaned=true` |
| 确认门路径 | verifier 先通过生产 `pilotflow_update_project` 的 `remove_member` 分支执行无确认请求，确认返回 `confirmation_required`，且不会改成员列表、状态表、项目文档、Base 流水或群反馈 |
| 执行路径 | 同一 verifier 再传入明确确认文本执行成员移除，确认负责人列表从三人变为两人，并同步状态表负责人字段、项目文档、Base 流水和群反馈 |
| @ 提及清理 | 运行态输入使用 Feishu `<at user_id=...>李四</at>` 形式，工具结果和群反馈只保留纯姓名/可展示 @，不把原始 open_id markup 写入结果 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，`--verify-deadline-update` 的 `deadline_update_applied=true`，`--verify-member-permissions` 的 `member_added=true`，`--verify-risk-cycle` 的 `risk_reported=true`，`--verify-progress-update` 的 `progress_update_applied=true`，`--verify-project-reminder` 的 `reminder_single_sent=true`，`--verify-card-status-cycle` 的 `card_status_done_applied=true`，`--verify-batch-followup-task` 的 `batch_followup_created=true`，以及 `--verify-dashboard-navigation` 的 `dashboard_filter_sent=true` |
| 用户价值 | 群聊里移除项目成员属于权限收缩动作，PilotFlow 会先要求确认；确认后才更新负责人、文档/状态表流水和群反馈，降低误删协作者造成的办公风险 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目创建空间运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `253 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `32 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_gate_created=true`、`project_create_confirmed=true`、`project_create_doc_created=true`、`project_create_bitable_created=true`、`project_create_task_created=true`、`project_create_calendar_created=true`、`project_create_reminder_scheduled=true`、`project_create_entry_card_sent=true`、`project_create_state_recorded=true`、`project_create_memory_saved=true`、`project_create_trace_redacted=true` |
| 端到端创建路径 | verifier 先通过生产 `pilotflow_generate_plan` 生成确认门和确认卡，再通过生产 `pilotflow_create_project_space` 消费确认门；dry-run 替换飞书资源写入函数，但保留安装态插件的编排逻辑 |
| 飞书资源编排 | 创建路径会调用文档、Base 状态表、飞书待办、日历事件、Hermes 截止提醒、入口卡片发送和 Hermes memory 保存，并把项目写入脱敏状态文件；日历事件会携带项目成员和群聊上下文，用于邀请可解析负责人 |
| 入口卡片完整性 | 日历事件和 Hermes 截止提醒会先写入资源列表，再发送项目入口卡片和保存重启状态，避免用户收到的交互卡片缺少日历/提醒信息 |
| 风险态与留痕 | 场景带初始风险，确认创建后项目状态记录为 `有风险`，Flight Recorder 开启脱敏，不把真实 chat_id 或资源 URL 写入 verifier 结果 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-update-task` 的 `update_task_created=true`，`--verify-archive-gate` 的 `archive_gate_required=true`，`--verify-followup-task` 的 `followup_task_created=true`，`--verify-deadline-update` 的 `deadline_update_applied=true`，`--verify-member-permissions` 的 `member_added=true`，`--verify-member-removal` 的 `member_removed=true`，`--verify-risk-cycle` 的 `risk_reported=true`，`--verify-progress-update` 的 `progress_update_applied=true`，`--verify-project-reminder` 的 `reminder_single_sent=true`，`--verify-card-status-cycle` 的 `card_status_done_applied=true`，`--verify-batch-followup-task` 的 `batch_followup_created=true`，以及 `--verify-dashboard-navigation` 的 `dashboard_filter_sent=true` |
| 用户价值 | 这覆盖了 PilotFlow 最核心的办公闭环：群聊任务被 Agent 结构化为计划，用户确认后一次性创建项目文档、状态表、待办、日历提醒和入口卡片，并进入后续看板/追踪状态 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 简报批量催办运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `255 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `34 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-briefing-batch-reminder` 在已安装的 WSL Hermes runtime 插件内返回 `briefing_batch_reminder_sent=true`、`briefing_batch_reminder_filtered=true`、`briefing_batch_reminder_doc_recorded=true`、`briefing_batch_reminder_history_recorded=true`、`briefing_batch_reminder_state_recorded=true`、`briefing_batch_reminder_feedback_sent=true`、`briefing_batch_reminder_used_opaque_ref=true` |
| 卡片动作路径 | verifier 使用生产 `_create_card_action_ref` 生成 opaque action，再通过 `_handle_card_action` 执行 `briefing_batch_reminder`，覆盖“项目简报卡片按钮 → 按筛选批量催办 → 群反馈”的真实插件路径 |
| 批量筛选 | 运行态场景同时注册逾期和未到期项目，显式 `filter=overdue` 后只催办逾期项目，不向未到期项目发送提醒 |
| 留痕闭环 | 命中项目会追加项目文档、Base 流水和脱敏状态更新；群反馈不包含 Feishu URL、open_id markup 或真实 chat_id |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-history` 的 `history_apply_card_sent=true`，`--verify-project-creation` 的 `project_create_entry_card_sent=true`，`--verify-project-reminder` 的 `reminder_single_sent=true`，`--verify-card-status-cycle` 的 `card_status_done_applied=true`，`--verify-batch-followup-task` 的 `batch_followup_created=true`，以及 `--verify-dashboard-navigation` 的 `dashboard_filter_sent=true` |
| 用户价值 | 站会/日报简报发现逾期项目后，用户可以直接点卡片批量催办；PilotFlow 自动筛选项目、发送群提醒并同步文档/状态表/状态文件，补齐简报后的团队级推进动作 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 卡片命令桥接运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `257 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `36 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-card-command-bridge` 在已安装的 WSL Hermes runtime 插件内返回 `card_command_bridge_executed=true`、`card_command_bridge_suppressed_text=true`、`card_command_bridge_marked_origin=true`、`card_command_bridge_doc_recorded=true`、`card_command_bridge_history_recorded=true`、`card_command_bridge_state_recorded=true`、`card_command_bridge_used_opaque_ref=true`、`card_command_bridge_feedback_sanitized=true` |
| Hermes 入口路径 | verifier 使用生产 `_create_card_action_ref` 和 `_attach_card_message_id` 准备按钮引用，再通过生产 `_handle_card_command` 执行 `/card button {"pilotflow_action_id":...}` 桥接路径，覆盖 Hermes 实际卡片回调入口 |
| 原卡片反馈 | 执行成功后 `_handle_card_command` 返回 `None`，避免向群聊额外吐 JSON/英文；原始卡片会被更新为“批量催办已发送”的只读反馈卡 |
| 办公链路 | 桥接入口继续触发 `briefing_batch_reminder`，只催办逾期项目，并追加项目文档、Base 流水和脱敏状态更新 |
| 基线验证 | 同轮继续通过 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_risk=true`，`--verify-briefing-batch-reminder` 的 `briefing_batch_reminder_sent=true`，`--verify-card-status-cycle` 的 `card_status_done_applied=true`，以及 `--verify-dashboard-navigation` 的 `dashboard_filter_sent=true` |
| 用户价值 | 用户实际点击飞书卡片按钮时，PilotFlow 走的是 Hermes `/card` 桥接入口；本验证证明该入口能执行真实项目动作、更新原卡片状态并保持群聊反馈干净 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目化建议运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `278 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| Verifier 新模式 | `/home/ding/.venvs/hermes-agent-feishu/bin/python verify_wsl_feishu_runtime.py --verify-projectization-suggestion` 在已安装的 WSL Hermes runtime 插件内返回 `lark_oapi_import_ok=true`、`projectization_suggestion_sent=true`、`projectization_action_found=true`、`projectization_plan_generated=true`、`projectization_plan_card_sent=true`、`projectization_risks_preserved=true`、`projectization_action_items_preserved=true`、`projectization_assignees_preserved=true`、`projectization_assignees_card_shown=true`、`projectization_schema_assignees_exposed=true`、`projectization_pending_recovered=true`、`projectization_cards_sent=true` |
| Agent/工具边界 | verifier 向 `pilotflow_scan_chat_signals` 传入 Hermes 已结构化的目标、承诺、风险、行动项和项目草案；PilotFlow 只负责发送建议卡和传递结构化字段，不从原文关键词推断语义 |
| 真实卡片路径 | 运行态会先向测试群发送“整理成项目计划”建议卡，再通过建议卡 action 进入 `pilotflow_generate_plan`，继续发送执行计划确认卡 |
| 字段保留 | 点击建议按钮后，风险 `API 审批可能卡住`、行动项 `整理上线清单`/`同步审批进度`、以及交付物负责人映射 `整理上线清单 -> 李四`、`同步审批进度 -> 张三` 均被写入 pending plan；确认卡同步展示负责人行，证明从 IM 信号到项目计划链路不丢失关键信息 |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `lark_oapi_import_ok=true`、`card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，`--verify-health-check` 的 `health_check_ok=true`、`health_has_client=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | PilotFlow 不只是在用户明确说“创建项目”后执行资源创建，也能在群聊已经出现目标、承诺、风险和行动项时先冒泡项目化建议，再进入确认式项目启动流程 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 运行健康检查运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `261 passed`；`tests/test_verify_wsl_feishu_runtime.py` 及 health 工具定向测试返回 `41 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-health-check` 在已安装的 WSL Hermes runtime 插件内返回 `health_check_ok=true`、`health_check_sanitized=true`、`health_has_credentials=true`、`health_has_client=true`、`health_has_chat_context=true`、`health_has_state_path_status=true`、`health_memory_flags_reported=true`、`health_card_bridge_registered=true` |
| 安装态诊断 | verifier 直接调用安装态 `pilotflow_health_check`，确认 Feishu 凭据、Feishu client、chat 上下文、状态路径、memory 开关和 `/card` 桥接注册状态都可被工具报告 |
| 脱敏边界 | health 结果只输出状态枚举和布尔结论，不暴露 app id、secret、chat_id、token、本地绝对路径或 message_id |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--verify-projectization-suggestion` 的 `projectization_suggestion_sent=true`，以及 `--verify-card-command-bridge` 的 `card_command_bridge_executed=true` |
| 用户价值 | 安装、演示或故障排查时，用户可以先让 PilotFlow 自检当前 Hermes/Feishu 运行环境，减少靠猜配置、猜日志定位问题 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 Agent 指引同步运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `262 passed`；定向 health/skill/setup/registration 测试返回 `8 passed`；`git diff --check` 通过 |
| Agent 决策入口 | `skills/pilotflow/SKILL.md` 已从 7 个工具更新为 8 个工具，补齐 `pilotflow_health_check`，并明确 `remove_member`、`add_progress`、`add_risk`、`resolve_risk`、`send_reminder` 等真实办公动作的触发和确认边界 |
| 安装态诊断 | `verify_wsl_feishu_runtime.py --verify-health-check` 在已安装的 WSL Hermes runtime 插件内返回 `health_skill_guidance_current=true`，同时保留 `health_check_ok=true`、`health_check_sanitized=true`、`health_card_bridge_registered=true` |
| 防漂移测试 | `tests/test_plugin_registration.py` 会检查每个已注册 PilotFlow 工具都出现在 Hermes skill 指引中，并检查所有 update action 已写入 Agent 指引；`tests/test_setup.py` 会检查安装复制后的 skill 含有 health、催办和成员移除能力 |
| 基线验证 | 同轮继续通过 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，以及 `--verify-projectization-suggestion` 的 `projectization_suggestion_sent=true`、`projectization_plan_card_sent=true`、`projectization_risks_preserved=true`、`projectization_action_items_preserved=true` |
| 用户价值 | PilotFlow 的已安装 Agent 指引不再停留在早期基础工具面；Hermes 能在群聊中选择诊断、风险闭环、进展记录、归档、成员移除和催办等真实办公动作，而不是只会创建项目或查询状态 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 协作资源安装态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `264 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `42 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-collaboration-resources` 在已安装的 WSL Hermes runtime 插件内返回 `collab_doc_created=true`、`collab_doc_comment_created=true`、`collab_doc_permission_refreshed=true`、`collab_task_created=true`、`collab_task_assignee_bound=true`、`collab_task_followers_bound=true`、`collab_task_collaborators_created=true`、`collab_task_url_returned=true` |
| 文档协作 | verifier 直接调用安装态 `_create_doc`，用最小 Feishu SDK/client 捕获文档创建、正文写入、引导评论 `请补充内容`、链接权限刷新和群成员编辑权刷新路径 |
| 任务协作 | verifier 直接调用安装态 `_create_task`，捕获负责人 assignee、项目成员 follower、v1 collaborator 补充绑定和任务 URL 回传，证明待办不是裸任务创建 |
| 基线验证 | 同轮继续通过 `--verify-health-check` 的 `health_check_ok=true`、`health_skill_guidance_current=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 项目空间创建后的文档和待办现在有可复跑安装态门禁：文档会留下协作引导并刷新权限，待办会绑定负责人和项目成员关注者，降低“创建了资源但团队无法协作/追踪”的风险 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 Hermes 注册面安装态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `266 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `44 passed`；`git diff --check` 通过 |
| Verifier 新模式 | `verify_wsl_feishu_runtime.py --verify-plugin-registration` 在已安装的 WSL Hermes runtime 插件内返回 `registration_tools_exposed=true`、`registration_expected_tool_count=true`、`registration_schemas_match_names=true`、`registration_check_fns_present=true`、`registration_handlers_present=true`、`registration_card_command_exposed=true` |
| Hermes 工具入口 | verifier 在 WSL runtime 中导入已安装 `plugins.pilotflow`，用 fake Hermes context 调用 `register(ctx)`，确认 8 个 PilotFlow 工具按顺序注册、schema name 与 tool name 一致，并且每个工具都有 handler 和 check_fn |
| 卡片命令入口 | 同一 verifier 确认 `/card` command 已注册，handler 可调用，`args_hint` 保留 `pilotflow_action`，避免插件复制成功但 Hermes 实际无法路由飞书卡片点击 |
| 基线验证 | 同轮继续通过 `--verify-health-check` 的 `health_check_ok=true`、`health_skill_guidance_current=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 安装验证不再只检查文件存在；现在能证明 Hermes runtime 会看到 PilotFlow 的工具和卡片回调入口，降低“装上了但 Agent 无法调用”的发布风险 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 历史分工建议运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `282 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-history` 在已安装的 WSL Hermes runtime 插件内返回 `history_assignees_recovered=true`、`history_assignees_card_shown=true`、`history_privacy_members_ignored=true`、`history_apply_card_sent=true` |
| 项目创建闭环 | `verify_wsl_feishu_runtime.py --verify-project-creation` 返回 `project_create_memory_assignees_saved=true`、`project_create_structured_assignees_used=true`、`project_create_memory_saved=true`，证明项目创建时会把交付物负责人写入 Hermes memory，并继续优先使用结构化负责人字段 |
| 历史建议路径 | 历史 memory 中的 `负责人=整理上线清单->李四、同步审批进度->张三` 会被解析为 `deliverable_assignees`；后续“照上次分工”类计划会在历史建议中恢复交付物负责人，并在确认卡展示负责人行 |
| 卡片动作路径 | `apply_history_suggestions` 使用 opaque card action ref 应用历史建议，负责人映射会经清洗后写入 pending plan，不要求 Agent 从自然语言重新猜测分工 |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200`，`--verify-projectization-suggestion` 的 `projectization_assignees_preserved=true`、`projectization_assignees_card_shown=true`、`projectization_schema_assignees_exposed=true`，`--send-card` 的 `card_sent=true`，以及 `--verify-health-check` 的 `health_check_ok=true`、`health_has_client=true` |
| 用户价值 | 用户复用历史项目经验时，PilotFlow 不只恢复目标、交付物、风险和成员，也能恢复“哪个交付物由谁负责”，避免项目确认前丢失团队分工 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 风险详情卡催办运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `283 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| 功能硬化 | 风险项目详情卡现在除“解除风险”和“创建待办”外，也展示“发送提醒”按钮；按钮通过短期 opaque `pilotflow_action_id` 触发，不把 chat_id 或项目明文控制字段放进卡片 payload |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-risk-cycle` 在已安装的 WSL Hermes runtime 插件内返回 `risk_detail_reminder_action_shown=true`、`risk_detail_reminder_opaque=true`，并保留 `risk_reported=true`、`risk_resolved=true`、`risk_bitable_synced=true`、`risk_history_recorded=true` |
| 飞书卡片路径 | verifier 使用生产 `_create_card_action_ref` 和 `_handle_card_action` 打开风险项目详情卡，检查风险详情卡能生成 `resolve_risk`、`send_project_reminder`、`create_followup_task` 三类动作引用 |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 群里发现风险项目后，用户不必先切换到简报或批量催办入口；在项目详情卡即可直接催办负责人、创建跟进待办或解除风险，补齐风险发现后的即时推进闭环 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目详情卡分工可见性运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `284 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| 功能硬化 | 项目详情卡现在展示结构化交付物负责人映射，例如 `验收清单 → 李四；上线演练 → 张三`；该字段来自创建计划/registry 中已清洗的 `deliverable_assignees`，不从详情查询文本重新推断 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_detail_assignees_shown=true`，并保留 `project_create_structured_assignees_used=true`、`project_create_memory_assignees_saved=true`、`project_create_entry_card_sent=true` |
| 飞书卡片路径 | verifier 走生产 `pilotflow_generate_plan` → `pilotflow_create_project_space` → `_create_card_action_ref(project_status)` → `_handle_card_action`，覆盖创建项目后再打开详情卡的真实插件路径 |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 项目创建后，群成员查看项目详情时能直接看到每个交付物的负责人安排，不需要回翻确认卡或项目文档，后续催办、跟进待办和风险处理更可执行 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目催办分工可见性运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `285 passed`；`tests/test_verify_wsl_feishu_runtime.py` 返回 `45 passed`；`git diff --check` 通过，仅有 CRLF 提示 |
| 功能硬化 | 单项目催办消息现在会包含结构化交付物负责人分工，例如 `分工：整理上线清单 → 张三；同步审批进度 → 张三`；该字段来自已清洗的 `deliverable_assignees`，不从催办文本重新推断 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-reminder` 在已安装的 WSL Hermes runtime 插件内返回 `reminder_single_assignees_included=true`，并保留 `reminder_single_sent=true`、`reminder_single_doc_updated=true`、`reminder_batch_sent=true`、`reminder_feedback_sanitized=true` |
| 飞书消息路径 | verifier 走生产 `pilotflow_update_project(action=send_reminder)`，捕获 Hermes 群消息发送内容，确认催办消息包含分工且不包含 `open_id`、真实 Feishu URL 或 chat_id |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_title=true`、`card_has_goal=true`、`card_has_initiator=true`、`card_has_risk=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 项目负责人收到群催办时，能直接看到每个交付物该由谁推进，不需要再打开详情卡或回翻项目确认卡，提升后续追踪动作的可执行性 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目化建议发起人保留运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `317 passed`；相关 projectization 单元/verifier 测试返回 `6 passed` |
| 功能硬化 | 群聊信号项目化建议卡生成时会把 Hermes session 发起人显示名写入 opaque action ref；用户稍后点击“整理成项目计划”时，即使点击阶段没有 session context，生成的 pending plan 和确认卡仍保留发起人 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-projectization-suggestion` 在已安装的 WSL Hermes runtime 插件内返回 `projectization_session_initiator_preserved=true`、`projectization_session_initiator_card_shown=true`，并保留 `projectization_plan_generated=true`、`projectization_plan_card_sent=true`、`projectization_assignees_preserved=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | @PilotFlow 从群聊中冒泡“整理成项目”建议后，确认卡能显示真实请求人的显示名，避免项目从建议卡转为计划时丢失发起人上下文 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 卡片桥接确认发起人快照运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `317 passed`；相关卡片确认/桥接测试返回 `6 passed` |
| 功能硬化 | `confirm_project` 卡片动作现在把 action ref 里的 `initiator` 显式传入项目创建，旧确认卡按自己的计划快照建项，不会被同群聊中新 pending plan 的发起人污染 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-card-command-bridge` 在已安装的 WSL Hermes runtime 插件内返回 `card_command_confirm_initiator_preserved=true`，并保留 `card_command_confirm_project_created=true`、`card_command_confirm_origin_marked=true`、`card_command_bridge_used_opaque_ref=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户在群里连续生成多个执行计划后，点击较早的飞书确认卡仍会创建那张卡对应的项目和发起人，避免真实项目负责人归属被后续计划覆盖 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目入口卡发起人可见性运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `317 passed`；相关入口卡/项目创建测试返回 `7 passed` |
| 功能硬化 | 项目创建后的群入口卡现在展示 `发起人` 行；该字段来自已清洗的 plan/pending plan 显示名，只写用户可见姓名，不写 open_id、chat_id 或 message_id |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_entry_initiator_shown=true`，并保留 `project_create_entry_card_sent=true`、`project_create_doc_created=true`、`project_create_bitable_created=true`、`project_create_task_created=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 项目真实创建后，群成员在入口卡即可看到谁发起了项目，不需要再回翻执行计划确认卡或详情卡确认责任来源 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目入口卡分工可见性运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `317 passed`；相关项目创建/入口卡测试返回 `6 passed` |
| 功能硬化 | 项目创建后的群入口卡现在展示结构化交付物负责人映射，例如 `验收清单 → 李四；上线演练 → 张三`；该字段来自已清洗的 `deliverable_assignees`，不从文本重新推断，也不暴露 Feishu 原始 ID |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_entry_assignees_shown=true`，并保留 `project_create_entry_card_sent=true`、`project_create_entry_initiator_shown=true`、`project_create_structured_assignees_used=true`、`project_create_detail_assignees_shown=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 项目真实创建后，群成员在第一张入口卡即可看到每个交付物由谁负责，不需要再打开详情卡或回翻执行计划确认卡确认分工 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目入口卡交付物可见性运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `317 passed`；相关入口卡/项目创建测试返回 `7 passed` |
| 功能硬化 | 项目创建后的群入口卡现在直接展示交付物列表，例如 `验收清单, 上线演练`；该字段来自结构化计划中的 `deliverables`，不从自然语言重新推断 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_entry_deliverables_shown=true`，并保留 `project_create_entry_assignees_shown=true`、`project_create_entry_initiator_shown=true`、`project_create_entry_card_sent=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 项目真实创建后，群成员在第一张入口卡即可看到项目要交付什么，不需要打开详情卡或文档才能确认产出范围 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实 chat_id、message_id、Feishu URL、用户 open_id、token 或 app secret |

## 2026-05-05 项目文档发起人与分工可见性运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `317 passed`；相关项目创建文档/verifier 测试返回 `3 passed` |
| 功能硬化 | 项目创建时生成的飞书项目简报文档现在展示 `发起人` 段落，并在 `负责人` 段落写入结构化交付物负责人映射，例如 `验收清单 → 李四`、`上线演练 → 张三`；内容来自已清洗的计划字段，不从自然语言重新推断 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_doc_initiator_shown=true`、`project_create_doc_assignees_shown=true`，并保留 `project_create_doc_created=true`、`project_create_entry_initiator_shown=true`、`project_create_entry_assignees_shown=true`、`project_create_entry_deliverables_shown=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 项目创建后，打开项目简报文档即可看到谁发起项目、每个交付物由谁负责，避免文档正文与群入口卡、项目状态之间的信息不一致 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 项目文档协作资源索引运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `318 passed`；新增文档资源索引单测和项目创建 verifier 测试返回 `4 passed` |
| 功能硬化 | 项目创建时先生成项目简报文档，再完成状态表、待办、日历和截止提醒创建后，PilotFlow 会向同一项目文档追加 `协作资源` 索引，把后续协作入口沉淀到文档正文 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_doc_resource_index_appended=true`，并保留 `project_create_doc_created=true`、`project_create_bitable_created=true`、`project_create_task_created=true`、`project_create_calendar_created=true`、`project_create_reminder_scheduled=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户打开项目简报文档后即可进入状态表、待办和日历等后续执行资源，不必只依赖群入口卡片或回翻机器人消息 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 项目详情卡日历与提醒资源可见性运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `318 passed`；详情卡资源渲染和项目创建 verifier 相关测试返回 `3 passed` |
| 功能硬化 | 项目详情卡的 `资源` 区现在不只展示项目文档、状态表和任务，也会展示创建路径保存的日历事件摘要与截止提醒状态 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_detail_calendar_reminder_shown=true`，并保留 `project_create_entry_card_sent=true`、`project_create_calendar_created=true`、`project_create_reminder_scheduled=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户从入口卡点击 `查看状态` 后，详情卡仍能看到日历和截止提醒，不会因为离开入口卡而丢失后续时间管理入口 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 跟进待办原卡反馈任务摘要运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest` 返回 `319 passed`；新增桥接反馈单测和 followup verifier 测试返回 `3 passed` |
| 功能硬化 | 用户从项目详情卡点击 `创建待办` 后，原卡片成功反馈现在展示脱敏后的待办摘要，而不是只显示泛化的“跟进待办已创建” |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-followup-task` 在已安装的 WSL Hermes runtime 插件内返回 `followup_task_origin_feedback_named=true`，并保留 `followup_task_created=true`、`followup_task_feedback_sent=true`、`followup_task_artifact_recorded=true`、`followup_task_public_update_recorded=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户点击卡片创建跟进待办后，即使只看原卡反馈，也能知道创建了哪个待办；真实任务链接仍不进入公开证据和原卡反馈正文 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 批量跟进待办原卡反馈项目列表运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `320 passed`；批量跟进待办原卡反馈和 verifier 相关 targeted tests 返回 `4 passed` |
| 功能硬化 | 用户从项目简报卡点击批量创建跟进待办后，原卡片成功反馈现在展示实际命中的项目名列表，例如逾期或风险项目集合，而不是只显示数量 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-batch-followup-task` 在已安装的 WSL Hermes runtime 插件内返回 `batch_followup_origin_feedback_projects_named=true`，并保留 `batch_followup_created=true`、`batch_followup_filtered=true`、`batch_followup_task_created=true`、`batch_followup_state_assignee_filtered=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户批量创建跟进待办后，即使只看原卡反馈，也能知道哪些项目实际生成了待办；真实任务链接仍不进入公开证据和原卡反馈正文 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 批量催办原卡反馈项目列表运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `320 passed`；批量催办原卡反馈和 verifier 相关 targeted tests 返回 `3 passed` |
| 功能硬化 | 用户从项目简报卡点击批量催办后，原卡片成功反馈现在展示实际命中的项目名列表，例如逾期或风险项目集合，而不是只显示数量 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-briefing-batch-reminder` 在已安装的 WSL Hermes runtime 插件内返回 `briefing_batch_reminder_origin_feedback_projects_named=true`，并保留 `briefing_batch_reminder_sent=true`、`briefing_batch_reminder_filtered=true`、`briefing_batch_reminder_doc_recorded=true`、`briefing_batch_reminder_history_recorded=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户批量催办后，即使只看原卡反馈，也能知道哪些项目实际收到催办提醒；真实会话标识和资源链接仍不进入公开证据和原卡反馈正文 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 看板分页原卡反馈查询上下文运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `320 passed`；看板分页原卡反馈和 dashboard verifier 相关 targeted tests 返回 `4 passed` |
| 功能硬化 | 用户从项目看板点击分页后，原卡片成功反馈现在展示已发送的查询/页码上下文，例如 `项目进展第2页看板已发送到群聊。`，不再只显示泛化的“新的项目看板” |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-dashboard-navigation` 在已安装的 WSL Hermes runtime 插件内返回 `dashboard_page_origin_feedback_query_named=true`，并保留 `dashboard_filter_sent=true`、`dashboard_page_sent=true`、`dashboard_page_scoped=true`、`dashboard_state_archived_filter_shown=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户连续点击看板分页时，原卡反馈能说明哪一页已经发送，减少多张看板卡并存时的操作歧义 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 看板筛选原卡反馈负责人范围运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `321 passed`；看板筛选负责人范围反馈和 dashboard verifier 相关 targeted tests 返回 `4 passed` |
| 功能硬化 | 用户从负责人范围简报点击看板筛选后，原卡片成功反馈现在保留负责人范围，例如 `张三负责的风险项目看板已发送到群聊。`，不再丢失筛选上下文 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-dashboard-navigation` 在已安装的 WSL Hermes runtime 插件内返回 `dashboard_filter_origin_feedback_owner_scoped=true`，并保留 `dashboard_filter_sent=true`、`dashboard_filter_scoped=true`、`dashboard_page_origin_feedback_query_named=true`、`dashboard_state_detail_assignees_shown=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户按负责人筛选项目后，原卡反馈能说明筛选范围，减少多张看板卡并存时误以为查看了全部风险项目的歧义 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 项目状态按钮原卡反馈同步摘要运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `321 passed`；状态按钮原卡反馈和 card-status verifier 相关 targeted tests 返回 `4 passed` |
| 功能硬化 | 用户从项目入口/详情卡点击标记完成、重新打开、催办或创建待办后，原卡片成功反馈现在会追加状态表/项目文档同步摘要，例如 `状态表已同步，项目文档已更新。` |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-card-status-cycle` 在已安装的 WSL Hermes runtime 插件内返回 `card_status_origin_feedback_sync_summary=true`，并保留 `card_status_bitable_synced=true`、`card_status_doc_recorded=true`、`card_status_done_applied=true`、`card_status_retryable_failure=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户点击状态类按钮后，原卡反馈能说明后端飞书资源是否已经同步，减少只看到“完成/重开”但不确定文档和状态表是否落库的歧义 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 确认创建原卡反馈资源清单运行态验证

| 项目 | 证据 |
| --- | --- |
| 运行环境 | PilotFlow 已通过 `setup.py --hermes-home <wsl-hermes-home>` 同步到 WSL Hermes runtime；安装验证返回插件、技能、Hermes config 和 Feishu display 配置均 OK |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `321 passed`；确认创建原卡资源清单和 card-command bridge verifier 相关 targeted tests 返回 `3 passed` |
| 功能硬化 | 用户点击确认创建项目后，原确认卡片成功反馈现在基于真实 `artifacts` 列出已创建的飞书资源，例如飞书文档、状态表、任务、日历事件、截止提醒和项目入口卡片 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-card-command-bridge` 在已安装的 WSL Hermes runtime 插件内返回 `card_command_confirm_origin_artifacts_listed=true`，并保留 `card_command_confirm_project_created=true`、`card_command_confirm_origin_marked=true`、`card_command_bridge_retryable_failure=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 项目创建完成后，用户无需打开入口卡即可从原确认卡知道哪些飞书资源已经实际落地，减少“只创建了入口消息还是完整项目空间已创建”的不确定性 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 项目详情原卡反馈资源与进展提示运行态验证

| 项目 | 证据 |
| --- | --- |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `321 passed`；项目详情原卡反馈和 card-command bridge verifier 相关 targeted tests 返回 `3 passed` |
| 功能硬化 | 用户点击 `查看状态` 后，原卡片成功反馈现在说明详情卡片包含资源入口和最近进展，不再只提示“详情卡片已发送到群聊” |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-card-command-bridge` 在已安装的 WSL Hermes runtime 插件内返回 `card_command_detail_origin_feedback_resources_updates=true`，并保留 `card_command_bridge_executed=true`、`card_command_confirm_project_created=true`、`card_command_confirm_origin_artifacts_listed=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户从入口卡或看板进入项目详情后，即使只看原卡反馈，也能知道新详情卡不是空确认，而是包含可继续操作的资源入口和最近进展 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 卡片桥接失败原卡重试提示运行态验证

| 项目 | 证据 |
| --- | --- |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `321 passed`；卡片桥接失败原卡重试提示和 card-command bridge verifier 相关 targeted tests 返回 `3 passed` |
| 功能硬化 | 当卡片按钮触发的飞书动作遇到临时失败时，原卡片失败反馈现在说明按钮状态已保留，修复连接后可再次点击重试 |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-card-command-bridge` 在已安装的 WSL Hermes runtime 插件内返回 `card_command_bridge_retryable_origin_hint=true`，并保留 `card_command_bridge_retryable_failure=true`、`card_command_bridge_executed=true`、`card_command_confirm_project_created=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户点击卡片按钮遇到临时 Feishu 连接或资源创建失败时，不会误以为按钮已失效或需要重新发起完整流程，可在故障恢复后继续同一办公动作 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 项目入口卡发送失败反馈运行态验证

| 项目 | 证据 |
| --- | --- |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `322 passed`；入口卡发送失败反馈和 project-creation verifier 相关 targeted tests 返回 `3 passed` |
| 功能硬化 | 项目文档、状态表、任务等资源已创建但项目入口卡片发送失败时，创建结果不再误报“已通知群成员”，而是提示“项目入口卡片未发送” |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-project-creation` 在已安装的 WSL Hermes runtime 插件内返回 `project_create_entry_card_failure_displayed=true`，并保留 `project_create_entry_card_sent=true`、`project_create_confirmed=true`、`project_create_state_recorded=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 用户不会在入口卡片未送达时误以为群成员已经收到入口消息；反馈能区分资源创建成功与入口通知失败，便于后续重试或人工补发 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 项目更新未知动作防误报运行态验证

| 项目 | 证据 |
| --- | --- |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `323 passed`；未知更新动作防误报和 update-task verifier 相关 targeted tests 返回 `3 passed` |
| 功能硬化 | `pilotflow_update_project` 现在会在运行时拒绝 schema 之外的更新动作，不再把 Agent 调用漂移或动作名拼写错误误报为“项目已更新” |
| Verifier 新字段 | `verify_wsl_feishu_runtime.py --verify-update-task` 在已安装的 WSL Hermes runtime 插件内返回 `update_task_unknown_action_rejected=true`，并保留 `update_task_created=true`、`update_task_feedback_includes_summary=true`、`update_task_state_internal_id_rejected=true` |
| 基线验证 | 同轮继续通过同一 Feishu venv 下 `--send-card` 的 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`，以及 `--probe-llm` 的 `llm_probe_ok=true`、`llm_probe_status=200` |
| 用户价值 | 当 Hermes Agent 或旧客户端传入不支持的更新动作时，PilotFlow 不会发送误导性的群聊成功反馈，也不会创建飞书任务或写入项目状态，避免真实办公数据被“假成功”污染 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

## 2026-05-05 工具层语义推断门控运行态验证

| 项目 | 证据 |
| --- | --- |
| 本地回归 | `C:\Users\Ding\miniforge3\python.exe -m pytest -q` 返回 `327 passed`；新增/调整用例覆盖 `view_mode` 显式简报、默认不从 query 关键词进简报、任意 `template` 字符串、模板只作参考不补交付物/截止时间、显式 `risk_level` 与默认不从风险文本推断 |
| 安装验证 | `setup.py --hermes-dir D:\Code\LarkProject\hermes-agent --hermes-home <wsl-hermes-home>` 返回插件、技能、Hermes config、Feishu display 配置均 OK |
| WSL 基线 | `verify_wsl_feishu_runtime.py --send-card` 返回 `card_sent=true`、`card_has_initiator=true`、`pending_plan_recovered=true`、`trace_has_key=true`；`--probe-llm` 返回 `llm_probe_ok=true`、`llm_probe_status=200` |
| 运行态门控 | `--verify-dashboard-navigation` 返回 `dashboard_no_implicit_briefing=true` 与 `dashboard_explicit_briefing=true`，证明 query 含简报词时默认仍走看板，只有 Agent 显式传 `view_mode=briefing` 才进入简报 |
| 风险等级边界 | `--verify-risk-cycle` 返回 `risk_level_high=true`、`risk_level_low=true`，运行态风险上报路径改为显式 `risk_level` 驱动，旧文本推断只保留在 `allow_inferred_risk_level=true` 退化路径 |
| 项目化边界 | `--verify-projectization-suggestion` 继续返回 `projectization_plan_generated=true`、`projectization_clarification_sent=true`、`projectization_raw_action_rejected=true`，模板/澄清调整未破坏项目化建议与确认门控 |
| 隐私处理 | 证据只记录布尔结果和脱敏结论；不写入真实会话标识、消息标识、Feishu URL、用户原始标识或凭证 |

