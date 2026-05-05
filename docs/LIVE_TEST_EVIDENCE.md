# 真实测试证据（脱敏）

> 本文件只记录可复验结论和脱敏摘要，不提交真实群 ID、用户 open_id、应用 secret、message_id 或飞书文档链接。

## 快速导航

| 主题 | 内容 | 行数 |
| :--- | :--- | :--- |
| [Agent 主驾驶 + Killer Demo](live/agent-driven.md) | 群聊主动巡检、Agent 显式传参、看板分页门控 | 43 |
| [卡片失败重试](live/card-retry.md) | 7 类卡片操作失败后保留 action ref 可重试、澄清闭环 | 171 |
| [重启恢复](live/restart-recovery.md) | 脱敏 state + 私有 refs 全链恢复，文件锁保障 | 253 |
| [端到端 + 风险 + 安全边界](live/e2e-risk-boundaries.md) | @Bot 端到端、风险贯通、Agent 主驾驶边界、状态文件硬化 | 209 |
| [核心飞书功能](live/core-features.md) | 文档/Base/任务/日历/权限/@mention/看板/催办/归档/分页 | 741 |
| [运行态验证](live/runtime-verification.md) | WSL runtime verifier 五模式覆盖 | 620 |
| [本地回归](live/local-regression.md) | pytest 328 passed + 安装验证 | 17 |

## 关键能力证据索引

| 能力 | 证据位置 |
| :--- | :--- |
| 群聊自然讨论 → 主动冒泡项目化 | [Agent 主驾驶 + Killer Demo](live/agent-driven.md) |
| Agent 主驾驶（5 类语义参数必须 LLM 显式传） | [Agent 主驾驶](live/agent-driven.md) + [端到端 + 边界](live/e2e-risk-boundaries.md) |
| 确认 token + idempotency key（防重复创建） | [端到端 + 边界](live/e2e-risk-boundaries.md) |
| opaque card action ref（防伪造操作） | [卡片失败重试](live/card-retry.md) |
| 重启后恢复（脱敏 state + 私有 refs + 文件锁） | [重启恢复](live/restart-recovery.md) |
| 卡片失败自动重试 | [卡片失败重试](live/card-retry.md) |
| 风险闭环（上报→解除→写文档→写表格） | [核心飞书功能](live/core-features.md) |
| 站会简报 + 批量催办/待办 | [核心飞书功能](live/core-features.md) |
| 完整 @Bot 端到端（mimo-v2.5-pro → 飞书产物） | [端到端 + 边界](live/e2e-risk-boundaries.md) |
| WSL 模型探针与 401 预检 | [端到端 + 边界](live/e2e-risk-boundaries.md) |

## 本地回归

```bash
"/c/Users/Ding/miniforge3/python.exe" -m pytest tests -q
```

结果：**328 passed**

## 当前证据边界

- 已有真实证据：Feishu 网关可接收群消息，PilotFlow 可发中文文本反馈、互动看板卡片、执行计划卡片、确认完成卡片、项目入口卡片和取消反馈。
- Agent 主驾驶已闭环：view_mode / template / risk_level / page / filters 5 处必须 Agent 显式传字段，`allow_inferred_*=true` 仅回归用。
- 卡片失败已覆盖 7 类 retryable failure，按钮操作网络恢复可重试。
- 重启恢复已覆盖看板/详情/催办/批量待办/截止更新 8+ 场景。
- 提交材料仍需补齐：4 段录屏、真实产物链接汇总、个人信息。
