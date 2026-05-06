## 2026-05-05 Killer Demo：群聊自然讨论 → 主动冒泡项目化

PilotFlow 最不可替代的能力：**用户没 @ 任何人，在群里自然讨论，PilotFlow 自己跳出来问"要不要整理成项目？"** 飞书项目 / OpenClaw / Aily 均无此能力。

| 项目 | 证据 |
| --- | --- |
| 前置条件 | 目标群 `require_mention: false`；Hermes gateway + `mimo-v2.5-pro` |
| 触发方式 | 用户自然发言：`下周五前要完成真实链路验证，API 审批可能卡住，记得整理上线清单`（无 @，无 Bot 前缀） |
| Agent 行为 | Hermes 收到普通群消息 → 推理上下文 → 提取 goal / risk / action_item → 主动调用 `pilotflow_scan_chat_signals` 传入结构化 signals + `should_suggest_project=true` |
| 工具行为 | PilotFlow 不重复做语义识别 → 构建"要不要整理成项目？"卡片 → Feishu IM API 直发到群 |
| 卡片交互 | 卡片展示识别到的目标/风险/行动项 + "整理成项目计划"按钮 → 用户点击 → `pilotflow_generate_plan` → 确认 → 文档/Base/任务/日历/入口卡全程 |
| 为什么别人做不到 | OpenClaw 建议不接入群聊；Aily 是固定场景增强；飞书项目被动管理。PilotFlow 是唯一**群聊里主动发现、主动建议、确认后一键写飞书**的 Agent |
| 订阅配置 | `pilotflow_subscribe_chat` 工具生成 per-group config 片段，用户粘贴到 `~/.hermes/config.yaml` 后重启 gateway |
| 本地回归 | `pytest tests -q` 328 passed；`--verify-projectization-suggestion` 返回 `projectization_plan_card_sent=true` |
| 隐私处理 | 真实 chat_id / open_id / message_id / 飞书 URL / token 不写入公开仓库 |


## 2026-05-05 看板分页 page 必须显式传

| 项目 | 证据 |
| --- | --- |
| 范围 | 看板分页参数 page 改为 Hermes Agent / 看板按钮 action ref payload 显式传入；删除 `_dashboard_query_for_page` 函数（不再把 page 编码进自然语言 query 字符串再让工具关键词解析回结构化） |
| 工具变更 | `pilotflow_query_status` schema 加 `page: integer minimum=1` + `allow_inferred_page: bool` 默认 false；`_handle_query_status` 优先用 `params["page"]`，仅 allow_inferred_page=true 才退到 `_dashboard_page_from_query(query)` 关键词推断 |
| 看板按钮变更 | dashboard navigation 上一页/下一页 action ref payload 直接携带 `{filter, member_filters, view_mode, page}` 结构化字段；`_handle_card_action` dashboard_page 分支直接透传 page 给 `_handle_query_status`，不再重组中文 query |
| 单测覆盖 | `test_query_status_does_not_infer_page_from_query_by_default` 验证 query 含 "第2页" 时默认仍走第 1 页；只有显式传 page 或 allow_inferred_page=true 才生效 |
| 本地回归 | `pytest tests -q` 返回 `328 passed`；`setup.py --hermes-dir D:\Code\LarkProject\hermes-agent` 通过 |
| 用户价值 | "工具内拍板"硬编码点又少一处：page 不再从 query 关键词解析，结构化数据保持结构化全程不降级再解析 |
| 隐私处理 | 验证只记录布尔结果和 commit 哈希；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

## 2026-05-05 Agent 主驾驶硬证据

| 项目 | 证据 |
| --- | --- |
| 范围 | PilotFlow 工具内 3 处原本由关键词/模板/枚举工具自行拍板的语义判断（briefing 视图 / 项目模板 / 风险等级），改为 Hermes Agent 必须显式传结构化字段；工具默认拒绝从用户原话推断，仅在 `allow_inferred_*=true` 时退到旧版关键词路径作为兼容回归用 |
| view_mode 显式（pilotflow_query_status） | schema 加 `view_mode: enum["", "list", "briefing"]` + `allow_inferred_view_mode: bool` 默认 false；handler 优先用显式 view_mode，仅 allow_inferred=true 才退到 `_is_briefing_query(query)` 关键词集合 |
| template 显式（pilotflow_generate_plan） | schema 移除 `template` 的 enum 限制改任意 string；模板信息仅作为参考建议展示，不再静默补全 deliverables/deadline；缺字段时返回 `needs_clarification` + 模板建议作为 hint，不当确认计划字段 |
| risk_level 显式（pilotflow_update_project add_risk） | schema 加 `risk_level: enum["低","中","高"]` + `allow_inferred_risk_level: bool` 默认 false；未传时默认 "中"，仅 allow_inferred=true 才退到 `_risk_level_from_text(value)` 关键词分级 |
| 单测覆盖 | `test_query_status_does_not_infer_briefing_from_query_by_default` / `test_query_status_uses_explicit_briefing_view_mode` / `test_generate_plan_does_not_infer_template_by_default` / `test_generate_plan_accepts_explicit_template_key` / `test_generate_plan_schema_allows_arbitrary_template_reference` / `test_update_project_add_risk_defaults_to_medium_without_inference_flag` 全部通过 |
| 本地回归 | `"/c/Users/Ding/miniforge3/python.exe" -m pytest tests -q` 返回 `327 passed`；`setup.py --hermes-dir D:\Code\LarkProject\hermes-agent` 复制 6 个 plugin/skill 文件全部 OK |
| 评委可复跑 | 任何含上述工具调用的场景，工具收到不带 view_mode/risk_level 的请求时按代码路径返回 list 视图或默认中等风险，不再"看用户说什么"自己拍板 |
| 用户价值 | "Agent 是主驾驶 + PilotFlow 是飞书执行层"在代码层 100% 落地；评委打开 tools.py 任一处工具内"看几个关键词决定下一步"的硬编码点都已加 `allow_inferred_*` 门控保护，且 schema description 标注 "仅供回归测试 / 旧客户端回放使用，生产 Agent 不应传 true" |
| 隐私处理 | 验证只记录布尔结果和 commit 哈希；不写入真实 chat_id、open_id、message_id、Feishu URL、token 或 app secret |

