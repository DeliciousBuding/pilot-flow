# 03 - Hermes-Agent Study

> Local reference repository: `D:\Code\Projects\hermes-agent`
> Verified snapshot: `21e695fcb6e379018687db7445a578aba981f67d`
> Commit title: `fix: clean up defensive shims and finish CI stabilization from #17660 (#17801)`
> Verification command: `git rev-parse HEAD` and per-file `Measure-Object -Line`

This document records what PilotFlow should learn from Hermes. It is a design reference, not a claim that PilotFlow should copy Hermes' entire codebase.

## Hermes 概览

| 维度 | 数据 |
|------|------|
| 仓库 | `github.com/nousresearch/hermes-agent` |
| 本地快照 | `21e695fcb6e379018687db7445a578aba981f67d` |
| 定位 | 通用多平台 Agent 框架 |
| PilotFlow 结论 | 借鉴 Agent runtime 模式，不复制产品范围 |

Verified local reference files:

| Hermes file | Local line count | Why it matters to PilotFlow |
| --- | ---: | --- |
| `agent/error_classifier.py` | 876 | LLM/API/lark-cli error taxonomy and recovery hints |
| `tools/registry.py` | 465 | Tool registration and availability surface |
| `gateway/platforms/feishu.py` | 4126 | Feishu identity, mention gating, callback routing, dedupe, per-chat queue |
| `tests/conftest.py` | 495 | Hermetic test environment |
| `agent/context_compressor.py` | 1228 | Future context/output compression |
| `agent/credential_pool.py` | 1424 | Later provider/key rotation, not part of first rebuild |

## Hermes 核心架构

### Agent 循环（Hermes run-agent pattern）

```
run_conversation(user_message):
  → Build system prompt（7 层：identity→help→tools→memory→skills→context→env）
  → Preflight compression（history > 75% context window 时触发）
  → WHILE iterations < max AND budget > 0:
      → [THINK] Build api_messages, inject context, call LLM（retry+backoff）
      → [OBSERVE] Track tokens, cost, update context engine
      → [DECIDE] Has tool_calls?
          → YES: execute tools（parallel/sequential），continue
          → NO: return final response
  → Persist session, save trajectory
```

关键设计：
- **稳定 system prompt 前缀** — 缓存 per session，压缩后才重建
- **自适应压缩** — API 返回的真实 token 计数驱动决策
- **模型特定行为** — tool-use enforcement 按模型家族调整
- **截断恢复** — `finish_reason == "length"` 时自动续写或重试
- **中断处理** — 线程级中断信号，循环顶部和退避期间检查

### LLM 提供者抽象（两层）

**Transport 层**（`agent/transports/base.py`）：
```python
class ProviderTransport(ABC):
    api_mode: str              # "anthropic_messages" | "chat_completions" | ...
    convert_messages(messages)  # OpenAI format → provider native
    convert_tools(tools)        # OpenAI tools → provider native
    build_kwargs(...)           # 组装完整 API 调用参数
    normalize_response(resp)    # Provider response → NormalizedResponse
```

4 个具体 transport：
- `AnthropicTransport` — thinking/adaptive thinking、cache_control、OAuth
- `ChatCompletionsTransport` — 16+ OpenAI 兼容提供者
- `BedrockTransport` — AWS Bedrock Converse API
- `ResponsesApiTransport` — Codex/xAI/GitHub

**Shared types**（`agent/transports/types.py`）：
```python
@dataclass
class NormalizedResponse:
    content: str
    tool_calls: List[ToolCall]
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter"
    reasoning: str
    usage: Usage
    provider_data: dict  # 协议特定状态
```

### Credential Pool（`agent/credential_pool.py`）

- **4 种选择策略**：fill_first（优先级排序）、round_robin、random、least_used
- **429/402 自动切换**：`mark_exhausted_and_rotate()` 标记当前凭证耗尽，选下一个
- **冷却期**：1 小时默认，或 provider 返回的 `reset_at`
- **OAuth 跨进程同步**：读取 `~/.claude/.credentials.json`
- **软租约**：`acquire_lease/release_lease` 支持并发请求

### 错误分类（`agent/error_classifier.py`）

Local snapshot line count: 876. The important part is not the exact line count; it is the centralized taxonomy and recovery-hint shape.

```
classify_api_error(exception) → ClassifiedError:
  1. Provider 特定模式（Anthropic thinking 签名、tier gate）
  2. HTTP 状态码（401→auth, 402→billing vs rate_limit, 429→rotate+fallback）
  3. 结构化错误码（resource_exhausted, insufficient_quota）
  4. 消息模式匹配（12+ 类别）
  5. SSL/TLS 瞬态 → timeout（不是 context_overflow）
  6. 服务器断连 + 大会话 → context_overflow
  7. 传输/超时启发式
  8. Fallback: unknown（retryable）
```

`ClassifiedError` 携带恢复提示：
- `retryable` — 可重试？
- `should_rotate_credential` — 切换凭证？
- `should_fallback` — 切换 provider？
- `should_compress` — 压缩上下文？

**402 真假区分**：检查 "try again"、"resets at" 等信号区分瞬时限流 vs 真实配额耗尽。

### 工具注册表（`tools/registry.py` + 相关调用层）

- **函数式自注册**：每个工具文件在模块导入时调用 registry register。
- **可用性检查**：registry 层提供工具存在性、schema 导出、dispatch 和错误路径。
- **Tool→LLM 翻译**：registry 输出 provider 可接受的 function schema；PilotFlow 需要把内部 `doc.create` 映射为 LLM-safe `doc_create`。
- **分发边界**：PilotFlow registry 只做注册、preflight、dispatch、recording；不要把插件发现、MCP 生命周期、pre/post hook 编排都塞进同一个文件。
- **不直接移植的层**：Hermes 的插件发现、MCP 覆盖/注销、外部工具生命周期属于更大平台范围；可作为未来参考，不进入第一版 registry。

### 技能系统

**Skills 是 prompt 文档，不是可执行代码**（但可含内联 shell 命令）：
- `skills/` 目录下的 `SKILL.md` 文件，含 YAML frontmatter
- 系统 prompt 注入 compact skill index（token-efficient）
- 模型按需调用 `skill_view(name)` 加载完整内容
- 可按平台过滤、条件激活
- `/skill-name` 斜杠命令触发

### 上下文压缩（`agent/context_compressor.py`）

5 个策略：
1. **工具输出裁剪**（无 LLM 调用）— 旧结果替换为一行摘要
2. **Token 预算尾部保护** — 向后累积 token 直到预算
3. **LLM 结构化摘要** — Active Task, Goal, Constraints, Completed Actions...
4. **迭代摘要更新** — 再压缩时更新而非重建
5. **主题引导压缩** — `/compress <topic>` 优先保留特定信息

**反抖动**：连续 2 次压缩各节省 <10% 则停止。

**边界保护**：头部 3 条消息（system + first exchange）+ 尾部（token 预算）永不压缩。最后一条用户消息保证在尾部。

### 记忆系统

**两个独立系统**：
- **Memory Provider** — 跨会话持久化（facts, preferences）：内置 MEMORY.md/USER.md + 可插拔外部 provider（Honcho/Mem0）
- **Context Compression** — 会话内 token 管理（摘要中间轮次）

**Provider 生命周期**：`initialize → prefetch → sync_turn → on_session_end → shutdown`
**上下文围栏**：记忆用 `<memory-context>` 标签包裹，输出 scrubber 防泄漏

### 飞书适配器（`gateway/platforms/feishu.py`，local snapshot 4126 行）

**生产级实现**：
- **双模式传输**：WebSocket（lark_oapi SDK）+ Webhook（aiohttp + SHA-256 签名验证）
- **9 种事件**：消息、已读、表情、卡片、群成员、DM 进入、撤回、文档评论
- **消息类型**：text、post（富文本含图片/代码/链接）、image、file、audio、media、merge_forward
- **卡片交互**：审批按钮 → 同步返回更新卡片；通用按钮 → 合成 COMMAND 事件
- **文档评论 agent**：独立 pipeline，per-doc 会话缓存（50 消息，1h TTL）
- **文本批处理**：0.6s 去抖，2.0s 接近 4096 字符分割点，最大 8 消息
- **媒体批处理**：0.8s 延迟合并多文件
- **去重**：LRU 2048 条 message_id，24h TTL，跨重启持久化
- **Per-chat 序列化**：`asyncio.Lock` per chat_id
- **群访问控制**：open/allowlist/blacklist/admin_only/disabled
- **Bot 身份发现**：`/bot/v3/info` 探测 bot_open_id
- **处理状态**：开始 → Typing 表情，完成 → 移除，失败 → CrossMark 表情
- **QR 上线向导**：扫码创建 bot 应用

**不可直接复用**：耦合 `BasePlatformAdapter`、`gateway.session`、`tools.approval`
**可提取的**：SDK 调用模式、消息解析、卡片回调、去重、批处理

### 网关会话管理（`gateway/session.py`）

- **Session Key**：`agent:main:{platform}:{chat_type}:{chat_id}:{participant_id?}`
- **LRU Agent 缓存**：128 上限，1h 空闲 TTL，配置变更自动失效
- **Sentinel 并发守卫**：`_AGENT_PENDING_SENTINEL` 防异步间隙竞态
- **Per-chat 序列化**：`asyncio.Lock` per chat_id
- **三级恢复**：suspended（硬重置）> resume_pending（保留记录）> 正常（策略淘汰）
- **双持久化**：sessions.json + SQLite，prefer-longer 合并迁移安全

### 测试模式

- **Hermetic fixtures**：100+ credential 环境变量清除、隔离 HOME、固定 TZ/LANG
- **模块单例重置**：每个测试间清除 ContextVars、审批状态、中断标志
- **30 秒超时**：SIGALRM 杀死挂起测试
- **线程安全测试**：`threading.Barrier` 并发验证

## 要移植的模式（~270 行）

| 模式 | 来源 | 行数 | 说明 |
|------|------|------|------|
| 错误分类+恢复提示 | `error_classifier.py` | ~100 | HTTP 状态码→FailoverReason→4 个 boolean hint |
| 工具注册表 | `tools/registry.py` | ~60 | register(name, schema, handler) + OpenAI schema |
| Agent 循环 | Hermes run-agent tests and loop pattern | ~40 | while-next: LLM→tool_calls→execute→loop |
| 抖动退避 | `retry_utils.py` | ~30 | `min(base * 2^attempt, max) + random * jitter` |
| 工具输出裁剪 | `context_compressor.py` Phase 1 | ~40 | 旧结果→一行摘要 |
| Feishu gateway | `gateway/platforms/feishu.py` | targeted | mention gate, card callback routing, dedupe, per-chat serial processing |
| Hermetic tests | `tests/conftest.py` | targeted | secret-env scrubbing and isolated runtime |

## 不移植的

| 模式 | 原因 |
|------|------|
| SQLite session DB | JSONL 够用 |
| Full external memory provider | First use bounded local/project memory; external providers are unnecessary for MVP |
| Full LLM context-compressor pipeline | Start with tool-output summarization and project-session compaction |
| Multi-platform gateway | 只有飞书 |
| Skills marketplace | 3-5 个固定 skill |
| Plugin 系统 | 工具集固定且小 |
| Credential pool 轮转 | 第一版 defer；先保留单 provider env，后续再做 key pool / model routing |
| TUI / Ink | Feishu cards 是 UI |
| Unbounded subagent delegation | Replace with typed manager-worker orchestration and human approval before publishing |

## Self-Evolution Takeaway

Hermes is valuable because it treats an Agent as a durable runtime: every turn has session state, tool contracts, error classes, retry policy, compression policy, and test isolation. PilotFlow should translate that into a product-visible evolution loop:

```text
Flight Recorder -> Evaluation -> Improvement proposal -> Human approval -> Updated workflow/template/test
```

This is different from hidden self-modifying code. PilotFlow can propose a better prompt, workflow template, eval case, Feishu card, or tool behavior, but it should cite the run trace that motivated the change and wait for human approval before the change becomes default.

## Worker Orchestration Takeaway

The earlier decision to avoid subagents still applies to the first live demo, but it should not block the product direction. The right adaptation is a manager-worker model:

- PilotFlow remains the accountable manager in the Feishu group.
- Workers are typed executors for documents, Base/data, research, scripts, and review.
- Workers return previews and proposed writes, not direct Feishu side effects.
- Confirmation gate remains the only path to publish worker artifacts.
- Flight Recorder records worker requests, results, risks, and approvals.

The detailed PilotFlow-specific plan lives in [`../AGENT_EVOLUTION.md`](../AGENT_EVOLUTION.md).

## 关键技术细节

### Hermes 的 prompt 缓存策略
Anthropic `system_and_3`：4 个 `cache_control: {type: "ephemeral"}` 断点（system prompt + 末尾 3 条非 system 消息）。多轮对话输入 token 成本降 ~75%。

### Hermes 的 Prompt 构建（7 层）
1. Identity — SOUL.md 或 DEFAULT_IDENTITY
2. Platform hint — 每平台格式指南
3. Environment hints — WSL/Docker 检测
4. Skills index — compact manifest
5. Context files — `.hermes.md > AGENTS.md > CLAUDE.md`（优先级链）
6. Memory guidance
7. Tool-use enforcement（模型特定）

### Hermes 的 Agent Loop 停止条件
- 无 tool_calls = 最终响应 → break
- 中断信号 → break
- 迭代预算耗尽 → break
- max_iterations 达到 → break
- `finish_reason == "length"` → 截断恢复（最多 3 次续写重试）
