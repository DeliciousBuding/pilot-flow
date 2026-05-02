# 个人进度 — PilotFlow

## 项目概述

PilotFlow 是飞书群聊中的 AI 项目运行官。基于 Hermes Agent 运行时，通过 lark_oapi SDK 直连飞书 API，实现一句话创建项目空间。

## 当前状态（2026-05-02）

### 已完成

**插件架构（v0.2）**
- 基于 Hermes Agent 运行时的即插即用插件
- lark_oapi SDK 直连飞书 API，不依赖 lark-cli
- 4 个核心工具：generate_plan、detect_risks、create_project_space、send_summary

**飞书能力**
- 飞书文档创建：支持 markdown 格式化（标题、列表、分隔线）
- 飞书任务创建：自动创建带负责人的任务
- 群消息发送：项目入口消息、交付总结
- @mention 支持：文档内和群消息中自动 @提及成员
- 文档权限：创建后自动开放链接访问权限

**端到端验证**
- Hermes gateway → LLM (mimo-v2.5-pro) → PilotFlow 工具 → 飞书产物
- 飞书群聊 @PilotFlow 触发 → 自动创建文档+任务+消息
- 全流程 ~17 秒完成

**已验证的飞书能力**

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 飞书文档创建 | ✅ | 格式化 markdown，自动开权限 |
| 飞书任务创建 | ✅ | lark_oapi SDK |
| 群消息发送 | ✅ | 文本消息 + @mention |
| @mention 解析 | ✅ | 自动解析群成员名称 |
| 文档内 @mention | ✅ | mention_user 元素 |
| 多维表格写入 | ❌ | 需要 bot 加 bitable 权限 |
| 确认门控 | 🔧 | 工具层已实现，需 gateway 交互卡片支持 |

### 待完成

1. 多维表格写入权限配置
2. 确认门控的交互卡片实现
3. 运行记录日志
4. 演示视频录制
5. 截图制作
6. 竞赛提交

## 技术决策

| 决策 | 原因 |
| --- | --- |
| 用 lark_oapi SDK 替代 lark-cli | 减少外部依赖，即插即用 |
| 基于 Hermes Agent 运行时 | 不重复造轮子，利用 LLM + 工具调度 |
| mimo-v2.5-pro 模型 | 中文理解能力强，适合飞书场景 |
| Python 而非 TypeScript | Hermes 生态全 Python，插件保持一致 |
