# 04 - Target Architecture

## 设计原则

1. **类型驱动** — 先定义接口，再写实现。接口是契约。
2. **Agent 主链路** — Feishu gateway -> session -> Agent loop -> tool registry -> Feishu tools。
3. **依赖方向正确** — gateway/interfaces -> agent/orchestrator -> domain/tools -> infrastructure -> shared。
4. **每个文件一个职责** — 单一职责，200 行上限。
5. **无循环依赖** — 编译期强制。
6. **安全默认** — 默认 dry-run，live 需显式确认。

## 目录结构

```
pilot-flow/
├── src/
│   ├── types/                          ← 类型定义（零依赖，被所有模块引用）
│   │   ├── plan.ts                     ← ProjectInitPlan, PlanStep, PlanRisk, PlanConfirmation
│   │   ├── artifact.ts                 ← Artifact, ArtifactType
│   │   ├── recorder.ts                 ← RecorderEvent, RunState, Recorder interface
│   │   ├── tool.ts                     ← ToolDefinition, ToolResult, ToolHandler, ToolContext
│   │   ├── session.ts                  ← Session, SessionConfig
│   │   ├── feishu.ts                   ← FeishuTarget, CardAction, ChatInfo, MessagePayload
│   │   ├── config.ts                   ← RuntimeConfig, FeishuTargets
│   │   └── common.ts                   ← Result<T,E>, Pagination, Timestamp
│   │
│   ├── shared/                         ← 纯函数工具（零内部依赖）
│   │   ├── parse-args.ts               ← parseArgs() 统一实现，替代 11 处重复
│   │   ├── markdown.ts                 ← markdownBlock, divider, escapeHtml, formatArtifactTarget
│   │   ├── path-utils.ts               ← getPath, resolveExecutable
│   │   ├── array-utils.ts              ← unique, chunk, firstBy
│   │   ├── errors.ts                   ← PilotFlowError + typed subclasses
│   │   └── id.ts                       ← generateRunId, buildDedupeKey, buildIdempotencyKey
│   │
│   ├── safety/                         ← 安全层（零业务依赖）
│   │   ├── preflight.ts                ← live 前置检查：targets 完整性、auth 状态
│   │   ├── write-guard.ts              ← 敏感路径写入拒绝列表（hermes file_safety 模式）
│   │   └── redact.ts                   ← 参数脱敏：--content, --text, --base-token
│   │
│   ├── infrastructure/                 ← 基础设施（只依赖 types + shared）
│   │   ├── command-runner.ts           ← lark-cli 子进程执行（加超时！）
│   │   ├── jsonl-recorder.ts           ← JSONL 事件记录（JSON.stringify 安全）
│   │   └── flight-recorder.ts          ← 飞行记录器模型构建
│   │
│   ├── config/                         ← 配置加载（只依赖 types）
│   │   └── runtime-config.ts           ← 环境变量加载 + 验证 + 默认值
│   │
│   ├── llm/                            ← LLM 提供者（新增，只依赖 types + shared）
│   │   ├── client.ts                   ← OpenAI 兼容 fetch 封装（~80 行）
│   │   ├── error-classifier.ts         ← hermes 模式移植（~100 行）
│   │   └── retry.ts                    ← 抖动指数退避（~30 行）
│   │
│   ├── tools/                          ← 工具注册表（依赖 types + shared + infrastructure）
│   │   ├── registry.ts                 ← register/execute/getDefinitions
│   │   ├── idempotency.ts              ← 幂等键管理
│   │   └── feishu/                     ← 飞书工具（每个独立文件）
│   │       ├── doc-create.ts
│   │       ├── base-write.ts
│   │       ├── task-create.ts
│   │       ├── im-send.ts
│   │       ├── entry-send.ts
│   │       ├── entry-pin.ts
│   │       ├── card-send.ts
│   │       ├── announcement-update.ts
│   │       └── contact-search.ts
│   │
│   ├── domain/                         ← 业务逻辑（依赖 types + shared，不依赖 infrastructure）
│   │   ├── plan.ts                     ← Plan 构建 + 验证 + fallback
│   │   ├── risk.ts                     ← 风险检测 + 决策构建
│   │   ├── project-brief.ts            ← 项目简报 markdown 构建
│   │   └── task-description.ts         ← 任务描述构建
│   │
│   ├── orchestrator/                   ← 编排器（依赖 domain + tools + infrastructure）
│   │   ├── orchestrator.ts             ← 主编排器（~80 行，只做调度）
│   │   ├── confirmation-gate.ts        ← 确认门控：卡片发送 + 等待回调
│   │   ├── tool-sequence.ts            ← 确定性工具序列定义
│   │   ├── duplicate-guard.ts          ← 去重守卫（修复竞态 + 崩溃 TTL）
│   │   ├── entry-message.ts            ← 入口消息构建
│   │   ├── flight-plan-card.ts         ← 执行计划卡片模板
│   │   ├── risk-decision-card.ts       ← 风险决策卡片模板
│   │   ├── summary-builder.ts          ← 交付摘要构建
│   │   ├── project-state.ts            ← 项目状态行构建
│   │   ├── contact-resolver.ts         ← 联系人解析
│   │   ├── assignee-resolver.ts        ← 任务分配解析
│   │   └── card-callback.ts            ← 卡片回调处理
│   │
│   ├── agent/                          ← Agent 循环（新增，依赖 llm + tools + orchestrator）
│   │   ├── loop.ts                     ← while-next 核心循环（~40 行）
│   │   └── session-manager.ts          ← chat_id→Session Map + TTL
│   │
│   ├── gateway/                        ← 产品事件入口（Feishu-native）
│   │   └── feishu/
│   │       ├── event-source.ts         ← 事件来源接口：lark-cli WebSocket / webhook
│   │       ├── lark-cli-source.ts      ← 近期默认：封装 lark-cli event +subscribe NDJSON
│   │       ├── webhook-server.ts       ← 后续可选：Node 内置 http 事件接收
│   │       ├── message-handler.ts      ← IM 消息处理
│   │       ├── card-handler.ts         ← 卡片回调处理
│   │       ├── mention-gate.ts         ← @mention / DM 过滤
│   │       ├── dedupe.ts               ← message/card event 去重
│   │       └── chat-queue.ts           ← per-chat serial queue
│   │
│   ├── interfaces/                     ← 人类操作入口和本地辅助入口
│   │   └── cli/                        ← CLI 入口
│   │       ├── cli-trigger.ts          ← CLI 手动触发（改名自 manual-trigger）
│   │       ├── card-listener.ts        ← 卡片事件监听
│   │       ├── pilot-cli.ts            ← CLI 主入口
│   │       ├── doctor.ts               ← 健康检查
│   │       ├── flight-recorder-view.ts ← 记录查看器
│   │       └── setup-feishu-targets.ts ← 飞书目标配置向导
│   │
│   └── review-packs/                   ← 评审材料（独立，依赖 infrastructure + domain）
│       ├── pack-utils.ts               ← 共享工具（parseArgs, escapeCell, readJsonl）
│       ├── demo-evidence.ts
│       ├── demo-eval.ts
│       └── ...（共 11 个）
│
├── tests/                              ← 测试（独立目录）
│   ├── helpers/
│   │   ├── memory-recorder.ts          ← 测试用内存 recorder
│   │   └── mock-registry.ts            ← 测试用工具注册表
│   ├── shared/
│   ├── domain/
│   ├── orchestrator/
│   ├── tools/
│   ├── infrastructure/
│   └── llm/
│
├── dist/                               ← 编译输出（.gitignore）
├── tmp/                                ← 运行产物（.gitignore）
├── tsconfig.json
├── package.json
├── .gitignore
├── .env.example
└── scripts/
    └── build.ts
```

## 依赖方向图

```
gateway/ ───────┐
interfaces/ ────┤
                  │
agent/ ──────────┤
                  ▼
orchestrator/ ──→ domain/ ──→ types/
     │              │           ▲
     ▼              ▼           │
   tools/ ───→ infrastructure/ ─┘
     │              │
     ▼              ▼
  shared/ ←──── safety/
                  │
                  ▼
               config/
```

**规则**：
- 箭头方向 = 允许的 import 方向
- 反方向 import = 编译错误
- `types/` 被所有模块引用，但不引用任何模块
- `shared/` 被所有模块引用，但不引用任何模块
- `gateway/` 是产品事件入口，负责把 Feishu 事件转成 session turns
- `interfaces/` 是叶子，只被 `package.json` scripts 引用
- Gateway first implementation should prefer `lark-cli event +subscribe` because the project already uses this path locally. `webhook-server.ts` is an optional transport once public callback delivery, signature verification, and encryption posture are verified.

## 模块职责边界

| 模块 | 职责 | 不做什么 |
|------|------|---------|
| `types/` | 定义接口和类型 | 不含逻辑、不含实现 |
| `shared/` | 纯函数工具 | 不含副作用、不含 I/O |
| `safety/` | 安全检查和防护 | 不含业务逻辑 |
| `infrastructure/` | 外部 I/O（文件、子进程） | 不含业务决策 |
| `config/` | 环境变量加载和验证 | 不含运行逻辑 |
| `llm/` | LLM API 调用 | 不含飞书逻辑 |
| `tools/` | 工具注册和执行 | 不含编排逻辑 |
| `domain/` | 业务规则和数据构建 | 不含 I/O、不含工具调用 |
| `orchestrator/` | 调度和协调 | 不含工具实现细节 |
| `agent/` | Agent 循环和会话管理 | 不含工具注册 |
| `gateway/` | Feishu IM/card/webhook 事件入口 | 不含业务决策和工具实现 |
| `interfaces/cli/` | CLI、doctor、recorder、setup 等本地入口 | 不含业务逻辑 |
| `review-packs/` | 评审材料生成 | 不含产品逻辑 |

## Breaking Rename Policy

The rebuild accepts one breaking migration, but it must not leave two competing public surfaces.

- Product event handling moves into `src/gateway/feishu/`.
- Human-operated commands stay under `src/interfaces/cli/`.
- Do not introduce an additional generic entry directory; keep the split as `gateway/` for product events and `interfaces/cli/` for human-operated commands.
- If any public path or command is renamed, update `README.md`, `docs/`, `package.json`, workspace `AGENTS.md`, and progress records in the same commit series.
