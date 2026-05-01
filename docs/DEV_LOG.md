# PilotFlow 开发日志归档

本文件归档了 AGENTS.md 中不再需要常驻 context 的详细开发日志。供需要了解历史细节时查阅。

## Phase 0：基础与 API 试飞（已完成）

- CLI、活动租户 profile、P0 API 试飞和本地骨架

## Phase 1：真实飞书闭环（已完成）

- dry-run/live 模式、确认机制、Doc/Base/Task/IM 写入、运行日志

## Phase 2：标准 MVP（基本完成）

已完成：风险检测、风险裁决卡 live 发送、项目入口消息 live pin、显式 owner/open_id Task assignee 映射、可选通讯录自动匹配、plan validation fallback、card callback action protocol、bounded listener、短幂等键修复、rich Base 字段实表补齐、群公告升级尝试（当前降级为 pinned entry message）。

## Phase 3：TypeScript 内核重建（已完成）

TypeScript rebuild 已完成 Day 0 到 Day 7：strict TS foundation、domain、ToolRegistry、9 个 Feishu tools、split orchestrator、OpenAI-compatible LLM client、Agent loop、session manager、Feishu gateway、`pilot:agent-smoke` dry-run smoke path、`pilot:project-init-ts` live-guarded bridge、产品化默认入口 `pilot:run`、TS 事件桥 `pilot:gateway`、Retrospective Eval、preview-only Review Worker 合同。

TS path 覆盖：validation fallback、confirmation gate、batch preflight、deterministic tool sequence、optional fallback、atomic duplicate guard + TTL cleanup、Project State rows、assignee/contact resolver、card callback bridge、lark-cli NDJSON gateway、mention gate、event dedupe、per-chat queue、card/message handlers、local pending-run continuation store、same-chat text confirmation continuation、webhook verification helpers。

2026-04-30 确认口令收敛：`确认执行` / `confirm_execute` / `execution_plan` 为主路径，`确认起飞` / `confirm_takeoff` / `flight_plan` 只作兼容保留。

## 2026-05-01 Live 验证

- `pilot:run -- --live --confirm "确认执行"` 完成真实飞书 live 验证：创建 Doc/Base/Task/执行计划卡/风险卡/固定入口/群内总结/JSONL trace
- `pilot:callback-proof -- --send-probe-card` 支持主动发送探针卡并监听回调
- `pilot:gateway` 支持 `--timeout` 和 `--send-probe-message`
- `pilot:live-check` 增加严格就绪门禁和权限缺口诊断
- 开放平台改为长连接后，IM 事件和卡片回调探针均已收到真实响应
- 修复 duplicate guard 路径错误、gateway 卡片动作过滤、scope 口径校正

## 当前缺口

- 卡片回调驱动 pending run 续跑还需验证
- 自动 IM 触发（`@PilotFlow` mention）未完成
- 持久记忆、worker approval cards、多 worker 编排、部署和审计未完成
- 录屏和截图证据未完成
