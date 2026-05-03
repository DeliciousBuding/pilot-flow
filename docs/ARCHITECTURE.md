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
| LLM 调度 | 调用 gpt-5.5，解析用户意图，选择工具 |
| 飞书网关 | WebSocket 连接、@mention 解析、消息收发 |
| 工具注册表 | 插件注册工具、工具发现、handler 调度 |

### PilotFlow 插件

| 组件 | 职责 |
| --- | --- |
| 项目管理工作流 | 意图提取 → 计划生成 → 确认门控 → 执行 → 总结 |
| lark_oapi 飞书工具 | 直连飞书 API，提供文档、任务、消息、@mention 工具 |

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
  → 用户文字确认，或点击卡片按钮触发 pilotflow_handle_card_action
  → 确认后调用 pilotflow_create_project_space
    → lark_oapi: 创建飞书文档（格式化 + @mention + 自动开权限）
    → lark_oapi: 创建多维表格（项目状态台账 + 记录 + 权限）
    → lark_oapi: 创建飞书任务
    → Hermes: 发送项目入口消息到群（@成员 + 链接）
    → lark_oapi: 创建日历事件（截止时间提醒）
    → Hermes: 写入 memory，调度 cron 截止提醒
```

### 多轮管理

```
用户: "项目进展如何？" → LLM 调用 pilotflow_query_status → 发送看板卡片
用户: "把截止时间改成5月10日" → LLM 调用 pilotflow_update_project → 发送更新通知
用户: "把张三加到项目" → LLM 调用 pilotflow_update_project → @提及新成员
```

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
- 消息发送：`registry.dispatch("send_message")`
- 群成员查询：`client.im.v1.chat_members.get`
- 权限设置：`client.drive.v1.permission_public.patch`

Hermes 深度融合点：
- 消息发送：复用 Hermes `send_message`
- 项目模式沉淀：创建成功后写入 Hermes `memory`
- 截止提醒：创建成功后调度 Hermes `cronjob`
- 卡片按钮：依赖 Hermes 将飞书 card action 转成 `/card button {...}` 合成命令，再由 `pilotflow_handle_card_action` 执行
