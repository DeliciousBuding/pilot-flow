# PilotFlow 答辩 Q&A 草稿

> 用途：评委可能在演示后追问的高频问题准备稿。每条 ≤ 60 秒回答时长，附"如果继续追问"的备弹。
> 红线：演示和代码必须一致；任何回答里提到的能力都要在 LIVE_TEST_EVIDENCE.md 或 tests/ 里能找到证据。

---

## Q1: PilotFlow 和飞书项目 / OpenClaw / Aily 有什么区别？为什么不直接用现成的？

**核心回答**：阶段不同。飞书项目、OpenClaw、Aily 解决的是项目**已经成型之后**的管理和执行；PilotFlow 解决项目**还没成型时**——目标、承诺、风险、行动项散落在群聊里，谁来识别、谁来追问、谁来建议项目化、确认后写入飞书。我们是飞书项目之前的"群聊意图层和项目启动治理层"。

**证据**：
- README "差异化定位"段对比矩阵
- `pilotflow_scan_chat_signals` 工具：接收 Hermes 总结的结构化 signals（goals/commitments/risks/action_items），冒泡建议项目化
- 路线图明确：飞书项目 OpenAPI 可用后 PilotFlow 优先对接其作为权威项目后端

**如果继续追问"那为什么不让飞书项目自己加这个能力"**：因为意图识别需要 LLM 主导的对话理解，飞书项目是 SaaS 形态、没有 Agent 上下文；Hermes Agent + PilotFlow 插件的组合让 LLM 理解力可以跨群、跨工具、跨长程任务复用。

---

## Q2: 你说 Hermes Agent 是主驾驶，那 PilotFlow 在做什么？会不会工具自己在拍板？

**核心回答**：PilotFlow 严格只做飞书结构化执行，不做意图识别。Schema 里 4 个工具的所有语义参数（title/goal/members/deliverables/deadline/risks/template/view_mode/risk_level/filter/member_filters）都要 Agent 显式传入；缺字段时工具返回 `needs_clarification` 让 Agent 自己追问；只有显式传 `allow_inferred_*=true` 才会退到旧版关键词解析路径，且该字段在 schema description 里标明 "仅供回归测试 / 旧客户端回放使用，生产 Agent 不应传 true"。

**证据**：
- `plugins/pilotflow/tools.py` 4 个工具入口的 `allow_inferred_fields` / `allow_inferred_template` / `allow_inferred_filters` / `allow_inferred_view_mode` / `allow_inferred_risk_level` 门控（默认 false）
- `_handle_generate_plan` 在字段全空时返回 `{"status": "needs_clarification", "missing": [...]}`
- LIVE_TEST_EVIDENCE.md "Agent 主驾驶硬证据" 段：mocked LLM 给定原话不传结构化字段时工具拒绝执行
- tests/test_tools.py 覆盖 needs_clarification 路径

**如果继续追问"那 _TEMPLATES / _is_briefing_query 那些函数还在文件里啊"**：是的，作为兼容旧客户端的 deprecated path 保留，不在默认路径调用。这是工程演进的过渡态，复赛后第一个 issue 是把它们搬到 `_legacy_inference.py` 加 deprecation warning。

> ⚠️ **本条回答的部分能力（view_mode / risk_level / template 改造）依赖 R-20260505-1230 P0 修复落地。如果答辩前未落地，本条改成保守版本：见下方"保守版"。**

**保守版（如果 P0 未落地）**：PilotFlow 在 4 个核心入口（generate_plan / create_project_space / query_status / send_reminder batch）严格走 Agent 显式传入路径；旧版关键词 fallback 仅在 `allow_inferred_*=true` 时启用。视图判断、模板套用、风险分级当前仍由工具内部辅助处理，下一步迭代会把这部分也改为 Agent 显式传入，让"Agent 主驾驶"在代码层 100% 落地。

---

## Q3: Hermes 跑出 401 / 模型不可用怎么办？现场你怎么排查？

**核心回答**：仓库里有 `scripts/verify_wsl_feishu_runtime.py --probe-llm`，输出脱敏的 `llm_probe_status` / `llm_probe_provider`，不打印 API key / base_url / 响应正文。一行命令就能确认 Hermes 实际加载的模型 / provider / base_url 是否可用。我们已经在 INSTALL.md 里写明：401 时优先改 `~/.hermes/.env` 和 `~/.hermes/config.yaml`，两边配置文件要一致。

**证据**：
- `scripts/verify_wsl_feishu_runtime.py:60+` `_read_runtime_config` 解析 providers 字段
- INSTALL.md 401 排查 step
- LIVE_TEST_EVIDENCE.md 顶部 e2e 段记载："2026-05-04 14:22 401 因旧模型配置未更新；20:54-20:58 切 当前模型 后端到端通过"

---

## Q4: 状态文件并发 / Hermes 重启会不会丢数据？

**核心回答**：状态写入用文件锁——Windows `msvcrt.locking` + POSIX `fcntl.flock` 双平台。锁文件是 `<state_path>.lock` 旁路文件不锁数据本身。状态 schema 加了 `schema_version=1` 字段向后兼容旧 list 格式。重启后所有项目状态、待确认计划、卡片 action ref、幂等 key 都从脱敏状态文件恢复——已经有 12 个 subprocess 并发写测试覆盖。

**证据**：
- `plugins/pilotflow/tools.py:776+` `_state_payload_file_lock` contextmanager
- `tests/test_tools.py::test_project_state_multiprocess_saves_do_not_lose_updates` 12 子进程并发
- LIVE_TEST_EVIDENCE.md "重启后..." 系列 8+ 场景

---

## Q5: 飞书 API 失败 / 网络抖动了怎么办？用户是不是要重新发起？

**核心回答**：所有卡片按钮动作都用 opaque action ref（不携带可伪造的项目名 / chat_id），单次成功消费；执行失败时原 action ref 保留，原卡片标"操作失败请重试"，用户点同一按钮可以恢复重试不需重新发起。最近 13 个 commit 专门做了 7 类 retryable 卡片失败覆盖（confirm_project / dashboard_page / batch_reminder / batch_followup / dashboard_followup / direct card action / history suggestion）。

**证据**：
- `plugins/pilotflow/tools.py` `_handle_card_action` 中 `actions_requiring_ref` 集合 + retryable 路径
- LIVE_TEST_EVIDENCE.md "卡片动作失败后可重试" 段
- 近期 commit hash：5dc4313 / efb0eb0 / f9f7ea5 / e2d6327 / 5521393 / b7e77cd / 058fd5b / da18015 / 5a78983 / dd8bcd2 / b776705

---

## Q6: 隐私 / 脱敏怎么做？真实 chat_id 会不会被写到日志？

**核心回答**：分两层：(a) 公共状态文件 `pilotflow_projects.json` 严格脱敏，不存 URL / app_token / table_id / record_id / open_id / chat_id / message_id / secret；(b) 非敏感资源链接（飞书文档 URL）单独写到私有 `pilotflow_project_refs.json`，不进 git。用户输入字段里的 `<at user_id="ou_xxx">name</at>` 通过 `_plain_at_mentions` 降级为 `@name` 纯文本，防止伪造提及污染状态。Hermes memory 默认 `PILOTFLOW_MEMORY_INCLUDE_MEMBERS=false` 不存成员姓名。

**证据**：
- `plugins/pilotflow/tools.py:942` `_plain_at_mentions`
- `plugins/pilotflow/tools.py:1290+` `_clean_recent_updates` 的 `unsafe_pattern` 过滤
- `plugins/pilotflow/tools.py:945+` `_save_project_resource_refs` 私有 refs
- LIVE_TEST_EVIDENCE.md 所有场景"隐私处理"行
- AGENTS.md 第 5 条工作流：敏感信息不写仓库 / 飞书公开文档 / 聊天记录

---

## Q7: 用户在群聊里说"删除张三"，会不会工具直接删？

**核心回答**：高风险动作必须先确认，不会直接执行。`_needs_confirmation_for_update` 函数（`tools.py:2197`）枚举了：`remove_member`（必确认）/ `update_status=已归档`（必确认）/ `add_member with unresolved member`（先问一次）。用户说"删除张三"时工具返回 `{"status": "confirmation_required", "instructions": "请先向用户确认..."}`，Agent 必须传入用户明确确认文本（如"确认执行"）才会真删。

**证据**：
- `plugins/pilotflow/tools.py:2197-2218` `_needs_confirmation_for_update`
- `plugins/pilotflow/tools.py:5450+` `if require_confirm and not _is_execution_confirmation(...): return confirmation_required`
- ARCHITECTURE.md "自治分层" 段
- tests/test_tools.py 覆盖 confirmation_required 路径

---

## Q8: 5000+ 行的 tools.py 维护得动吗？

**核心回答**：维护得动，但这是已经识别的工程债不是目标架构。README:89-93 写明"工程边界与重构计划"段：复赛前优先保持真实链路稳定 / 证据可复验 / Hermes 插件边界不漂移；复赛后第一个 issue 是按 `actions.py` / `state.py` / `feishu_client.py` 拆分执行层，每件 ≤ 1500 行。当前 91 commit 内统一动作流水管道（`_record_action_outcome`）已经把"补丁繁殖"压住了，文件增长曲线已经趋平。

**证据**：
- README.md:89-93 工程边界与重构计划
- `plugins/pilotflow/tools.py:4458` `_record_action_outcome` 统一管道（9 处复用）
- git log b36c03b..HEAD 91 commit 主要是 fix:/test: 微调

---

## Q9: 测试 300 多个，有没有 mock 偏多 / 真实链路覆盖不够？

**核心回答**：单元测试用 mock registry 是必要的（保证不依赖飞书凭证就能跑），真实链路证据由 LIVE_TEST_EVIDENCE.md 60+ 场景 + `verify_wsl_feishu_runtime.py` 5 类 verifier mode 覆盖（probe-llm / send-card / health-check / card-command-bridge / history-suggestions），全部脱敏输出。每条 verifier 输出的字段（`card_has_title=true` / `llm_probe_ok=true` 等）都在白名单内，不打印真实 ID/URL/token。

**证据**：
- `scripts/verify_wsl_feishu_runtime.py` `_sanitize_result` 白名单
- LIVE_TEST_EVIDENCE.md "完整 @Bot 端到端" + "卡片内容验证" + "重启后..." 系列

---

## Q10: 现场如果飞书权限不足 / 网络断 / Hermes 起不来怎么办？

**核心回答**：(a) 提前在测试群跑过完整 e2e（录屏作为 fallback 证据）；(b) 演示设备和评委网络隔离的话有 本地 verifier 一行命令能脱敏输出所有运行态 / 凭证 / 模型连接状态；(c) 真实产物链接（文档 / Base / 任务 / 日历）已私有汇总在飞书云文档，可现场直接打开。

---

## 准备答辩前 checklist

- [ ] R-20260505-1230 P0 修复落地（Q2 完整版才能用）
- [ ] 4 段录屏完成（Q1 + Q10 fallback）
- [ ] 真实产物链接私有汇总（Q10）
- [ ] 个人信息填全（复赛提交模板 / 飞书 wiki）
- [ ] LIVE_TEST_EVIDENCE.md "Agent 主驾驶硬证据" 段加好
- [ ] `pytest tests -q` ≥ 323 passed 当场可复现
- [ ] `verify_wsl_feishu_runtime.py --probe-llm` 一行可复现
