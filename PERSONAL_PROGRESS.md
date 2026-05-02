# 个人进度 — PilotFlow

## 项目定位

PilotFlow 是飞书群聊中的 AI 项目运行官。用户在群里 @PilotFlow 说一句需求，LLM 自动理解意图，调用飞书 API 创建真实文档、任务和项目入口消息。

**技术栈**：Hermes Agent（Python）+ lark_oapi SDK + gpt-5.5

## 开发历程

### 第一阶段：原型验证（4月）

最初用 TypeScript 自建 Agent，实现了确定性计划解析和飞书工具调用。通过飞书群实测发现核心问题：
- 没有 LLM 接入，本质是脚本而非 AI
- 确认门控未生效，消息一次性全部发出
- 中英文混杂，产品化程度不足

**关键决策**：放弃自建 Agent，转向 Hermes Agent 运行时。

### 第二阶段：架构重构（5月初）

将项目从 TypeScript 自建 Agent 重构为 Hermes Python 插件：
- 研究 Hermes 源码，理解插件注册、工具调度、飞书网关机制
- 用 `ctx.register_tool()` 注册 4 个 PilotFlow 工具
- 配置 Hermes gateway 连接飞书 WebSocket
- 配置 gpt-5.5 作为 LLM（通过 vectorcontrol API）

### 第三阶段：插件完善（5月2日）

从 lark-cli 子进程调用迁移到 lark_oapi SDK 直连：
- 修复工具 handler 签名（`**kwargs` 兼容 Hermes 注入的 `task_id`）
- 新增 @mention 支持（解析群成员列表，文档内 mention_user 元素）
- 文档格式化写入（markdown → 飞书 block_type：标题、列表、分隔线）
- 创建文档后自动开放链接访问权限
- 排查 gateway 消息接收问题（FEISHU_GROUP_POLICY=open）

### 第四阶段：端到端验证

完整链路跑通：
```
飞书群 @PilotFlow → Hermes gateway 收消息 → LLM 理解意图
→ 调用 pilotflow_create_project_space → 创建飞书文档 + 多维表格 + 任务 + 群消息
→ bot 回复用户，~30秒完成

多轮管理：
飞书群 @PilotFlow → "把答辩项目的截止时间改成5月10日"
→ LLM 调用 pilotflow_update_project → 发送更新通知
```

### 第五阶段：质量加固（v0.9）

代码质量全面审计和修复：
- 确认门控从全局布尔值改为按 chat_id 隔离，支持多群并发
- 成员缓存增加定期过期清理，防止内存泄漏
- 任务创建移除静默重试，返回明确成功/失败状态
- 日历事件创建结果透明化，成功时计入产物列表
- SKILL.md/DESCRIPTION.md 职责分离（完整 vs 发现提示）
- 修复工具数量声明（7→6，与实际注册一致）
- 新增 AGENTS.md 供 Claude Code agent 使用
- plugin.yaml 版本同步至 0.9.0

### 第六阶段：深度审计修复（v0.9.1）

基于 Hermes 源码和飞书 SDK 源码的三方审计，修复所有确认的 bug：

**Hermes 集成修复：**
- `get_session_env()` 调用签名修正（原来缺参数，永远走 env fallback）
- `_hermes_send` 成功检测逻辑重写（registry 返回 `{"error": ...}` 表示失败）
- lark_oapi client 增加 10 秒超时，防止 gateway 线程阻塞
- `_check_available` 结果缓存，避免重复 import

**线程安全修复：**
- `_member_cache` 加独立锁 `_member_cache_lock`
- `_evict_caches` 中变量作用域修复（`expired_plans` 初始化）

**错误处理增强：**
- `_add_editors` 每个成员的 permission create 检查响应并记录失败
- `_create_bitable` 字段创建检查响应
- `_add_editors` 成员数上限 20，防止无界 API 调用
- `_resolve_member` 增加 `resp.data` 空值检查
- `_hermes_send` 增加类型安全（`isinstance(result, str)`）

**SDK 修复：**
- 分隔线 Divider 使用正确的 `DocDivider.builder().build()` 而非 `{}`
- 日历事件增加 `calendar_id("primary")` 参数

**数据修复：**
- 多维表格中负责人字段使用纯文本，不再混入 `@mention` XML 标记
- 新增 `_member_names_plain()` 辅助函数

**产品修复：**
- 工具描述全面加强（写明参数格式、前置条件、LLM 行为指引）
- 移除确认卡片中无回调处理的按钮（防止用户点击无响应）
- SKILL.md 移除冗余的 send_summary 步骤
- INSTALL.md 补全缺失的飞书权限（bitable/drive/calendar）
- INSTALL.md 修复验证命令（加 sys.path）
- INSTALL.md 统一模型名为 gpt-5.5

### 第七阶段：功能真实性修复（v0.9.2-v0.9.3）

竞赛评审审计发现的核心问题：功能声称与实现不符。

**v0.9.2 — 文档一致性修复：**
- ARCHITECTURE.md 补全 6 个工具 + 多轮管理流程
- README_EN.md 模型名统一为 gpt-5.5
- PRODUCT_SPEC.md 移除已删除的互动按钮描述
- INNOVATION.md 重新分类功能状态
- query_status 新增内存项目注册表（解决 tenant token 无法查询任务的问题）
- 日历事件使用 UTC+8 时区

**v0.9.3 — update_project 从通知变为真实更新：**
- `_handle_update_project` 重写：更新内存注册表 + 更新多维表格记录 + 发送通知
- `_create_bitable` 返回 app_token/table_id/record_id 元数据，支持后续更新
- `_update_bitable_record` 新函数：调用 `app_table_record.update` API
- 模糊匹配项目名称（子串匹配）
- 日历事件修复为 9:00 AM 开始、1 小时时长（原来零时长）
- 新增 15 个单元测试（模板检测、成员格式化、注册表、确认门控、缓存驱逐）

## 已验证能力

| 能力 | 状态 | 技术实现 |
| --- | --- | --- |
| 飞书文档创建 | ✅ | lark_oapi docx API，markdown 格式化 |
| 文档权限自动开放 | ✅ | drive permission_public.patch |
| 飞书任务创建 | ✅ | lark_oapi task v2 API |
| 群消息发送 | ✅ | lark_oapi im message create |
| @mention（群消息） | ✅ | 解析群成员 open_id，<at> 标签 |
| @mention（文档内） | ✅ | docx mention_user 元素 |
| 权限自管理 | ✅ | 链接可查看 + 群成员自动加编辑权限 |
| 多维表格自建 | ✅ | 自动创建表格、字段、记录、权限 |
| LLM 意图理解 | ✅ | gpt-5.5 + pilotflow skill |
| 端到端群聊触发 | ✅ | Hermes gateway WebSocket，~30秒 5个产物 |
| 确认门控 | ✅ | 代码级拦截 + 线程安全 + 按群聊隔离 |
| 项目模板识别 | ✅ | 答辩/sprint/活动/上线 模板自动建议 |
| 项目状态查询 | ✅ | 内存项目注册表 + 飞书任务 API 双源查询 |
| 多轮项目更新 | ✅ | 注册表更新 + 多维表格 record.update + 群通知 |
| 消息走 Hermes | ✅ | registry.dispatch("send_message") |

## 技术决策

| 决策 | 原因 | 权衡 |
| --- | --- | --- |
| 基于 Hermes 而非自建 | 不重复造轮子，LLM + 工具调度开箱即用 | 受限于 Hermes 架构 |
| lark_oapi SDK 而非 lark-cli | 零外部依赖，即插即用 | 需自己处理 API 错误 |
| Python 而非 TypeScript | Hermes 生态全 Python | 放弃旧 TS 代码 |
| gpt-5.5 | 工具调用稳定，中文能力强 | 需要 vectorcontrol API |
| 插件而非 fork | 不改 Hermes 代码，cp -r 安装 | 无法修改 gateway 行为 |

## 项目结构

```
PilotFlow/
├── plugins/pilotflow/      # 核心插件（tools.py + __init__.py + plugin.yaml）
├── skills/pilotflow/       # Hermes skill（SKILL.md + DESCRIPTION.md）
├── docs/                   # 产品规格、架构设计、创新点
├── README.md / README_EN.md
├── INSTALL.md
├── AGENTS.md               # Claude Code agent 上下文
├── PERSONAL_PROGRESS.md
└── .env.example
```

## 迭代方向

| 方向 | 说明 |
| --- | --- |
| 多轮项目管理 | 改截止时间、查状态、重新分配成员 |
| 日历集成 | 自动创建截止时间日历事件 |
| 审批流 | 飞书审批 API 集成 |
| Hermes memory | 记住用户项目偏好 |
| 互动卡片回调 | 按钮点击实时响应 |
