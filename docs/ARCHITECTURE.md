# 架构设计

## 系统架构

```
┌─────────────────────────────────────────┐
│           Hermes Agent 运行时            │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ LLM      │  │ 飞书网关   │  │ 工具   │ │
│  │ 调度     │  │ Gateway  │  │ 注册表  │ │
│  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │              │            │      │
│       └──────────────┴────────────┘      │
│                      │                   │
│           ┌──────────┴──────────┐        │
│           │   PilotFlow 插件     │        │
│           │                     │        │
│           │  ┌───────────────┐  │        │
│           │  │ 项目管理工作流  │  │        │
│           │  └───────┬───────┘  │        │
│           │          │          │        │
│           │  ┌───────┴───────┐  │        │
│           │  │ lark_oapi     │  │        │
│           │  │ 飞书 API 工具  │  │        │
│           │  └───────────────┘  │        │
│           └─────────────────────┘        │
└─────────────────────────────────────────┘
```

## 组件说明

### Hermes 运行时（底座）

| 组件 | 职责 |
| --- | --- |
| LLM 调度 | 调用 Hermes 配置的 OpenAI-compatible 模型，解析用户意图，选择工具 |
| 飞书网关 | WebSocket 连接、@mention 解析、消息收发 |
| 工具注册表 | 插件注册工具、工具发现、handler 调度 |
| 显示配置 | 通过 `display.platforms.feishu.tool_progress=off` 避免群聊暴露内部工具进度 |

### PilotFlow 插件

| 组件 | 职责 |
| --- | --- |
| 项目管理工作流 | 意图提取 → 计划生成 → 确认门控 → 执行 → 总结 |
| lark_oapi 飞书工具 | 直连飞书 API，提供文档、任务、消息、@mention 工具 |
| 自治决策层 | 按会话作用域、动作风险、联系人状态决定自动执行 / 先问一次 / 必须确认 |

## 工具列表

| 工具 | 说明 | 输出 |
| --- | --- | --- |
| `pilotflow_generate_plan` | 从自然语言提取项目信息 | 结构化项目计划 + 确认门控指令 |
| `pilotflow_detect_risks` | 检测计划中的潜在风险 | 风险列表 + 建议 |
| `pilotflow_create_project_space` | 一键创建全套项目产物 | 文档 + 表格 + 任务 + 群消息 + 日历 |
| `pilotflow_handle_card_action` | 处理确认卡片按钮 | 从 pending plan 恢复参数并确认/取消 |
| `pilotflow_query_status` | 查询项目状态，发送看板卡片 | 项目看板卡片 |
| `pilotflow_update_project` | 更新项目状态 | 内存注册表 + 多维表格记录 + 群通知 |

## 工具调用流程

### 创建项目

```
用户 @PilotFlow → 飞书网关收到消息
  → LLM 理解意图，调用 pilotflow_generate_plan
  → 插件发送确认卡片，保存 pending plan，打开 chat_id 级确认门控
  → 用户文字确认，或点击卡片按钮进入插件 `/card` 桥接，再触发 pilotflow_handle_card_action
  → 确认后调用 pilotflow_create_project_space
    → lark_oapi: 创建飞书文档（格式化 + @mention + 自动开权限）
    → lark_oapi: 创建多维表格（项目状态台账 + 记录 + 权限）
    → lark_oapi: 创建飞书任务
    → lark_oapi: 发送项目入口互动卡片到群（@成员 + 链接）
    → lark_oapi: 创建日历事件（截止时间提醒）
    → Hermes: best-effort 写入 memory，调度 cron 截止提醒
```

### 多轮管理

```
用户: "项目进展如何？" → LLM 调用 pilotflow_query_status → 发送看板卡片
用户: "把截止时间改成5月10日" → LLM 调用 pilotflow_update_project → 发送更新通知
用户: "把张三加到项目" → LLM 调用 pilotflow_update_project → @提及新成员
```

### 自治分层

- 群聊默认保守：先展示计划，再确认执行。
- 私聊默认主动：非敏感、可回滚、已在项目上下文内的动作可以直接做。
- 首次外联先问一次：新联系人、未解析成员、或不在当前项目上下文中的人。
- 高风险必须确认：删成员、撤权限、公开发布、对外发送、撤销已有内容。

## 依赖关系

```
PilotFlow 插件
  ├── lark-oapi SDK（飞书 API Python SDK）
  ├── Hermes 工具注册表（tools/registry）
  └── 环境变量（~/.hermes/.env）
```

PilotFlow 通过 lark_oapi SDK 直连飞书 API，无中间层：
- 文档创建：`client.docx.v1.document.create`
- 任务创建：`client.task.v2.task.create`
- 文本消息：`registry.dispatch("send_message")`
- 互动卡片：`client.im.v1.message.create(..., msg_type="interactive")`
- 卡片状态更新：`client.im.v1.message.patch(..., content=card_json)`
- 群成员查询：`client.im.v1.chat_members.get`
- 权限设置：`client.drive.v1.permission_public.patch`

Hermes 深度融合点：
- 文本消息：复用 Hermes `send_message`
- 项目模式沉淀：创建成功后写入 Hermes `memory`
- 截止提醒：创建成功后 best-effort 调度 Hermes `cronjob`，失败不阻断项目创建
- 卡片按钮：PilotFlow 注册插件级 `/card` 命令，接收 Hermes 的 `/card button {...}` 合成命令后直接执行 `pilotflow_handle_card_action`
- 卡片反馈：确认卡片发送后记录 Feishu `message_id`，按钮点击时把原卡片更新为“处理中/已创建/已取消”
- 运行边界：不修改 Hermes 源码；安装脚本只复制插件/skill 并检查用户级 Hermes 配置
