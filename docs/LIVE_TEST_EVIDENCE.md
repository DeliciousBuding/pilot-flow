# 真实测试证据（脱敏）

> 本文件只记录可复验结论和脱敏摘要，不提交真实群 ID、用户 open_id、应用 secret、message_id 或飞书文档链接。

## 2026-05-03 状态看板场景

| 项目 | 证据 |
| --- | --- |
| 运行环境 | WSL 中 Hermes gateway 已运行，PilotFlow 已通过 `setup.py --hermes-dir <hermes-agent-path>` 同步到 runtime |
| CLI 身份 | `lark-cli auth status` 显示 user token valid |
| 发送方式 | `lark-cli im +messages-send --as user` 向 Hermes 记录的 Feishu 测试群发送文本查询 |
| 用户输入 | `PilotFlow 真实测试：项目进展如何？` |
| Bot 文本反馈 | `项目看板已发送，共 1 个项目。` |
| Bot 卡片反馈 | 最近消息中出现 `msg_type=interactive` 的 `项目看板` 卡片 |
| 看板内容 | 卡片展示已创建项目、成员、截止时间、倒计时和状态 |
| 隐私处理 | 真实 chat_id、open_id、message_id、文档链接和状态表链接不写入公开仓库 |

## 本地回归

```bash
uv run pytest -o addopts='' -q
```

结果：

```text
47 passed
```

## 当前证据边界

- 已有真实证据：Feishu 网关可接收群消息，PilotFlow 可发中文文本反馈和互动看板卡片。
- 已有历史现场验证：确认按钮可触发项目创建，原确认卡片可更新为已创建状态。
- 提交材料仍需补齐：成功创建路径录屏、取消路径录屏、真实文档/多维表格/任务/日历链接清单。该清单应进入私有提交材料或飞书在线文档，不建议直接提交到公开仓库。
