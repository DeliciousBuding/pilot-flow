# PilotFlow 自驱迭代路线图

> 版本: v1.11+ (2026-05-03)
> 目的: 规划下一阶段的产品增量, 围绕「深度融合 Hermes 生态 + 飞书原生能力」, 不造轮子, 强差异化

---

## 一、当前位置

### 已经做对的事

- **架构边界清晰**: 消息/记忆/定时走 Hermes (`registry.dispatch`), 文档/表格/任务走 lark_oapi SDK 直连
- **确认门控有效**: `_plan_generated` 全局变量按 chat_id 隔离, TTL 10 分钟
- **测试覆盖**: 25/25 通过 (19 单元 + 6 集成 mock gateway)
- **代码质量**: 工具描述强引导 LLM, 输出规则在工具返回值里

### 已经识别但还没做的事

| 缺口 | 影响 | 紧迫度 |
| --- | --- | --- |
| WSL+tmux 真实端到端验证 | 工具描述改了没在真实 LLM 上验证 | P0 |
| 卡片按钮回调 handler | 按钮点了没反应 = 产品断点 | P0 |
| Memory 双向读取 | 「越用越聪明」是口号不是功能 | P1 |
| Session Context 利用不足 | 浪费了 user_name / chat_name 信息 | P1 |
| 任务订阅者 / 日历邀请 | 飞书生态深度未挖透 | P2 |
| 项目归档/删除 | 50 项目自动踢出, 用户失控 | P2 |
| 成员解析失败静默 | 用户不知道谁没 @ 上 | P2 |

---

## 二、深度融合策略

### 2.1 Hermes 生态融合 (我们必须用满)

Hermes 已经为我们准备好的能力, 我们能复用的全部要复用:

| Hermes 能力 | 当前状态 | 计划复用方式 |
| --- | --- | --- |
| `registry.dispatch("send_message")` | ✅ 已用 | 维持 |
| `registry.dispatch("memory", action=add)` | ✅ 已用 (写) | **加上 read/scan** -> 历史项目模式回填 |
| `registry.dispatch("cronjob")` | ✅ 已用 | 维持, 增加更多触发场景 (周报/日报) |
| `gateway.session_context.get_session_env` | ✅ 部分用 | **扩展到 USER_NAME / CHAT_NAME / USER_ID** |
| `tools.feishu_doc_read` | ❌ 未用 | **加入查询能力**, 读取已创建的项目文档做回顾 |
| `tools.feishu_drive_add_comment` | ❌ 未用 | **创建文档后写一条 @所有人的评论** 引导补充 |
| `tools.feishu_drive_list_comments` | ❌ 未用 | **看板查询时拉取评论数**作为活跃度指标 |
| `FeishuAdapter._on_card_action_trigger` | ❌ 未接 | **关键!** Hermes 已把按钮路由成 `/card button {value}` 合成消息, 我们只需让 LLM 识别这个格式 |
| `tools/registry.py 的 30s TTL 缓存` | ✅ 隐式利用 | 维持 |

**重大发现**: 卡片按钮回调不需要我们自己写 handler! Hermes 的 `_handle_card_action_event` 已经把按钮点击路由成 `/card button {"pilotflow_action": "confirm_project"}` 这样的合成 COMMAND 消息走 LLM 流程。我们只需:
1. 在 `_handle_generate_plan` 返回的 instructions 里告诉 LLM「如果收到 `/card button {pilotflow_action: confirm_project}` 就调用 create_project_space」
2. 或者写一个轻量级的 `pilotflow_handle_card_action` 工具专门处理这种合成消息

### 2.2 飞书生态融合 (lark_oapi 还没挖透的部分)

我们已经用了 docx / bitable / task / calendar / drive permission / im chat members. 还能加的:

| lark_oapi 能力 | 当前状态 | 计划用法 | 优先级 |
| --- | --- | --- | --- |
| `task.v2.task_collaborator.create` | ❌ | 任务创建后, 把所有成员加为关注者 | P2 |
| `calendar.v4.calendar_event.attendee.create` | ❌ | 日历事件邀请所有成员 | P2 |
| `bitable.v1.app_table_record.batch_create` | ❌ | 多个交付物一次写入, 减少 API 调用 | P3 |
| `bitable.v1.app_table_view.create` | ❌ | 给项目状态表创建「按截止时间排序」视图 | P3 |
| `wiki.v2.space_node.create` | ❌ | 项目空间归档到 wiki 知识库 | P3 |
| `im.v1.chat.update` (group_topic) | ❌ | 把项目标题设为群话题 | P3 |
| `application.v6.bot.info` | ❌ | 启动时探测自身权限, 缺权限提前告警 | P2 |
| `contact.v3.user.batch_get_id` | ❌ | 用 email/手机号反查 open_id, 容错性更强 | P3 |
| `docx.v1.document_block.list` | ❌ | 读取已创建文档的 block 结构, 做更新 | P3 |
| `sheets.v3.spreadsheet.create` | ❌ | 提供「电子表格模式」选项 (vs bitable) | P4 |
| `approval.v4.instance.create` | ❌ | 高风险项目走飞书审批流 | P4 |

### 2.3 Hermes Skill 系统融合

当前 SKILL.md 没被 gateway 加载. 但 Hermes 的 skill 系统支持:
- 渐进式披露 (progressive disclosure)
- 工具集 (toolset) 分组
- DESCRIPTION.md 短描述 + SKILL.md 长指南

**计划**: 即使 gateway 不加载 SKILL.md, 它对人类开发者和 IDE agent 仍然有用. 保持 SKILL.md 作为「人类可读的工作流文档」, 工具描述里 self-contained 给 LLM 看. 两条线并行不矛盾.

---

## 三、迭代轮次规划

### Round 12: 真实验证 + 卡片回调 (P0 必做)

**目标**: 把上一轮欠的债还清 + 关闭最大产品断点

**任务清单**:
1. WSL+tmux 启动 gateway, 在真实测试群发消息全链路验证
2. 验证卡片按钮回调 (Hermes 已自动路由, 验证 LLM 能接住合成消息)
3. 添加 `pilotflow_handle_card_action` 工具 (专门处理 `/card button {...}` 格式)
4. 修复在真实环境中暴露的所有 bug

**验证标准**:
- 真实群里 @PilotFlow 能完整跑通: 提取 -> 卡片确认 -> 创建 5 个产物
- 点击「✅ 确认执行」按钮能触发 create_project_space (不需要文字回复)
- 点击「❌ 取消」按钮能清掉 plan gate 和 pending plan

### Round 13: Hermes Memory 双向 + Session Context 扩展 (P1)

**目标**: 让「越用越聪明」成为可演示功能

**任务清单**:
1. 新增 `_load_project_patterns()`: 启动 generate_plan 时调用 `registry.dispatch("memory", {action: "scan"})` 拉取历史项目
2. 模式识别: 同一群聊中常见的成员组合, 常用的交付物类型, 常见的工期
3. 在 generate_plan 返回的 instructions 里加上「历史项目建议」
4. 扩展 session context: 自动读取 USER_NAME 加为发起人, CHAT_NAME 做项目标题缺省

**验证标准**:
- 第一次创建答辩项目: 用模板默认值
- 第二次在同一群创建: 自动建议「上次的成员是 X、Y、Z, 是否复用?」
- 不指定标题时, 自动用「{群名} - {日期}」作为缺省

### Round 14: 飞书生态深度 — 协作者 + 邀请 + 评论 (P2)

**目标**: 5 行代码挖透飞书生态

**任务清单**:
1. 任务创建: 用 `task_collaborator.create` 把所有成员加为关注者
2. 日历事件: `attendee.create` 邀请所有成员
3. 文档创建后: 用 Hermes 自带的 `feishu_drive_add_comment` 写一条「@所有人, 请补充内容」的引导评论
4. 看板查询: 用 `feishu_drive_list_comments` 拉取每个项目文档的评论数, 显示「最近活跃度」

**验证标准**:
- 创建任务后, 群成员全员收到「关注的任务」通知
- 创建日历事件后, 群成员全员收到日历邀请
- 文档刚创建就有一条引导评论
- 看板显示「文档评论数 / 最近评论时间」

### Round 15: UX 收尾 + 项目生命周期 (P2)

**目标**: 把 50 项目自动踢出 / 成员解析失败 / 没有归档途径 三个 UX 缺陷一次解决

**任务清单**:
1. 新增 `pilotflow_archive_project` 工具: 显式归档, 不再出现在看板
2. 成员解析失败: 在 create_project_space 返回值里加 `unresolved_members`, display 中明确提示
3. 项目状态: 加 `archived` 状态, `query_status` 默认不显示已归档项目
4. 看板加分页: 超过 10 个项目时分页显示

**验证标准**:
- 用户能说「归档答辩项目」让某个项目消失
- 创建项目时如果有成员没加进群, 用户立刻收到「张三未在群中, 已用文本兜底」的提示
- 看板上 archived 项目默认隐藏, 用户可以说「显示所有项目」看到全部

### Round 16: 答辩冲刺 (P0)

**目标**: 答辩材料完整, 录屏, 截图齐备

**任务清单**:
1. 录制成功路径录屏 (一句话创建项目, 30 秒搞定)
2. 录制失败路径录屏 (权限不足时的安全降级)
3. 截图清单: 5 张必截 + 2 张可选
4. 答辩 Q&A 文档 (20 个问题)
5. 一页纸 judge one-pager
6. 演示脚本 final cut

**验证标准**:
- 答辩前能离线播放录屏证明能力 (网络异常不依赖现场)
- 评委 Q&A 覆盖率 80%+

---

## 四、不做的事 (避免 scope creep)

明确不在本阶段做的事 (留给 Phase 4+):

- ❌ 移动端飞书小程序 (飞书原生体验已够)
- ❌ 自定义 LLM provider (vectorcontrol 够用)
- ❌ 多租户 / SaaS 化 (单 app 单租户足以演示)
- ❌ Worker Tab / Chat Tab (PR 体验复杂, 优先级低)
- ❌ 事件订阅复杂规则 (Hermes 默认 group_policy=open 即可)
- ❌ Star History badge (star 数少展示难看)
- ❌ Web 控制台 (飞书 IM 即是入口, 不需要)

---

## 五、关键约束 (任何轮次都不能违反)

来自项目记忆和代码审查:

| 约束 | 原因 | 检查方式 |
| --- | --- | --- |
| 工具名英文 `^[a-zA-Z0-9_-]+$` | OpenAI API schema 校验 | 看 `_TOOLS` 元组 |
| 消息发送走 `registry.dispatch("send_message")` | 复用 Hermes 渠道, 维持架构 | grep `lark_oapi.*im\.v1.*message.*create` 应为空 |
| 工具描述强引导 LLM | gateway 不加载 SKILL.md | 描述里有「必须首先调用」「必须在用户确认后」 |
| 输出规则写在工具返回值的 instructions 字段 | 系统提示词改不到 | 看每个 handler 的 tool_result |
| 不暴露英文工具名 | 用户看到「pilotflow_xxx」很丑 | 看 instructions 里有「不要展示工具名称」 |
| 确认门控按 chat_id 隔离 | 多群并发不串扰 | `_plan_generated: Dict[str, float]` |
| 权限自动 `link_share_entity=anyone_readable` + 群成员 editor | 用户不用手动开权限 | 看 `_set_permission` + `_add_editors` 都被调用 |
| 不要 Star History badge | star 少丢人 | grep `star-history` 应为空 |
| PERSONAL_PROGRESS 不列 P0 任务 | 项目阶段总结不是 todo | grep `P0` PERSONAL_PROGRESS.md 应为空 |
| Hermes 优先, lark_oapi 兜底 | 不造轮子 | 任何新功能先查 Hermes 是否有原生工具 |

---

## 六、迭代检查清单 (每轮必跑)

```
[审查阶段]
1. 用 subagent 从产品角度审视 README / INSTALL / PERSONAL_PROGRESS / tools.py / SKILL.md
2. 找到本轮要解决的 1-3 个具体问题
3. 把问题写进 TaskCreate

[改进阶段]
4. 直接修复代码和文档
5. 任何新增工具都要英文名 + 强描述 + instructions 输出规则
6. 任何新增飞书 API 调用都要先查 Hermes 是否有原生工具
7. 改完代码立刻跑单元测试 + 集成测试

[测试阶段] (Round 12+ 必做)
8. python setup.py --hermes-dir ../hermes-agent 同步插件
9. WSL 中 tmux new-session -d -s gateway 'cd hermes-agent && uv run hermes gateway'
10. 在飞书测试群 @PilotFlow 跑测试场景
11. tmux capture-pane 看 gateway 日志, 验证工具调用链路
12. 看飞书群里实际产物, 验证 5 个产出都正确

[提交阶段]
13. git add 具体文件名, 不用 git add . 防止误提交
14. git commit -m "vX.Y: <一句话总结>"
15. git push origin master
16. git push origin master:main 同步到 main 分支
17. 更新 memory: pilotflow-iteration-progress.md 记录本轮成果
```

---

## 七、终态愿景 (north star)

> **PilotFlow 是一个深度长在飞书里、也长在 Hermes 里的 AI 项目运行官.**
>
> 用户在飞书群 @它说一句话, 它会:
> 1. 从历史项目记忆中找相似模式, 给出建议
> 2. 把当前发起人和群名作为缺省值
> 3. 发互动卡片让用户一键确认
> 4. 用 Hermes 工具发消息, 用 lark_oapi SDK 创建文档/表格/任务/日历
> 5. 把所有成员加为协作者, 邀请到日历, 在文档里 @ 引导补充
> 6. 设置截止前 1 天的 Hermes cron 提醒
> 7. 在看板里持续显示活跃度 (评论数, 任务完成度)
> 8. 项目结束时一键归档到 wiki 知识库
>
> 不是「能创建文档的机器人」, 而是「飞书+Hermes 生态的项目协奏曲指挥」.
